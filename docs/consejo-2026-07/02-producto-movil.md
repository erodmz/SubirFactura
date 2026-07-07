# Informe del Asesor de Producto Móvil — SubirFactura (app_flutter)

> Consejo de 5 · 6 de julio de 2026 · Basado en lectura completa de la app Flutter (20 archivos Dart, ~4,300 líneas), manifiestos iOS/Android y pubspec.

## Resumen ejecutivo

La app está **sorprendentemente sólida para su fase**: la cola offline es de calidad profesional, el feedback de procesamiento en vivo (polling + spinners por factura) está bien resuelto, y el flujo cliente está enfocado. Pero **no está lista para tiendas** ni para un usuario no acompañado: hay credenciales de prueba embebidas en el binario, falta el permiso INTERNET en el manifest de release de Android (la app de producción no tendría red), no hay notificaciones push (la promesa "toma la foto y olvídate" solo se cumple con la app abierta), no hay recuperación de contraseña ni eliminación de cuenta (Apple la exige), y la identidad todavía dice "facturard" en vez de SubirFactura.

---

## 1. Diagnóstico por pantalla

### Login (`lib/screens/login_screen.dart`)
**Bien**: ojito de contraseña, mensajes de error claros, submit con Enter, copy de valor ("Fotografía tus facturas y tu contador se encarga del resto").
**Problemas**:
- **`login_screen.dart:21-26` y `:116-120`** — Botón "Ingreso rápido (dev)" con email y contraseña reales hardcodeados que se compilan en el binario. Bloqueante absoluto de tienda y de seguridad. El propio TODO lo admite.
- No existe "¿Olvidaste tu contraseña?". Para un dueño de colmado esto es garantía de tickets de soporte al contador.
- El texto dice "pide a tu contador un enlace de invitación" (`:123`), pero la app **no maneja deep links de invitación**: el enlace abriría el navegador, no la app. El onboarding del cliente vive fuera de la app.

### Router / selectores (`home_router.dart`, `org_selector_screen.dart`, `client_picker_screen.dart`)
**Bien**: lógica de roles limpia (contador→despachos, cliente→negocios, 1→directo, varios→selector), estado de error con Reintentar/Cerrar sesión (`home_router.dart:67-89`).
**Problema menor**: la elección de negocio no se recuerda entre sesiones; un cliente con 2 negocios pasa por el selector cada vez.

### Home cliente (`client_home_screen.dart`)
**Bien**: es la mejor pantalla. Banner "Leyendo N factura(s) con IA…" (`:235-258`), polling de 3 s solo mientras hay actividad (`:76-84`), spinner por fila, chips de estado con color, snackbar diferenciado online/offline tras capturar (`:117-123`), pull-to-refresh, estado vacío con instrucción.
**Problemas**:
- Sin paginación ni búsqueda: `_load()` (`:86-103`) trae **todas** las facturas siempre. Con 300+ facturas de un restaurante esto se degrada.
- La lista no muestra el **monto** — es el dato que el dueño más quiere ver de un vistazo.
- Una factura `rechazada`/`duplicada` solo se distingue por un chip rojo; no hay explicación de *por qué* ni acción sugerida ("vuelve a tomar la foto").
- El estado `duplicada` no aparece como filtro ni genera alerta destacada.

### Home contador (`home_screen.dart`)
**Bien**: filtros por estado (`:244-255`), mismas animaciones de procesamiento.
**Problemas**:
- Duplicación casi total con `client_home_screen.dart` (mapas de colores, polling, lista) — deuda que ya está causando divergencias: aquí se usa `withOpacity` deprecado (`home_screen.dart:289,326`) y en la de cliente `withValues`.
- Los filtros omiten `rechazada`/`duplicada` — justo lo que el contador necesita triagear.
- Sin agrupación por cliente/negocio ni por período fiscal; para un despacho con 30 clientes esta lista plana no escala.

