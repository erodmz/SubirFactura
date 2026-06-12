import { describe, expect, it } from 'vitest';
import { validateNcf } from './ncf';

describe('validateNcf', () => {
  it('acepta NCF serie B válidos', () => {
    const result = validateNcf('B0100000123');
    expect(result).toEqual({ valid: true, esECF: false, tipo: '01' });
  });

  it.each(['01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17'])(
    'acepta el tipo de comprobante %s',
    (tipo) => {
      expect(validateNcf(`B${tipo}00000001`).valid).toBe(true);
    },
  );

  it('acepta e-CF serie E de 13 caracteres', () => {
    const result = validateNcf('E310000000005');
    expect(result).toEqual({ valid: true, esECF: true, tipo: '31' });
  });

  it('normaliza minúsculas y espacios', () => {
    expect(validateNcf('  b0200001234 ').valid).toBe(true);
  });

  it('rechaza tipos de comprobante desconocidos', () => {
    const result = validateNcf('B9900000123');
    expect(result.valid).toBe(false);
    expect(result.tipo).toBe('99');
    expect(result.error).toMatch(/desconocido/);
  });

  it('rechaza tipos de e-CF desconocidos', () => {
    expect(validateNcf('E990000000005').valid).toBe(false);
  });

  it('rechaza estructuras inválidas', () => {
    for (const bad of ['', 'B010000123', 'B01000001234', 'A0100000123', 'E3100000005', '0100000123B']) {
      expect(validateNcf(bad).valid).toBe(false);
    }
  });
});
