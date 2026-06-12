# FacturaRD — Especificación del Proyecto

> Documento de arranque para Claude Code. Colócalo en la raíz del repositorio.
> Plataforma SaaS multi-tenant para que contadores de República Dominicana
> recolecten, digitalicen y reporten facturas de gastos de sus clientes ante la DGII.

---

## 1. Visión del producto

Los contadores dominicanos pierden horas persiguiendo facturas físicas de sus clientes
para preparar el **Formato 606** (compras de bienes y servicios) de la DGII. Esta
plataforma resuelve ese flujo completo:

1. El **cliente final** fotografía sus facturas desde una app móvil.
2. La plataforma extrae los datos fiscales con **IA de visión** (NCF, RNC, fecha,
   montos, ITBIS) y sugiere la categoría de gasto del 606.
3. Las facturas con baja confianza caen en una **cola de revisión** que valida el
   cliente o el contador.
4. El **contador** confirma clasificaciones, valida NCF/RNC en lote contra la DGII,
   y genera el **TXT oficial del 606**, el **607**, o una **exportación a Excel**.

## 2. Decisiones tomadas (no re-discutir, implementar)

| Tema | Decisión |
|---|---|
| App móvil | Flutter (una sola base iOS + Android) |
| Backend | Node.js + TypeScript |
| Base de datos | PostgreSQL (con row-level security por tenant) |
| Lectura de facturas | Claude API (modelo con visión) — JSON estructurado con confianza por campo |
| Hosting v1 | Servidor Ubuntu propio, todo en Docker Compose, diseño 12-factor portable a cloud |
| Almacenamiento de imágenes | MinIO (S3-compatible) en el servidor; migrable a S3 real |
| Colas / async | Redis + BullMQ para el pipeline OCR y trabajos de lote |
| Validación DGII | En lote, antes de generar el 606 (Padrón RNC local + verificación de NCF) |
| Salidas DGII v1 | TXT 606 oficial + TXT 607 + exportación Excel (flexibilidad total) |
| Clasificación de gasto | La IA sugiere la categoría del 606; el contador confirma |
| Monetización | 3 planes (Básico / Pro / Empresarial) con límites configurables; cobro manual por transferencia en v1 (activación por admin), pasarela Azul/CardNET en fase posterior |
| Equipo | Un solo desarrollador con Claude Code → **monolito modular**, no microservicios |

## 3. Arquitectura

```
[App Flutter] ──HTTPS──▶ [API Node.js/TS (NestJS)] ──▶ [PostgreSQL]
                              │                          [Redis]
                              ├──▶ [BullMQ workers] ──▶ [Claude API (visión)]
                              └──▶ [MinIO (imágenes)]
Todo orquestado con Docker Compose detrás de un reverse proxy (Caddy o Nginx) con TLS.
```

- **Monolito modular en NestJS**: módulos `auth`, `tenants`, `clients`, `invoices`,
  `ocr`, `dgii`, `billing`, `admin`. Separación limpia para extraer servicios después
  si la demanda lo exige.
- **Workers separados del API** (mismo repo, otro proceso/contenedor): el OCR es
  asíncrono; el API nunca espera a Claude para responder una subida.
- **12-factor**: toda configuración por variables de entorno. Migrar a AWS/GCP debe
  ser cambiar env vars y endpoints, nunca reescribir código.

## 4. Modelo multi-tenant (el corazón del sistema)

Reglas de negocio:

- Una **empresa contable** (organización/tenant) tiene contadores y clientes.
- Un **usuario** puede pertenecer a **varias empresas** con roles distintos en cada una.
- Cada **cliente final** es atendido por uno o más contadores asignados.
- Todo dato fiscal pertenece a un tenant; nunca se cruza información entre tenants.

Esquema base (simplificado):

```
users            (id, email, password_hash, nombre, telefono, ...)
organizations    (id, nombre, rnc, plan_id, estado_suscripcion, ...)
memberships      (user_id, organization_id, rol)        -- rol: org_admin | contador | cliente
client_profiles  (id, organization_id, user_id, rnc_o_cedula, razon_social, ...)
assignments      (contador_membership_id, client_profile_id)
invoices         (id, organization_id, client_profile_id, estado, imagen_url,
                  ncf, rnc_proveedor, razon_social_proveedor, fecha,
                  monto_facturado, itbis, otros_impuestos, propina_legal,
                  categoria_606, confianza_por_campo JSONB,
                  validacion_dgii JSONB, periodo_fiscal, ...)
plans            (id, nombre, max_contadores, max_clientes, max_facturas_mes, precio)
subscriptions    (organization_id, plan_id, estado, inicio, fin, metodo_pago)
audit_log        (quién hizo qué y cuándo — crítico para datos fiscales)
```

