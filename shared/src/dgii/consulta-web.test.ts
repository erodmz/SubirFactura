import { describe, it, expect } from 'vitest';
import { parseConsultaRnc, parseConsultaNcf } from './consulta-web';

// Fragmentos recortados de las respuestas reales de ConsultasWeb2 (rnc.aspx /
// ncf.aspx), con las mismas etiquetas y entidades numéricas que sirve la DGII.

const RNC_ENCONTRADO = `
<table id="cphMain_dvDatosContribuyentes" class="table">
  <tr><td>C&#233;dula/RNC</td><td>132-69539-9</td></tr>
  <tr><td>Nombre/Raz&#243;n Social</td><td>CEIDI CENTRO DE IMAGENES DIAGNOSTICAS SRL</td></tr>
  <tr><td>Nombre Comercial</td><td>CEIDI CENTRO DE IMAGENES DIAGNOSTICAS</td></tr>
  <tr><td>R&#233;gimen de pagos</td><td>NORMAL</td></tr>
  <tr><td>Estado</td><td>ACTIVO</td></tr>
  <tr><td>Facturador Electr&#243;nico</td><td>NO</td></tr>
</table>`;

// Misma tabla pero con las celdas de datos vacías (RNC inexistente).
const RNC_NO_ENCONTRADO = `
<table id="cphMain_dvDatosContribuyentes" class="table">
  <tr><td>C&#233;dula/RNC</td><td></td></tr>
  <tr><td>Nombre/Raz&#243;n Social</td><td></td></tr>
  <tr><td>Estado</td><td></td></tr>
</table>`;

const RNC_SUSPENDIDO = RNC_ENCONTRADO.replace('ACTIVO', 'SUSPENDIDO');

const NCF_ACEPTADO = `
<div id="cphMain_PResultadoFE">
  <span id="cphMain_lblrncemisor">101068744</span>
  <span id="cphMain_lblrnccomprador">132695399</span>
  <span id="cphMain_lblencf">E310005582846</span>
  <span id="cphMain_lblEstadoFe">Aceptado</span>
  <span id="cphMain_lblMontoTotal">3479.5</span>
  <span id="cphMain_lblTotalItbis">0.0</span>
  <span id="cphMain_lblFechaEmision">2026-07-04</span>
</div>`;

const NCF_VACIO = `<div id="cphMain_PResultadoFE"><span id="cphMain_lblEstadoFe"></span></div>`;

describe('parseConsultaRnc', () => {
  it('extrae razón social, estado y facturador de un RNC activo', () => {
    const r = parseConsultaRnc(RNC_ENCONTRADO, '132695399');
    expect(r.encontrado).toBe(true);
    expect(r.razonSocial).toBe('CEIDI CENTRO DE IMAGENES DIAGNOSTICAS SRL');
    expect(r.nombreComercial).toBe('CEIDI CENTRO DE IMAGENES DIAGNOSTICAS');
    expect(r.estado).toBe('ACTIVO');
    expect(r.activo).toBe(true);
    expect(r.facturadorElectronico).toBe(false);
  });

  it('marca no encontrado cuando las celdas vienen vacías', () => {
    const r = parseConsultaRnc(RNC_NO_ENCONTRADO, '000000000');
    expect(r.encontrado).toBe(false);
    expect(r.razonSocial).toBeNull();
    expect(r.activo).toBe(false);
  });

  it('detecta estado no activo', () => {
    const r = parseConsultaRnc(RNC_SUSPENDIDO, '132695399');
    expect(r.encontrado).toBe(true);
    expect(r.activo).toBe(false);
    expect(r.estado).toBe('SUSPENDIDO');
  });

  it('degrada a no encontrado si falta la tabla', () => {
    expect(parseConsultaRnc('<html>error</html>', '1').encontrado).toBe(false);
  });
});

describe('parseConsultaNcf', () => {
  it('extrae estado y montos de un e-CF aceptado', () => {
    const r = parseConsultaNcf(NCF_ACEPTADO);
    expect(r.encontrado).toBe(true);
    expect(r.estado).toBe('Aceptado');
    expect(r.aceptado).toBe(true);
    expect(r.rncEmisor).toBe('101068744');
    expect(r.ncf).toBe('E310005582846');
    expect(r.montoTotal).toBe(3479.5);
    expect(r.totalItbis).toBe(0);
    expect(r.fechaEmision).toBe('2026-07-04');
  });

  it('marca no encontrado cuando el estado viene vacío', () => {
    const r = parseConsultaNcf(NCF_VACIO);
    expect(r.encontrado).toBe(false);
    expect(r.aceptado).toBe(false);
  });
});
