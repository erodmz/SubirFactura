# Informe de Usabilidad y Producto Web — SubirFactura

> Consejo de 5 · 6 de julio de 2026 · Basado en lectura completa de `web/app/`, `web/lib/`, y los módulos `api/src/invoices`, `api/src/dgii` y `api/src/audit`.

**Rol:** Asesor de UX/Producto B2B · **Usuario objetivo:** contador dominicano ~45 años, vive en Excel, cierra 606 cada mes antes del día 15.

## Resumen ejecutivo

La base es sorprendentemente sólida para la fase en que está: el semáforo de cierre del 606 (`dgii/page.tsx` + `cierreEstado`) es exactamente el tipo de feature que un contador valora, el español es consistente y natural ("Falta para poder cerrar", "venció hace N días"), y el modal de revisión cubre las 23 columnas del 606. **Pero el producto hoy está optimizado para revisar UNA factura, no OCHENTA.** El flujo mensual real —80 facturas → revisar → cerrar → descargar TXT— tiene fricción cuadrática: cada factura cuesta ~6 clics y el modal se cierra tras guardar, obligando a volver a la tabla, buscar la siguiente y esperar recarga. Además hay un **hallazgo de producto potencialmente crítico** en la generación del 606 (ver P0-1).

---

## Hallazgo mayor de producto (verificar con negocio)

**El 606 se genera con el RNC de la organización y mezcla las facturas de TODOS los clientes.**
`api/src/dgii/dgii.service.ts` → `collect()` (línea 119-145) consulta `invoice.findMany({ where: { periodoFiscal, estado } })` sin `clientProfileId`, y el archivo se nombra con `org.rnc`. Pero el Formato 606 lo presenta **cada contribuyente** (cada cliente del despacho, con su propio RNC) ante la DGII. Si el modelo es "organización = despacho con N clientes" (como sugieren los client profiles con `rncOCedula` propio y el pitch de la landing), un contador que cierre el período generaría un 606 fiscalmente inválido que mezcla gastos de Colmado Don José con Farmacia Carol. La página `web/app/orgs/[orgId]/dgii/page.tsx` tampoco tiene selector de cliente. **O el 606 debe ser por cliente (con el RNC del cliente), o el modelo es "1 org = 1 empresa" y entonces Clientes/asignaciones necesitan replanteamiento.** Esto define el producto; resolverlo antes que cualquier otra cosa.

---

## Diagnóstico página por página

### 1. Landing — `web/app/page.tsx`
- Buena: clara, dominicana ("Colmado Don José" 👌), tema claro/oscuro.
- **Promete "Reportes 606 / 607"** (líneas 25-26) pero el 607 no existe en ninguna parte del backend ni la web. Promesa incumplida visible desde el día 1.
- "Entrar a la app →" y "Iniciar sesión" en el CTA final compiten con "Comenzar gratis"; para captación el CTA dominante debería ser registro.

### 2. Login — `web/app/login/page.tsx`
- **Credenciales de prueba hardcodeadas y botón "⚡ Ingreso rápido (dev)"** (líneas 40-45): email y contraseña reales en el bundle JS del cliente. El TODO lo reconoce, pero debe salir ya o esconderse tras `NODE_ENV`.
- **No existe "¿Olvidaste tu contraseña?"**. Para un usuario de 45 años esto es soporte telefónico garantizado. No hay endpoint de reset en el API tampoco.
- El ojito 🙈/👁️ funciona bien.

### 3. Registro — `web/app/register/page.tsx`
- Inconsistente con login: sin `Logo`, sin `ThemeToggle`, sin el tagline. Parece de otra app.
- Sin confirmación de contraseña ni indicador de fortaleza; el requisito "mínimo 8" solo está en el label.
- Tras registrarse el usuario cae en `/app` con cero organizaciones y un botón "Crear empresa contable" — aceptable, pero no hay onboarding que explique la secuencia crítica: crear empresa → **configurar RNC** (sin él no hay 606) → crear clientes → invitar usuarios móviles.

### 4. Selector de empresa — `web/app/app/page.tsx`
- Bien resuelto (saludo, tarjetas, logo). Detalle: el badge muestra el rol crudo `org_admin`/`contador` sin traducir (línea 91) — en Miembros sí se traduce ("Administrador"). Español inconsistente.

