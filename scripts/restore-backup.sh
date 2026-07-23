#!/usr/bin/env bash
# Restaura un respaldo de SubirFactura.
#
# Corre en TU máquina, no en el servidor: necesita la clave PRIVADA de age, que
# nunca debe vivir en el box (todo el diseño del respaldo depende de eso).
#
# Uso:
#   scripts/restore-backup.sh <archivo.dump.gz.age> <DATABASE_URL_destino>
#
# Ejemplo (a una base local de prueba, que es como SIEMPRE deberías ensayarlo
# antes de tocar producción):
#   rclone copy s3:mi-bucket/subirfactura/db/2026-07-15/ ./restore/
#   scripts/restore-backup.sh ./restore/subirfactura-….dump.gz.age \
#     postgresql://facturard:clave@localhost:5433/facturard_restore
#
# Requisitos: age, pg_restore (v16), y la clave privada en $AGE_KEY_FILE
# (por defecto ~/.config/subirfactura/backup-key.txt).
set -euo pipefail

ARCHIVO="${1:-}"
DESTINO="${2:-}"
AGE_KEY_FILE="${AGE_KEY_FILE:-$HOME/.config/subirfactura/backup-key.txt}"

if [ -z "$ARCHIVO" ] || [ -z "$DESTINO" ]; then
  echo "Uso: $0 <archivo.dump.gz.age> <DATABASE_URL_destino>" >&2
  exit 1
fi
[ -f "$ARCHIVO" ]     || { echo "No existe el archivo: $ARCHIVO" >&2; exit 1; }
[ -f "$AGE_KEY_FILE" ] || { echo "No encuentro la clave privada en $AGE_KEY_FILE" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── El pg_restore local suele ser MÁS VIEJO que el Postgres de producción ─────
# Un dump en formato custom de la 16 no lo lee un pg_restore 14: falla con
# "unsupported version (1.15) in file header", que no dice nada de versiones.
# Descubrirlo durante una emergencia real es lo peor que puede pasar, así que
# se comprueba aquí y, si no cuadra, se usa Docker con la versión correcta.
PG_MAYOR_BD="${PG_MAJOR:-16}"
USAR_DOCKER=0
if command -v pg_restore >/dev/null 2>&1; then
  PG_MAYOR_LOCAL="$(pg_restore --version | grep -oE '[0-9]+' | head -1)"
  if [ "$PG_MAYOR_LOCAL" -lt "$PG_MAYOR_BD" ]; then
    echo "⚠ Tu pg_restore es la $PG_MAYOR_LOCAL y el respaldo viene de la $PG_MAYOR_BD."
    USAR_DOCKER=1
  fi
else
  echo "⚠ No hay pg_restore instalado."
  USAR_DOCKER=1
fi
if [ "$USAR_DOCKER" = "1" ]; then
  if command -v docker >/dev/null 2>&1; then
    echo "  → uso postgres:${PG_MAYOR_BD}-alpine por Docker (no hace falta instalar nada)."
  else
    echo "  Instala el cliente correcto:  brew install postgresql@${PG_MAYOR_BD}" >&2
    echo "  (o instala Docker y vuelve a intentarlo)" >&2
    exit 1
  fi
fi

echo "→ Descifrando…"
age -d -i "$AGE_KEY_FILE" "$ARCHIVO" | gunzip > "$TMP/restore.dump"

echo "→ Restaurando en la base destino…"
# --clean --if-exists deja la base como el dump; sin esto quedan restos previos.
if [ "$USAR_DOCKER" = "1" ]; then
  # host.docker.internal: el contenedor tiene que alcanzar el Postgres del Mac.
  DESTINO_DOCKER="$(printf '%s' "$DESTINO" | sed -e 's|@localhost:|@host.docker.internal:|' -e 's|@127\.0\.0\.1:|@host.docker.internal:|')"
  docker run --rm -i \
    --add-host=host.docker.internal:host-gateway \
    -v "$TMP/restore.dump:/restore.dump:ro" \
    "postgres:${PG_MAYOR_BD}-alpine" \
    pg_restore --clean --if-exists --no-owner --no-privileges \
      -d "$DESTINO_DOCKER" /restore.dump
else
  pg_restore --clean --if-exists --no-owner --no-privileges \
    -d "$DESTINO" "$TMP/restore.dump"
fi

echo "✅ Restaurado. Verifica antes de dar por buena la restauración, p. ej.:"
echo "   psql '$DESTINO' -c 'SELECT count(*) FROM invoices;'"
