#!/bin/sh
# Programa el respaldo nocturno con el cron de busybox y se queda al frente.
#
# `docker compose run --rm backup once` corre un respaldo inmediato — úsalo el
# día del despliegue para comprobar que la cadena completa funciona, en vez de
# esperar a la madrugada y descubrir a la mala que algo faltaba.
set -eu

if [ "${1:-}" = "once" ]; then
  exec /usr/local/bin/backup.sh
fi

# Cualquier otro comando se ejecuta tal cual (docker compose run backup sh, etc.).
# Sin esto, el entrypoint se tragaba los comandos y arrancaba el cron igual.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

HORA="${BACKUP_CRON:-15 3 * * *}"   # 3:15 a.m. hora de RD por defecto

# El cron de busybox no hereda el entorno del contenedor: lo volcamos a un
# archivo que el job carga antes de correr (si no, backup.sh no vería nada).
env | grep -E '^(POSTGRES_|PG|BACKUP_|NTFY_|RCLONE_|S3_)' \
    | sed 's/^/export /' > /etc/backup.env

mkdir -p /etc/crontabs
echo "$HORA . /etc/backup.env; /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

echo "[BACKUP] programado: '$HORA' (TZ=$TZ). Esperando…"
exec crond -f -l 8