### Captura (`capture_screen.dart`)
**Bien**: multi-página para recibos largos con tira de miniaturas removibles (`_PagesStrip`), compresión correcta antes de subir — `maxWidth: 1600, imageQuality: 85` (`:36-40`) da fotos de ~300–500 KB, perfecto para OCR y datos móviles. Guías de foto útiles y encolado instantáneo (la pantalla cierra sin esperar la red).
**Problemas de fricción — el flujo principal hoy son ~5 taps**: FAB "Subir factura" → tap "Tomar foto" → obturador → "Usar foto" (iOS) → "Subir factura". Para el caso dominante (1 foto, 1 factura):
  - La pantalla intermedia con la tarjeta de guías **siempre** ocupa media pantalla (`:73-104`); debería verse la primera vez o tras un rechazo, no en cada captura. El FAB podría abrir la cámara directo y dejar "agregar página" como paso posterior.
- **`capture_screen.dart:31,63` — `_error` se declara y se renderiza pero nunca se asigna**: si el usuario negó el permiso de cámara, `ImagePicker.pickImage` lanza y no pasa nada visible. Un usuario que negó permisos una vez queda con un botón que "no hace nada" y sin enlace a Ajustes.
- No hay captura en lote (5 facturas de la semana = 5 recorridos completos del flujo). Para colmados/ferreterías, esto es la mejora #1 de retención.

### Cola offline (`services/upload_queue.dart`, `widgets/connectivity_badge.dart`)
**Bien**: es lo más maduro de la app. Persistencia en disco con copia de archivos (`:91-101`), reintento al reconectar + barrido cada 2 min (`:81-83`), los 4xx salen de la cola como rechazo definitivo (`:131-135`), badge de conectividad discreto estilo iOS y banner de pendientes.
**Problemas**:
- **Sin UI de gestión de cola**: no se puede ver qué items están atascados, ni borrar, ni reintentar uno manualmente. `attempts` y `lastError` (`:38-39`) se registran pero jamás se muestran.
- `lastRejection` es un solo string (`:63`): si 3 facturas son rechazadas offline→online, el usuario ve solo la última. Y el mensaje se muestra sin decir *cuál* foto era.
- Sin backoff ni tope de reintentos ante 5xx: reintenta indefinidamente cada 2 min.
- En 401 hace `break` esperando re-login (`:130`) pero **nadie avisa al usuario** que su sesión murió y hay facturas retenidas.

### Sesión (`api/client.dart`)
**Bien**: refresh token con rotación y un solo reintento (`:71-74`, `:94-109`), también en la subida multipart (`:158-160`). Mensajes de error del API bien extraídos.
**Problemas**:
- **`client.dart:46-53` — tokens en `SharedPreferences` en texto plano**. Deben ir a `flutter_secure_storage` (Keychain/Keystore). En un dispositivo compartido del negocio esto importa.
- **Sesión expirada sin salida**: si el refresh falla, `clearTokens()` corre pero ninguna pantalla navega al Login; el usuario queda viendo errores 401 en cada pantalla. Falta un listener global de "sesión inválida → Login".
- **`client.dart:26-27`** — `API_URL` por defecto es `http://localhost:3000`; un build de release sin `--dart-define` apunta a la nada. Falta configuración por entorno/flavor con default de producción HTTPS.

### Detalle de factura (`invoice_detail_screen.dart`)
**Bien**: la joya de UX es el resaltado de campos de baja confianza con el ícono de advertencia (`:268-288`), visor con zoom pellizco/doble-tap, alertas DGII y check verde "NCF, RNC y padrón verificados" (`:239-252`), Guardar vs Guardar-y-validar según permiso, reprocesar con IA y cambio manual de estado para el contador.
**Problemas**:
- La fecha es un `TextField` libre "AAAA-MM-DD" (`:297`) — para el usuario meta, esto es un `DatePicker` obligatorio.
- Montos sin validación de formato (acepta cualquier texto; `double.tryParse` falla en silencio y el campo simplemente no se envía, `:84-87`).
- No se puede **eliminar** una factura (foto borrosa, duplicado accidental).
- El mapeo campo↔confianza (`_apiFieldName`, `:392-396`) solo cubre 2 campos; si el worker marca `monto_total` o `propina_legal` como dudosos, el resaltado no aparece.

