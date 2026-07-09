import 'package:flutter/material.dart';

import '../services/connectivity_service.dart';
import '../services/upload_queue.dart';

/// Indicador de conexión, estilo iOS: discreto cuando todo va bien (un punto
/// verde), claro cuando hay que avisar (sincronizando / sin conexión).
class ConnectivityBadge extends StatelessWidget {
  const ConnectivityBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: ConnectivityService.instance.online,
      builder: (context, online, _) {
        return ListenableBuilder(
          listenable: UploadQueue.instance,
          builder: (context, _) {
            final pending = UploadQueue.instance.pendingCount;
            return Padding(
              padding: const EdgeInsets.only(right: 4),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 280),
                switchInCurve: Curves.easeOut,
                transitionBuilder: (child, anim) =>
                    FadeTransition(opacity: anim, child: ScaleTransition(scale: anim, child: child)),
                child: _content(context, online, pending),
              ),
            );
          },
        );
      },
    );
  }

  Widget _content(BuildContext context, bool online, int pending) {
    if (!online) {
      // Sin conexión: nube tachada en rojo, sin texto (llama la atención).
      return const _CloudStatus(
        key: ValueKey('offline'),
        icon: Icons.cloud_off_rounded,
        color: Color(0xFFFF3B30), // rojo iOS
        tooltip: 'Sin conexión',
      );
    }
    if (pending > 0) {
      return _Pill(
        key: const ValueKey('sync'),
        spinner: true,
        label: 'Sincronizando${pending > 1 ? ' · $pending' : ''}',
        color: Theme.of(context).colorScheme.primary,
      );
    }
    // En línea: nube verde con check.
    return const _CloudStatus(
      key: ValueKey('online'),
      icon: Icons.cloud_done_rounded,
      color: Color(0xFF34C759), // verde iOS
      tooltip: 'En línea',
    );
  }
}

/// Banner de subidas pendientes: en línea muestra "subiendo…"; sin conexión
/// avisa que quedaron pendientes y se subirán al reconectar.
class PendingUploadBanner extends StatelessWidget {
  const PendingUploadBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final queue = UploadQueue.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([queue, ConnectivityService.instance.online]),
      builder: (context, _) {
        if (queue.lastRejection != null) {
          return Material(
            color: scheme.errorContainer,
            child: ListTile(
              dense: true,
              iconColor: scheme.onErrorContainer,
              textColor: scheme.onErrorContainer,
              leading: const Icon(Icons.error_outline),
              title: Text(queue.lastRejection!),
              trailing: IconButton(
                icon: const Icon(Icons.close, size: 18),
                color: scheme.onErrorContainer,
                onPressed: queue.clearRejection,
              ),
            ),
          );
        }
        if (queue.pendingCount == 0) return const SizedBox.shrink();

        final online = ConnectivityService.instance.online.value;
        final n = queue.pendingCount;
        return Material(
          color: online ? scheme.secondaryContainer : scheme.surfaceContainerHighest,
          child: ListTile(
            dense: true,
            iconColor: online ? scheme.onSecondaryContainer : scheme.onSurfaceVariant,
            textColor: online ? scheme.onSecondaryContainer : scheme.onSurfaceVariant,
            leading: Icon(online ? Icons.cloud_upload : Icons.cloud_off_rounded),
            title: Text(online
                ? '$n factura(s) subiendo…'
                : '$n factura(s) pendiente(s) de subir'),
            subtitle: online
                ? null
                : const Text('Sin conexión: se subirán solas al reconectar'),
          ),
        );
      },
    );
  }
}

/// Ícono de nube que resume el estado de red: verde (en línea) o rojo (sin
/// conexión). Sin texto; el detalle va en el tooltip.
class _CloudStatus extends StatelessWidget {
  const _CloudStatus({
    super.key,
    required this.icon,
    required this.color,
    required this.tooltip,
  });

  final IconData icon;
  final Color color;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        child: Icon(icon, color: color, size: 22),
      ),
    );
  }
}

/// Píldora compacta con spinner + texto (estado de sincronización).
class _Pill extends StatelessWidget {
  const _Pill({
    super.key,
    this.spinner = false,
    required this.label,
    required this.color,
  });

  final bool spinner;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (spinner)
            SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(color)),
            ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
