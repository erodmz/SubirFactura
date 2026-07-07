# Revisión de Seguridad y Privacidad — SubirFactura

> Consejo de 5 · 6 de julio de 2026 · Revisión defensiva autorizada por el dueño, solo lectura.

**Alcance:** `api/` (NestJS), `workers/` (BullMQ+Claude), `web/` (Next.js), `app_flutter/`, infra Docker.
**Etapa:** pre-lanzamiento.
**Veredicto general:** la arquitectura de seguridad es **notablemente sólida para pre-lanzamiento** (RLS real con rol sin BYPASSRLS, rotación de refresh tokens con detección de reuso, tokens hasheados, auditoría, validación de DTOs). Hay **un hallazgo crítico de autorización intra-tenant** y varios controles de endurecimiento que faltan antes de cobrar al primer cliente.

---

## CRÍTICO

### C-1. IDOR intra-tenant en endpoints de factura individual (fuga de datos entre clientes del mismo despacho)
**Archivos:** `api/src/invoices/invoices.controller.ts:75-91`, `api/src/invoices/invoices.service.ts:295-311` (`get`) y `:317-438` (`review`)

`list()` y `resumen()` filtran correctamente por rol: un `contador` solo ve sus clientes asignados y un `cliente` solo sus `client_profiles` (invoices.service.ts:146-173, 197-221). Pero los endpoints de **factura individual no replican ese filtro**:

- `GET /organizations/:orgId/invoices/:invoiceId` (`get`) hace `forOrg(orgId).invoice.findUnique({ where: { id } })` sin verificar que la factura pertenezca a un `clientProfile` que el usuario maneje.
- `PATCH .../:invoiceId/review` (`review`) igual: solo comprueba `puedeValidar` al validar, pero no la pertenencia al cliente.

La RLS protege el aislamiento **entre organizaciones**, no **entre clientes dentro de una organización**. `@OrgRoles('org_admin','contador','cliente')` solo exige ser miembro de la org.

**Explotación concreta:** un usuario con rol `cliente` del negocio A, dentro del despacho X, puede iterar UUIDs de factura (o tomarlos de cualquier respuesta) y hacer `GET .../invoices/{id}` de una factura del negocio B del mismo despacho: obtiene RNC del proveedor, NCF, montos, ITBIS y **las URLs firmadas de las imágenes** de la factura de otro contribuyente. Con `review` incluso puede editarlas. Un `contador` no asignado a un cliente también puede leer/editar sus facturas. Esto es exactamente el dato fiscal sensible que el producto promete aislar.

**Corrección:** en `get`, `review` (y `retry`, `changeStatus`) aplicar el mismo cálculo de `clientProfileId` permitido que `list()` según `membership`, y devolver 404 si la factura queda fuera del alcance.

---

## ALTO

### A-1. Sin rate limiting ni bloqueo por intentos fallidos (fuerza bruta / credential stuffing)
**Archivos:** `api/src/auth/auth.controller.ts:23-28` (`login`), `api/package.json` (no existe `@nestjs/throttler`), `api/src/main.ts`

`login` compara con bcrypt y no hay ninguna capa de `ThrottlerGuard` ni lockout por cuenta/IP. Tampoco hay CAPTCHA. Con datos fiscales de por medio, un atacante puede lanzar fuerza bruta/credential-stuffing ilimitado contra `/api/auth/login` (y `/auth/refresh`, `/auth/register` para enumerar correos vía el `ConflictException` "Ya existe una cuenta").

**Corrección:** `@nestjs/throttler` global + límite estricto en rutas de auth; bloqueo temporal por cuenta tras N fallos; respuestas de `register` que no revelen existencia de la cuenta.

### A-2. Botón "Ingreso rápido (dev)" con credenciales de prueba embebidas en cliente web y móvil
**Archivos:** `web/app/login/page.tsx:40-44`, `app_flutter/lib/screens/login_screen.dart:21-25`

Ambos clientes traen credenciales de prueba hardcodeadas y un botón visible (`⚡ Ingreso rápido (dev)`). Es un TODO conocido, pero hoy **se compilaría y enviaría a producción** tal cual. Las mismas credenciales están en `scripts/dev.sh:73,86-87`.

**Explotación:** si esa cuenta de prueba existe en el entorno productivo (y `dev.sh` la crea con esos datos), cualquiera que abra el login entra con un clic.

