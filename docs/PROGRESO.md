# PROGRESO — SubirFactura

> Estado real del proyecto. Actualizar aquí al cerrar trabajo relevante
> (el README solo lleva el resumen por fases; el detalle vive aquí).
> Última actualización: **7 de julio de 2026** (rama `fase-2`).

## Resumen ejecutivo

Fases 0–2 completas; Fase 3 (DGII) casi completa — falta el 607. El consejo de 5
asesores (6-jul-2026, informes en [consejo-2026-07/](consejo-2026-07/)) concluyó
unánime: **la restricción ya no es el código, es el mercado y el reloj**. Meta del
escéptico: **10 despachos pagando antes del 15-oct-2026** o replantear sin culpa.
Posicionamiento adoptado: *"la bandeja de gastos del contador dominicano"*
(foto + PDF + XML e-CF → 606/607), no "OCR mágico".

## Fases (roadmap de ESPECIFICACION.md §9)

- [x] **Fase 0 — Fundación**: monorepo pnpm, Docker Compose (Postgres/Redis/MinIO/Caddy),
      Prisma + seeds, CI, validadores fiscales con tests.
- [x] **Fase 1 — Núcleo multi-tenant**: auth JWT + refresh rotado, memberships
      multi-empresa, invitaciones, clientes + asignaciones, límites de plan, RLS,
      panel super-admin, panel web del contador (Next.js).
- [x] **Fase 2 — Captura y OCR**: subida a MinIO, cola BullMQ, worker con Claude
      Vision + structured outputs, reglas de confianza 80/100%, validaciones
      determinísticas, duplicados, cola de revisión campo a campo, captura manual
      tras 3 reintentos. App Flutter: login multi-empresa, captura con guías, cola
      offline-first, estados en vivo, revisión. Share extension iOS/Android.
- [ ] **Fase 3 — DGII** (en curso): ✅ 606 TXT + Excel **por cliente**, cierre de
      período con semáforo, padrón RNC, validación NCF/RNC en revisión, lectura QR
      e-CF. ⏳ Pendiente: **607 (ventas)** — la landing lo promete; quitarlo de ahí
      mientras tanto.
- [ ] **Fase 4 — Pulido y lanzamiento** (adelantos hechos): ✅ verificación e-CF en
      vivo contra ecf.dgii.gov.do (flag `DGII_LIVE_VERIFICATION`). ⏳ Push, métricas,
      hardening, tiendas, pilotos.
- [ ] **Fase 5 — Post-lanzamiento**: pasarela Azul/CardNET, ingesta XML e-CF,
      reportes analíticos.

## Sprint de bloqueantes del consejo — HECHO ✅ (7-jul-2026, commit `e6a132c`)

Todo verificado end-to-end:

1. **606 por cliente** — `dgii.service.ts` genera el 606 con el RNC de cada
   contribuyente; endpoints exigen `clientId`; selector de cliente en la web.
2. **IDOR intra-tenant cerrado** — `invoiceScope()`/`assertInvoiceInScope()` en
   get/review/retry/changeStatus (verificado: cliente ajeno → 404).
3. **Quick-login de dev eliminado** de web y móvil (ya no se compilan credenciales).
4. **Rate limiting** — login/register 10/min, refresh 30/min, global 120/min.
5. **P0s de release móvil** — permiso INTERNET en Android, nombre "SubirFactura"
   (iOS+Android), `API_URL` sin default en release.
6. **OCR a Haiku por defecto** (~1/5 del costo).

## Mes 1 — "El producto que un contador recomienda"

- [x] Flujo de las 80 facturas: split view + **"Guardar y siguiente"** en cadena,
      ⌘/Ctrl+Enter, filtro de período, totales (commit `f686b8f`).
- [ ] **Formato 607** (ventas).
- [ ] **Dashboard operativo** del contador — consumir `/invoices/resumen` (el
      endpoint ya existe y hoy no se usa en web) + semáforo del mes.
