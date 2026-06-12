import { describe, expect, it } from 'vitest';
import type { InvoiceExtraction } from '../types';
import { evaluateExtraction, fechaToPeriodoFiscal, validateInvoiceFields } from './evaluate';

function extraction(overrides: Partial<InvoiceExtraction> = {}): InvoiceExtraction {
  return {
    ncf: { valor: 'B0100000123', confianza: 0.97 },
    rnc_proveedor: { valor: '101000007', confianza: 0.95 },
    razon_social: { valor: 'Colmado Don José', confianza: 0.9 },
    fecha: { valor: '2026-05-14', confianza: 0.98 },
    monto_facturado: { valor: 1500.0, confianza: 0.99 },
    itbis: { valor: 270.0, confianza: 0.97 },
    propina_legal: { valor: 0, confianza: 0.9 },
    monto_total: { valor: 1770.0, confianza: 0.98 },
    categoria_606_sugerida: { valor: '02', confianza: 0.85 },
    tipo_comprobante: { valor: '01', confianza: 0.9 },
    es_legible: true,
    notas: '',
    ...overrides,
  };
}

describe('evaluateExtraction', () => {
  it('todos los críticos ≥ umbral y validaciones ok → extraida (§5.3)', () => {
    const result = evaluateExtraction(extraction());
    expect(result.estado).toBe('extraida');
    expect(result.camposBajaConfianza).toEqual([]);
    expect(result.erroresValidacion).toEqual([]);
  });

  it('un campo crítico < 0.90 → en_revision marcando el campo dudoso', () => {
    const result = evaluateExtraction(extraction({ itbis: { valor: 270, confianza: 0.6 } }));
    expect(result.estado).toBe('en_revision');
    expect(result.camposBajaConfianza).toEqual(['itbis']);
  });

  it('campo crítico nulo → en_revision aunque la confianza sea alta', () => {
    const result = evaluateExtraction(extraction({ ncf: { valor: null, confianza: 0.95 } }));
    expect(result.estado).toBe('en_revision');
    expect(result.camposBajaConfianza).toContain('ncf');
  });

  it('es_legible false → en_revision pidiendo re-tomar la foto (§5.3)', () => {
    const result = evaluateExtraction(extraction({ es_legible: false }));
    expect(result.estado).toBe('en_revision');
    expect(result.esLegible).toBe(false);
    expect(result.erroresValidacion[0]).toMatch(/re-tomar/);
  });

  it('NCF estructuralmente inválido → en_revision aunque la IA esté confiada (§5.4)', () => {
    const result = evaluateExtraction(
      extraction({ ncf: { valor: 'X9999', confianza: 0.99 } }),
    );
    expect(result.estado).toBe('en_revision');
    expect(result.erroresValidacion[0]).toMatch(/NCF inválido/);
  });

  it('RNC con dígito verificador malo → en_revision', () => {
    const result = evaluateExtraction(
      extraction({ rnc_proveedor: { valor: '101000001', confianza: 0.99 } }),
    );
    expect(result.estado).toBe('en_revision');
    expect(result.erroresValidacion[0]).toMatch(/RNC del proveedor/);
  });

  it('aritmética incoherente → en_revision (subtotal + ITBIS ≠ total)', () => {
    const result = evaluateExtraction(
      extraction({ monto_total: { valor: 2500.0, confianza: 0.99 } }),
    );
    expect(result.estado).toBe('en_revision');
    expect(result.erroresValidacion[0]).toMatch(/no cuadran/);
  });

  it('el umbral es configurable por env (§5.3)', () => {
    const low = extraction({ fecha: { valor: '2026-05-14', confianza: 0.8 } });
    expect(evaluateExtraction(low, 0.75).estado).toBe('extraida');
    expect(evaluateExtraction(low, 0.9).estado).toBe('en_revision');
  });
});

describe('validateInvoiceFields (revisión manual)', () => {
  it('acepta campos válidos', () => {
    expect(
      validateInvoiceFields({
        ncf: 'B0100000123',
        rncProveedor: '101000007',
        fecha: '2026-05-14',
        montoFacturado: 100,
        itbis: 18,
        montoTotal: 118,
      }),
    ).toEqual([]);
  });

  it('acumula múltiples errores', () => {
    const errores = validateInvoiceFields({
      ncf: 'MALO',
      rncProveedor: '123',
      fecha: '14/05/2026',
    });
    expect(errores).toHaveLength(3);
  });

  it('ignora los campos ausentes (edición parcial)', () => {
    expect(validateInvoiceFields({ ncf: 'B0100000123' })).toEqual([]);
  });
});

describe('fechaToPeriodoFiscal', () => {
  it('convierte fecha ISO a AAAAMM', () => {
    expect(fechaToPeriodoFiscal('2026-05-14')).toBe('202605');
  });

  it('rechaza fechas inválidas', () => {
    expect(fechaToPeriodoFiscal('14/05/2026')).toBeNull();
    expect(fechaToPeriodoFiscal('2026-13-01')).toBeNull();
  });
});
