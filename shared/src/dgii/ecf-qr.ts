// Parseo del QR de facturas electrónicas (e-CF) de la DGII. El QR codifica una
// URL a ecf.dgii.gov.do cuyos parámetros ya traen datos OFICIALES: RNC emisor,
// e-NCF, monto total, fecha y código de seguridad. Preferimos esto sobre el OCR
// para esos campos (son autoritativos). Lógica pura → testeable sin red.

export interface EcfQrData {
  /** URL completa del QR (para verificación en vivo — Fase 4). */
  url: string;
  ncf: string | null; // e-NCF
  rncEmisor: string | null; // proveedor
  rncComprador: string | null;
  montoTotal: number | null;
  fechaEmision: string | null; // AAAA-MM-DD
  codigoSeguridad: string | null;
}

/** DD-MM-AAAA o DD/MM/AAAA → AAAA-MM-DD; ISO se deja igual; otro → null. */
function normalizeFecha(raw: string | null): string | null {
  if (!raw) return null;
  const dmy = raw.trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/**
 * Si `raw` es una URL de verificación e-CF de la DGII, extrae sus datos.
 * Devuelve null si no es un QR de la DGII o no es una URL válida.
 */
export function parseEcfQrUrl(raw: string): EcfQrData | null {
  // Parseo manual (sin `URL`) para no depender de libs DOM/Node en el paquete compartido.
  const m = raw.trim().match(/^https?:\/\/([^/?#]+)[^?#]*(?:\?([^#]*))?/i);
  if (!m || !m[1]) return null;
  const host = m[1].toLowerCase().split(':')[0];
  if (!/(^|\.)dgii\.gov\.do$/.test(host ?? '')) return null;

  // Parámetros case-insensitive.
  const p = new Map<string, string>();
  for (const pair of (m[2] ?? '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq >= 0 ? pair.slice(0, eq) : pair).toLowerCase();
    const val = eq >= 0 ? decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' ')) : '';
    if (!p.has(key)) p.set(key, val);
  }
  const get = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = p.get(k.toLowerCase());
      if (v != null && v !== '') return v;
    }
    return null;
  };

  const montoRaw = get('montototal', 'monto');
  const monto = montoRaw != null ? Number(montoRaw.replace(/,/g, '')) : null;

  return {
    url: raw.trim(),
    ncf: get('encf', 'e-ncf', 'ncf')?.toUpperCase() ?? null,
    rncEmisor: get('rncemisor', 'rnc_emisor', 'rncemi'),
    rncComprador: get('rnccomprador', 'rnc_comprador', 'rnccom'),
    montoTotal: monto != null && Number.isFinite(monto) ? monto : null,
    fechaEmision: normalizeFecha(get('fechaemision', 'fechaemi', 'fe', 'fecha')),
    codigoSeguridad: get('codigoseguridad', 'codigoseg', 'codigo'),
  };
}
