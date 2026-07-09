import 'package:flutter/material.dart';

import '../theme.dart';

/// Logo de SubirFactura (igual al del web): encuadre de cámara + recibo con
/// flecha hacia arriba ("subir"), con degradado de marca + wordmark.
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 30, this.withWordmark = true});

  final double size;
  final bool withWordmark;

  @override
  Widget build(BuildContext context) {
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
      child: CustomPaint(painter: _MarkPainter(), size: Size(size, size)),
    );

    if (!withWordmark) return mark;

    // "Factura" toma el color de texto del tema (oscuro en claro, claro en
    // oscuro); "Subir" siempre va con el degradado de marca, legible en ambos.
    final wordStyle = TextStyle(
      color: Theme.of(context).colorScheme.onSurface,
      fontSize: size * 0.62,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.5,
    );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        SizedBox(width: size * 0.32),
        Text.rich(
          TextSpan(
            children: [
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: ShaderMask(
                  shaderCallback: (bounds) => const LinearGradient(
                    colors: [brandBlue, brandPurple],
                  ).createShader(bounds),
                  child: Text('Subir',
                      style: wordStyle.copyWith(color: Colors.white)),
                ),
              ),
              TextSpan(text: 'Factura', style: wordStyle),
            ],
          ),
        ),
      ],
    );
  }
}

/// Dibuja el glifo (encuadre + recibo + flecha) en coordenadas 0..100.
class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 100;
    final stroke = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4 * s
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final corners = Path()
      ..moveTo(24 * s, 34 * s)
      ..lineTo(24 * s, 28 * s)
      ..quadraticBezierTo(24 * s, 24 * s, 28 * s, 24 * s)
      ..lineTo(34 * s, 24 * s)
      ..moveTo(66 * s, 24 * s)
      ..lineTo(72 * s, 24 * s)
      ..quadraticBezierTo(76 * s, 24 * s, 76 * s, 28 * s)
      ..lineTo(76 * s, 34 * s)
      ..moveTo(24 * s, 66 * s)
      ..lineTo(24 * s, 72 * s)
      ..quadraticBezierTo(24 * s, 76 * s, 28 * s, 76 * s)
      ..lineTo(34 * s, 76 * s)
      ..moveTo(66 * s, 76 * s)
      ..lineTo(72 * s, 76 * s)
      ..quadraticBezierTo(76 * s, 76 * s, 76 * s, 72 * s)
      ..lineTo(76 * s, 66 * s);
    canvas.drawPath(corners, stroke);

    final receipt = Path()
      ..moveTo(40 * s, 38 * s)
      ..lineTo(60 * s, 38 * s)
      ..quadraticBezierTo(62 * s, 38 * s, 62 * s, 40 * s)
      ..lineTo(62 * s, 58 * s)
      ..lineTo(58 * s, 62 * s)
      ..lineTo(54 * s, 58 * s)
      ..lineTo(50 * s, 62 * s)
      ..lineTo(46 * s, 58 * s)
      ..lineTo(42 * s, 62 * s)
      ..lineTo(38 * s, 58 * s)
      ..lineTo(38 * s, 40 * s)
      ..quadraticBezierTo(38 * s, 38 * s, 40 * s, 38 * s)
      ..close();
    canvas.drawPath(receipt, Paint()..color = Colors.white);

    final arrowPaint = Paint()..color = brandBlue;
    final head = Path()
      ..moveTo(50 * s, 40 * s)
      ..lineTo(43 * s, 49 * s)
      ..lineTo(57 * s, 49 * s)
      ..close();
    canvas.drawPath(head, arrowPaint);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(48 * s, 47 * s, 4 * s, 11 * s),
        Radius.circular(1 * s),
      ),
      arrowPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _MarkPainter oldDelegate) => false;
}
