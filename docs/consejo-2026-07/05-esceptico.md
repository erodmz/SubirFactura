# Informe del Escéptico — SubirFactura

> Consejo de 5 · 6 de julio de 2026 · Rol: abogado del diablo. Leyó el repo, verificó precios de API y contrastó con fuentes públicas.

## 0. Calibración: qué hay realmente en el repo

Lo digo primero porque es lo único que juega a favor: **el estado técnico es mejor que el de la mayoría de los MVPs de fundador solo.**

- Monorepo coherente: API NestJS (módulos auth, invoices, dgii, plans, admin, audit), web Next.js, workers OCR con BullMQ, app Flutter con 11 pantallas (captura, revisión, resumen de gastos, share extension iOS/Android funcionando).
- Schema Prisma serio (317 líneas): multi-tenant, roles, planes con límites, suscripciones, AuditLog, padrón RNC local.
- Los validadores fiscales **sí tienen tests**: `shared/src/validators/{ncf,rnc,arithmetic}.test.ts`, `shared/src/dgii/{formato606,fiscal-validation,ecf-qr,ecf-verificacion,padron}.test.ts`.

Pero la calibración también revela las grietas:

- **No hay pasarela de pago.** El cobro es transferencia manual y el super-admin activa la suscripción a mano. No hay Stripe, Azul ni CardNET en ninguna parte.
- **El OCR corre por defecto en `claude-opus-4-8`** (`workers/src/ocr/extract.ts:69`), el modelo más caro disponible salvo Fable — para leer facturas de colmado.
- **La verificación e-CF es scraping de HTML con regex** contra `ecf.dgii.gov.do` (`shared/src/dgii/ecf-verificacion.ts`). No es una API pública; es una página que la DGII puede cambiar mañana.
- Cobertura de tests fuera de `shared/`: 3 archivos en la API, 1 en Flutter. El corazón fiscal está probado; el producto casi no.

Es un buen sistema. La pregunta es si es un buen **negocio**.

---

## 1. Las 5 objeciones, ordenadas por letalidad

### Objeción #1 (la más letal): la feature estrella ya existe, la vende un competidor con cientos de miles de usuarios, y fija tu precio techo en US$29/mes

