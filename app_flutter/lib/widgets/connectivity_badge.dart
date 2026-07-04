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
      return const _Pill(
        key: ValueKey('offline'),
        icon: Icons.cloud_off_rounded,
        label: 'Sin conexión',
        color: Color(0xFF8A8A8E), // gris iOS
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
    return const _OnlineDot(key: ValueKey('online'));
  }
}

/// Punto verde minimalista: la app está en línea y todo sincronizado.
class _OnlineDot extends StatelessWidget {
  const _OnlineDot({super.key});

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF34C759); // verde iOS
    return Tooltip(
      message: 'En línea',
      child: Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        child: Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: green,
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: green.withValues(alpha: 0.45), blurRadius: 5, spreadRadius: 1)],
          ),
        ),
      ),
    );
  }
}

/// Píldora compacta con ícono/spinner + texto (sincronizando o sin conexión).
class _Pill extends StatelessWidget {
  const _Pill({
    super.key,
    this.icon,
    this.spinner = false,
    required this.label,
    required this.color,
  });

  final IconData? icon;
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
            )
          else
            Icon(icon, size: 14, color: color),
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