### 5. Dashboard "Resumen" — `web/app/orgs/[orgId]/page.tsx`
- **Es la página más pobre de la app y es la puerta de entrada diaria.** Solo muestra 3 barras de uso del plan (contadores/clientes/facturas). Un contador que entra un lunes no ve: cuántas facturas esperan revisión, el semáforo del período en curso, la fecha límite del 606, ni actividad reciente.
- **El backend ya tiene todo lo necesario y la web no lo usa:** `GET /invoices/resumen` (`api/src/invoices/invoices.service.ts` líneas 188-293) devuelve total gastado, ITBIS, desglose por categoría 606, comparativa mensual y top 5 proveedores — **cero consumidores en `web/`** (verificado por grep). Es analítica lista para pintar que hoy se desperdicia.

### 6. Facturas + modal de revisión — `web/app/orgs/[orgId]/invoices/page.tsx`
La pantalla donde el contador pasa el 80% de su tiempo:
- **Imagen ARRIBA del formulario, no al lado** (líneas 378-399): con `max-height: 420px` (globals.css:938) el contador hace ping-pong de scroll entre la foto y los 20+ campos. En un monitor de escritorio, el layout correcto es imagen fija a la izquierda, formulario a la derecha. "Ampliar" abre la URL prefirmada de MinIO en otra pestaña — sin zoom/lightbox, se pierde el contexto.
- **Sin "guardar y siguiente"**: `onSaved` cierra el modal y recarga la lista (líneas 181-184). Con 80 facturas: 80 × (buscar fila + clic Revisar + esperar fetch de imagen). Es LA fricción número uno del producto.
- **Cero atajos de teclado**: ni `Escape` cierra el modal, ni `Enter`/`Cmd+S` guarda, ni ↑/↓ navega. El clic en el fondo sí cierra — y **descarta ediciones sin confirmar** (pérdida de trabajo silenciosa).
- **Tres botones "Guardar / Validar / Guardar y validar"** que necesitan un párrafo explicativo debajo (líneas 579-583). Si un botón necesita manual, sobra un botón. "Validar" (valida lo guardado ignorando lo que está en pantalla) es una trampa: el usuario editará un campo, pulsará "Validar" y validará datos viejos.
- **Sin validación en lote** ni selección múltiple, pese a que las facturas con OCR limpio y `validacionDgii.ok` podrían aprobarse en grupo.
- **La tabla no muestra señales de problema**: no hay columna de alertas DGII ni de campos dudosos. Para saber cuáles duelen hay que abrirlas una a una. Tampoco hay orden por columnas ni totales (un contador quiere ver "RD$ 412,350.00 en 78 facturas" al pie).
- **Sin filtro de período fiscal** aunque el API lo soporta (`periodoFiscal` en `ListInvoicesQueryDto`, `api/src/invoices/dto/invoices.dto.ts:39-41`). El flujo de cierre es mensual; el filtro más importante no existe en la UI.
- **Sin paginación**: el API corta a `take: 200` (`invoices.service.ts:179`) sin decírselo al usuario; la búsqueda es client-side sobre ese subconjunto. Con volumen real, facturas "desaparecen".
- **No se puede subir una factura desde la web**: `POST /organizations/:orgId/invoices` acepta multipart y `apiUpload()` existe en `web/lib/api.ts`, pero solo se usa para el logo. El contador que recibe un PDF/foto por WhatsApp Web no tiene cómo ingresarla.
- **No hay "reintentar OCR"** aunque `POST :invoiceId/retry` existe (`invoices.controller.ts:104-112`). Una factura atascada en `procesando` es un callejón sin salida en la UI.
- Mensajes técnicos filtrados al usuario: "La IA marcó como dudosos: monto_facturado, rnc_proveedor" (línea 405) — snake_case interno en pantalla. Debe traducirse ("Monto facturado", "RNC del proveedor").
- Fechas como texto libre `AAAA-MM-DD` en vez de `<input type="date">` — invita errores de dedo en el campo más validado por regex del backend.
- Color de advertencia hardcodeado `#d97706` (líneas 256, 456, 492) en vez de `var(--warning-text)` — se rompe en tema oscuro.
- El selector "Mover a… (corregir error)" se muestra a rol `cliente` pero el endpoint es solo admin/contador → 403 confuso.