- `organization_id` en toda tabla de datos + **row-level security** de PostgreSQL
  activada con `SET app.current_org` por request.
- Estados de factura: `subida → procesando → extraida → en_revision → validada →
  incluida_en_606 → reportada` (+ `rechazada`, `duplicada`).
- **Detección de duplicados**: hash perceptual de la imagen + unicidad
  (organization_id, rnc_proveedor, ncf).

## 5. Pipeline de lectura de facturas (OCR con IA)

1. La app Flutter captura la foto con guías de encuadre, la comprime (~1–2 MB,
   JPEG) y la sube al API → se guarda en MinIO y se encola el trabajo.
2. El worker llama al **Claude API** con la imagen y un prompt que exige **solo JSON**
   con este contrato:

```json
{
  "ncf": {"valor": "B0100000123", "confianza": 0.97},
  "rnc_proveedor": {"valor": "101000000", "confianza": 0.95},
  "razon_social": {"valor": "...", "confianza": 0.90},
  "fecha": {"valor": "2026-05-14", "confianza": 0.98},
  "monto_facturado": {"valor": 1500.00, "confianza": 0.99},
  "itbis": {"valor": 270.00, "confianza": 0.97},
  "propina_legal": {"valor": 0, "confianza": 0.9},
  "categoria_606_sugerida": {"valor": "02", "confianza": 0.85},
  "tipo_comprobante": {"valor": "01", "confianza": 0.9},
  "es_legible": true,
  "notas": "..."
}
```

3. **Reglas de confianza** (configurables por env):
   - Todos los campos críticos (NCF, RNC, fecha, monto, ITBIS) ≥ 0.90 → `extraida`
     y pasa directo a confirmación de categoría.
   - Cualquier campo crítico < 0.90 → `en_revision`, marcando en la UI exactamente
     qué campos dudosos debe corregir el cliente o contador.
   - `es_legible: false` → se pide al cliente re-tomar la foto desde la app.
4. **Validaciones determinísticas post-extracción** (no confiar solo en la IA):
   - Estructura del NCF (serie B + 2 dígitos de tipo + 8 secuenciales; e-CF serie E).
   - RNC de 9 dígitos o cédula de 11, con dígito verificador.
   - Coherencia aritmética: subtotal + ITBIS (18%) + propina (10%) ≈ total.
5. Reintentos con backoff en el worker; si Claude API falla 3 veces → `en_revision`
   con captura manual de datos como respaldo. **Nunca se pierde una factura.**

Referencia del API: https://docs.claude.com/en/api/overview (usar el SDK oficial de
TypeScript `@anthropic-ai/sdk`; verificar en la doc el modelo con visión vigente y
sus límites antes de fijarlo en código — mantener el nombre del modelo en env var).

## 6. Módulo DGII

- **Formato 606**: generador del TXT oficial por período fiscal (AAAAMM). Encabezado
  + detalle según la norma vigente de la DGII. Antes de codificarlo, descargar la
  especificación técnica actual desde dgii.gov.do y validar contra ella (las normas
  cambian; no asumir el layout de memoria).
- **Formato 607** (ventas): misma infraestructura, segundo generador.
- **Exportación Excel**: mismo dataset del 606/607 en .xlsx para contadores que
  prefieren ajustar a mano.
- **Validación en lote pre-606**:
  - **Padrón RNC**: la DGII publica el padrón completo descargable. Job programado
    que lo importa a PostgreSQL semanalmente → validación local instantánea de que
    el RNC existe y su razón social coincide.
  - **NCF**: la consulta pública de la DGII no tiene API oficial documentado.
    ⚠️ RIESGO TÉCNICO A RESOLVER EN FASE 1: evaluar (a) automatización de la
    consulta web, (b) proveedor tercero, (c) validación estructural + padrón como
    mínimo viable. No bloquear el resto del desarrollo por esto.
