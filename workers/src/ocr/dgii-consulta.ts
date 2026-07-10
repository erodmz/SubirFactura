// Consulta en vivo contra las páginas oficiales de la DGII (ConsultasWeb2,
// ASP.NET WebForms). Es la fuente PRIMARIA de validación: el padrón local queda
// como respaldo cuando la DGII no responde a tiempo (degradación elegante).
//
//   - RNC:  consultarRncLive → .../consultas/rnc.aspx
//   - NCF:  consultarNcfLive → .../consultas/ncf.aspx (e-CF, con código de seguridad)
//
// El parseo del HTML vive en @facturard/shared (consulta-web); aquí solo va la
// mecánica de red: bajar la página, tomar los campos ocultos (__VIEWSTATE, etc.)
// y la cookie de sesión, y reenviar el POST simulando el botón de búsqueda.

import {
  parseConsultaRnc,
  parseConsultaNcf,
  type ConsultaRncResult,
  type ConsultaNcfResult,
} from '@facturard/shared';

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

/**
 * Ejecuta un postback de WebForms: GET para tomar VIEWSTATE + cookie, luego POST
 * con los campos. Un solo `timeoutMs` cubre ambas peticiones. Devuelve el HTML de
 * la respuesta, o null ante timeout/red/HTTP no-2xx.
 */
async function postWebForm(
  url: string,
  fields: Record<string, string>,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const get = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    });
    if (!get.ok) return null;
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
    if (!post.ok) return null;
    return await post.text();
  } catch {
    return null; // timeout, red, DNS, abort…
  } finally {
    clearTimeout(timer);
  }
}

/** Consulta el RNC/cédula en el registro de la DGII. null si no respondió. */
export async function consultarRncLive(
  rnc: string,
  timeoutMs: number,
): Promise<ConsultaRncResult | null> {
  const html = await postWebForm(
    RNC_URL,
    {
      'ctl00$cphMain$txtRNCCedula': rnc,
      'ctl00$cphMain$btnBuscarPorRNC': 'BUSCAR',
      'ctl00$cphMain$hidActiveTab': '0',
    },
    timeoutMs,
  );
  return html ? parseConsultaRnc(html, rnc) : null;
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
  const html = await postWebForm(
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
  return html ? parseConsultaNcf(html) : null;
}
