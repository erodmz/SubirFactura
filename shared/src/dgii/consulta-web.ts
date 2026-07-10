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
  /**
   * Serie del comprobante que la DGII reportó: 'E' = e-CF (comprobante fiscal
   * electrónico, panel con estado Aceptado/Rechazado), 'B' = comprobante
   * tradicional/preimpreso (panel con "El NCF digitado es válido" + vigencia).
   * null si no se reconoció ninguno de los dos paneles.
   */
  serie: 'E' | 'B' | null;
  /** La DGII devolvió una ficha para el comprobante consultado. */
  encontrado: boolean;
  /** Estado del comprobante (e-CF: "Aceptado"…; serie B: "VIGENTE"/"VENCIDO"). */
  estado: string | null;
  /** true si la DGII lo da por válido (e-CF Aceptado; serie B "NCF válido"). */
  aceptado: boolean;
  /** Razón social del emisor tal cual la reporta la DGII (serie B). */
  razonSocial: string | null;
  /** Tipo de comprobante (serie B: "FACTURA DE CRÉDITO FISCAL"…). */
  tipoComprobante: string | null;
  /** Fecha "Válido hasta" de la autorización del NCF (serie B). */
  vigenciaHasta: string | null;
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

/**
 * Parsea la respuesta de la consulta de NCF. La MISMA página (ncf.aspx) atiende
 * dos series con paneles distintos:
 *   - serie E (e-CF): panel con <span id="cphMain_lblEstadoFe"> = "Aceptado"…
 *   - serie B (tradicional): panel con lblRazonSocial/lblEstado (VIGENTE/VENCIDO)
 *     y un feedback lblInformacion = "El NCF digitado es válido." Sin panel y con
 *     feedback negativo = el NCF no corresponde a ese RNC.
 */
export function parseConsultaNcf(html: string): ConsultaNcfResult {
  // El campo NCF (o el label de estado e-CF) confirma que es la página correcta.
  const paginaOk = /id="cphMain_(txtNCF|lblEstadoFe)"/i.test(html);

  const base = {
    paginaOk,
    rncComprador: spanText(html, 'lblrnccomprador'),
    montoTotal: parseMonto(spanText(html, 'lblMontoTotal')),
    totalItbis: parseMonto(spanText(html, 'lblTotalItbis')),
    fechaEmision: spanText(html, 'lblFechaEmision'),
  };

  // ── Serie E (e-CF) ──
  const estadoFe = spanText(html, 'lblEstadoFe');
  if (estadoFe != null) {
    return {
      ...base,
      serie: 'E',
      encontrado: true,
      estado: estadoFe,
      aceptado: NCF_VALIDO.test(estadoFe),
      razonSocial: spanText(html, 'lblRazonSocial'),
      tipoComprobante: spanText(html, 'lblTipoComprobante'),
      vigenciaHasta: null,
      rncEmisor: spanText(html, 'lblrncemisor'),
      ncf: spanText(html, 'lblencf'),
    };
  }

  // ── Serie B (comprobante tradicional) ──
  const informacion = spanText(html, 'lblInformacion');
  if (informacion != null) {
    const razonSocial = spanText(html, 'lblRazonSocial');
    const encontrado = razonSocial != null; // el panel de datos solo aparece si es válido
    // "El NCF digitado es válido." (positivo) vs "...no es correcto o no corresponde".
    const valido = /\bes\s+v[aá]lido/i.test(informacion) && !/\bno\s+es\b/i.test(informacion);
    return {
      ...base,
      serie: 'B',
      encontrado,
      estado: spanText(html, 'lblEstado'),
      aceptado: encontrado && valido,
      razonSocial,
      tipoComprobante: spanText(html, 'lblTipoComprobante'),
      vigenciaHasta: spanText(html, 'lblVigencia'),
      rncEmisor: spanText(html, 'lblRncCedula'),
      ncf: spanText(html, 'lblNCF'),
    };
  }

  // Página válida pero sin resultado (formulario en blanco / sin coincidencia).
  return {
    ...base,
    serie: null,
    encontrado: false,
    estado: null,
    aceptado: false,
    razonSocial: null,
    tipoComprobante: null,
    vigenciaHasta: null,
    rncEmisor: spanText(html, 'lblrncemisor'),
    ncf: spanText(html, 'lblencf'),
  };
}
