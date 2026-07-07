#!/usr/bin/env bash
# Limpia TODAS las facturas: filas en BD (invoices, invoice_images, audit_log
# de facturas) y los objetos de imagen en MinIO (prefijo invoices/).
# Conserva: organizaciones, usuarios, clientes, logos, padrón RNC.
#   ./scripts/clean-invoices.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Falta .env" >&2; exit 1; }
set -a; . ./.env; set +a

echo "▶ Borrando facturas de la base de datos…"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
BEGIN;
DELETE FROM invoice_images;
DELETE FROM invoices;
DELETE FROM audit_log WHERE entidad = 'invoice';
COMMIT;
SQL

echo "▶ Borrando imágenes de facturas en MinIO (bucket $S3_BUCKET, prefijo invoices/)…"
docker compose exec -T minio sh -c \
  "mc alias set local http://localhost:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' >/dev/null \
   && mc rm --recursive --force local/$S3_BUCKET/invoices/ 2>/dev/null \
   || echo '  (sin objetos que borrar)'"

echo "✔ Limpieza completada."
