#!/usr/bin/env bash
# SubirFactura — despliegue MANUAL desde el propio servidor.
#
#   cd /opt/subirfactura
#   ./actualizar.sh              # traer y levantar la última versión
#   ./actualizar.sh <sha>        # rollback a un commit ya construido
#   ./actualizar.sh --estado     # qué está corriendo, memoria y disco
#   ./actualizar.sh --logs api   # seguir logs (api | worker | web | migrate…)
#   ./actualizar.sh --alertas    # rupturas detectadas por el pipeline
#
# El camino normal es `git push origin main` (GitHub Actions hace esto mismo).
# Esto es para cuando quieres desplegar sin pasar por Actions, o revertir
# rápido a las 2 a.m. sin abrir el navegador.
#
# NO construye nada: solo baja imágenes ya construidas de GHCR. Un build de
# Node en una caja de 4 GB se muere.
set -euo pipefail

# El CD lo deja en /opt/subirfactura/scripts/, pero el compose vive un nivel
# arriba. Busca la raíz esté donde esté, para que funcione lo llames como lo
# llames (./actualizar.sh, ./scripts/actualizar.sh o por ruta absoluta).
AQUI="$(cd "$(dirname "$0")" && pwd)"
for CANDIDATO in "$AQUI" "$AQUI/.." /opt/subirfactura; do
  if [ -f "$CANDIDATO/docker-compose.prod.yml" ]; then RAIZ="$(cd "$CANDIDATO" && pwd)"; break; fi
done
cd "${RAIZ:-$AQUI}"

COMPOSE=docker-compose.prod.yml
ENVFILE=.env.prod

say()  { printf "\n\033[1;32m▶ %s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$1"; }
fail() { printf "\033[1;31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

dc() { docker compose -f "$COMPOSE" --env-file "$ENVFILE" "$@"; }

[ -f "$COMPOSE" ] || fail "No encuentro $COMPOSE. ¿Ya corrió un despliegue?"
[ -f "$ENVFILE" ] || fail "Falta $ENVFILE — sin él no hay secretos ni dominio."

case "${1:-}" in
  --estado|-e)
    dc ps
    echo
    info "Memoria y disco:"
    free -h | sed 's/^/  /'
    df -h / | sed 's/^/  /'
    exit 0 ;;
  --logs|-l)
    shift
    dc logs -f --tail=100 "${@:-api}"
    exit 0 ;;
  --alertas|-a)
    # Las rupturas que el pipeline detecta se marcan con [ALERTA] (y van a ntfy).
    dc logs --tail=2000 api worker | grep -F '[ALERTA]' || info "sin alertas recientes"
    exit 0 ;;
  --ayuda|-h|--help)
    sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
esac

TAG="${1:-latest}"

# ── 1. Entrar al registro ─────────────────────────────────────────────────────
# GHCR necesita autenticación incluso para imágenes públicas de un repo privado.
if [ -n "${GHCR_TOKEN:-}" ]; then
  say "Entrando a GHCR"
  GHCR_OWNER=$(grep -E '^GHCR_OWNER=' "$ENVFILE" | cut -d= -f2)
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin >/dev/null
  info "ok"
elif ! docker system info 2>/dev/null | grep -q 'ghcr.io'; then
  info "usando la sesión de docker login que ya existe"
fi

# ── 2. Bajar imágenes ─────────────────────────────────────────────────────────
say "Bajando imágenes (tag: $TAG)"
export IMAGE_TAG="$TAG"
dc pull

# ── 3. Levantar ───────────────────────────────────────────────────────────────
# `migrate` corre primero y termina; el resto arranca contra el esquema nuevo.
say "Levantando"
dc up -d --remove-orphans

# ── 4. Esperar a que el API esté SANO de verdad ───────────────────────────────
# Un despliegue no está bien hasta que /health responde. Si no, revertir.
say "Comprobando salud"
for i in $(seq 1 24); do
  if dc exec -T api node -e \
      'fetch("http://localhost:3000/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' \
      2>/dev/null; then
    info "API sana"
    OK=1; break
  fi
  printf '  esperando al API… (%s/24)\r' "$i"; sleep 5
done
echo
if [ "${OK:-0}" != "1" ]; then
  warn "El API no respondió sano. Últimas líneas:"
  dc logs --tail=40 api migrate | sed 's/^/  /'
  fail "Despliegue fallido. Para revertir:  ./actualizar.sh <sha-anterior>"
fi

# ── 5. Limpieza ───────────────────────────────────────────────────────────────
# Sin esto, el disco se llena solo de capas viejas.
say "Purgando imágenes de más de 7 días"
docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
info "$(df -h / | awk 'NR==2{print $4}') libres en /"

say "Desplegado (tag: $TAG)"
warn "El rollback NO revierte migraciones de base de datos. Si el despliegue"
warn "malo migró el esquema, hay que restaurar el respaldo."
