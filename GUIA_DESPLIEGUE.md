# Guía de despliegue — SubirFactura

De cero a producción en una sola caja, barata y con espacio para crecer.
Tiempo estimado la primera vez: **~1 hora**.

---

## 0. La arquitectura en una foto

```
                    Internet
                       │
              DNS (Google Cloud DNS) → 138.197.81.29
                       │  :443
              ┌────────▼────────┐
              │  Caddy (TLS auto)│   ← lo ÚNICO expuesto
              └────┬────────┬────┘   Let's Encrypt automático
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
| **Droplet** Premium AMD 4 GB / 2 vCPU / 80 GB NVMe, **NYC3** | DigitalOcean | ~$28/mes |
| Dominio `subirfactura.com` | ya lo tienes (Google Cloud DNS) | ~$12/año |
| Bucket para respaldos (**Cloudflare R2** o Backblaze B2) | — | centavos |
| API key de Anthropic (OCR) | console.anthropic.com | pago por uso |
| `age` en tu Mac | `brew install age` | gratis |

**Servidor de este proyecto: `138.197.81.29` · dominio: `www.subirfactura.com`.**

> **¿Por qué NYC3?** Está a ~55-70 ms de Santo Domingo. DigitalOcean no tiene
> Ashburn, pero Nueva York rinde prácticamente igual.
>
> **¿Por qué 4 GB y no 2?** En la caja conviven Postgres, Redis, MinIO, api,
> worker, web y Caddy: ~1.5 GB en reposo, pero el worker carga imágenes de
> varios MB en memoria para el OCR. Con 2 GB sobrevives sin usuarios y te
> mueres el día que tres personas suban fotos a la vez.

---

## 2. Generar llaves y secretos (en TU MÁQUINA)

Un solo comando produce todo lo que hace falta, en `.despliegue/` (ignorada
por git). Es idempotente: si algo ya existe lo reusa — regenerar el
`JWT_SECRET` cierra la sesión de todo el mundo, y regenerar la clave `age`
deja ilegibles los respaldos viejos.

```bash
./scripts/preparar-secretos.sh
```

Produce:

| Archivo | Qué es |
|---|---|
| `deploy_key` / `.pub` | llave SSH con la que GitHub Actions entra al servidor |
| `backup-key.txt` | clave **age** de los respaldos |
| `.env.prod` | variables del servidor, con secretos ya generados |
| `INSTRUCCIONES.txt` | los pasos siguientes, con tu IP ya puesta |

Antes de continuar, **completa a mano dos cosas** en `.despliegue/.env.prod`:
`ANTHROPIC_API_KEY` y las tres `BACKUP_S3_*` de tu bucket.

> ⚠️ **`backup-key.txt` es lo único que puede descifrar tus respaldos.**
> Al gestor de contraseñas y a un USB aparte. Si la pierdes, tus respaldos son
> basura cifrada. **Nunca la subas al servidor**: el servidor solo cifra, y por
> eso un atacante que lo comprometa tampoco puede leerlos.

---

## 3. Preparar el servidor (una sola vez)

```bash
scp scripts/bootstrap-servidor.sh root@138.197.81.29:/tmp/
ssh root@138.197.81.29 "bash /tmp/bootstrap-servidor.sh \"$(cat .despliegue/deploy_key.pub)\""
```

Deja listo: usuario `deploy` con tu llave · Docker · cortafuegos (solo 22/80/443)
· 2 GB de swap · actualizaciones de seguridad automáticas · `/opt/subirfactura`.
Puedes correrlo dos veces sin romper nada.

Comprueba que entras **sin contraseña** y solo entonces cierra esa puerta:

```bash
ssh -i .despliegue/deploy_key deploy@138.197.81.29 'echo ok'
ssh root@138.197.81.29 'bash /tmp/bootstrap-servidor.sh --endurecer-ssh'
```

> El endurecimiento va aparte **a propósito**: apaga las contraseñas SSH, y si
> tu llave no quedó bien instalada te dejaría fuera de tu propio servidor. El
> script se niega a hacerlo si `deploy` no tiene llaves.

---

## 4. Secretos y variables

Sube el `.env.prod` que ya generaste (nunca pasa por git ni por GitHub):

```bash
scp -i .despliegue/deploy_key .despliegue/.env.prod deploy@138.197.81.29:/opt/subirfactura/.env.prod
ssh -i .despliegue/deploy_key deploy@138.197.81.29 'chmod 600 /opt/subirfactura/.env.prod'
```

Contenido (así lo genera el script):

```bash
GHCR_OWNER=erodmz

