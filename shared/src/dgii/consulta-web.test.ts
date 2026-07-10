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

// Serie B (comprobante tradicional): la MISMA ncf.aspx responde con otro panel
// (cphMain_pResultado) y un feedback lblInformacion. Fragmentos reales de la DGII.
const NCF_SERIE_B_VALIDO = `
<input type="text" id="cphMain_txtNCF" name="ctl00$cphMain$txtNCF" />
<div id="cphMain_pResultado">
  <table class="table table-striped detailview"><tbody>
    <tr><th>RNC / C&#233;dula</th><td><span id="cphMain_lblRncCedula">101068744</span></td></tr>
    <tr><th>Nombre / Raz&#243;n Social</th><td><span id="cphMain_lblRazonSocial">TOTALENERGIES MARKETING DOMINICANA SA</span></td></tr>
    <tr><th>Tipo de comprobante</th><td><span id="cphMain_lblTipoComprobante">FACTURA DE CR&#201;DITO FISCAL</span></td></tr>
    <tr><th>NCF</th><td><span id="cphMain_lblNCF">B0100000005</span></td></tr>
    <tr><th>Estado</th><td><span id="cphMain_lblEstado">VENCIDO</span></td></tr>
    <tr><th>V&#225;lido hasta</th><td><span id="cphMain_lblVigencia">31/12/2019</span></td></tr>
  </tbody></table>
  <span id="cphMain_lblInformacion" class="label label-info">El NCF digitado es v&#225;lido.</span>
</div>`;

// Serie B sin coincidencia: no aparece el panel de datos, solo el feedback negativo.
const NCF_SERIE_B_NO_CORRESPONDE = `
<input type="text" id="cphMain_txtNCF" name="ctl00$cphMain$txtNCF" />
<span id="cphMain_lblInformacion" class="label label-danger">El N&#250;mero de Comprobante Fiscal ingresado no es correcto o no corresponde a este RNC</span>`;

describe('parseConsultaRnc', () => {
  it('extrae razón social, estado y facturador de un RNC activo', () => {
    const r = parseConsultaRnc(RNC_ENCONTRADO, '132695399');
    expect(r.paginaOk).toBe(true);
    expect(r.encontrado).toBe(true);
    expect(r.razonSocial).toBe('CEIDI CENTRO DE IMAGENES DIAGNOSTICAS SRL');
    expect(r.nombreComercial).toBe('CEIDI CENTRO DE IMAGENES DIAGNOSTICAS');
    expect(r.estado).toBe('ACTIVO');
    expect(r.activo).toBe(true);
    expect(r.facturadorElectronico).toBe(false);
  });

  it('marca no encontrado (pero página OK) cuando las celdas vienen vacías', () => {
    const r = parseConsultaRnc(RNC_NO_ENCONTRADO, '000000000');
    expect(r.paginaOk).toBe(true); // la estructura existe: es un "no existe" legítimo
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

  it('marca paginaOk=false si falta la tabla (scraper roto, no "no existe")', () => {
    const r = parseConsultaRnc('<html>error 500</html>', '1');
    expect(r.paginaOk).toBe(false);
    expect(r.encontrado).toBe(false);
  });
});

describe('parseConsultaNcf', () => {
  it('extrae estado y montos de un e-CF aceptado', () => {
    const r = parseConsultaNcf(NCF_ACEPTADO);
    expect(r.paginaOk).toBe(true);
    expect(r.serie).toBe('E');
    expect(r.encontrado).toBe(true);
    expect(r.estado).toBe('Aceptado');
    expect(r.aceptado).toBe(true);
    expect(r.rncEmisor).toBe('101068744');
    expect(r.ncf).toBe('E310005582846');
    expect(r.montoTotal).toBe(3479.5);
    expect(r.totalItbis).toBe(0);
    expect(r.fechaEmision).toBe('2026-07-04');
  });

  it('valida un NCF de serie B (comprobante tradicional) con su vigencia', () => {
    const r = parseConsultaNcf(NCF_SERIE_B_VALIDO);
    expect(r.paginaOk).toBe(true);
    expect(r.serie).toBe('B');
    expect(r.encontrado).toBe(true);
    expect(r.aceptado).toBe(true); // "El NCF digitado es válido."
    expect(r.estado).toBe('VENCIDO'); // autorización vencida, pero NCF válido
    expect(r.razonSocial).toBe('TOTALENERGIES MARKETING DOMINICANA SA');
    expect(r.tipoComprobante).toBe('FACTURA DE CRÉDITO FISCAL');
    expect(r.ncf).toBe('B0100000005');
    expect(r.rncEmisor).toBe('101068744');
    expect(r.vigenciaHasta).toBe('31/12/2019');
  });

  it('serie B: NCF que no corresponde al RNC → encontrado/aceptado false, página OK', () => {
    const r = parseConsultaNcf(NCF_SERIE_B_NO_CORRESPONDE);
    expect(r.paginaOk).toBe(true);
    expect(r.serie).toBe('B');
    expect(r.encontrado).toBe(false);
    expect(r.aceptado).toBe(false);
    expect(r.razonSocial).toBeNull();
  });

  it('no encontrado pero página OK cuando el estado viene vacío', () => {
    const r = parseConsultaNcf(NCF_VACIO);
    expect(r.paginaOk).toBe(true);
    expect(r.encontrado).toBe(false);
    expect(r.aceptado).toBe(false);
  });

  it('paginaOk=false si no está el formulario (scraper roto)', () => {
    const r = parseConsultaNcf('<html>mantenimiento</html>');
    expect(r.paginaOk).toBe(false);
    expect(r.encontrado).toBe(false);
  });
});
