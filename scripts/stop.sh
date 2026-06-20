#!/usr/bin/env bash
# FacturaRD — detiene TODO: servicios de Node y la infraestructura Docker.
#   ./scripts/stop.sh
# Los datos se conservan (no se borran volúmenes).
set -uo pipefail
cd "$(dirname "$0")/.."

echo "Deteniendo API, worker y panel web…"
pkill -f 'nest start' 2>/dev/null || true
pkill -f 'tsx watch'  2>/dev/null || true
pkill -f 'next dev'   2>/dev/null || true

echo "Deteniendo infraestructura Docker (datos conservados)…"
docker compose stop >/dev/null 2>&1 || true

echo "Listo. Para volver a levantar todo: ./scripts/dev.sh"
