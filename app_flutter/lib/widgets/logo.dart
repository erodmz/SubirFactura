import 'package:flutter/material.dart';

import '../theme.dart';

/// Logo de FacturaRD (igual al del web): marca con degradado (mini-tablero) +
/// wordmark con "RD" en degradado.
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 30, this.withWordmark = true});

  final double size;
  final bool withWordmark;

  @override
  Widget build(BuildContext context) {
    final inner = size * 0.6;
    Widget bar(double hFrac, double opacity) => Container(
          width: inner * 0.2,
          height: inner * hFrac,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: opacity),
            borderRadius: BorderRadius.circular(inner * 0.1),
          ),
        );

    final mark = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [brandBlue, Color(0xFF6C6CFF), brandPurple],
        ),
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: Padding(
        padding: EdgeInsets.all(size * 0.2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [bar(0.5, 0.95), bar(0.75, 0.85), bar(1.0, 0.72)],
        ),
      ),
    );

    if (!withWordmark) return mark;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        SizedBox(width: size * 0.32),
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: 'Factura',
                style: TextStyle(
                  color: textInk,
                  fontSize: size * 0.62,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: ShaderMask(
                  shaderCallback: (bounds) => const LinearGradient(
                    colors: [brandBlue, brandPurple],
                  ).createShader(bounds),
                  child: Text(
                    'RD',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: size * 0.62,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
