import { describe, expect, it } from 'vitest';
import { buildFiscalValidation } from './fiscal-validation';
import { computeRncCheckDigit } from '../validators/rnc';

// RNC válido construido con su dígito verificador correcto.
const RNC_OK = '10102312' + computeRncCheckDigit('10102312');

describe('buildFiscalValidation', () => {
  it('sin alertas cuando NCF, RNC y padrón coinciden', () => {
    const v = buildFiscalValidation({
      ncf: 'B0100000001',
      rnc: RNC_OK,
      razonSocial: 'Colmado Don José',
      padronEntry: { rnc: RNC_OK, razonSocial: 'COLMADO DON JOSE SRL', estado: 'ACTIVO' },
    });
    expect(v.ok).toBe(true);
    expect(v.alertas).toHaveLength(0);
    expect(v.ncf.ok).toBe(true);
    expect(v.rnc.ok).toBe(true);
    expect(v.padron.existe).toBe(true);
  });

  it('alerta por NCF y RNC inválidos', () => {
    const v = buildFiscalValidation({
      ncf: 'XYZ',
      rnc: '123',
      razonSocial: null,
      padronEntry: null,
    });
    expect(v.ok).toBe(false);
    expect(v.ncf.ok).toBe(false);
    expect(v.rnc.ok).toBe(false);
    expect(v.alertas.some((a) => a.startsWith('NCF'))).toBe(true);
    expect(v.alertas.some((a) => a.startsWith('RNC'))).toBe(true);
  });

  it('alerta cuando el RNC no aparece en el padrón consultado', () => {
    const v = buildFiscalValidation({
      ncf: 'B0200000099',
      rnc: RNC_OK,
      razonSocial: 'Algo SRL',
      padronEntry: null,
      padronConsultado: true,
    });
    expect(v.alertas.some((a) => a.includes('no aparece en el padrón'))).toBe(true);
  });

  it('alerta cuando la razón social no coincide con el padrón', () => {
    const v = buildFiscalValidation({
      ncf: 'B0100000001',
      rnc: RNC_OK,
      razonSocial: 'Nombre Equivocado',
      padronEntry: { rnc: RNC_OK, razonSocial: 'EMPRESA OFICIAL SA', estado: 'ACTIVO' },
    });
    expect(v.alertas.some((a) => a.includes('no coincide con el padrón'))).toBe(true);
  });

  it('e-CF verificado y no aceptado → alerta con texto de e-CF', () => {
    const v = buildFiscalValidation({
      ncf: 'E310005582846',
      rnc: RNC_OK,
      razonSocial: 'Algo SRL',
      padronEntry: { rnc: RNC_OK, razonSocial: 'ALGO SRL', estado: 'ACTIVO' },
      ecf: { aceptado: false, estado: 'Rechazado', serie: 'E' },
    });
    expect(v.ecf?.serie).toBe('E');
    expect(v.alertas.some((a) => a.includes('e-CF') && a.includes('Aceptado'))).toBe(true);
  });

  it('serie B no reconocida por la DGII → alerta con texto de serie B', () => {
    const v = buildFiscalValidation({
      ncf: 'B0100000005',
      rnc: RNC_OK,
      razonSocial: 'Algo SRL',
      padronEntry: { rnc: RNC_OK, razonSocial: 'ALGO SRL', estado: 'ACTIVO' },
      ecf: { aceptado: false, estado: null, serie: 'B' },
    });
    expect(v.ecf?.serie).toBe('B');
    expect(v.alertas.some((a) => a.includes('serie B'))).toBe(true);
    expect(v.alertas.some((a) => a.includes('e-CF'))).toBe(false);
  });

  it('serie B válida (aceptada) → sin alerta de comprobante', () => {
    const v = buildFiscalValidation({
      ncf: 'B0100000005',
      rnc: RNC_OK,
      razonSocial: 'Algo SRL',
      padronEntry: { rnc: RNC_OK, razonSocial: 'ALGO SRL', estado: 'ACTIVO' },
      ecf: { aceptado: true, estado: 'VIGENTE', serie: 'B' },
    });
    expect(v.ecf?.verificado).toBe(true);
    expect(v.ecf?.aceptado).toBe(true);
    expect(v.alertas.some((a) => a.includes('serie B') || a.includes('e-CF'))).toBe(false);
  });

  it('serie B VENCIDA con factura posterior a la vigencia → alerta explícita', () => {
    const v = buildFiscalValidation({
      ncf: 'B0100000005',
      rnc: RNC_OK,
      razonSocial: 'Algo SRL',
      padronEntry: { rnc: RNC_OK, razonSocial: 'ALGO SRL', estado: 'ACTIVO' },
      fecha: '2026-07-04',
      ecf: { aceptado: true, estado: 'VENCIDO', serie: 'B', vigenciaHasta: '31/12/2019' },
    });
    expect(v.ok).toBe(false);
    expect(v.ecf?.vigenciaHasta).toBe('31/12/2019');
    expect(v.alertas.some((a) => a.includes('VENCIDA') && a.includes('posterior'))).toBe(true);
  });

  it('serie B VENCIDA pero factura anterior a la vigencia → sin alerta (factura legítima)', () => {
    const v = buildFiscalValidation({
      ncf: 'B0100000005',
      rnc: RNC_OK,
      razonSocial: 'Algo SRL',
      padronEntry: { rnc: RNC_OK, razonSocial: 'ALGO SRL', estado: 'ACTIVO' },
      fecha: '2019-03-10',
      ecf: { aceptado: true, estado: 'VENCIDO', serie: 'B', vigenciaHasta: '31/12/2019' },
    });
    expect(v.ok).toBe(true);
    expect(v.alertas.some((a) => a.includes('VENCIDA'))).toBe(false);
  });

  it('serie B VENCIDA sin fecha de factura → avisa para que se verifique', () => {
    const v = buildFiscalValidation({
      ncf: 'B0100000005',
      rnc: RNC_OK,
      razonSocial: 'Algo SRL',
      padronEntry: { rnc: RNC_OK, razonSocial: 'ALGO SRL', estado: 'ACTIVO' },
      fecha: null,
      ecf: { aceptado: true, estado: 'VENCIDO', serie: 'B', vigenciaHasta: '31/12/2019' },
    });
    expect(v.alertas.some((a) => a.includes('VENCIDA') && a.includes('verifica'))).toBe(true);
  });

  it('no consulta padrón para cédulas (padronConsultado falso)', () => {
    const v = buildFiscalValidation({
      ncf: 'B1100000001',
      rnc: null,
      razonSocial: null,
      padronEntry: null,
      padronConsultado: false,
    });
    expect(v.padron.consultado).toBe(false);
  });
});
