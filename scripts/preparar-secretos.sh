#!/usr/bin/env bash
# SubirFactura — genera TODO lo que hace falta para el primer despliegue.
#
#   ./scripts/preparar-secretos.sh
#
# Corre en TU MÁQUINA, nunca en el servidor. Produce, en .despliegue/ (ignorada
# por git):
#   · deploy_key / deploy_key.pub  → llave SSH que usa GitHub Actions para entrar
#   · backup-key.txt               → clave age de respaldos (la privada NUNCA sube)
#   · .env.prod                    → variables del servidor, con secretos ya generados
#   · INSTRUCCIONES.txt            → qué copiar y a dónde
#
# Es idempotente: si algo ya existe, lo reusa en vez de regenerarlo (regenerar
# el JWT_SECRET cierra la sesión de todo el mundo; regenerar la clave age deja
# los respaldos viejos ilegibles).
set -euo pipefail

cd "$(dirname "$0")/.."
DIR=".despliegue"
mkdir -p "$DIR"
chmod 700 "$DIR"

say()  { printf "\n\033[1;32m▶ %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }

secreto() { openssl rand -hex "${1:-32}"; }

# ── 1. Llave SSH de despliegue ────────────────────────────────────────────────
say "Llave SSH de despliegue"
if [ -f "$DIR/deploy_key" ]; then
  info "ya existe — la reuso"
else
  ssh-keygen -t ed25519 -f "$DIR/deploy_key" -N "" -C "github-actions@subirfactura" >/dev/null
  info "generada"
fi
chmod 600 "$DIR/deploy_key"

# ── 2. Clave de respaldos (age) ───────────────────────────────────────────────
say "Clave de respaldos (age)"
if [ -f "$DIR/backup-key.txt" ]; then
  info "ya existe — la reuso"
else
  if ! command -v age-keygen >/dev/null 2>&1; then
    warn "Falta 'age'. Instálalo con:  brew install age"
    warn "Luego vuelve a correr este script."
    exit 1
  fi
  age-keygen -o "$DIR/backup-key.txt" 2>/dev/null
  info "generada"
fi
chmod 600 "$DIR/backup-key.txt"
AGE_PUBLICA=$(grep -o 'age1[a-z0-9]*' "$DIR/backup-key.txt" | head -1)

# ── 3. .env.prod ──────────────────────────────────────────────────────────────
say "Variables de producción (.env.prod)"
if [ -f "$DIR/.env.prod" ]; then
  info "ya existe — NO lo toco (edítalo a mano si hace falta)"
else
  cat > "$DIR/.env.prod" <<EOF
# SubirFactura — producción. Vive SOLO en el servidor, en /opt/subirfactura/.
# Generado por scripts/preparar-secretos.sh — no lo subas al repo.

GHCR_OWNER=erodmz
# Token para que el SERVIDOR baje las imágenes por su cuenta (./actualizar.sh).
# Los paquetes de GHCR nacen privados aunque el repo sea público, y el token de
# GitHub Actions caduca al terminar el workflow. Crea uno en
# github.com/settings/tokens con UN SOLO permiso: read:packages.
# ⚠️ LO PONES TÚ. Sin él, los despliegues manuales desde el servidor fallan.
GHCR_TOKEN=

# ── Dominios ──────────────────────────────────────────────────────────────────
# El panel y la landing viven en hosts distintos:
#   APP_DOMAIN     → el PANEL. Canónico de la app: los enlaces de los correos,
#                    las invitaciones y el CORS apuntan aquí.
#   LANDING_DOMAIN → la página pública. Es la URL que se indexa (SEO).
#   APEX_DOMAIN    → redirige a la landing. VACÍO si el apex aún no resuelve.
APP_DOMAIN=app.subirfactura.com
LANDING_DOMAIN=www.subirfactura.com
APEX_DOMAIN=subirfactura.com
# Let's Encrypt te escribe aquí si un certificado deja de renovarse.
ACME_EMAIL=elmer.rodriguez.m@gmail.com

# ── Postgres ──────────────────────────────────────────────────────────────────
POSTGRES_USER=facturard
POSTGRES_PASSWORD=$(secreto 24)
POSTGRES_DB=facturard
# Rol de la aplicación, SIN BYPASSRLS: es la segunda barrera del multi-tenant.
POSTGRES_APP_PASSWORD=$(secreto 24)

# ── Almacén de imágenes (MinIO, interno) ──────────────────────────────────────
MINIO_ROOT_USER=facturard
MINIO_ROOT_PASSWORD=$(secreto 24)
S3_BUCKET=invoices

# ── Sesiones ──────────────────────────────────────────────────────────────────
# Cambiarlos cierra la sesión de todos los usuarios.
JWT_SECRET=$(secreto 32)
JWT_REFRESH_SECRET=$(secreto 32)
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── OCR (Claude) ──────────────────────────────────────────────────────────────
# ⚠️ PEGA TU LLAVE AQUÍ. Sin ella las facturas caen a "en revisión" para
#    captura manual: no se pierde nada, pero no hay lectura automática.
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
OCR_CONCURRENCY=2

# ── Alertas al teléfono (ntfy) ────────────────────────────────────────────────
# Suscríbete a este topic en la app ntfy. Que sea difícil de adivinar: quien
# lo sepa puede leer tus alertas.
NTFY_URL=https://ntfy.sh
NTFY_TOPIC=subirfactura-$(secreto 6)

# ── Respaldos cifrados ────────────────────────────────────────────────────────
# La clave PÚBLICA: el servidor cifra pero NO puede descifrar. Si te lo
# comprometen, los respaldos siguen siendo ilegibles para el atacante.
BACKUP_AGE_PUBLIC_KEY=$AGE_PUBLICA
BACKUP_REMOTE=s3:subirfactura-respaldos
BACKUP_RETENTION_DAYS=30
# Las imágenes de las facturas son la EVIDENCIA del comprobante: sin esto, si
# se pierde el droplet quedan los datos sin el papel.
BACKUP_IMAGES=true
# ⚠️ COMPLETA con tu bucket (Cloudflare R2 recomendado: otro proveedor = otro
#    dominio de fallo, y no cobra egress el día que restaures de verdad).
BACKUP_S3_PROVIDER=Cloudflare
BACKUP_S3_ENDPOINT=
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=

# ── Opcionales ────────────────────────────────────────────────────────────────
# GOOGLE_CLIENT_ID=            # "Entrar con Google" (ver GUIA_DESPLIEGUE.md §7.5)
# ── Correo (verificación, recuperación, invitaciones) ─────────────────────────
# Sin esto no sale ningún correo: los enlaces quedan en el log del servidor.
# resend.com → API Keys. El dominio del remitente debe estar verificado allí.
RESEND_API_KEY=
MAIL_FROM=SubirFactura <no-reply@subirfactura.com>
DGII_LIVE_CONSULTA=true
DGII_LIVE_VERIFICATION=false
EOF
  chmod 600 "$DIR/.env.prod"
  info "generado con secretos aleatorios"
fi

# ── 4. Instrucciones ──────────────────────────────────────────────────────────
IP="${DEPLOY_HOST:-138.197.81.29}"
cat > "$DIR/INSTRUCCIONES.txt" <<EOF
SubirFactura — pasos para el primer despliegue
==============================================

1) PREPARAR EL SERVIDOR (una sola vez)

   scp scripts/bootstrap-servidor.sh root@$IP:/tmp/
   ssh root@$IP 'bash /tmp/bootstrap-servidor.sh "$(cat "$DIR/deploy_key.pub")"'

   Comprueba que entras SIN contraseña antes de seguir:
   ssh -i $DIR/deploy_key deploy@$IP 'echo ok'