# Dominio: APP_DOMAIN es el canónico; APEX_DOMAIN redirige a él.
APP_DOMAIN=www.subirfactura.com
APEX_DOMAIN=subirfactura.com
ACME_EMAIL=tu@correo.com          # Let's Encrypt avisa aquí si algo falla

POSTGRES_USER=facturard
POSTGRES_PASSWORD=<generado>
POSTGRES_DB=facturard
POSTGRES_APP_PASSWORD=<generado>  # rol SIN BYPASSRLS: 2ª barrera multi-tenant

MINIO_ROOT_USER=facturard
MINIO_ROOT_PASSWORD=<generado>
S3_BUCKET=invoices

JWT_SECRET=<generado>             # cambiarlos cierra la sesión de todos
JWT_REFRESH_SECRET=<generado>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

ANTHROPIC_API_KEY=sk-ant-...      # ← LO PONES TÚ
ANTHROPIC_MODEL=claude-haiku-4-5
OCR_CONCURRENCY=2

NTFY_TOPIC=<generado>             # suscríbete en la app ntfy

BACKUP_AGE_PUBLIC_KEY=age1...     # la PÚBLICA; la privada vive en tu Mac
BACKUP_REMOTE=s3:subirfactura-respaldos
BACKUP_IMAGES=true                # las imágenes SON la evidencia fiscal
BACKUP_RETENTION_DAYS=30
BACKUP_S3_PROVIDER=Cloudflare     # ← LAS 3 SIGUIENTES LAS PONES TÚ
BACKUP_S3_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com
BACKUP_S3_ACCESS_KEY=<...>
BACKUP_S3_SECRET_KEY=<...>
```

**En GitHub** → Settings → Secrets and variables → Actions:

| Secreto | Valor |
|---|---|
| `DEPLOY_HOST` | `138.197.81.29` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | contenido de `.despliegue/deploy_key` (`pbcopy < .despliegue/deploy_key`) |

---

## 5. DNS

El dominio está en **Google Cloud DNS** (`ns-cloud-e*.googledomains.com`).
Hacen falta los dos registros:

| Tipo | Nombre | Valor | Estado |
|---|---|---|---|
| A | `www` | `138.197.81.29` | ✅ ya existe |
| A | `@` | `138.197.81.29` | ⬅ **falta** |

Sin el registro del apex, `subirfactura.com` sin "www" no abre, y Caddy
reintenta sacarle certificado para siempre llenando el log de errores. Si
prefieres esperar, deja `APEX_DOMAIN=` **vacío** en `.env.prod`: cae en un
nombre `.localhost` que Caddy firma con su CA interna y no toca Let's Encrypt.

**Let's Encrypt no requiere ninguna configuración.** Caddy pide el certificado
solo la primera vez que alguien entra y lo renueva desde entonces; solo necesita
que los puertos 80 y 443 lleguen a la máquina (el cortafuegos ya los abre). Sin
Cloudflare de por medio no hay nada más que tocar — si algún día lo pones
delante, debe ir en **Full (strict)**, nunca en "Flexible", o se arma un bucle
de redirecciones.

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
curl https://www.subirfactura.com/health          # {"status":"ok","service":"facturard-api"}
```

