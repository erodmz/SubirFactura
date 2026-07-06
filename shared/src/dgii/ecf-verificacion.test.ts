import { describe, expect, it } from 'vitest';
import { parseEcfVerificacion } from './ecf-verificacion';

// HTML que imita la estructura de la página "Verificación e-NCF" de la DGII
// (tabla etiqueta/valor), basada en un e-CF real de TotalEnergies/CEIDI.
const SAMPLE = `
<html><body>
<h1>Verificación e-NCF</h1>
<table>
  <tr><td>RNC Emisor</td><td>101068744</td></tr>
  <tr><td>Razón social emisor</td><td>TOTALENERGIES DOMINICANA</td></tr>
  <tr><td>RNC Comprador</td><td>132695399</td></tr>
  <tr><td>Razón social comprador</td><td>CEIDI CENTRO DE IMAGENES DIAGNOSTICAS SRL</td></tr>
  <tr><td>e-NCF</td><td>E310005582846</td></tr>
  <tr><td>Fecha de Emisión</td><td>04-07-2026</td></tr>
  <tr><td>Total de ITBIS</td><td>-</td></tr>
  <tr><td>Monto Total</td><td>3,479.50</td></tr>
  <tr><td>Estado</td><td>Aceptado</td></tr>
</table>
</body></html>`;

describe('parseEcfVerificacion', () => {
  it('extrae estado, razones sociales y montos de la página de la DGII', () => {
    const v = parseEcfVerificacion(SAMPLE);
    expect(v.estado).toBe('Aceptado');
    expect(v.aceptado).toBe(true);
    expect(v.razonSocialEmisor).toBe('TOTALENERGIES DOMINICANA');
    expect(v.razonSocialComprador).toBe('CEIDI CENTRO DE IMAGENES DIAGNOSTICAS SRL');
    expect(v.totalItbis).toBeNull(); // "-"
    expect(v.montoTotal).toBe(3479.5);
  });

  it('marca aceptado=false cuando el estado no es de aceptación', () => {
    const v = parseEcfVerificacion(SAMPLE.replace('Aceptado', 'Rechazado'));
    expect(v.estado).toBe('Rechazado');
    expect(v.aceptado).toBe(false);
  });

  it('degrada con gracia si el HTML no tiene los campos', () => {
    const v = parseEcfVerificacion('<html><body>Página no encontrada</body></html>');
    expect(v.aceptado).toBe(false);
    expect(v.razonSocialEmisor).toBeNull();
  });
});
