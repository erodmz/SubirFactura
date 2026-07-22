import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models.dart';
import '../widgets/error_banner.dart';
import '../widgets/logo.dart';
import 'login_screen.dart';

/// Empresa en revisión KYC: mientras el operador no apruebe, el API bloquea el
/// despacho. Aquí el usuario ve el estado (y el motivo si fue rechazada) y
/// puede refrescar; el documento se sube desde el panel web.
class PendingOrgScreen extends StatefulWidget {
  const PendingOrgScreen({
    super.key,
    required this.membership,
    required this.onApproved,
    this.onExit,
  });

  final Membership membership;

  /// Se llama cuando la verificación en vivo confirma que ya está aprobada.
  final VoidCallback onApproved;

  /// Volver (selector de empresas) — null si no hay a dónde volver.
  final VoidCallback? onExit;

  @override
  State<PendingOrgScreen> createState() => _PendingOrgScreenState();
}

class _PendingOrgScreenState extends State<PendingOrgScreen> {
  String _estado = 'pendiente';
  String? _motivo;
  bool _tieneDoc = false;
  bool _checking = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _estado = widget.membership.estadoAprobacion;
    _check();
  }

  Future<void> _check() async {
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      // GET de la org está permitido aunque esté pendiente (@AllowPendingOrg).
      final data = await ApiClient.instance
          .get('/api/organizations/${widget.membership.orgId}') as Map<String, dynamic>;
      final estado = data['estadoAprobacion'] as String? ?? 'aprobada';
      if (!mounted) return;
      if (estado == 'aprobada') {
        widget.onApproved();
        return;
      }
      setState(() {
        _estado = estado;
        _motivo = data['motivoRechazo'] as String?;
        _tieneDoc = data['verificacionDocKey'] != null;
        _checking = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _checking = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _checking = false;
          _error = 'Sin conexión. Intenta de nuevo.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final rechazada = _estado == 'rechazada';
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Logo(size: 24),
        leading: widget.onExit != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: widget.onExit,
                tooltip: 'Mis empresas',
              )
            : null,
        actions: [
          IconButton(
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ApiClient.instance.clearTokens();
              if (!context.mounted) return;
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (_) => false,
              );
            },
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  rechazada ? Icons.gpp_bad_outlined : Icons.verified_user_outlined,
                  size: 56,
                  color: rechazada ? scheme.error : scheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  rechazada
                      ? 'La verificación fue rechazada'
                      : '${widget.membership.orgNombre} está en revisión',
                  style: Theme.of(context).textTheme.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                if (rechazada && _motivo != null) ...[
                  ErrorBanner(message: 'Motivo: $_motivo', icon: Icons.info_outline),
                  const SizedBox(height: 10),
                ],
                Text(
                  rechazada
                      ? 'Corrige el documento y súbelo de nuevo desde el panel web — lo revisamos en cuanto llegue.'
                      : _tieneDoc
                          ? 'Recibimos tu documento y lo estamos revisando (normalmente el mismo día). Te avisamos en cuanto quede activa.'
                          : 'Falta el documento que pruebe que eres el dueño o tienes acceso a la empresa. Súbelo desde el panel web (una factura del negocio, registro mercantil o certificado del RNC).',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 20),
                if (_error != null) ...[
                  ErrorBanner(message: _error!, icon: Icons.wifi_off_rounded),
                  const SizedBox(height: 10),
                ],
                FilledButton.icon(
                  onPressed: _checking ? null : _check,
                  icon: _checking
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh_outlined),
                  label: Text(_checking ? 'Verificando…' : 'Ya me aprobaron — verificar'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