### Subida compartida (`shared_upload_screen.dart`, `main.dart:36-59`)
**Bien**: recién terminada y bien pensada — selector de destino con auto-selección si hay uno solo, reusa la misma cola offline.
**Problemas**: si no hay sesión muestra el error (`:47-53`) pero no ofrece "Iniciar sesión" y retomar; las fotos compartidas se pierden. Tampoco permite quitar una foto del set compartido antes de subir.

### Mi cuenta (`settings_screen.dart`) y Resumen de gastos (`resumen_gastos_screen.dart`)
**Bien**: tema claro/oscuro/sistema persistido (modo oscuro ya existe ✓), cambio de contraseña con validaciones; el resumen de gastos (totales, ITBIS, barras por mes/categoría, top proveedores) es un gran gancho de valor para el dueño del negocio.
**Faltas en Settings**: sin biometría, sin versión de la app, **sin enlaces a Política de Privacidad/Términos, y sin "Eliminar mi cuenta"** — Apple rechaza apps con cuentas que no permiten borrarlas in-app (guideline 5.1.1(v)).

---

## 2. Fricción del flujo principal (abrir → foto → listo)

Hoy: **abrir app → [FAB] → [Tomar foto] → [obturador] → [usar foto] → [Subir] = 5 taps + 1 pantalla intermedia con texto denso**. El feedback posterior es excelente (encolado instantáneo, snackbar, spinner en la fila, chip que cambia solo). Objetivo alcanzable: **3 taps** (FAB abre cámara directo; tras la foto, pantalla de confirmación con "Agregar página" y "Subir"). Lo que sobra: la tarjeta de guías permanente. Lo que falta: aviso cuando el resultado llega **con la app cerrada** — hoy el ciclo de feedback muere al salir de la app.

## 3. Calidad técnica — hallazgos duros

| Hallazgo | Archivo | Gravedad |
|---|---|---|
| Falta `<uses-permission android.permission.INTERNET>` en el manifest principal (solo está en debug/profile) → **el APK/AAB de release no tiene red** | `android/app/src/main/AndroidManifest.xml` | P0 |
| Credenciales de prueba compiladas en el binario | `lib/screens/login_screen.dart:21-26` | P0 |
| Tokens en texto plano en SharedPreferences | `lib/api/client.dart:46-53` | P1 |
| Sesión expirada no redirige al Login (estado zombi) | `lib/api/client.dart` + todas las pantallas | P1 |
| `API_URL` default `http://localhost:3000` en release | `lib/api/client.dart:26-27` | P0 |
| Permiso de cámara denegado = fallo silencioso | `lib/screens/capture_screen.dart:35-44` | P1 |
| Sin crash reporting ni analytics (imposible operar en producción a ciegas) | `pubspec.yaml` | P1 |
| Un solo archivo de test (`test/models_test.dart`) | — | P2 |
| Naming inconsistente: `facturard`/`Facturard` como nombre visible, bundle iOS `com.elmerrodriguez.facturard` vs Android `com.facturard.app` | `Info.plist`, `AndroidManifest.xml:4`, `build.gradle.kts:24` | P0 (nombre) / P2 (ids, ya no se pueden cambiar tras publicar — decidir AHORA) |

**Lo que está bien técnicamente**: compresión de imagen correcta antes de subir, multipart con refresh en 401, cola persistente que sobrevive cierres de app, polling que se apaga solo, modo oscuro completo.

## 4. Preparación para tiendas — checklist