**Corrección:** eliminar el botón y las credenciales de ambos clientes (guardar tras `if (process.env.NODE_ENV !== 'production')` no basta para móvil; quitarlo). Asegurar que la cuenta de prueba no se siembre en prod.

---

## MEDIO

### M-1. CORS abierto por defecto en producción
**Archivos:** `api/src/main.ts:15`, `docker-compose.yml` (servicio `api`)

`app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true })`. En `docker-compose.yml` el servicio `api` **no define `WEB_ORIGIN`**, así que en producción cae a `origin: true` (refleja cualquier origen). El riesgo se atenúa porque la auth es Bearer en `localStorage` (no cookies), pero sigue siendo una config permisiva no intencionada. **Corrección:** pasar `WEB_ORIGIN=https://${APP_DOMAIN}` al contenedor `api` y no permitir el fallback `true` cuando `NODE_ENV=production`.

### M-2. Sin cabeceras de seguridad a nivel de aplicación (helmet)
**Archivos:** `api/main.ts`, `api/package.json` (sin `helmet`)

Caddy fija HSTS (`docker/Caddyfile`), pero no hay `helmet` ni CSP/nosniff/frame-options en el API ni política de contenido en Next.js. Dado que el token vive en `localStorage`, una CSP ayuda a mitigar robo por XSS. **Corrección:** `helmet` en el API y CSP en `web`.

### M-3. Token en `localStorage` (web) y `SharedPreferences` sin cifrar (móvil)
**Archivos:** `web/lib/api.ts:14-23`, `app_flutter/lib/api/client.dart:29-61`

- Web: access + refresh token en `localStorage` → cualquier XSS los exfiltra, y el refresh dura 7 días.
- Flutter: tokens en `SharedPreferences` (texto plano en el sandbox de la app), no en `flutter_secure_storage` (Keychain/Keystore).

**Corrección:** móvil → `flutter_secure_storage`. Web → idealmente refresh token en cookie `HttpOnly`+`Secure`+`SameSite`; como mínimo, CSP estricta y acortar TTL del refresh.

### M-4. Privacidad y cumplimiento Ley 172-13 (RD)
**Archivos:** `workers/src/ocr/extract.ts:66-92`, sin política de privacidad ni retención en el repo

Las **imágenes completas de facturas** (datos fiscales de terceros: RNC, NCF, montos, razón social) se envían a la API de Anthropic para OCR. No encontré: política de privacidad, aviso al usuario, acuerdo de tratamiento, ni política de retención/borrado (de hecho `clients.service.ts:119-128` **impide borrar** clientes con facturas, y no hay flujo de eliminación de datos). La Ley 172-13 exige consentimiento informado, finalidad y derechos ARCO. Con verificación e-CF en vivo activada (`DGII_LIVE_VERIFICATION`) también sale tráfico hacia la DGII.

**Corrección antes de cobrar:** aviso de privacidad que declare el subprocesamiento por Anthropic; verificar/activar zero-retention en la cuenta de Anthropic; definir política de retención y un mecanismo de exportación/borrado; registrar el consentimiento.

### M-5. Registro abierto sin verificación de correo
**Archivos:** `api/src/auth/auth.controller.ts:17-21`, `auth.service.ts:46-61`

`/auth/register` es `@Public()` y no verifica el correo; cualquiera crea usuario + organización (`organizations.controller.ts:34-37`, sin `@OrgRoles`, cualquier autenticado crea org y se auto-asigna `org_admin`). Riesgo de spam/abuso y de invitaciones aceptadas con correos no verificados. La aceptación de invitación sí valida coincidencia de correo (`invitations.service.ts:105`), lo cual es bueno, pero el correo del que acepta nunca fue verificado. **Corrección:** verificación de correo antes de habilitar acciones sensibles.

---

## BAJO