### 7. Reporte 606 — `web/app/orgs/[orgId]/dgii/page.tsx`
- **Lo mejor de la app**: semáforo con fecha límite DGII, días restantes, bloqueos y avisos en lenguaje humano. El Excel de verificación existe y se descarga. Felicitaciones genuinas aquí.
- **Las omitidas muestran `o.id.slice(0, 8)`** (línea 258) — un UUID truncado no significa nada para un contador, y no hay enlace a la factura. "Complétalas en la pestaña Facturas" (línea 262) tampoco enlaza con filtro pre-aplicado. Cada omitida = búsqueda manual.
- Los bloqueos ("5 factura(s) en revisión") **no son clicables** — el semáforo diagnostica pero no lleva a la cura.
- Período como input de texto `AAAAMM` con placeholder; un `<input type="month">` o selector de mes elimina toda una clase de error.
- "Cerrar período e incluir en 606" usa `className="danger"` (rojo, línea 267) — es la acción principal positiva del mes, no destructiva. Y la confirmación es un `confirm()` nativo del navegador para una acción irreversible.
- **No hay historial de cierres**: ¿ya generé el 606 de 202605? ¿quién lo cerró y cuándo? No hay registro visible (el audit_log lo guarda, pero no se expone).
- Las advertencias del padrón dan el RNC pero no dicen en qué factura(s) aparece ese proveedor.

### 8. Clientes — `web/app/orgs/[orgId]/clients/page.tsx`
- Funcional pero árido: la tabla no muestra facturas del mes ni pendientes por cliente (el dato existe vía `resumen`/list). Un despacho gestiona por cliente; esta tabla debería ser un mini-dashboard.
- "Eliminar cliente" con `confirm()` nativo, ¿y sus facturas? No se explica la consecuencia.
- El flujo "invítalo en Equipo y luego habilítalo aquí" está honestamente documentado en un párrafo (líneas 280-283), pero son dos pantallas para una tarea; debería poderse invitar-y-vincular desde aquí.
- Sin validación de formato de RNC/cédula al crear (el `shared/` tiene validadores fiscales con tests que la web no reutiliza en cliente).

### 9. Equipo — `web/app/orgs/[orgId]/members/page.tsx`
- La invitación genera un enlace que el admin debe copiar a mano — no hay botón "Copiar" ni envío por correo. Detalle pequeño, fricción diaria.
- Cambiar rol con un `<select>` sin confirmación aplica al instante — degradarse a sí mismo de `org_admin` a `cliente` es un pie-gun a un clic.
- El checkbox "Puede validar" con actualización optimista y revert está bien hecho.

### 10. Configuración — `settings` (org y cuenta)
- Correctas y modestas. Falta en la de la org lo más importante: **editar nombre y RNC de la organización** — el RNC es requisito duro del 606 (`bloqueos: 'La empresa no tiene RNC configurado'`) y solo se puede poner al crear la empresa.

### Transversales
- **Auditoría escrita pero invisible**: `api/src/audit/audit.service.ts` registra todo (`invoice.upload`, cambios de estado…) pero no existe controller de lectura ni pantalla. Para datos fiscales, "quién cambió qué" es requisito profesional.
- **No hay papelera/anulación**: eliminar cliente es hard-delete con `confirm()`.
- Responsive: aceptable (sidebar colapsa a barra horizontal a 820px, `globals.css:897-933`), pero las tablas no tienen contenedor con scroll horizontal propio y el modal de revisión en móvil es duro.
- Estados de carga: solo texto "Cargando…"; sin skeletons; los `catch(() => {})` silenciosos (layout, clientes) esconden fallos reales al usuario.
- Español: muy consistente en general; deslices: roles sin traducir en `/app`, snake_case en avisos del OCR, "Todas" en el filtro Estado (debería ser "Todos los estados").

---

## Top 10 mejoras priorizadas

