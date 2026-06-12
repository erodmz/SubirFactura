import { describe, expect, it } from 'vitest';
import {
  computeCedulaCheckDigit,
  computeRncCheckDigit,
  isValidCedula,
  isValidRnc,
  validateTaxId,
} from './rnc';

describe('computeRncCheckDigit', () => {
  it('calcula el dígito verificador (módulo 11)', () => {
    // 1·7 + 0·9 + 1·8 + 0·6 + 0·5 + 0·4 + 0·3 + 0·2 = 15; 15 % 11 = 4; dv = 11 − 4 = 7
    expect(computeRncCheckDigit('10100000')).toBe(7);
  });

  it('rechaza entradas que no son 8 dígitos', () => {
    expect(() => computeRncCheckDigit('123')).toThrow();
  });
});

describe('isValidRnc', () => {
  it('acepta un RNC con dígito verificador correcto', () => {
    expect(isValidRnc('101000007')).toBe(true);
  });

  it('acepta formato con guiones', () => {
    expect(isValidRnc('1-01-00000-7')).toBe(true);
  });

  it('rechaza dígito verificador incorrecto', () => {
    expect(isValidRnc('101000001')).toBe(false);
  });

  it('rechaza longitudes incorrectas', () => {
    expect(isValidRnc('10100000')).toBe(false);
    expect(isValidRnc('1010000070')).toBe(false);
  });
});

describe('computeCedulaCheckDigit', () => {
  it('calcula el dígito verificador (Luhn)', () => {
    // 0,0,1·1=1,1·2=2,3,9·2=18→9,1,8·2=16→7,2,0 → suma 25 → dv = (10−5)%10 = 5
    expect(computeCedulaCheckDigit('0011391820')).toBe(5);
  });
});

describe('isValidCedula', () => {
  it('acepta una cédula con dígito verificador correcto', () => {
    expect(isValidCedula('00113918205')).toBe(true);
  });

  it('acepta formato con guiones', () => {
    expect(isValidCedula('001-1391820-5')).toBe(true);
  });

  it('rechaza dígito verificador incorrecto', () => {
    expect(isValidCedula('00113918204')).toBe(false);
  });
});

describe('validateTaxId', () => {
  it('clasifica RNC de 9 dígitos', () => {
    expect(validateTaxId('101000007')).toEqual({ valid: true, kind: 'rnc', normalized: '101000007' });
  });

  it('clasifica cédula de 11 dígitos', () => {
    expect(validateTaxId('001-1391820-5')).toEqual({
      valid: true,
      kind: 'cedula',
      normalized: '00113918205',
    });
  });

  it('rechaza longitudes que no son ni RNC ni cédula', () => {
    expect(validateTaxId('12345').valid).toBe(false);
  });

  it('reporta dígito verificador inválido', () => {
    const result = validateTaxId('101000001');
    expect(result.valid).toBe(false);
    expect(result.kind).toBe('rnc');
  });
});