- [ ] **Push notifications** (FCM primero).
- [ ] **Subida web drag & drop** + reintentar OCR (endpoints ya existen).
- [ ] Enviar apps a las tiendas (cuentas de developer + bundle IDs definitivos:
      unificar `com.elmerrodriguez.facturard` iOS vs `com.facturard.app` Android).
- [ ] Política de privacidad + términos (Ley 172-13, declarar subprocesamiento
      Anthropic); eliminación de cuenta in-app; recuperación de contraseña.
- [ ] Endurecimiento: verificación de correo, tokens a `flutter_secure_storage`,
      sesión expirada → Login, helmet + CORS fijo, RLS en `invoice_images`.
- [ ] Monitoreo del parser DGII (alerta si devuelve vacío) + degradación explícita en UI.

## Calle (no es código, pero es el camino crítico)

- [ ] 3 contadores conocidos en piloto con facturas reales de julio
      (TestFlight/APK, gratis); objetivo: 1 genera su 606 de julio con la herramienta.
- [ ] Precios hipótesis para pilotos: RD$2,900 / 6,900 / 14,900 por despacho
      (los seeds siguen en `precio: '0.00'`).
- [ ] Instrumentar desde el piloto #1: ratio de captura del cliente final,
      % de facturas con QR e-CF, tiempo de revisión por factura,
      conversión demo → pago.

## Trimestre (corte: 15-oct-2026)

- [ ] **10 despachos pagando** (~RD$50–70k MRR) o replantear sin culpa.
- [ ] Apps publicadas + caso de éxito documentado + primera charla ICPARD
      (gancho: obligatoriedad e-CF del 15-nov-2026).
- [ ] **Ingesta XML e-CF** (el pivote a "bandeja de gastos" hecho código).
- [ ] Trial autoservicio de 30 días.

## Decisiones tomadas (no re-abrir)

| Fecha | Decisión |
|---|---|
| jun-2026 | Rebrand FacturaRD → **SubirFactura** (código sigue `@facturard/*`) |
| jul-2026 | **606 por cliente** (no 1-org-1-empresa): coherente con el pitch multi-cliente |
| jul-2026 | Posicionamiento: **"bandeja de gastos del contador"**, no "OCR mágico" |
| jul-2026 | OCR con **Haiku** por defecto; modelo siempre por env var |
| jul-2026 | Pilotos gratis primero; primer cobro solo con bloqueantes cerrados (ya lo están) |

## Sesión 9-jul-2026 — pulido móvil + dashboard del contador

Trabajo reciente (rama `fase-2`):

- **App Flutter**: share extension corregido (sube sin asignar, el worker
  clasifica por RNC; preview + Subir/Cancelar; multi-foto pregunta separadas vs
  una factura de páginas; se ve subiendo siempre). Fix del preview de imagen
  (ATS/cleartext). Revisión de factura a la par del panel web (mismos campos,
  permisos, validación). Scroll estable. Logo/badge/offline.
- **Backend/worker**: lector de QR e-CF robusto (escala + 4 rotaciones) — corrige
  NCF/fecha y caza duplicados. Worker zombi eliminado; `stop.sh`/`dev.sh`
  endurecidos. Permiso "ver reportes" que el contador otorga por cliente.
- **Panel web**: dashboard del contador enriquecido (KPIs con récord y delta,
  gráficos donut/área/barras, insights accionables, clientes por atender),
  **configurable** por contador (mostrar/ocultar, reordenar drag-and-drop,
  redimensionar con el mouse en ancho y alto), filtros de período y cliente,
  toggle de tema en el topbar, controles modernos (toggle, dropdown).

> ⚠️ **TODAVÍA FALTAN UN MONTÓN DE AJUSTES** — esto es un avance, no el final.
> Pendientes conocidos: fijar el layout por defecto del dashboard (config del
> usuario), drag táctil en móvil, que los gráficos llenen el alto del widget,
> 607 (ventas), ingesta XML e-CF, pulir estados/errores, más pruebas E2E, y todo
> lo del roadmap de arriba. Revisar y ajustar a fondo antes de considerar listo.