Crea tu cuenta en `https://www.subirfactura.com/register` y luego hazte super-admin:

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
   - Orígenes de JavaScript autorizados: `https://www.subirfactura.com`
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

./actualizar.sh --estado      # qué corre, memoria y disco
./actualizar.sh --logs api    # seguir logs (api | worker | web | migrate…)
./actualizar.sh --alertas     # rupturas detectadas por el pipeline
./actualizar.sh               # traer y levantar la última versión
./actualizar.sh <sha>         # rollback a un commit ya construido
```

`actualizar.sh` hace lo mismo que GitHub Actions —bajar imágenes, levantar y
**esperar a que `/health` responda de verdad**— pero desde el servidor. Es para
cuando quieres desplegar sin abrir el navegador, o revertir rápido a las 2 a.m.
Nunca construye: un build de Node en 4 GB se muere.

Para lo que no cubre:

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.prod'
dc logs backup           # respaldos
dc exec postgres psql -U facturard facturard
```

### Cuando haya demanda (lo elástico)

```bash
# 1. Más workers — es donde ocurren los picos. Gratis, misma caja.
dc up -d --scale worker=3

# 2. Redimensionar el droplet: panel de DigitalOcean → Resize (~1 min,
#    con apagado; el disco no se toca)

# 3. Imágenes a Cloudflare R2 (egress gratis) cuando el disco apriete:
#    cambia S3_ENDPOINT / MINIO_ROOT_USER / MINIO_ROOT_PASSWORD en .env.prod
#    → el código ya habla S3, no hay que tocar nada más.
```

### Rollback

Desde el servidor (lo más rápido):

```bash
cd /opt/subirfactura && ./actualizar.sh <SHA del commit bueno>
```

O desde GitHub → Actions → Deploy → Run workflow → tag: `<SHA>`.

Baja las imágenes de ese tag y levanta. **No reconstruye nada** → tarda ~1 min.
Para ver los tags disponibles: pestaña *Packages* del repo.

> ⚠️ El rollback **no revierte migraciones de base de datos**. Si el despliegue
> malo migró el esquema, hay que restaurar el respaldo. Por eso las migraciones
> deben ser compatibles hacia atrás siempre que se pueda.

---

## 9. Costos reales

| Concepto | Mensual |
|---|---|
| Droplet DigitalOcean 4 GB / 2 vCPU | ~$28 |
| Dominio | ~$1 |
| Cloudflare R2 (respaldos) | ~$0–1 |
| **Fijo** | **~$30** |
| Claude (OCR) | variable — pago por uso, atado a tus planes |

El único costo que crece es el OCR, y crece **con el ingreso**, no contra él.

Un VPS equivalente en Hetzner cuesta ~$9. La diferencia es real; si algún día
pesa, el `docker-compose.prod.yml` corre igual en cualquier caja y mudarse es
un `bootstrap-servidor.sh` + restaurar el respaldo.

---

## 10. Cosas que ya te van a morder (documentadas para no redescubrirlas)

- **No construyas en el VPS.** Un build de Node con 4 GB se muere. Por eso el CD
  construye en Actions y el servidor solo baja imágenes.
- **`.env.prod` nunca en el repo.** El workflow falla a propósito si no lo
  encuentra en el servidor.
- **El almacén no se expone.** Las imágenes de facturas se sirven por el proxy
  autenticado del API y los logos por una ruta pública propia. No hay que
  publicar MinIO ni configurar `S3_PUBLIC_URL`.
- **Los dos registros DNS.** Con solo `www`, el apex no abre; con solo el apex,
  Caddy no puede sacar el certificado del canónico.
- **Si algún día pones Cloudflare delante**, en "Full (strict)", no "Flexible".
- **Las migraciones corren en su propia imagen** (`migrate`), que sí trae el CLI
  de prisma y tsx. Incluye los seeds: sin ellos no hay planes ni categorías 606
  y el despliegue nace roto.
- **La clave privada de age vive fuera del servidor.** Es el diseño, no un
  descuido.