- **B-1. `invoice_images` sin RLS.** `shared/prisma/migrations/.../rls/migration.sql` solo activa RLS en `client_profiles` e `invoices`. El acceso hoy pasa por la relación de `invoice` (protegida), pero como defensa en profundidad conviene añadir política a `invoice_images`.
- **B-2. Política de contraseñas mínima.** `RegisterDto`/`ChangePasswordDto` exigen solo 8 caracteres (`auth/dto/auth.dto.ts:8,41`), sin complejidad ni chequeo contra contraseñas filtradas.
- **B-3. Access token no se invalida al cambiar contraseña ni al cambiar de rol.** `changePassword` revoca refresh tokens pero el access token (15m, con `isSuperAdmin` embebido) sigue válido hasta expirar. Ventana pequeña; aceptable, documentarlo.
- **B-4. HTTP en LAN durante dev.** `app_flutter/lib/api/client.dart:27` y MinIO en `9000` en todas las interfaces (`docker-compose.yml`) son cleartext. Es solo dev; asegurar que en prod todo va por Caddy/TLS y que el puerto `9000` no se expone.
- **B-5. `JWT_REFRESH_SECRET` declarado pero sin uso.** El refresh token es `randomBytes` opaco (correcto), así que la variable en `.env.example`/compose es engañosa; eliminarla o documentar que no se usa para firmar.

---

## Lo que está BIEN hecho (reconocimiento)

- **RLS como segunda barrera, bien montada.** Rol `facturard_app` con `NOBYPASSRLS` (`docker/initdb/01-app-role.sh:9`), `PrismaService.forOrg` fija `app.current_org` con `set_config(..., TRUE)` **dentro de la misma transacción** que la consulta (`prisma.service.ts:33-45`), y `current_setting(...,TRUE)` devuelve NULL sin contexto → sin org no se ve nada. Diseño correcto.
- **Rotación de refresh tokens con detección de reuso** que revoca **todas** las sesiones ante robo (`auth.service.ts:77-110`) — práctica de primer nivel.
- **Tokens sensibles siempre hasheados** (SHA-256) en BD: refresh e invitaciones; los valores en claro son `randomBytes` de alta entropía. Invitaciones con TTL de 7 días y aceptación ligada al correo.
- **bcrypt** para contraseñas.
- **`ValidationPipe` global con `whitelist` + `forbidNonWhitelisted` + `transform`** y DTOs con `class-validator` en todo el API.
- **Almacenamiento sin buckets públicos:** solo URLs prefirmadas y temporales (1h), claves con `randomUUID` no enumerables, separación de endpoint interno/público.
- **Subidas con allowlist de MIME y límites de tamaño/cantidad**.
- **Worker: scoping manual consistente.** Al usar conexión owner (bypasa RLS), verifica `invoice.organizationId === organizationId` (`processor.ts:59`) y filtra por `organizationId` en la auto-asignación. No se encontró ningún query del worker sin filtro de org.
- **Auditoría transversal y no bloqueante** (`audit.service.ts`).
- **Secretos fuera del repo:** `.env` y `web/.env.local` en `.gitignore` (confirmado), `.env.example` con placeholders, modelo de Claude por env.
- **Protección de "último administrador"** y bloqueo de edición/borrado de facturas ya incluidas en un 606.

---

## Checklist priorizado "antes de cobrar al primer cliente"

**Bloqueantes:**
1. **[C-1]** Aplicar filtro por cliente asignado/propio en `get`, `review`, `retry`, `changeStatus` de facturas (misma lógica que `list`). Añadir prueba de que un `cliente`/`contador` no accede a facturas fuera de su alcance.
2. **[A-2]** Eliminar el botón "Ingreso rápido (dev)" y las credenciales embebidas en `web` y `app_flutter`; verificar que la cuenta de prueba no se siembre en prod.
3. **[A-1]** Añadir rate limiting (`@nestjs/throttler`) + lockout en `/auth/*`; que `register` no revele existencia de cuenta.

**Alto valor, hacer antes del lanzamiento:**
4. **[M-1]** Fijar `WEB_ORIGIN` en el contenedor `api` y prohibir CORS `true` en producción.
5. **[M-2]** `helmet` en el API + CSP en `web`.
6. **[M-3]** Móvil a `flutter_secure_storage`; en web mover refresh token a cookie `HttpOnly` o endurecer con CSP + TTL menor.
7. **[M-4]** Política de privacidad + consentimiento (Ley 172-13), confirmar zero-retention en Anthropic, definir retención/borrado/exportación de datos.

**Endurecimiento:**
8. **[M-5]** Verificación de correo en registro.
9. **[B-1]** RLS también en `invoice_images`.
10. **[B-2]** Reforzar política de contraseñas (longitud + lista de filtradas).
11. **[B-4/B-5]** Confirmar que en prod nada va por HTTP y limpiar `JWT_REFRESH_SECRET` sin uso.
