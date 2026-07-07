# Informe del Asesor de Ventas y Go-To-Market — SubirFactura

> Consejo de 5 · 6 de julio de 2026

## 0. Qué está construido HOY (base para vender)

Revisé el repo. Estado real: Fases 0–2 completas (multi-tenant con RLS, auth JWT, invitaciones, app Flutter offline-first con captura guiada, pipeline OCR con Claude Vision + reglas de confianza 80/100%, cola de revisión, duplicados). Fase 3 en curso: **606 TXT + Excel + cierre de período + padrón RNC listos; falta el 607**. Hay landing básica con features, registro self-serve, panel super-admin, verificación e-CF vía QR oficial (detrás de flag), y share extension iOS/Android. **Lo que NO hay**: precios reales (los 3 planes en `shared/prisma/seed.ts` están en `precio: '0.00'`), cobro (v1 es transferencia manual activada por admin, sin Azul/CardNET), trial, y la app no está en las tiendas.

---

## 1. Cliente objetivo y propuesta de valor

**Se vende al contador (despacho de igualas), no al negocio.** El negocio pequeño dominicano no compra software fiscal: paga una iguala de RD$6,000–10,000+/mes a un contador que le resuelve todo ([Igualas Contables](https://igualascontables.com.do/igualas-contables-republica-dominicana/), [CGR Lawyer](https://cgrlawyer.com.do/2023/10/04/igualas-contables-en-republica-dominicana/)). El contador es el comprador con presupuesto, dolor recurrente y efecto multiplicador: un despacho con 30 clientes = 30 negocios instalando la app sin que tú los vendas uno por uno.

**El dolor #1 que paga**: la persecución mensual de facturas físicas antes del día 15 (fecha límite del 606 en la Oficina Virtual). Hoy el flujo es fundas de papel, fotos sueltas por WhatsApp, y digitación manual factura por factura. SubirFactura convierte eso en: el cliente fotografía → la IA digita → el contador revisa y descarga el TXT. La propuesta de valor en una frase: **"Tu 606 listo el día 5, no el día 14 a medianoche."** Es ahorro de horas de digitación + eliminación de errores de NCF/RNC que generan inconsistencias con la DGII.

Importante: **no somos competencia de Alegra ni de Alanube; somos complemento**. Alanube es API de *emisión* de e-CF; Alegra es contabilidad completa del negocio que factura. Nadie está atacando bien el flujo inverso: los *gastos* (facturas recibidas en papel/foto) del cliente pequeño que no lleva sistema. Nexito tiene OCR de NCF pero es enterprise, sin app para el cliente final del contador ([Nexito](https://nexito.tech/productos/ocr-empresarial/republica-dominicana/)).

**El viento de cola regulatorio**: la Ley 32-23 obliga a pequeños/micro/no clasificados a emitir e-CF a más tardar el **15 de noviembre de 2026** (prórroga de mayo 2026); grandes locales y medianos ya desde noviembre 2025; multas de 5 a 50 salarios mínimos ([DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Listados-contribuyentes-obligados-implementar-facturacion-electronica.aspx), [Alegra blog](https://blog.alegra.com/republica-dominicana/obligatoriedad-de-factura-electronica/)). Ya hay 34,000+ emisores electrónicos y 15,000+ en certificación ([DGII noticias](https://dgii.gov.do/noticias/Paginas/DGII-exhorta-MIPYMES-acogerse-Facturacion-Electronica-antes-15-mayo-2026.aspx)). Ojo con la lectura honesta: la universalización del e-CF *reduce* a mediano plazo el papel (el e-CF llega digital), pero durante 2026–2028 el mundo será híbrido — papel + e-CF mezclados — y ahí SubirFactura brilla justamente porque hace ambos (OCR + verificación QR e-CF ya implementada). La ventana fuerte es AHORA; hay que correr.

**Mercado alcanzable**: el ICPARD tiene 18 filiales y decenas de miles de CPA colegiados (no publica cifra exacta; estimaciones del gremio superan los 20,000). Meta realista para un fundador solo: no "el mercado", sino **50 despachos pagando en 12 meses**.

## 2. Modelo de precios recomendado

Anclas del mercado: Alegra Contabilidad va de US$29 a US$129/mes ([precios Alegra RD](https://www.alegra.com/rdominicana/precios/)); las pymes pagan RD$890–2,200/mes por facturación electrónica ([programascontabilidad.com](https://programascontabilidad.com/comparativas-de-software/administracion/cuanto-cuesta-un-sistema-de-facturacion-electronica/)); una iguala pequeña es RD$6,000–10,000/mes. Si le ahorras al contador 2–3 horas de digitación por cliente al mes, con 20 clientes eso son 40–60 horas: cualquier precio bajo RD$10,000/mes es obvio.

Mi recomendación — cobrar **por despacho, escalando por clientes activos** (no por facturas, que castiga el uso; el límite de facturas queda como tope anti-abuso, y el modelo `Plan` ya soporta exactamente esto):

| Plan | Precio | Incluye | Nota |
|---|---|---|---|
| **Solo** | **RD$2,900/mes (~US$48)** | 1 contador, 10 clientes, 500 facturas/mes | Sustituye los límites actuales del seed "Básico" |
| **Despacho** | **RD$6,900/mes (~US$115)** | 5 contadores, 40 clientes, 2,500 facturas/mes | El plan que debe comprar el 70% |
| **Firma** | **RD$14,900/mes (~US$250)** | Ilimitado razonable, soporte prioritario | Para firmas medianas / ICPARD |

- **Trial de 30 días sin tarjeta** (Alegra da 15; tú necesitas cubrir un ciclo completo de 606 — el "aha" es descargar su primer TXT).
- **Anual: paga 10, recibe 12** (el mercado ya está educado en esto por Alegra).
- El costo variable (Claude Vision, ~US$0.01–0.02/factura) da márgenes >90%. No regales plan gratis permanente: el contador que no paga RD$2,900 no vale el soporte.

Equivalencia de venta: "menos que media iguala tuya, y te ahorra la parte del trabajo que más odias".

## 3. Canal de venta realista para un fundador solo

1. **Venta fundador-directa a despachos conocidos (mes 1–3)**: 10 clientes de diseño a mano — contadores del círculo personal/profesional en Santo Domingo y Santiago. WhatsApp + demo de 20 minutos en su oficina con facturas reales de ellos. Nada convierte más que ver SU factura digitada sola.
2. **WhatsApp + contenido de fechas límite (permanente)**: el contador dominicano vive en WhatsApp y en grupos de contadores. Contenido corto tipo "checklist del 606 de este mes" y "qué cambia el 15 de noviembre de 2026" en Instagram/TikTok/LinkedIn — el ecosistema (Alegra, Micromza, siemprealdía) ya demostró que el SEO/contenido fiscal RD funciona.
3. **ICPARD y sus 18 filiales (mes 3+)**: patrocinar/dar charlas de "cómo prepararte para la obligatoriedad e-CF 2026" en las filiales. Una charla a 50 contadores es tu mejor costo de adquisición.
4. **Referidos con incentivo duro**: 1 mes gratis por despacho referido que pague. Los contadores se conocen todos entre sí.
5. **NO hacer todavía**: ads pagados, vendedores, marketplace de apps. Sin caso de éxito documentado es quemar dinero.

## 4. Qué falta en el producto para poder cobrar (gaps de venta)

En orden de bloqueo:

1. **Terminar el 607** — el contador compra el paquete completo 606+607; venderlo a medias regala la objeción.
2. **Precios reales en los planes** — hoy `0.00` en el seed; definir los 3 números y mostrarlos en la landing con página `/precios`.
3. **App en App Store y Google Play** — sin esto no hay producto: el cliente final del contador no va a instalar un APK. Es el gap más largo (cuentas de developer, revisión de Apple). Empezar YA.
4. **Trial autoservicio de 30 días** — el flujo existe (registro + `Subscription`), falta que el registro cree una suscripción trial automática con expiración y CTA de pago; hoy todo depende de activación manual del super-admin.
5. **Cobro real** — para los primeros 20 clientes la transferencia manual + activación admin ES suficiente (ya está construida; no sobre-ingeniar). Azul/CardNET solo cuando el cobro manual duela (>30 clientes).
6. **Onboarding guiado del despacho** — checklist post-registro: crea tu empresa → invita tu primer cliente → él baja la app → primera factura → primer 606. Si el contador no llega solo al "aha" en la primera semana, se va.
7. **Landing comercial** — la actual es funcional pero necesita: precios, video demo de 90 segundos (foto → TXT), testimonios, y urgencia regulatoria ("¿listo para nov-2026?"). El dominio subirfactura.com ya es un activo: nombre que se autoexplica por teléfono.
8. **Materiales para el cliente del contador**: PDF/flyer de 1 página que el contador reenvía por WhatsApp a sus clientes explicando cómo instalar la app. El contador no va a escribir eso; dáselo hecho.

## 5. Tres primeras acciones comerciales

**Esta semana**: consigue 3 contadores reales (conocidos) y hazles piloto gratis con facturas reales de sus clientes de este período fiscal. Objetivo: que al menos 1 genere su 606 de julio con SubirFactura. Sus tiempos y frustraciones definen el pitch. En paralelo, abre las cuentas de Apple Developer y Google Play hoy mismo — es el camino crítico.

**Este mes**: cierra el 607, fija los precios (RD$2,900/6,900/14,900), publica la página de precios con trial de 30 días, y convierte al menos 1 piloto en el primer cliente que paga por transferencia (aunque sea con 50% de descuento fundador de por vida a los primeros 10). Un solo despacho pagando valida más que 100 registros gratis.

**Este trimestre** (para llegar a nov-2026 con inercia): apps publicadas en ambas tiendas, 10 despachos pagando (~RD$50–70k MRR), un caso de éxito documentado ("el despacho X redujo su cierre de 606 de 5 días a 1"), y la primera charla en una filial del ICPARD usando la obligatoriedad del 15 de noviembre de 2026 como gancho. Todo el marketing de Q4 debe colgar de esa fecha: es el mejor generador de urgencia que este producto va a tener jamás.

**Opinión final sin filtro**: el producto está sorprendentemente completo para pre-venta (el gap técnico es pequeño: 607 + tiendas), pero el riesgo real es de distribución, no de producto. El error a evitar es seguir puliendo fases mientras la ventana regulatoria 2026 se cierra. Con 606 funcionando hoy, ya se puede cobrar a los primeros despachos esta misma temporada fiscal.

**Fuentes**: [DGII — listados obligados e-CF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Listados-contribuyentes-obligados-implementar-facturacion-electronica.aspx) · [DGII — exhortación MIPYMES 2026](https://dgii.gov.do/noticias/Paginas/DGII-exhorta-MIPYMES-acogerse-Facturacion-Electronica-antes-15-mayo-2026.aspx) · [Alegra — obligatoriedad](https://blog.alegra.com/republica-dominicana/obligatoriedad-de-factura-electronica/) · [Alegra — precios RD](https://www.alegra.com/rdominicana/precios/) · [The Factory HKA — Ley 32-23](https://thefactoryhka.com.do/ley-32-23-y-la-obligatoriedad-de-factura-electronica-fechas-clave-y-todo-lo-que-debes-saber/) · [Alanube RD](https://www.alanube.co/rd/) · [Nexito OCR RD](https://nexito.tech/productos/ocr-empresarial/republica-dominicana/) · [Igualas Contables](https://igualascontables.com.do/igualas-contables-republica-dominicana/) · [CGR Lawyer — igualas](https://cgrlawyer.com.do/2023/10/04/igualas-contables-en-republica-dominicana/) · [programascontabilidad.com — costos](https://programascontabilidad.com/comparativas-de-software/administracion/cuanto-cuesta-un-sistema-de-facturacion-electronica/) · [ICPARD](https://icpard.org/nosotros/)
