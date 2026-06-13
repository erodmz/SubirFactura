# FacturaRD — App móvil (Flutter)

App para que el **cliente final** fotografíe sus facturas de gasto y el contador
las reciba digitalizadas (ESPECIFICACION.md, Fase 2).

## Qué incluye

- **Login multi-empresa**: selector de empresa cuando el usuario pertenece a varias (§4).
- **Captura con guías**: consejos de encuadre + cámara nativa, compresión a ~1–2 MB JPEG (§5.1).
- **Cola de subida offline-first**: la foto se guarda local al instante y se sube sola al
  recuperar señal (listener de conectividad + barrido cada 2 min). Sobrevive a cierres de la app.
- **Estados de factura** en vivo: subida → procesando → extraída / en revisión → validada.
- **Cola de revisión**: edición campo a campo con los campos dudosos de la IA resaltados
  y los errores de validación fiscal en español (§5.3).

## Correr en desarrollo

```bash
flutter pub get

# iOS simulator (el API local responde en localhost)
flutter run --dart-define=API_URL=http://localhost:3000

# Android emulator (localhost del host = 10.0.2.2)
flutter run --dart-define=API_URL=http://10.0.2.2:3000

# Dispositivo físico: usar la IP de tu Mac en la red local
flutter run --dart-define=API_URL=http://192.168.x.x:3000
```

En producción: `--dart-define=API_URL=https://tu-dominio.do` (Caddy sirve el API bajo `/api`).

## Tests y análisis

```bash
flutter analyze
flutter test
```