No es que Alegra "podría añadir foto → 606 en un trimestre". **Ya lo tiene.** Su producto dominicano hace exactamente el flujo de SubirFactura: fotografías el recibo, la IA extrae RNC, ITBIS y monto ("Inbox Inteligente"), y genera 606, 607, 608, IT-1 e IR-17 listos para la Oficina Virtual — homologado por la DGII, desde **US$29/mes** con prueba gratis, y con un [programa específico para contadores](https://www.alegra.com/rdominicana/contadores/) (históricamente gratuito para el contador, que es exactamente tu comprador). Y no está solo:

- **Cashflow** (dominicano) — OCR de gastos, compite localmente.
- **Contapp Digital** — software para contadores RD con 606/607 y e-CF.
- **FacturaSimple**, **Softland RD**, y el ecosistema e-CF: **Alanube** como API/BaaS autorizado por la DGII, más la [lista oficial de proveedores autorizados](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Proveedores-servicios-FE-autorizados.aspx).
- **La propia DGII regala el piso**: Facturador Gratuito + certificados digitales sin costo para MIPYMES.

Consecuencias: (a) tu diferenciación no es la tecnología sino, como mucho, el flujo "el cliente del contador sube, el contador consolida multi-cliente" — eso es una *feature* de Alegra Contadores, no un producto; (b) tu precio de referencia lo fija un jugador regional con economías de escala.

**Réplica que aceptaría:** que en entrevistas reales los contadores digan que Alegra les resulta caro/complejo para clientes pequeños y que su OCR falla con facturas dominicanas arrugadas de suplidores informales. Pero eso hay que *demostrarlo con ventas*, no asumirlo.

### Objeción #2: producto con fecha de caducidad estructural — la Ley 32-23

El calendario real:

| Segmento | Fecha límite e-CF |
|---|---|
| Grandes nacionales | 15 may 2024 (cumplida) |
| Grandes locales y medianos | 15 nov 2025 (con prórroga; cumplida) |
| Micro, pequeños y no clasificados | **15 nov 2026** (prorrogado desde may 2026) |

Estamos en julio 2026: **faltan 4 meses**. Un e-CF es XML estructurado que la DGII recibe en tiempo real de *ambos lados*. Dos amenazas escalonadas:

1. **Corto plazo:** para toda factura de un emisor electrónico, la foto es la peor fuente de datos posible. El QR ya da los datos oficiales. El OCR con IA se vuelve un fallback, no el producto.
2. **Mediano plazo (la que mata):** cuando la DGII tiene emisor y receptor de cada e-CF, **el Formato 606 mismo es candidato a desaparecer o venir precargado** (camino de Chile). Si la DGII precarga el 606, SubirFactura pierde el "job to be done" completo.

**El contrapeso honesto** (y es real): la adopción va lentísima — solo **~34,000 emisores electrónicos** activos frente a cientos de miles de contribuyentes obligados; ya hubo **dos prórrogas** y nada garantiza que nov 2026 no se corra otra vez; la informalidad laboral es **54.1% del empleo** y 8 de cada 10 empleos nuevos se crean en la informalidad; el comprobante **E41** para compras a proveedores informales seguirá generando papel por años. El papel no muere en noviembre.

Pero: **tu mercado direccionable es el segmento decreciente y más pobre del flujo de facturas.** Construyes sobre un glaciar que se derrite; la discusión es solo a qué velocidad.

### Objeción #3: el eslabón débil no es tu usuario — es el cliente de tu usuario

El modelo exige que el dueño de la pyme (no el contador que paga) fotografíe **cada factura, todos los meses, para siempre**. La historia del receipt-scanning es brutal con esta suposición: Expensify, Shoeboxed y todos los "fotografía tus recibos" descubrieron que el usuario final sube 3 fotos la primera semana, se olvida, y el día 13 le entrega al contador la funda de papeles de siempre. Cuando eso pasa:

- El contador no obtiene el ahorro prometido → el producto "no funciona" → churn, aunque el software sea perfecto.
- El fallback natural es que el contador fotografíe la funda completa — y entonces compites contra "escanear y digitar en Excel", que cuesta RD$0.
- El repo ya delata esta fricción: QR, modo offline, auto-asignación — parches correctos, pero ninguno resuelve el problema de *hábito*.

Nada en el repo (ni recordatorios push, ni ingesta por WhatsApp — el canal donde los dominicanos realmente mandan fotos) ataca hoy el problema #1 del producto. Y ojo: si la solución termina siendo WhatsApp, el valor de la app Flutter se diluye.

### Objeción #4: un fundador solo vendiendo a la profesión más conservadora del país, con cobro por transferencia bancaria

- **Ciclo de venta:** los contadores compran por referencia de colegas y del ICPARD, no por landing page. Cada cuenta requiere demo, acompañamiento el primer cierre, y soporte en el pico del 1 al 15. Un fundador solo no puede vender, soportar el pico mensual y desarrollar a la vez; algo se cae, y lo primero es la venta.
- **Cobro manual:** fricción de renovación perpetua y churn invisible hasta que ya ocurrió.
- **Bus factor fiscal:** si el 14 del mes el OCR se cae o la DGII cambia el HTML, hay 0 personas de respaldo y N contadores con una obligación legal al día siguiente. Ese escenario, una sola vez, mata la reputación en un gremio que habla entre sí.

### Objeción #5: responsabilidad y fragilidad — declaras impuestos de terceros sobre scraping y un LLM

- **¿Quién responde si el OCR lee RD$14,500 donde decía RD$4,500?** Legalmente, el contribuyente y su contador, pero el costo reputacional lo pagas tú. El diseño mitiga bien (confianza por campo, cola de revisión, validación aritmética), pero comercialmente basta *un* caso sonado en un grupo de WhatsApp de contadores. No hay términos de servicio, descargos, ni seguro E&O.
- **Fragilidad DGII:** la verificación e-CF depende de regex sobre HTML de `ecf.dgii.gov.do`. Sin contrato, sin SLA, con riesgo de captcha/rate-limit/cambio de maquetación. Cuando la DGII cambie la página, la validación "en vivo" muere en silencio.
- **Dependencia de un solo proveedor de IA** con el modelo más caro como default. Sin abstracción multi-proveedor ni fallback.

### Nota honesta sobre unit economics: NO es la objeción que te mata

Una foto de factura son ~1,500–4,800 tokens de imagen + prompt + ~500 de salida. Con Opus 4.8 es ~US$0.02–0.05 por factura; **con Haiku 4.5 (que sobra para esto) cae a ~US$0.005–0.01, y con Batch API la mitad**. A 100 facturas/mes/cliente: RD$30–300 de COGS. El margen aguanta de sobra. El problema no es el costo — es que el *precio* techo lo fija la Objeción #1 y el *volumen* lo limita la Objeción #3.

---

## 2. Señales tempranas de que tengo razón (instrumentar YA)

1. **Ratio de captura del cliente final:** facturas subidas por cliente/mes en las semanas 1, 4 y 12. Si cae >60% de la semana 1 a la 12, la Objeción #3 está confirmada.
2. **% de facturas entrantes que ya son e-CF** (QR válido). Si cruza 40–50% y sigue subiendo, el OCR es un producto en liquidación.
3. **Conversión de demo a pago con transferencia real.** Si tras 10 demos ningún contador transfiere sin persecución, la disposición a pagar no existe.
4. **La pregunta "¿y esto en qué es distinto a Alegra?"** en cada demo. Si no tienes una respuesta que el contador repita él solo, no hay foso.
5. **Prórroga (o no) del 15-nov-2026 y cualquier anuncio DGII de "declaración propuesta/precargada".** Ese anuncio es tu reloj de arena.
6. **Primer incidente de scraping:** el día que `parseEcfVerificacion` devuelva null en producción, mide cuánto tardas en enterarte. Si te enteras por un contador, el punto #5 está probado.

## 3. Steel-man: qué tendría que ser cierto para que SÍ funcione

La tesis se sostiene si **todas** estas se cumplen:

1. **El papel persiste 5+ años en el segmento objetivo.** Plausible: 54% de informalidad, E41 obligatorio para compras a informales, dos prórrogas ya, solo 34K emisores e-CF. Los *gastos* de una pyme dominicana seguirán llegando en papel mucho después de que sus *ventas* sean electrónicas.
2. **Alegra es demasiado "sistema contable completo" para este job.** El contador promedio no quiere migrar la contabilidad de 30 clientes; quiere que la funda de facturas se convierta en un TXT 606 sin digitar. Una herramienta de un solo propósito, en español dominicano, con soporte por WhatsApp del propio fundador, puede ganarle a la suite en ese nicho — los nichos verticales le ganan a las suites todo el tiempo.
3. **El contador es un canal multiplicador real:** con 30–50 contadores pagando RD$3,000–8,000/mes hay un negocio de estilo de vida sólido (~US$3–8K MRR) sin necesidad de VC. Para un fundador solo, ese puede ser el objetivo correcto.
4. **La transición e-CF es oportunidad, no amenaza, si el producto es "bandeja de gastos" y no "OCR":** el mismo pipeline puede ingerir XML e-CF, PDFs y correos mañana — el 606 hay que armarlo igual, venga de donde venga el dato, mientras la DGII no lo precargue. El código ya apunta ahí: el activo es el flujo contador-cliente-606, no la visión por computadora.

Si crees en las 4, sigue. Si dudas de la 2 o la 3, para.

## 4. Veredicto: **SEGUIR CON CONDICIONES ESTRICTAS** (y con pivote de identidad)

No lo mataría hoy: el costo hundido es bajo, el activo técnico es real, el nicho existe durante una ventana de 3–5 años, y el objetivo racional es un negocio de nicho rentable, no un unicornio. Pero "seguir" solo bajo estas condiciones, con fecha:

1. **Prueba de mercado antes de una línea más de código de features (90 días):** 10 contadores **pagando por transferencia real** (no pilotos gratis, no amigos). Si el 15 de octubre de 2026 no están, **matar o archivar sin culpa.** El repo ya tiene de sobra para venderse; más código no es la restricción.
2. **Re-posicionar de "OCR de fotos" a "la bandeja de gastos del contador dominicano":** ingesta de foto + PDF + XML e-CF + (pronto) WhatsApp → 606/607. Eso convierte la Ley 32-23 de sentencia de muerte en roadmap. El OCR es un ingrediente, no el producto.
3. **Bajar el COGS y el riesgo de proveedor:** modelo barato (Haiku-clase) como default con escalado al caro solo en baja confianza; el env var ya lo permite (`ANTHROPIC_MODEL`), cámbialo.
4. **Tratar el scraping DGII como deuda crítica:** monitoreo con alerta cuando el parser devuelva vacío, degradación explícita en UI ("no se pudo verificar contra DGII"), y nunca venderlo como garantía.
5. **Blindaje de responsabilidad antes del cliente #1 de pago:** términos de servicio con descargo explícito ("herramienta de asistencia; la revisión y la declaración son responsabilidad del contador"), y el flujo de revisión obligatorio para campos bajo el umbral de confianza — el código ya lo soporta.
6. **Definir el techo honestamente:** esto es un negocio para llegar a US$5–10K MRR en un nicho con fecha de caducidad parcial, operado por una persona. Si eso te sirve, es un buen trato.

**Fuentes principales:** [Calendario y prórroga MIPYMES — Alegra/DGII](https://blog.alegra.com/republica-dominicana/obligatoriedad-de-factura-electronica/) · [DGII: 34,000 emisores e-CF](https://dgii.gov.do/noticias/Paginas/DGII-exhorta-MIPYMES-acogerse-Facturacion-Electronica-antes-15-mayo-2026.aspx) · [Listados de obligados DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Listados-contribuyentes-obligados-implementar-facturacion-electronica.aspx) · [Alegra RD precios](https://www.alegra.com/rdominicana/contabilidad/precios/) · [Alegra Contadores](https://www.alegra.com/rdominicana/contadores/) · [Apps contables RD 2026](https://micromza.com/mejores-apps-contabilidad-dominicana/) · [Contapp Digital](https://contappdigital.com/accountants) · [Alanube](https://www.alanube.co/rd/) · [Proveedores autorizados DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Proveedores-servicios-FE-autorizados.aspx) · [E41 proveedores informales](https://siemprealdia.co/republica-dominicana/impuestos/comprobante-fiscal-e41-compras-proveedores-informales/) · [Informalidad 54.1% BCRD](https://elnuevodiario.com.do/economia-rd-registro-133915-nuevos-ocupados-en-2025-informalidad-promedio-54-1-durante-todo-el-ano-segun-bcrd/)
