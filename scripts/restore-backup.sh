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

echo "→ Descifrando…"
age -d -i "$AGE_KEY_FILE" "$ARCHIVO" | gunzip > "$TMP/restore.dump"

echo "→ Restaurando en la base destino…"
# --clean --if-exists deja la base como el dump; sin esto quedan restos previos.
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$DESTINO" "$TMP/restore.dump"

echo "✅ Restaurado. Verifica antes de dar por buena la restauración, p. ej.:"
echo "   psql '$DESTINO' -c 'SELECT count(*) FROM invoices;'"