- Las 11 categorías de gasto del 606 (01 gastos de personal … 11 gastos de seguros)
  como tabla de referencia en la BD, no hardcodeadas.

## 7. Planes y monetización

- Tabla `plans` con límites: `max_contadores`, `max_clientes`, `max_facturas_mes`.
  Tres registros semilla: **Básico / Pro / Empresarial** (precios placeholder en
  config; se definen comercialmente después).
- **Enforcement en el API** (guards de NestJS): al invitar contador, crear cliente o
  subir factura se valida contra el plan. Al 80% del límite → notificación; al 100%
  → bloqueo suave con CTA de upgrade.
- **v1: cobro manual.** Panel de super-admin (tú) para activar/extender/suspender
  suscripciones tras recibir la transferencia. La tabla `subscriptions` y el
  enforcement quedan completos desde el día 1.
- **Fase posterior**: integración con pasarela local (Azul o CardNET) detrás de una
  interfaz `PaymentProvider` para no acoplar el dominio a la pasarela.

## 8. Seguridad (innegociable: son datos fiscales)

- PostgreSQL **solo en la red interna de Docker**. Cerrar el puerto 5432 expuesto a
  internet que hoy tiene el servidor. `ufw`: permitir solo 22 (con llaves SSH,
  idealmente IP restringida) y 443.
- TLS en todo (Caddy con certificados automáticos). HSTS.
- Autenticación: JWT cortos + refresh tokens rotados; bcrypt/argon2 para contraseñas.
- Autorización por membresía y rol en CADA endpoint + RLS como segunda barrera.
- URLs firmadas y temporales para servir imágenes desde MinIO (nunca buckets públicos).
- **Backups automáticos diarios fuera del servidor** (pg_dump + imágenes → storage
  externo cifrado). Probar la restauración, no solo el backup.
- `audit_log` de toda acción sobre facturas y reportes.
- Rate limiting en endpoints públicos (login, subida).

## 9. Roadmap de construcción (orden para Claude Code)

**Fase 0 — Fundación (1 semana de trabajo)**
Monorepo (pnpm workspaces: `api`, `workers`, `shared`, `app_flutter` aparte),
Docker Compose (Postgres, Redis, MinIO, API, worker, Caddy), CI básico, migraciones
(Prisma o Drizzle), seeds de planes y categorías 606.

**Fase 1 — Núcleo multi-tenant**
Auth + memberships multi-empresa, roles, invitaciones, panel web mínimo del contador
(puede ser Next.js o Flutter Web), CRUD de clientes y asignaciones, enforcement de
límites de plan, panel super-admin de suscripciones.

**Fase 2 — Captura y OCR**
App Flutter: login multi-empresa (selector de empresa), cámara con guías, cola de
subida offline-first (reintentos al recuperar señal), pipeline OCR completo con
Claude API, estados de factura, cola de revisión con edición campo a campo.

**Fase 3 — DGII**
Importador del padrón RNC, validaciones en lote, generadores 606/607 TXT + Excel,
cierre de período fiscal, resolución del riesgo NCF.

**Fase 4 — Pulido y lanzamiento**
Notificaciones push (recordatorio mensual de subir facturas), métricas de uso,
hardening de seguridad, pruebas de carga del pipeline, onboarding de los primeros
contadores piloto.

**Fase 5 — Post-lanzamiento**
Pasarela de pago Azul/CardNET, e-CF (comprobantes electrónicos), reportes analíticos
para el contador, migración a cloud si la demanda lo exige.

## 10. Convenciones para Claude Code

- TypeScript estricto (`strict: true`), ESLint + Prettier.
- Tests: unitarios para validadores fiscales (NCF, RNC, aritmética, generador 606 —
  100% de cobertura aquí) e integración para el pipeline OCR con respuestas mockeadas.
- Commits convencionales; una rama por fase.
- Español en la UI y mensajes al usuario; inglés en código e identificadores.
- Dinero como `BIGINT` en centavos o `NUMERIC(14,2)` — nunca float.
- Fechas en UTC en BD; zona `America/Santo_Domingo` solo en presentación y cortes
  de período fiscal.
- Cada módulo nuevo arranca con su migración + seed + test antes de la UI.
