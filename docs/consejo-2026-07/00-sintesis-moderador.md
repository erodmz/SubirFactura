# Síntesis del Moderador — Consejo de 5 sobre SubirFactura

> 6 de julio de 2026 · Informes completos en esta carpeta: [ventas](01-ventas.md) · [móvil](02-producto-movil.md) · [web](03-usabilidad-web.md) · [seguridad](04-seguridad-privacidad.md) · [escéptico](05-esceptico.md)

## Veredicto global del consejo

**Unánime: seguir — pero el juego cambió.** Los 5 coinciden en que el activo técnico es real y está por encima del promedio para un fundador solo (RLS bien montada, cola offline profesional, validadores fiscales con tests, semáforo 606). Y los 5 coinciden, desde ángulos distintos, en la misma conclusión incómoda: **la restricción ya no es el código — es el mercado y el reloj.** El escéptico le puso fecha: 10 contadores pagando de verdad antes del **15 de octubre de 2026**, o archivar sin culpa.

## Donde el consejo es unánime (5/5)

1. **El quick-login de dev sale YA de web y móvil** — lo señalaron los 5 (seguridad lo clasificó ALTO: credenciales reales compiladas en ambos binarios).
2. **Vender esta temporada fiscal.** Ventas: "el riesgo es de distribución, no de producto". Escéptico: "el repo ya tiene de sobra para venderse; más código no es la restricción".
3. **Las tiendas (App Store / Play) son el camino crítico.** Abrir las cuentas de developer hoy; la revisión de Apple es el paso más largo.
4. **Bajar el OCR a un modelo barato.** Corre en Opus 4.8 por defecto (`workers/src/ocr/extract.ts:69`); con Haiku el costo cae ~5x y sobra para extraer campos. Es cambiar un env var.

## Los 2 hallazgos que bloquean cobrar

### 🔴 #1 — El 606 mezcla los clientes del despacho (web/producto)
`dgii.service.ts → collect()` junta las facturas de TODOS los clientes bajo el RNC de la organización. Pero el 606 lo presenta **cada contribuyente** con su propio RNC. Tal como está, el reporte de un despacho multi-cliente sería fiscalmente inválido. **Decisión de producto previa a todo lo fiscal**: 606 por cliente (recomendado — es coherente con el pitch "despacho con N clientes") o replantear a 1-org-1-empresa.

### 🔴 #2 — IDOR intra-tenant (seguridad, CRÍTICO)
`GET/PATCH .../invoices/:id` no verifican que la factura pertenezca a un cliente que el usuario maneje: un `cliente` del negocio A puede leer/editar facturas del negocio B del mismo despacho (RNC, montos, imágenes). La RLS aísla entre organizaciones, no entre clientes de la misma. Corregir `get`, `review`, `retry`, `changeStatus` con el mismo filtro de `list()` + test.

## Donde el consejo choca (y cómo lo resuelvo)

| Choque | Posición A | Posición B | Resolución del moderador |
|---|---|---|---|
| **Precio** | Ventas: RD$2,900–14,900/mes por despacho (ancla: iguala, ahorro de horas) | Escéptico: Alegra fija el techo en US$29 con OCR + 606 incluidos | Arrancar con los precios de Ventas **como hipótesis** en los pilotos; la pregunta "¿y esto en qué es distinto a Alegra?" debe tener respuesta ensayada (nicho: bandeja de gastos multi-cliente del contador, no suite contable del negocio). Si 3 de 5 pilotos objetan precio, bajar. |
| **"Vender ya" vs "no cobrar aún"** | Ventas: cobrar esta temporada | Seguridad: no cobrar hasta cerrar C-1/A-1/A-2; Móvil: es beta interna | Compatible: **pilotos gratis esta semana** (contadores conocidos, TestFlight/APK — no necesitan tiendas) mientras se cierra la lista bloqueante (~1–2 semanas). Primer cobro cuando C-1, quick-login y 606-por-cliente estén resueltos. |
| **La app móvil como corazón** | Móvil: push + captura 3 taps la hacen retener | Escéptico: si el hábito falla, el canal real es WhatsApp y la app se diluye | No pelear con la realidad: instrumentar el **ratio de captura** (semanas 1/4/12) desde el piloto #1. Si cae >60%, priorizar ingesta WhatsApp/web sobre pulir la app. La subida web (drag & drop, endpoints ya existen) cubre el fallback "el contador fotografía la funda". |
| **Identidad del producto** | Ventas: "OCR mágico foto→606" | Escéptico: "OCR es ingrediente; el producto es la bandeja de gastos" | Adoptar el reposicionamiento del escéptico: **"la bandeja de gastos del contador dominicano"** — foto + PDF + XML e-CF → 606/607. Convierte la Ley 32-23 de amenaza en roadmap y desactiva la objeción de caducidad. |

