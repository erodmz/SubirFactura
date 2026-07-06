// Parseo de la página oficial de "Verificación e-NCF" de la DGII
// (ecf.dgii.gov.do), a la que apunta el QR de las facturas electrónicas.
// Confirma que la DGII ACEPTÓ el e-CF y trae la razón social de ambas partes.
//
// NOTA: los anclas de extracción se basan en las etiquetas visibles de esa
// página (RNC Emisor, Razón social emisor, ..., Estado). Si la DGII cambia el
// HTML, ajustar aquí. La función degrada con gracia (devuelve null) si no halla
// los campos, para no bloquear el flujo.

export interface EcfVerificacion {
  /** Estado reportado por la DGII (p. ej. "Aceptado"). */
  estado: string | null;
  /** true si el estado indica aceptación. */
  aceptado: boolean;
  razonSocialEmisor: string | null;
  razonSocialComprador: string | null;
  montoTotal: number | null;
  totalItbis: number | null;
}

/** Quita scripts/estilos/etiquetas y colapsa espacios; decodifica entidades básicas. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMonto(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Extrae los datos de verificación del HTML de ecf.dgii.gov.do. */
export function parseEcfVerificacion(html: string): EcfVerificacion {
  const t = htmlToText(html);
  const grab = (re: RegExp): string | null => {
    const m = t.match(re);
    return m && m[1] ? m[1].trim() : null;
  };

  const estado = grab(/Estado\s*[:-]?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
  return {
    estado,
    aceptado: estado != null && /acept/i.test(estado),
    razonSocialEmisor: grab(/Raz[oó]n social emisor\s*[:-]?\s*(.+?)\s*RNC\s*Comprador/i),
    razonSocialComprador: grab(/Raz[oó]n social comprador\s*[:-]?\s*(.+?)\s*e-?NCF/i),
    totalItbis: parseMonto(grab(/Total de ITBIS\s*[:-]?\s*([\d.,-]+)/i)),
    montoTotal: parseMonto(grab(/Monto Total\s*[:-]?\s*([\d.,-]+)/i)),
  };
}
