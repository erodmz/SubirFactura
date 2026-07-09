#!/usr/bin/env bash
# FacturaRD — levanta TODO el entorno de desarrollo con un solo comando.
#   ./scripts/dev.sh
# Detener: Ctrl+C (para API/worker/web; la infra Docker queda arriba).
# Para apagar también la infra: ./scripts/stop.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say() { printf "\n\033[1;32m▶ %s\033[0m\n" "$1"; }

# 1. Docker en marcha
if ! docker info >/dev/null 2>&1; then
  say "Iniciando Docker Desktop…"
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi

# 2. .env
if [ ! -f .env ]; then
  echo "Falta .env. Copia .env.example a .env y ajusta los secretos." >&2
  exit 1
fi

# 3. Infraestructura (Postgres + Redis + MinIO)
say "Levantando infraestructura (postgres, redis, minio)…"
docker compose up -d postgres redis minio >/dev/null
printf "Esperando a PostgreSQL"
until [ "$(docker inspect -f '{{.State.Health.Status}}' invoice-postgres-1 2>/dev/null)" = "healthy" ]; do
  printf "."; sleep 2
done
echo " listo."

# 4. Dependencias, Prisma, migraciones y seeds (idempotente)
set -a; . ./.env; set +a

# IP LAN de la Mac: las URL firmadas de las imágenes deben usar un host que el
# navegador Y el teléfono puedan alcanzar (localhost no sirve desde el celular).
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)"
export S3_PUBLIC_URL="http://$LAN_IP:9000"
say "Instalando dependencias…";            pnpm install --frozen-lockfile >/dev/null
say "Generando cliente Prisma…";           pnpm db:generate >/dev/null
say "Aplicando migraciones…";              pnpm db:deploy >/dev/null
say "Sembrando planes y categorías 606…";  pnpm db:seed >/dev/null
say "Compilando paquete compartido…";      pnpm --filter @facturard/shared build >/dev/null

# 5. Config del panel web
[ -f web/.env.local ] || echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > web/.env.local

# 6. Arrancar API + worker + web
mkdir -p logs

# Mata cualquier instancia previa (incluidos zombis) para NO acumular procesos
# duplicados: correr dev.sh dos veces dejaba varios workers en la misma cola, y
# un worker compilado viejo (node dist/main.js) seguía asignando mal por RNC.
kill_services() {
  pkill -f 'nest start'        2>/dev/null || true
  pkill -f 'tsx watch'         2>/dev/null || true
  pkill -f 'tsx.*src/main.ts'  2>/dev/null || true
  pkill -f 'node dist/main.js' 2>/dev/null || true
  pkill -f 'next dev'          2>/dev/null || true
}
say "Limpiando procesos node previos…"; kill_services; sleep 1

say "Iniciando API, worker y panel web…"
( cd api     && pnpm dev    > "$ROOT/logs/api.log"    2>&1 ) &
( cd workers && pnpm dev    > "$ROOT/logs/worker.log" 2>&1 ) &
( cd web     && pnpm dev    > "$ROOT/logs/web.log"    2>&1 ) &

cleanup() {
  echo; say "Deteniendo servicios (la infra Docker sigue arriba)…"
  kill_services
  exit 0
}
trap cleanup INT TERM

# 7. Esperar a que el API responda y garantizar una cuenta de prueba
printf "Esperando al API"
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do printf "."; sleep 1; done
echo " listo."
curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"elmer.test@facturard.do","password":"clave-segura-123","nombre":"Elmer Test"}' \
  >/dev/null 2>&1 || true

# 8. Banner
IP="$LAN_IP"
printf "\n\033[1;36m──────────────────────────────────────────────────────────────\033[0m\n"
cat <<BANNER
  FacturaRD está corriendo 🚀

  🌐 Panel web :  http://localhost:3001
     API       :  http://localhost:3000/health

  👤 Cuenta de prueba:
       correo     : elmer.test@facturard.do
       contraseña : clave-segura-123

  📱 PROBAR EN EL MÓVIL (Flutter):
     1) Tu teléfono y tu Mac deben estar en la MISMA red WiFi.
     2) Conoce la IP de tu Mac (corre esto y copia el número):
            ipconfig getifaddr en0
        → tu IP ahora es:  $IP
     3) En OTRA terminal:
            cd app_flutter
        iPhone físico:
            flutter run --release --dart-define=API_URL=http://$IP:3000
        Simulador iOS (usa galería en vez de cámara):
            flutter run --dart-define=API_URL=http://localhost:3000
        Emulador Android:
            flutter run --dart-define=API_URL=http://10.0.2.2:3000

  🤖 OCR real con Claude (opcional):
       pon ANTHROPIC_API_KEY=sk-ant-... y ANTHROPIC_MODEL=claude-haiku-4-5 en .env
       (sin la key, las facturas caen a revisión para captura manual)

  📜 Logs   : tail -f logs/api.log logs/worker.log logs/web.log
  ⏹  Detener: Ctrl+C (detiene node) · ./scripts/stop.sh (baja TODO)
BANNER
printf "\033[1;36m──────────────────────────────────────────────────────────────\033[0m\n"

wait
