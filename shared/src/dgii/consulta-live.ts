// Consulta en vivo contra las páginas oficiales de la DGII (ConsultasWeb2,
// ASP.NET WebForms). Es la fuente PRIMARIA de validación: el padrón local queda
// como respaldo cuando la DGII no responde a tiempo (degradación elegante).
//
//   - RNC:  consultarRncLive → .../consultas/rnc.aspx
//   - NCF:  consultarNcfLive → .../consultas/ncf.aspx (e-CF, con código de seguridad)
//
// El parseo del HTML vive en consulta-web (lógica pura); aquí solo va la
// mecánica de red: bajar la página, tomar los campos ocultos (__VIEWSTATE, etc.)
// y la cookie de sesión, y reenviar el POST simulando el botón de búsqueda.
// Vive en `shared` para que lo usen tanto el worker (OCR) como el API (guardado
// manual): ambos validan contra la DGII con la misma lógica.

import {
  parseConsultaRnc,
  parseConsultaNcf,
  type ConsultaRncResult,
  type ConsultaNcfResult,
} from './consulta-web';
import { alertRupture } from '../alerts';

const BASE = 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas';
const RNC_URL = `${BASE}/rnc.aspx`;
const NCF_URL = `${BASE}/ncf.aspx`;
const UA = 'Mozilla/5.0 (SubirFactura)';

function hiddenField(html: string, name: string): string {
  const m = html.match(
    new RegExp(`name="${name.replace(/\$/g, '\\$')}"[^>]*value="([^"]*)"`, 'i'),
  );
  return m?.[1] ?? '';
}

// ok:true → llegó respuesta 2xx (aunque el dato no exista). ok:false → NO llegó
// (timeout/red/HTTP): es transitorio y esperado; el caller cae al padrón sin alertar.
type WebFormResult =
  | { ok: true; html: string }
  | { ok: false; reason: 'timeout' | 'http' | 'error'; detail?: string };

/**
 * Ejecuta un postback de WebForms: GET para tomar VIEWSTATE + cookie, luego POST
 * con los campos. Un solo `timeoutMs` cubre ambas peticiones. Nunca lanza.
 */
async function postWebForm(
  url: string,
  fields: Record<string, string>,
  timeoutMs: number,
): Promise<WebFormResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const get = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } });
    if (!get.ok) return { ok: false, reason: 'http', detail: `GET ${get.status}` };
    const cookie = (get.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const page = await get.text();

    const body = new URLSearchParams({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATE: hiddenField(page, '__VIEWSTATE'),
      __VIEWSTATEGENERATOR: hiddenField(page, '__VIEWSTATEGENERATOR'),
      __EVENTVALIDATION: hiddenField(page, '__EVENTVALIDATION'),
      ...fields,
    });

    const post = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    });
    if (!post.ok) return { ok: false, reason: 'http', detail: `POST ${post.status}` };
    return { ok: true, html: await post.text() };
  } catch (err) {
    const aborted = (err as { name?: string }).name === 'AbortError';
    return { ok: false, reason: aborted ? 'timeout' : 'error', detail: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta el RNC/cédula en el registro de la DGII. Devuelve null cuando NO se
 * pudo consultar (para que el caller use el padrón). Si la DGII respondió pero el
 * HTML no tiene la estructura esperada (scraper roto), además emite una alerta.
 */
export async function consultarRncLive(
  rnc: string,
  timeoutMs: number,
): Promise<ConsultaRncResult | null> {
  const res = await postWebForm(
    RNC_URL,
    {
      'ctl00$cphMain$txtRNCCedula': rnc,
      'ctl00$cphMain$btnBuscarPorRNC': 'BUSCAR',
      'ctl00$cphMain$hidActiveTab': '0',
    },
    timeoutMs,
  );
  if (!res.ok) return null; // transitorio (timeout/red/HTTP): sin alerta, cae al padrón
  try {
    const parsed = parseConsultaRnc(res.html, rnc);
    if (!parsed.paginaOk) {
      await alertRupture({
        key: 'dgii.rnc.estructura',
        title: 'Scraper RNC de la DGII: estructura desconocida',
        message: 'La página de consulta de RNC respondió pero sin la tabla esperada. ¿Cambió el HTML de la DGII?',
        context: { rnc, url: RNC_URL },
      });
      return null; // no confiable → cae al padrón
    }
    return parsed;
  } catch (err) {
    await alertRupture({
      key: 'dgii.rnc.parse',
      title: 'Scraper RNC de la DGII falló al parsear',
      message: 'Excepción al interpretar la respuesta de la consulta de RNC.',
      error: err,
      context: { rnc, url: RNC_URL },
    });
    return null;
  }
}

export interface ConsultaNcfInput {
  rncEmisor: string;
  ncf: string;
  rncComprador?: string | null;
  /** Código de seguridad del e-CF (6 caracteres del QR). Requerido para serie E. */
  codigoSeguridad?: string | null;
}

/** Consulta la validez de un comprobante (e-CF) en la DGII. null si no respondió. */
export async function consultarNcfLive(
  input: ConsultaNcfInput,
  timeoutMs: number,
): Promise<ConsultaNcfResult | null> {
  const res = await postWebForm(
    NCF_URL,
    {
      'ctl00$cphMain$txtRNC': input.rncEmisor,
      'ctl00$cphMain$txtNCF': input.ncf,
      'ctl00$cphMain$txtRncComprador': input.rncComprador ?? '',
      'ctl00$cphMain$txtCodigoSeg': input.codigoSeguridad ?? '',
      'ctl00$cphMain$btnConsultar': 'Consultar',
    },
    timeoutMs,
  );
  if (!res.ok) return null;
  try {
    const parsed = parseConsultaNcf(res.html);
    if (!parsed.paginaOk) {
      await alertRupture({
        key: 'dgii.ncf.estructura',
        title: 'Scraper NCF de la DGII: estructura desconocida',
        message: 'La página de consulta de NCF respondió pero sin el formulario esperado. ¿Cambió el HTML de la DGII?',
        context: { ncf: input.ncf, url: NCF_URL },
      });
      return null;
    }
    return parsed;
  } catch (err) {
    await alertRupture({
      key: 'dgii.ncf.parse',
      title: 'Scraper NCF de la DGII falló al parsear',
      message: 'Excepción al interpretar la respuesta de la consulta de NCF.',
      error: err,
      context: { ncf: input.ncf, url: NCF_URL },
    });
    return null;
  }
}
