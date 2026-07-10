import { describe, expect, it } from 'vitest';
import { editDistanceAtMost1, normalizeNcf, sanitizeExtraction } from './normalize';
import type { InvoiceExtraction } from '../types';

describe('normalizeNcf', () => {
  it('deja intacto un NCF serie B válido (solo normaliza formato)', () => {
    expect(normalizeNcf(' b0100004521 ')).toEqual({
      value: 'B0100004521',
      corrected: false,
      valid: true,
    });
  });

  it('corrige el cero de más tras el tipo (el caso real del OCR)', () => {
    // El OCR leyó B01000004521 (12 chars) de un recibo que decía B0100004521 (11)
    const r = normalizeNcf('B01000004521');
    expect(r).toEqual({ value: 'B0100004521', corrected: true, valid: true });
  });

  it('corrige un cero de menos tras el tipo', () => {
    const r = normalizeNcf('B010004521'); // 10 chars
    expect(r).toEqual({ value: 'B0100004521', corrected: true, valid: true });
  });

  it('corrige el cero de más en un e-CF (serie E, 13 chars)', () => {
    const r = normalizeNcf('E3100005582846'); // 14 chars, cero extra
    expect(r).toEqual({ value: 'E310005582846', corrected: true, valid: true });
  });

  it('NO corrige cuando el dígito extra no es un cero de relleno', () => {
    const r = normalizeNcf('B01900004521'); // el 9 no es relleno: ambiguo
    expect(r.corrected).toBe(false);
    expect(r.valid).toBe(false);
  });

  it('marca inválido lo irreconocible sin inventar', () => {
    const r = normalizeNcf('XYZ123');
    expect(r).toEqual({ value: 'XYZ123', corrected: false, valid: false });
  });
});

describe('editDistanceAtMost1', () => {
  it('acepta iguales, una sustitución, una inserción y un borrado', () => {
    expect(editDistanceAtMost1('132695399', '132695399')).toBe(true); // igual
    expect(editDistanceAtMost1('132695399', '132695390')).toBe(true); // sustitución
    expect(editDistanceAtMost1('13269539', '132695399')).toBe(true); // dígito perdido (caso real)
    expect(editDistanceAtMost1('1326953990', '132695399')).toBe(true); // dígito extra
  });

  it('rechaza dos o más ediciones', () => {
    expect(editDistanceAtMost1('132695399', '132695311')).toBe(false);
    expect(editDistanceAtMost1('1326953', '132695399')).toBe(false); // faltan 2
    expect(editDistanceAtMost1('999999999', '132695399')).toBe(false);
  });
});

function extractionBase(): InvoiceExtraction {
  const f = <T>(valor: T | null, confianza = 0.95) => ({ valor, confianza });
  return {
    ncf: f('B0100004521'),
    rnc_proveedor: f('101011556'),
    rnc_comprador: f('132695399'),
    razon_social: f('FARMACIA CAROL'),
    fecha: f('2026-07-09'),
    monto_facturado: f(635),
    itbis: f(114.3),
    propina_legal: f<number>(null),
    monto_total: f(749.3),
    categoria_606_sugerida: f('09'),
    tipo_comprobante: f('01'),
    impuesto_selectivo: f<number>(null),
    otros_impuestos: f<number>(null),
    forma_pago: f<string>(null),
    tipo_bien_servicio: f('bienes'),
    ncf_modificado: f<string>(null),
    es_legible: true,
    notas: '',
  };
}

describe('sanitizeExtraction', () => {
  it('no toca una extracción sana', () => {
    const e = extractionBase();
    expect(sanitizeExtraction(e)).toEqual([]);
    expect(e.ncf.confianza).toBe(0.95);
  });

  it('corrige el NCF con cero extra y penaliza su confianza bajo el umbral', () => {
    const e = extractionBase();
    e.ncf = { valor: 'B01000004521', confianza: 0.95 };
    const ajustes = sanitizeExtraction(e);
    expect(e.ncf.valor).toBe('B0100004521');
    expect(e.ncf.confianza).toBeLessThan(0.9);
    expect(ajustes.some((a) => a.includes('NCF corregido'))).toBe(true);
  });

  it('degrada la confianza de un RNC que no pasa el dígito verificador', () => {
    const e = extractionBase();
    // El caso real: el OCR leyó 8 dígitos con confianza 0.9
    e.rnc_comprador = { valor: '13269539', confianza: 0.9 };
    const ajustes = sanitizeExtraction(e);
    expect(e.rnc_comprador.confianza).toBeLessThanOrEqual(0.5);
    expect(ajustes.some((a) => a.includes('rnc_comprador'))).toBe(true);
  });

  it('limpia separadores de un RNC válido sin degradarlo', () => {
    const e = extractionBase();
    e.rnc_proveedor = { valor: '101-01155-6', confianza: 0.95 };
    sanitizeExtraction(e);
    expect(e.rnc_proveedor.valor).toBe('101011556');
    expect(e.rnc_proveedor.confianza).toBe(0.95);
  });
});
