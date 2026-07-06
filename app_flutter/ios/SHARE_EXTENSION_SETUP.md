# Share Extension de iOS — pasos en Xcode

El lado Flutter/Android ya está hecho. Falta crear el **target de la extensión**
en Xcode (no se puede hacer a ciegas sin arriesgar el proyecto). Estos son los
pasos exactos. Bundle id de la app: `com.elmerrodriguez.facturard`.

## 1. Abrir el proyecto
```
open ios/Runner.xcworkspace
```

## 2. Crear el target "Share Extension"
1. File → New → Target… → **Share Extension** → Next.
2. Product Name: **ShareExtension**. Language: **Swift**. Finish.
3. Cuando pregunte "Activate scheme?", elige **Cancel** (no hace falta).

Esto crea la carpeta `ShareExtension/` con `ShareViewController.swift`, `Info.plist`
y `MainInterface.storyboard`.

## 3. Reemplazar los archivos generados por los de este repo
Ya dejé listos en `ios/ShareExtension/`:
- `ShareViewController.swift`  → reemplaza el generado.
- `Info.plist`                → reemplaza el generado.
- `ShareExtension.entitlements` → añádelo al target (paso 5).

(Deja el `MainInterface.storyboard` que generó Xcode tal cual.)

## 4. App Group (para pasar la foto de la extensión a la app)
En **ambos** targets (Runner y ShareExtension): pestaña **Signing & Capabilities**
→ **+ Capability** → **App Groups** → **+** → agrega:
```
group.com.elmerrodriguez.facturard
```
- Para el **Runner**, ya dejé `ios/Runner/Runner.entitlements` con ese grupo; si
  Xcode crea otro, unifícalos.
- Para la **ShareExtension**, usa `ios/ShareExtension/ShareExtension.entitlements`.

## 5. Pod de receive_sharing_intent en la extensión
En el `ios/Podfile`, añade el target de la extensión para que tenga el plugin:
```ruby
target 'ShareExtension' do
  use_frameworks!
  pod 'receive_sharing_intent', :path => '.symlinks/plugins/receive_sharing_intent/ios'
end
```
Luego:
```
cd ios && pod install
```

## 6. Deployment target
El target ShareExtension debe tener el mismo **iOS Deployment Target** que el
Runner (15.0). Ajústalo en Build Settings si Xcode puso otro.

## 7. Probar
```
flutter run --release -d <tu-iphone> --dart-define=API_URL=http://<IP>:3000
```
Abre **Fotos**, elige una factura, **Compartir** → debería aparecer **SubirFactura**.
Al tocarla, la app abre en la pantalla "Subir factura compartida", eliges la
empresa y se encola igual que una foto tomada en la app.

## Notas
- El esquema `ShareMedia-com.elmerrodriguez.facturard` ya está en `Runner/Info.plist`.
- Si compartes y no abre la app: revisa que el **App Group sea idéntico** en ambos
  targets y que el esquema de URL coincida con el bundle id.
- Android ya funciona sin pasos extra (intent-filter en el manifest).
