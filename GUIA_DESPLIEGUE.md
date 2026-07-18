# Guía de despliegue — SubirFactura

De cero a producción en una sola caja, barata y con espacio para crecer.
Tiempo estimado la primera vez: **~1 hora**.

---

## 0. La arquitectura en una foto

```
                    Internet
                       │
                 Cloudflare (gratis: DNS, caché, DDoS)
                       │  :443
              ┌────────▼────────┐
              │  Caddy (TLS auto)│   ← lo ÚNICO expuesto
              └────┬────────┬────┘
            /api/* │        │ resto
              ┌────▼───┐ ┌──▼────┐
              │  api   │ │  web  │
              └────┬───┘ └───────┘
                   │        red interna (nada publicado)
      ┌────────┬───┴────┬──────────┬─────────┐
   postgres  redis    minio      worker    backup
                                   │          │  3:15 a.m.
                              Claude API   → cifrado → R2/B2
```

**Todo vive en un VPS.** Lo elástico de verdad: subir réplicas del `worker`
(donde ocurren los picos) y redimensionar la caja en 1 minuto.

---

## 1. Lo que necesitas antes de empezar

| Cosa | Dónde | Costo |
|---|---|---|
| VPS (recomendado: **Hetzner CPX21**, 3 vCPU / 4 GB / 80 GB, **Ashburn**) | hetzner.com/cloud | ~€8/mes |
| Dominio | Namecheap / Cloudflare | ~$12/año |
| Cuenta Cloudflare (DNS + caché) | cloudflare.com | gratis |
| Bucket para respaldos (**Cloudflare R2** o Backblaze B2) | — | centavos |
| API key de Anthropic (OCR) | console.anthropic.com | pago por uso |

> **¿Por qué Ashburn y no Alemania?** Ashburn está a ~50-60 ms de RD (Alemania,
> ~130 ms). Y como Cloudflare tiene PoP en Santo Domingo, la landing y los
> estáticos salen del borde: solo lo dinámico toca el origen.

---

## 2. Preparar el servidor (una sola vez)

```bash
ssh root@TU_IP

# Usuario sin root para desplegar
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy 2>/dev/null || true

# Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Cortafuegos: solo SSH y web
apt install -y ufw
ufw allow OpenSSH && ufw allow 80 && ufw allow 443
ufw --force enable

mkdir -p /opt/subirfactura && chown deploy:deploy /opt/subirfactura
```

Llave SSH para que GitHub Actions entre (**en tu máquina**):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/subirfactura_deploy -N ""
ssh-copy-id -i ~/.ssh/subirfactura_deploy.pub deploy@TU_IP
cat ~/.ssh/subirfactura_deploy      # ← esta clave privada va a los secretos
```

---

## 3. Claves de respaldo (¡hazlo bien!)

El servidor **solo puede cifrar**, no descifrar. Si algún día lo comprometen,
el atacante no puede leer tus respaldos.

```bash
# EN TU MÁQUINA, no en el servidor
brew install age
mkdir -p ~/.config/subirfactura
age-keygen -o ~/.config/subirfactura/backup-key.txt
```

Verás algo como:

```
Public key: age1abc…      ← va al servidor (BACKUP_AGE_PUBLIC_KEY)
```

> ⚠️ **La clave privada (`backup-key.txt`) es lo único que puede restaurar tus
> respaldos.** Guárdala en tu gestor de contraseñas y en un USB aparte. Si la
> pierdes, los respaldos son basura cifrada. **Nunca la subas al servidor.**

---

## 4. Secretos y variables

**En el servidor**, crea `/opt/subirfactura/.env.prod`:

```bash
su - deploy && cd /opt/subirfactura && nano .env.prod
```

```bash
GHCR_OWNER=erodmz
APP_DOMAIN=subirfactura.do

# Postgres — genera con: openssl rand -hex 24
POSTGRES_USER=facturard
POSTGRES_PASSWORD=<pega-uno>
POSTGRES_DB=facturard
POSTGRES_APP_PASSWORD=<pega-otro>

# MinIO
MINIO_ROOT_USER=facturard
MINIO_ROOT_PASSWORD=<pega-otro>
S3_BUCKET=invoices

# JWT — openssl rand -hex 32 (uno distinto cada uno)
JWT_SECRET=<...>
JWT_REFRESH_SECRET=<...>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OCR
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5
OCR_CONCURRENCY=2

# Alertas (topic difícil de adivinar)
NTFY_TOPIC=<tu-topic>

# Respaldos
BACKUP_AGE_PUBLIC_KEY=age1abc…           # la PÚBLICA del paso 3
BACKUP_REMOTE=s3:subirfactura-backups
BACKUP_S3_PROVIDER=Cloudflare
BACKUP_S3_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com
BACKUP_S3_ACCESS_KEY=<...>
BACKUP_S3_SECRET_KEY=<...>
BACKUP_RETENTION_DAYS=30
```

```bash
chmod 600 .env.prod    # que solo lo lea deploy
```

**En GitHub** → Settings → Secrets and variables → Actions:

| Secreto | Valor |
|---|---|
| `DEPLOY_HOST` | la IP del VPS |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | el contenido de `~/.ssh/subirfactura_deploy` (la privada) |

---

## 5. DNS

En Cloudflare, apunta tu dominio al VPS:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| A | `@` | TU_IP | 🟠 activado |
| A | `www` | TU_IP | 🟠 activado |

En **SSL/TLS → Overview**, pon el modo en **Full (strict)**. Caddy saca su
propio certificado; con "Flexible" se te arma un bucle de redirecciones.

---

## 6. Primer despliegue

```bash
# En GitHub: Actions → Deploy → Run workflow (o simplemente empuja a main)
git push origin main
```

El workflow: verifica (lint/build/test) → construye las 5 imágenes → las sube a
GHCR → entra por SSH → `pull` + `up -d` → **no termina hasta que `/health`
responde**.

Cuando acabe:

```bash
curl https://TU_DOMINIO/health          # {"status":"ok","service":"facturard-api"}
```

Crea tu cuenta en `https://TU_DOMINIO/register` y luego hazte super-admin:

