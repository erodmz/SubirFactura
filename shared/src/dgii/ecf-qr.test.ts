import { describe, expect, it } from 'vitest';
import { parseEcfQrUrl } from './ecf-qr';

describe('parseEcfQrUrl', () => {
  it('extrae los datos de una URL de verificación e-CF de la DGII', () => {
    const url =
      'https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=101068744&RncComprador=132695399' +
      '&ENCF=E310005582846&MontoTotal=3479.50&FechaEmision=04-07-2026&CodigoSeguridad=eI3N67';
    const d = parseEcfQrUrl(url);
    expect(d).not.toBeNull();
    expect(d!.rncEmisor).toBe('101068744');
    expect(d!.rncComprador).toBe('132695399');
    expect(d!.ncf).toBe('E310005582846');
    expect(d!.montoTotal).toBe(3479.5);
    expect(d!.fechaEmision).toBe('2026-07-04');
    expect(d!.codigoSeguridad).toBe('eI3N67');
  });

  it('es case-insensitive en los parámetros', () => {
    const d = parseEcfQrUrl('https://ecf.dgii.gov.do/x?encf=E310000000001&montototal=1,234.50');
    expect(d!.ncf).toBe('E310000000001');
    expect(d!.montoTotal).toBe(1234.5);
  });

  it('devuelve null si el host no es de la DGII', () => {
    expect(parseEcfQrUrl('https://otra.com/x?ENCF=E31')).toBeNull();
  });

  it('devuelve null si no es una URL', () => {
    expect(parseEcfQrUrl('no soy una url')).toBeNull();
  });
});
