import { describe, expect, it } from 'vitest';
import { matchRazonSocial, normalizeRazonSocial, validateAgainstPadron } from './padron';

describe('normalizeRazonSocial', () => {
  it('quita acentos, puntuación y normaliza mayúsculas', () => {
    expect(normalizeRazonSocial('Colmado Don José, C. por A.')).toBe('COLMADO DON JOSE');
  });

  it('elimina sufijos societarios', () => {
    expect(normalizeRazonSocial('Ferretería Popular SRL')).toBe('FERRETERIA POPULAR');
    expect(normalizeRazonSocial('Industrias ABC, S.A.')).toBe('INDUSTRIAS ABC');
  });

  it('colapsa espacios', () => {
    expect(normalizeRazonSocial('  EMPRESA   X  ')).toBe('EMPRESA X');
  });
});

describe('matchRazonSocial', () => {
  it('coincide ignorando acentos, caso y sufijos', () => {
    expect(matchRazonSocial('Colmado Don José', 'COLMADO DON JOSE SRL')).toBe(true);
  });

  it('coincide por contención', () => {
    expect(matchRazonSocial('Supermercado Nacional', 'Supermercado Nacional Bravo')).toBe(true);
  });

  it('no coincide nombres distintos', () => {
    expect(matchRazonSocial('Colmado Don José', 'Ferretería Popular')).toBe(false);
  });

  it('cadena vacía nunca coincide', () => {
    expect(matchRazonSocial('', 'Algo')).toBe(false);
  });
});

describe('validateAgainstPadron', () => {
  const entry = { rnc: '101000007', razonSocial: 'COLMADO DON JOSE SRL', estado: 'ACTIVO' };

  it('RNC ausente del padrón', () => {
    const r = validateAgainstPadron('999999999', 'X', null);
    expect(r).toEqual({ rnc: '999999999', existe: false, activo: false, razonSocialCoincide: false });
  });

  it('RNC activo con razón social coincidente', () => {
    const r = validateAgainstPadron('101000007', 'Colmado Don José', entry);
    expect(r.existe).toBe(true);
    expect(r.activo).toBe(true);
    expect(r.razonSocialCoincide).toBe(true);
    expect(r.razonSocialOficial).toBe('COLMADO DON JOSE SRL');
  });

  it('marca razón social que no coincide', () => {
    const r = validateAgainstPadron('101000007', 'Otra Empresa', entry);
    expect(r.razonSocialCoincide).toBe(false);
  });

  it('marca RNC inactivo (dado de baja)', () => {
    const r = validateAgainstPadron('101000007', 'Colmado Don José', { ...entry, estado: 'SUSPENDIDO' });
    expect(r.activo).toBe(false);
  });

  it('estado vacío se trata como activo', () => {
    const r = validateAgainstPadron('101000007', 'Colmado Don José', { ...entry, estado: '' });
    expect(r.activo).toBe(true);
  });
});
