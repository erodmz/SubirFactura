import { describe, expect, it } from 'vitest';
import { generateFormato606, type Formato606Detail } from './formato606';

function detalle(overrides: Partial<Formato606Detail> = {}): Formato606Detail {
  return {
    rncCedula: '101000007',
    tipoId: '1',
    tipoBienesServicios: '09',
    ncf: 'B0100000123',
    fechaComprobante: '20260514',
    fechaPago: '20260514',
    montoBienes: 1500.0,
    itbisFacturado: 270.0,
    propinaLegal: 0,
    formaPago: '2',
    ...overrides,
  };
}

describe('generateFormato606', () => {
  it('genera el encabezado 606|RNC|periodo|cantidad', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle()],
    });
    expect(r.contenido.split('\r\n')[0]).toBe('606|131000001|202605|1');
    expect(r.cantidadRegistros).toBe(1);
  });

  it('normaliza el RNC del informante (quita guiones) en encabezado y nombre', () => {
    const r = generateFormato606({
      rncInformante: '1-31-00000-1',
      periodo: '202605',
      detalles: [],
    });
    expect(r.contenido).toBe('606|131000001|202605|0');
    expect(r.nombreArchivo).toBe('DGII_F_606_131000001_202605.TXT');
  });

  it('serializa las 23 columnas en orden, separadas por pipe', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle()],
    });
    const cols = r.contenido.split('\r\n')[1]!.split('|');
    expect(cols).toHaveLength(23);
    expect(cols[0]).toBe('101000007'); // RNC proveedor
    expect(cols[1]).toBe('1'); // tipo id
    expect(cols[2]).toBe('09'); // tipo bienes/servicios
    expect(cols[3]).toBe('B0100000123'); // NCF
    expect(cols[5]).toBe('20260514'); // fecha comprobante
  });

  it('calcula la col. 10 Total = servicios + bienes', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle({ montoServicios: 500, montoBienes: 1500, itbisFacturado: 360 })],
    });
    const cols = r.contenido.split('\r\n')[1]!.split('|');
    expect(cols[7]).toBe('500.00'); // servicios
    expect(cols[8]).toBe('1500.00'); // bienes
    expect(cols[9]).toBe('2000.00'); // total calculado
  });

  it('calcula la col. 15 ITBIS por adelantar = facturado − costo', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle({ itbisFacturado: 270, itbisCosto: 100 })],
    });
    const cols = r.contenido.split('\r\n')[1]!.split('|');
    expect(cols[10]).toBe('270.00'); // ITBIS facturado
    expect(cols[13]).toBe('100.00'); // ITBIS al costo
    expect(cols[14]).toBe('170.00'); // por adelantar (calculada)
  });

  it('deja en blanco la col. 15 cuando no hay ITBIS facturado', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle({ itbisFacturado: undefined })],
    });
    const cols = r.contenido.split('\r\n')[1]!.split('|');
    expect(cols[10]).toBe(''); // ITBIS facturado en blanco
    expect(cols[14]).toBe(''); // por adelantar en blanco
  });

  it('formatea montos con 2 decimales y deja en blanco los nulos', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle({ propinaLegal: 177, impuestoSelectivo: undefined })],
    });
    const cols = r.contenido.split('\r\n')[1]!.split('|');
    expect(cols[21]).toBe('177.00'); // propina legal
    expect(cols[19]).toBe(''); // ISC nulo → en blanco
  });

  it('deja la fecha de pago en blanco cuando no se pagó', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle({ fechaPago: null })],
    });
    const cols = r.contenido.split('\r\n')[1]!.split('|');
    expect(cols[6]).toBe('');
  });

  it('incluye NCF modificado y tipo de retención ISR cuando se proveen', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [
        detalle({ ncfModificado: 'B0100000099', tipoRetencionISR: '2', montoRetencionRenta: 150 }),
      ],
    });
    const cols = r.contenido.split('\r\n')[1]!.split('|');
    expect(cols[4]).toBe('B0100000099'); // NCF modificado
    expect(cols[16]).toBe('2'); // tipo retención ISR
    expect(cols[17]).toBe('150.00'); // monto retención renta
  });

  it('genera múltiples líneas y refleja la cantidad', () => {
    const r = generateFormato606({
      rncInformante: '131000001',
      periodo: '202605',
      detalles: [detalle(), detalle({ ncf: 'B0100000124' })],
    });
    const lines = r.contenido.split('\r\n');
    expect(lines).toHaveLength(3); // encabezado + 2 detalles
    expect(lines[0]).toContain('|2');
  });

  it('rechaza período fiscal inválido', () => {
    expect(() =>
      generateFormato606({ rncInformante: '131000001', periodo: '2026-05', detalles: [] }),
    ).toThrow(/Período fiscal inválido/);
    expect(() =>
      generateFormato606({ rncInformante: '131000001', periodo: '202613', detalles: [] }),
    ).toThrow();
  });

  it('rechaza fechas que no son AAAAMMDD', () => {
    expect(() =>
      generateFormato606({
        rncInformante: '131000001',
        periodo: '202605',
        detalles: [detalle({ fechaComprobante: '2026-05-14' })],
      }),
    ).toThrow(/AAAAMMDD/);
  });

  it('rechaza montos no finitos', () => {
    expect(() =>
      generateFormato606({
        rncInformante: '131000001',
        periodo: '202605',
        detalles: [detalle({ montoBienes: Number.NaN })],
      }),
    ).toThrow(/Monto inválido/);
  });

  it('rechaza exceder el límite de 10,000 registros', () => {
    const detalles = Array.from({ length: 10001 }, () => detalle());
    expect(() =>
      generateFormato606({ rncInformante: '131000001', periodo: '202605', detalles }),
    ).toThrow(/máximo 10000/);
  });

  it('un archivo sin registros es válido (606 informativo)', () => {
    const r = generateFormato606({ rncInformante: '131000001', periodo: '202605', detalles: [] });
    expect(r.contenido).toBe('606|131000001|202605|0');
    expect(r.cantidadRegistros).toBe(0);
  });
});
