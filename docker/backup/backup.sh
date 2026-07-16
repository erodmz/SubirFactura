#!/bin/sh
# Respaldo nocturno de SubirFactura. Son datos FISCALES: el respaldo se cifra
# antes de salir del servidor y se guarda fuera de la máquina.
#
# Cadena: pg_dump -Fc | gzip | age (clave PÚBLICA) | rclone → almacenamiento remoto
#
# El servidor solo tiene la clave pública: puede cifrar, NO descifrar. Si algún
# día comprometen el box, el atacante no puede leer los respaldos anteriores.
# La clave privada la guarda Elmer fuera del servidor (ver GUIA_DESPLIEGUE.md).
set -eu

TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
FECHA="$(date -u +%Y-%m-%d)"
RETENCION_DIAS="${BACKUP_RETENTION_DAYS:-30}"

log() { echo "[BACKUP] $(date -u +%H:%M:%S) $*"; }

# Falla ruidosamente: alerta a ntfy (sin PII — solo qué paso falló) y sale != 0
# para que el cron lo registre. Un respaldo que falla en silencio no es respaldo.
fallar() {
  log "ERROR: $1"
  if [ -n "${NTFY_TOPIC:-}" ]; then
    curl -sS -m 10 \
      -H "Title: Respaldo de SubirFactura FALLÓ" \
      -H "Priority: urgent" \
      -H "Tags: rotating_light,subirfactura" \
      -d "Paso: $1. Revisa los logs del servidor (docker compose logs backup)." \
      "${NTFY_URL:-https://ntfy.sh}/${NTFY_TOPIC}" >/dev/null 2>&1 || true
  fi
  exit 1
}

# ── Requisitos ────────────────────────────────────────────────────────────────
[ -n "${POSTGRES_USER:-}" ]           || fallar "falta POSTGRES_USER"
[ -n "${POSTGRES_DB:-}" ]             || fallar "falta POSTGRES_DB"
[ -n "${PGPASSWORD:-}" ]              || fallar "falta PGPASSWORD"
[ -n "${BACKUP_AGE_PUBLIC_KEY:-}" ]   || fallar "falta BACKUP_AGE_PUBLIC_KEY (clave pública age)"
[ -n "${BACKUP_REMOTE:-}" ]           || fallar "falta BACKUP_REMOTE (destino rclone, p.ej. s3:mi-bucket/subirfactura)"

TMP="$(mktemp -d)"
# shellcheck disable=SC2064
trap "rm -rf '$TMP'" EXIT

ARCHIVO="subirfactura-${TS}.dump.gz.age"

# ── 1. Volcado + cifrado, en streaming (no toca disco sin cifrar) ─────────────
log "volcando la base de datos…"
pg_dump -h "${POSTGRES_HOST:-postgres}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  | gzip -9 \
  | age -r "$BACKUP_AGE_PUBLIC_KEY" -o "$TMP/$ARCHIVO" \
  || fallar "pg_dump/cifrado"

TAM="$(du -h "$TMP/$ARCHIVO" | cut -f1)"
# Un dump válido nunca es diminuto: atrapa el caso "se cifró la nada".
TAM_BYTES="$(wc -c < "$TMP/$ARCHIVO")"
[ "$TAM_BYTES" -gt 1024 ] || fallar "el respaldo salió sospechosamente pequeño (${TAM_BYTES} bytes)"
log "respaldo cifrado listo: $ARCHIVO ($TAM)"

# ── 2. Subida fuera del servidor ──────────────────────────────────────────────
log "subiendo a $BACKUP_REMOTE …"
rclone copy "$TMP/$ARCHIVO" "$BACKUP_REMOTE/db/$FECHA/" --s3-no-check-bucket \
  || fallar "subida a $BACKUP_REMOTE"

# ── 3. Verificación: el archivo debe existir en el destino ────────────────────
rclone lsf "$BACKUP_REMOTE/db/$FECHA/$ARCHIVO" >/dev/null 2>&1 \
  || fallar "el archivo no aparece en el destino tras subirlo"
log "verificado en el destino"

# ── 4. Imágenes de facturas (opcional: son la evidencia del comprobante) ──────
if [ "${BACKUP_IMAGES:-false}" = "true" ]; then
  log "espejando las imágenes…"
  rclone sync "${BACKUP_IMAGES_SOURCE:-minio:${S3_BUCKET}}" "$BACKUP_REMOTE/images/" \
    --s3-no-check-bucket || fallar "espejo de imágenes"
  log "imágenes al día"
fi

# ── 5. Retención ──────────────────────────────────────────────────────────────
log "limpiando respaldos de más de ${RETENCION_DIAS} días…"
rclone delete "$BACKUP_REMOTE/db/" --min-age "${RETENCION_DIAS}d" || true
rclone rmdirs "$BACKUP_REMOTE/db/" --leave-root || true

log "OK — respaldo del $FECHA completado"