2) SUBIR EL .env.prod (nunca pasa por git ni por GitHub)

   Completa primero, en $DIR/.env.prod:
     · ANTHROPIC_API_KEY   (console.anthropic.com)
     · GHCR_TOKEN          (github.com/settings/tokens → solo read:packages)
     · BACKUP_S3_*         (las 3 de tu bucket de respaldos)
   y luego:

   scp -i $DIR/deploy_key $DIR/.env.prod deploy@$IP:/opt/subirfactura/.env.prod
   ssh -i $DIR/deploy_key deploy@$IP 'chmod 600 /opt/subirfactura/.env.prod'

3) SECRETOS EN GITHUB  (repo → Settings → Secrets and variables → Actions)

   DEPLOY_HOST     $IP
   DEPLOY_USER     deploy
   DEPLOY_SSH_KEY  (todo el contenido de $DIR/deploy_key, incluidas las
                    líneas BEGIN/END)

   Para copiarla al portapapeles:  pbcopy < $DIR/deploy_key

4) DNS  (tu dominio está en Google Cloud DNS)

   Tipo  Nombre  Valor
   A     www     $IP     ← ya lo tienes
   A     @       $IP     ← FALTA: sin él, subirfactura.com sin "www" no abre

5) DESPLEGAR

   git push origin main
   (o GitHub → Actions → Deploy → Run workflow)

6) GUARDA ESTO DONDE NO SE PIERDA

   $DIR/backup-key.txt  ← la clave PRIVADA de los respaldos.
   Es lo ÚNICO que puede descifrarlos. Al gestor de contraseñas y a un USB.
   Si la pierdes, tus respaldos son basura cifrada. Nunca la subas al servidor.
EOF

say "Listo"
info "Todo quedó en $DIR/ (ignorada por git)"
echo
cat "$DIR/INSTRUCCIONES.txt"
echo
warn "Antes de desplegar, completa en $DIR/.env.prod: ANTHROPIC_API_KEY, GHCR_TOKEN y BACKUP_S3_*"
warn "Y respalda $DIR/backup-key.txt fuera de esta máquina."
