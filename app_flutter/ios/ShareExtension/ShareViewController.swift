import receive_sharing_intent

/// Controlador de la Share Extension. Hereda todo el comportamiento del plugin
/// receive_sharing_intent: guarda los archivos compartidos en el App Group y
/// abre la app anfitriona (SubirFactura), que los recibe en getInitialMedia().
///
/// Requisitos (ver ios/SHARE_EXTENSION_SETUP.md):
///  - App Group: group.com.elmerrodriguez.facturard  (en Runner y en esta extensión)
///  - URL scheme en Runner: ShareMedia-com.elmerrodriguez.facturard
class ShareViewController: RSIShareViewController {
  // Redirige a la app inmediatamente (sin la hoja de composición) al compartir.
  override func shouldAutoRedirect() -> Bool {
    return true
  }
}