## Agenda de decisiones (solo el fundador puede tomarlas)

1. **Modelo del 606**: ¿por cliente (recomendación del consejo) o 1-org-1-empresa?
2. **Posicionamiento**: ¿adoptar "bandeja de gastos" como identidad? (afecta roadmap: ingesta XML/PDF/web sube de prioridad)
3. **Precios de lista** para presentar en pilotos: ¿RD$2,900/6,900/14,900?
4. **La fecha de corte del escéptico**: ¿te comprometes a 10 pagando al 15-oct-2026 o ajustas la meta?
5. **Nombre y bundle IDs definitivos** antes del primer envío a tiendas (irreversibles): unificar `com.elmerrodriguez.facturard` (iOS) vs `com.facturard.app` (Android), nombre visible "SubirFactura".

## Plan operativo consolidado

### Semana 1–2 — "Cobrable" (código) + pilotos (calle)
**Código (en orden):**
1. Decidir y arreglar **606 por cliente** (bloquea todo lo fiscal)
2. Fix **IDOR C-1** (get/review/retry/changeStatus + test)
3. Quitar **quick-login** de web + móvil; verificar que la cuenta test no exista en prod
4. **Rate limiting** en /auth/* (`@nestjs/throttler`)
5. Android release: permiso **INTERNET** + `API_URL` prod HTTPS
6. Renombrar a **SubirFactura** en móvil; política de privacidad + términos (Ley 172-13, declara subprocesamiento Anthropic); eliminar cuenta in-app; recuperación de contraseña
7. `ANTHROPIC_MODEL=claude-haiku-4-5` en el worker
8. Sentry/Crashlytics básico
**Calle (en paralelo):**
- Abrir cuentas Apple Developer + Google Play HOY
- 3 contadores conocidos en piloto con facturas reales de julio; objetivo: 1 genera su 606 de julio con la herramienta
- Instrumentar: ratio de captura, % facturas con QR e-CF, tiempo de revisión por factura

### Mes 1 — El producto que un contador recomienda
- **607** (la landing lo promete; quitarlo mientras tanto)
- Flujo de las 80 facturas: split view imagen/formulario, **"Guardar y siguiente"**, atajos, filtro de período, columna de alertas, 2 botones en vez de 3
- **Dashboard operativo** (consumir `/invoices/resumen` + semáforo del mes — el backend ya lo tiene)
- **Push notifications** (FCM primero)
- **Subida web drag & drop + reintentar OCR** (endpoints ya existen)
- Enviar apps a las tiendas; primer cliente pagando por transferencia (descuento fundador a los primeros 10)
- Tokens a `flutter_secure_storage`; sesión expirada → Login; helmet + CORS fijo
- Monitoreo del parser DGII (alerta si devuelve vacío) + degradación explícita en UI

### Trimestre (hasta el 15-oct-2026, la fecha del escéptico)
- **10 despachos pagando** (~RD$50–70k MRR) o replantear sin culpa
- Apps publicadas; caso de éxito documentado; primera charla ICPARD con gancho "nov-2026"
- **Ingesta XML e-CF** (el pivote a "bandeja de gastos" hecho código)
- Trial autoservicio 30 días; verificación de correo
- Evaluar según métricas: ¿WhatsApp ingest? ¿validación en lote? ¿pantalla de auditoría?

## Tablero de señales (instrumentar desde el piloto #1)

| Métrica | Umbral de alarma | Objeción que confirma |
|---|---|---|
| Ratio de captura del cliente final (sem 1→12) | cae >60% | #3 hábito |
| % facturas entrantes con QR e-CF | >40–50% y subiendo | #2 caducidad |
| Conversión demo → pago real | 0 de 10 sin persecución | #1/#4 disposición a pagar |
| "¿En qué es distinto a Alegra?" | sin respuesta que el contador repita solo | #1 foso |
| Anuncios DGII: prórroga nov-2026 / 606 precargado | cualquier anuncio | #2 reloj de arena |
| Parser DGII devuelve vacío en prod | te enteras por un contador | #5 fragilidad |