| # | Mejora | Prioridad | Esfuerzo | Archivos clave |
|---|--------|-----------|----------|----------------|
| 1 | **Resolver el modelo del 606: por cliente (RNC del cliente) o confirmar 1-org-1-empresa** | **P0** | M-L | `api/src/dgii/dgii.service.ts`, `web/.../dgii/page.tsx` |
| 2 | **"Guardar y siguiente" + navegación ←/→ + Escape con confirmación de descarte en el modal de revisión** | **P0** | S-M | `web/.../invoices/page.tsx` |
| 3 | **Imagen al lado del formulario (split view) con zoom en el propio modal** | **P0** | M | `web/.../invoices/page.tsx`, `globals.css` |
| 4 | **Quitar el quick-login dev con credenciales del bundle** (o gate por env) y agregar reset de contraseña | **P0** | S (quitar) / M (reset) | `web/app/login/page.tsx`, `api/src/auth` |
| 5 | **Dashboard operativo**: pendientes de revisión, semáforo 606 del mes en curso con fecha límite, y analítica del endpoint `resumen` ya existente | **P1** | M | `web/.../orgs/[orgId]/page.tsx` (consumir `/invoices/resumen` y `/dgii/606/cierre`) |
| 6 | **Filtro de período fiscal + columna de alertas/dudosos + totales al pie en la tabla de facturas** | **P1** | S | `web/.../invoices/page.tsx` (el API ya soporta `periodoFiscal`) |
| 7 | **Omitidas y bloqueos del 606 clicables** → enlace a Facturas con filtro aplicado, mostrando proveedor+monto en vez de UUID | **P1** | S | `web/.../dgii/page.tsx` (requiere devolver proveedor en `omitidas`, `dgii.service.ts:138`) |
| 8 | **Subir factura desde la web** (drag & drop) + botón "Reintentar OCR" — ambos endpoints ya existen | **P1** | M | `web/.../invoices/page.tsx`, reusar `apiUpload` |
| 9 | **Validación en lote** de facturas sin alertas (checkbox + "Validar seleccionadas") | **P2** | M | `web/.../invoices/page.tsx`, nuevo endpoint batch o loop de `review` |
| 10 | **Pantalla de auditoría** (quién cambió qué) + historial de cierres 606 | **P2** | M | nuevo controller sobre `audit.service.ts` + página web |

Menciones: simplificar los 3 botones del modal a 2 ("Guardar" / "Guardar y validar", eliminando el ambiguo "Validar"); `<input type="date">` y `<input type="month">`; traducir claves snake_case del OCR; editar RNC de la org en Configuración; botón copiar en invitaciones; eliminar "607" de la landing hasta que exista.

---

## Plan de las próximas 2 semanas

**Semana 1 — el flujo de las 80 facturas (velocidad de revisión):**
1. Decisión de producto sobre el 606 por cliente (día 1, con negocio — bloquea todo lo fiscal).
2. Modal de revisión: split view imagen/formulario, "Guardar y siguiente", atajos (Esc/Enter/flechas), confirmación al descartar cambios, reducir a 2 botones. Traducir los nombres de campos dudosos.
3. Tabla: filtro de período fiscal, columna "⚠ alertas", totales al pie.
4. Quitar quick-login del bundle de producción.

Resultado medible: revisar 80 facturas pasa de ~10 clics/factura a ~2 (objetivo: <30 segundos por factura limpia).

**Semana 2 — el cierre de mes con confianza:**
5. Dashboard operativo consumiendo `/invoices/resumen` + `/dgii/606/cierre` del mes actual: "Tienes 12 facturas en revisión · el 606 de junio vence en 8 días".
6. Página 606: omitidas con proveedor/monto y enlace directo, bloqueos clicables, selector de mes, botón de cierre en color primario con modal de confirmación propio, y registro visible del último cierre (fecha + usuario, leyendo audit_log).
7. Subida de factura desde la web + botón reintentar OCR.
8. Barrido de consistencia: roles traducidos en `/app`, logo/tema en registro, `var(--warning-text)` en vez de `#d97706`, quitar "607" de la landing.

Con esto, el "llegaron 80 facturas → subí mi 606" queda en: abrir dashboard (1 clic) → cola de revisión filtrada del período (1 clic) → revisar en cadena con teclado → semáforo verde → cerrar y descargar (2 clics). Ese es el producto que un contador recomienda a otro contador.
