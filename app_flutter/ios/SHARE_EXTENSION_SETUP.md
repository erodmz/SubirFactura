# Share Extension de iOS — pasos en Xcode (receive_sharing_intent 1.9.0, SPM)

El lado Flutter/Android ya está hecho, y el target `ShareExtension` ya está creado.
Los archivos del repo ya están correctos:
- `ShareExtension/ShareViewController.swift` → hereda de `RSIShareViewController`.
- `ShareExtension/Info.plist` → `AppGroupId = group.com.elmerrodriguez.facturard` + regla de imágenes.
- `ShareExtension/ShareExtension.entitlements` → App Group (ya cableado en el proyecto).
- `Runner/Info.plist` → esquema `ShareMedia-com.elmerrodriguez.facturard` (ya está).
- `Runner/Runner.entitlements` → App Group (ya está).

⚠️ **IMPORTANTE**: la v1.9.0 se distribuye **solo por Swift Package Manager**
(no hay podspec de CocoaPods). No agregues el plugin al Podfile.

## Único paso manual que falta

### 1. Enlazar el plugin al target de la extensión (SPM)
En Xcode (`open ios/Runner.xcworkspace`):
1. Selecciona el target **ShareExtension** → pestaña **General**.
2. En **Frameworks and Libraries** → **+**.
3. Elige la librería **`receive-sharing-intent`** (del paquete Swift
   `receive_sharing_intent`) y añádela.

### 2. Evitar "no such module" en runtime
Target **Runner** → **Build Phases** → arrastra **Embed Foundation Extension**
por encima de **Thin Binary**.

### 3. (Verificar) App Groups en ambos targets
`Signing & Capabilities` de **Runner** y **ShareExtension** debe mostrar
**App Groups** con `group.com.elmerrodriguez.facturard`. Ya está en los
`.entitlements`; si con firma automática pide algo, deja que Xcode lo resuelva.

## Probar
```
flutter run --release -d <tu-iphone> --dart-define=API_URL=http://<IP>:3000
```
Fotos → elige una factura → **Compartir** → **SubirFactura**. La app abre directa
en "Subir factura compartida", eliges la empresa y se encola igual que una foto
tomada en la app.

## Si comparte pero no sube
- Revisa que el **App Group sea idéntico** (`group.com.elmerrodriguez.facturard`)
  en ambos targets.
- El esquema de URL debe coincidir con el bundle id (`ShareMedia-com.elmerrodriguez.facturard`).
- Mira los logs de la app al abrir: `ReceiveSharingIntent` debe emitir los archivos.