- ✅ Iconos (flutter_launcher_icons configurado con adaptive icons)
- ❌ Quitar botón e ingreso rápido dev
- ❌ Nombre visible "SubirFactura" (hoy "facturard"/"Facturard")
- ❌ Permiso INTERNET en release Android
- ❌ URL de producción por defecto (HTTPS)
- ❌ Política de privacidad (URL pública + enlace en Settings) y Términos
- ❌ Eliminación de cuenta in-app (requisito Apple)
- ❌ Cuenta demo para revisores de Apple (con datos de ejemplo y notas de revisión)
- ❌ Recuperación de contraseña
- ⚠️ Splash: LaunchScreen por defecto de Flutter (pantalla blanca) — deseable marca
- ⚠️ Fijar orientación portrait (hoy permite landscape en iPhone, `Info.plist`)
- ⚠️ Decidir bundle IDs definitivos antes del primer envío (irreversibles)

## 5. Top 10 mejoras priorizadas

| # | Prioridad | Mejora | Esfuerzo |
|---|---|---|---|
| 1 | **P0** | Quitar quick-login dev + credenciales del binario (`login_screen.dart:21`) | S |
| 2 | **P0** | Añadir INTERNET al manifest principal + `API_URL` de producción HTTPS por flavor/dart-define documentado | S |
| 3 | **P0** | Cumplimiento de tienda: renombrar a SubirFactura, política de privacidad + términos enlazados en Settings, eliminar cuenta in-app, cuenta demo para Apple, portrait-only | M |
| 4 | **P0** | Recuperación de contraseña (pantalla + endpoint) — sin esto el soporte recae en el contador | M |
| 5 | **P1** | **Notificaciones push** (FCM/APNs): "factura leída ✓ / necesita revisión / rechazada" — cierra el ciclo de la propuesta de valor con la app cerrada | L |
| 6 | **P1** | Manejo global de sesión expirada (redirigir a Login + aviso de facturas pendientes retenidas) y tokens a `flutter_secure_storage` | M |
| 7 | **P1** | UI de la cola: lista de pendientes con error visible, reintentar y borrar por item; rechazos múltiples acumulados con identificación de la foto | M |
| 8 | **P1** | Reducir captura a 3 taps: FAB→cámara directa, guías solo la 1ª vez, manejo del permiso denegado con enlace a Ajustes; modo lote ("tomar otra factura" al terminar) | M |
| 9 | **P1** | Crash reporting + analytics mínimos (Sentry o Crashlytics; eventos: captura, subida, rechazo) | S |
| 10 | **P2** | Lista de facturas: mostrar monto, paginación/búsqueda, filtros rechazada/duplicada, DatePicker en detalle, unificar los dos home en un widget compartido | M-L |

## 6. Recomendación para las próximas 2 semanas

**Semana 1 — "Cerrable en tienda"**: items 1–4 (todos los P0) + item 9 (Sentry, es medio día). Al final de la semana: build de release de Android que funciona, TestFlight interno con nombre correcto, política de privacidad publicada, demo account creada. Nada de esto es glamoroso, pero *todo* bloquea el envío.

**Semana 2 — "Ciclo de confianza"**: item 5 (push, empezar por FCM/Android que es más rápido, APNs después) e item 6 (sesión expirada + secure storage). Si sobra tiempo, item 8 (captura en 3 taps), que es la mejora de uso diario con mejor relación impacto/esfuerzo.

Dejaría para después: multi-tenant avanzado del contador (agrupación por cliente), paginación y biometría. La app cliente es el producto; el contador vive en el portal web.

**Veredicto**: base técnica por encima del promedio para esta etapa (la cola offline y el feedback de OCR en vivo son diferenciales reales), pero hoy es una beta interna, no un producto de tienda. Con 2 semanas disciplinadas en la lista anterior, es enviable a TestFlight/Play internal con dignidad.
