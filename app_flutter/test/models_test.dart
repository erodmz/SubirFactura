import 'package:facturard/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Invoice.fromJson tolera Decimals de Prisma serializados como string', () {
    final invoice = Invoice.fromJson({
      'id': 'inv1',
      'estado': 'en_revision',
      'createdAt': '2026-06-12T18:00:00.000Z',
      'ncf': 'B0100000123',
      'fecha': '2026-05-14T00:00:00.000Z',
      'montoFacturado': '1500.00',
      'itbis': 270,
      'clientProfile': {'id': 'c1', 'razonSocial': 'Colmado'},
      'confianzaPorCampo': {
        'evaluation': {
          'camposBajaConfianza': ['itbis'],
          'erroresValidacion': ['Los montos no cuadran'],
        },
      },
    });

    expect(invoice.montoFacturado, 1500.0);
    expect(invoice.itbis, 270.0);
    expect(invoice.fecha, '2026-05-14');
    expect(invoice.camposBajaConfianza, ['itbis']);
    expect(invoice.erroresValidacion, ['Los montos no cuadran']);
  });

  test('Invoice.fromJson tolera campos nulos y error de OCR', () {
    final invoice = Invoice.fromJson({
      'id': 'inv2',
      'estado': 'subida',
      'createdAt': '2026-06-12T18:00:00.000Z',
      'confianzaPorCampo': {'error': 'OCR falló tras 3 intentos', 'capturaManual': true},
    });

    expect(invoice.ncf, isNull);
    expect(invoice.erroresValidacion, ['OCR falló tras 3 intentos']);
  });

  test('categorias606 contiene las 11 categorías del Formato 606', () {
    expect(categorias606.length, 11);
    expect(categorias606['01'], 'Gastos de personal');
    expect(categorias606['11'], 'Gastos de seguros');
  });
}