```bash
cd /opt/subirfactura
# `migrate` ya terminó; se levanta uno nuevo solo para esto (run, no exec).
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate \
  node_modules/.bin/tsx scripts/make-super-admin.ts tu@correo.com
```

---

## 7. Probar el respaldo el MISMO día (no esperes a la madrugada)

```bash
cd /opt/subirfactura
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backup once
```

Debe terminar en `OK — respaldo del … completado`. Si falla, te llega un ntfy.

**Y ensaya una restauración** (en tu máquina, no en producción):

```bash
rclone copy s3:subirfactura-backups/db/2026-07-16/ ./restore/
scripts/restore-backup.sh ./restore/subirfactura-*.age \
  postgresql://facturard:clave@localhost:5433/facturard_restore
```

> Un respaldo que nunca restauraste no es un respaldo: es una esperanza.

---

## 7.5 Activar "Entrar con Google" (opcional)

El acceso social viene **apagado** hasta que lo configures (sin credenciales, el
botón no aparece y `/auth/google` responde "no configurado"). Para encenderlo:

1. **Google Cloud Console** → *APIs y servicios* → *Credenciales* → *Crear
   credenciales* → *ID de cliente de OAuth* → tipo **Aplicación web**.
   - Orígenes de JavaScript autorizados: `https://TU_DOMINIO`
   - Copia el **Client ID** (es público, no es secreto).
2. En GitHub → *Settings* → *Secrets and variables* → *Actions* → pestaña
   **Variables** (no Secrets): crea `GOOGLE_CLIENT_ID` con ese valor. El CD lo
   hornea en el panel web (`NEXT_PUBLIC_*` es build-time).
3. En el servidor, añade a `.env.prod`: `GOOGLE_CLIENT_ID=<el mismo valor>`
   (lo usa el API para verificar los tokens).
4. Vuelve a desplegar (push a main). El botón aparece solo.

> La identidad es única por correo: si alguien ya tiene cuenta con contraseña y
> entra con Google usando el mismo correo, se **enlazan** — es la misma cuenta.
> Facebook y el botón en la app móvil (`google_sign_in`) reusan este mismo
> backend; quedan como siguiente paso.

---

## 8. Operación diaria

```bash
cd /opt/subirfactura
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.prod'

dc ps                    # qué está corriendo
dc logs -f api           # logs del API
dc logs -f worker        # OCR
dc logs backup           # respaldos
grep '\[ALERTA\]' <(dc logs api worker)   # rupturas detectadas
```

### Cuando haya demanda (lo elástico)

```bash
# 1. Más workers — es donde ocurren los picos. Gratis, misma caja.
dc up -d --scale worker=3

# 2. Redimensionar la caja: en el panel de Hetzner, "Rescale" (~1 min)

# 3. Imágenes a Cloudflare R2 (egress gratis) cuando el disco apriete:
#    cambia S3_ENDPOINT / MINIO_ROOT_USER / MINIO_ROOT_PASSWORD en .env.prod
#    → el código ya habla S3, no hay que tocar nada más.
```

### Rollback

```
GitHub → Actions → Deploy → Run workflow → tag: <SHA del commit bueno>
```

Baja las imágenes de ese tag y levanta. **No reconstruye nada** → tarda ~1 min.
Para ver los tags disponibles: pestaña *Packages* del repo.

> ⚠️ El rollback **no revierte migraciones de base de datos**. Si el despliegue
> malo migró el esquema, hay que restaurar el respaldo. Por eso las migraciones
> deben ser compatibles hacia atrás siempre que se pueda.

---

## 9. Costos reales

| Concepto | Mensual |
|---|---|
| VPS Hetzner CPX21 | ~$9 |
| Dominio | ~$1 |
| Cloudflare + R2 (respaldos) | ~$0–1 |
| **Fijo** | **~$10–11** |
| Claude (OCR) | variable — pago por uso, atado a tus planes |

El único costo que crece es el OCR, y crece **con el ingreso**, no contra él.

---

## 10. Cosas que ya te van a morder (documentadas para no redescubrirlas)

- **No construyas en el VPS.** Un build de Node con 4 GB se muere. Por eso el CD
  construye en Actions y el servidor solo baja imágenes.
- **`.env.prod` nunca en el repo.** El workflow falla a propósito si no lo
  encuentra en el servidor.
- **El almacén no se expone.** Las imágenes de facturas se sirven por el proxy
  autenticado del API y los logos por una ruta pública propia. No hay que
  publicar MinIO ni configurar `S3_PUBLIC_URL`.
- **Cloudflare en "Full (strict)"**, no "Flexible".
- **Las migraciones corren en su propia imagen** (`migrate`), que sí trae el CLI
  de prisma y tsx. Incluye los seeds: sin ellos no hay planes ni categorías 606
  y el despliegue nace roto.
- **La clave privada de age vive fuera del servidor.** Es el diseño, no un
  descuido.
