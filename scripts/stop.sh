#!/usr/bin/env bash
# FacturaRD — baja TODO el proyecto.
#   ./scripts/stop.sh            → detiene servicios node + contenedores (CONSERVA los datos)
#   ./scripts/stop.sh --reset    → además BORRA la base de datos y archivos (empezar de cero)
set -uo pipefail
cd "$(dirname "$0")/.."

echo "Deteniendo API, worker y panel web…"
pkill -f 'nest start' 2>/dev/null || true
pkill -f 'tsx watch'  2>/dev/null || true
pkill -f 'next dev'   2>/dev/null || true
# Además: runners tsx huérfanos (si el supervisor murió y dejó el hijo) y
# workers COMPILADOS arrancados con `pnpm start` (node dist/main.js) — estos no
# los caza 'tsx watch' y pueden quedar de zombis consumiendo la cola con código
# viejo, causando que facturas no se asignen. Matarlos evita ese dolor de cabeza.
pkill -f 'tsx.*src/main.ts'  2>/dev/null || true
pkill -f 'node dist/main.js' 2>/dev/null || true

if [ "${1:-}" = "--reset" ]; then
  read -r -p "⚠️  Esto BORRARÁ la base de datos y las imágenes subidas. ¿Seguro? (escribe SI) " ans
  if [ "$ans" = "SI" ]; then
    echo "Bajando y borrando datos (volúmenes)…"
    docker compose down -v >/dev/null 2>&1 || true
    echo "Listo. Todo en cero. La próxima vez ./scripts/dev.sh recreará la base."
  else
    echo "Cancelado. No se borró nada; solo se detuvieron los servicios node."
  fi
  exit 0
fi

echo "Bajando contenedores (los datos se conservan)…"
docker compose down >/dev/null 2>&1 || true
echo "Proyecto detenido. Para volver a levantar: ./scripts/dev.sh"
