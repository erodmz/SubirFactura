// Parseo de las consultas oficiales de la DGII en ConsultasWeb2 (WebForms):
//   - RNC:  .../consultas/rnc.aspx  → datos del contribuyente (razón social, estado)
//   - NCF:  .../consultas/ncf.aspx  → validez del comprobante (estado del e-CF)
//
// Lógica PURA (sin red): recibe el HTML de la respuesta y extrae los campos. El
// fetch/POST (con VIEWSTATE y timeout) vive en workers/src/ocr/dgii-consulta.ts.
// Ambas páginas son la MISMA app ASP.NET; no llevan captcha. Si la DGII cambia
// el HTML, ajustar los anclas aquí; las funciones degradan a "no encontrado".

/** Decodifica entidades HTML (numéricas y las nombradas comunes en español). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Ntilde;/g, 'Ñ');
}

/** Texto limpio de un fragmento HTML (quita etiquetas, decodifica, colapsa). */
function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Normaliza una etiqueta para comparar sin acentos ni mayúsculas. */
function normLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMonto(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ───────────────────────── RNC (rnc.aspx) ─────────────────────────

export interface ConsultaRncResult {
  /**
   * Se reconoció la estructura esperada de la página (tabla de datos). false =
   * la DGII cambió el HTML o devolvió algo inesperado → el scraper está roto,
   * NO que el RNC no exista. Distinguirlo evita falsas alarmas.
   */
  paginaOk: boolean;
  /** El RNC/cédula figura en el registro de la DGII (tiene razón social). */
  encontrado: boolean;
  rnc: string;
  razonSocial: string | null;
  nombreComercial: string | null;
  /** Estado tal cual lo reporta la DGII (p. ej. "ACTIVO", "SUSPENDIDO"). */
  estado: string | null;
  /** true si el estado indica actividad normal. */
  activo: boolean;
  /** ¿Es facturador electrónico? (SÍ/NO en la ficha). null si no aparece. */
  facturadorElectronico: boolean | null;
}

const ESTADOS_ACTIVOS = /^(activo|normal)$/i;

/** Pares [etiqueta, valor] de la tabla de datos del contribuyente. */
function rncRows(html: string): Array<[string, string]> {
  const tbl = html.match(
    /<table[^>]*id="cphMain_dvDatosContribuyentes"[\s\S]*?<\/table>/i,
  );
  if (!tbl) return [];
  const rows: Array<[string, string]> = [];
  for (const tr of tbl[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(tr[1] ?? '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      cellText(c[1] ?? ''),
    );
    const [label, value] = cells;
    if (label !== undefined && value !== undefined) rows.push([normLabel(label), value]);
  }
  return rows;
}

export function parseConsultaRnc(html: string, rnc: string): ConsultaRncResult {
  const rows = rncRows(html);
  const get = (label: string): string | null => {
    const hit = rows.find(([l]) => l === label);
    return hit && hit[1] ? hit[1] : null;
  };
  // "Nombre/Razón Social" → normaliza a "nombre razon social".
  const razonSocial = get('nombre razon social');
  const estado = get('estado');
  const fe = get('facturador electronico');
  return {
    paginaOk: rows.length > 0,
    encontrado: razonSocial != null,
    rnc,
    razonSocial,
    nombreComercial: get('nombre comercial'),
    estado,
    activo: estado != null && ESTADOS_ACTIVOS.test(estado.trim()),
    facturadorElectronico: fe == null ? null : /^s/i.test(fe.trim()),
  };
}

// ───────────────────────── NCF (ncf.aspx) ─────────────────────────

export interface ConsultaNcfResult {
  /**
   * Se reconoció la página de consulta de NCF (el formulario esperado). false =
   * la DGII cambió el HTML → scraper roto, no "comprobante no hallado".
   */
  paginaOk: boolean;
  /** La DGII devolvió una ficha para el comprobante consultado. */
  encontrado: boolean;
  /** Estado del comprobante (p. ej. "Aceptado", "Vigente"). */
  estado: string | null;
  /** true si el estado indica que el comprobante es válido. */
  aceptado: boolean;
  rncEmisor: string | null;
  rncComprador: string | null;
  ncf: string | null;
  montoTotal: number | null;
  totalItbis: number | null;
  fechaEmision: string | null;
}

/** Texto de un <span id="cphMain_<id>">…</span>. */
function spanText(html: string, id: string): string | null {
  const m = html.match(new RegExp(`id="cphMain_${id}"[^>]*>([\\s\\S]*?)</span>`, 'i'));
  if (!m) return null;
  const t = cellText(m[1] ?? '');
  return t === '' ? null : t;
}

/** Estados que la DGII considera comprobante válido. */
const NCF_VALIDO = /(acept|vigente|v[aá]lid)/i;

export function parseConsultaNcf(html: string): ConsultaNcfResult {
  // Panel de comprobante fiscal electrónico (e-CF, serie E).
  const estado = spanText(html, 'lblEstadoFe');
  // El formulario (campo NCF o el label de estado) confirma que es la página correcta.
  const paginaOk = /id="cphMain_(txtNCF|lblEstadoFe)"/i.test(html);
  return {
    paginaOk,
    encontrado: estado != null,
    estado,
    aceptado: estado != null && NCF_VALIDO.test(estado),
    rncEmisor: spanText(html, 'lblrncemisor'),
    rncComprador: spanText(html, 'lblrnccomprador'),
    ncf: spanText(html, 'lblencf'),
    montoTotal: parseMonto(spanText(html, 'lblMontoTotal')),
    totalItbis: parseMonto(spanText(html, 'lblTotalItbis')),
    fechaEmision: spanText(html, 'lblFechaEmision'),
  };
}
