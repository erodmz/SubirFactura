// Comparación de razón social contra el Padrón RNC de la DGII (ESPECIFICACION.md §6).
// Lógica pura, compartida por el importador y la validación en lote.

/**
 * Normaliza una razón social para comparar: mayúsculas, sin acentos, sin
 * puntuación, sin sufijos societarios (SRL, SA, EIRL…) y espacios colapsados.
 */
// Sufijos societarios a descartar. Tras quitar la puntuación, "S.A." queda como
// "S A" y "C. por A." como "C POR A", así que se contemplan ambas formas.
const SUFIJOS_SOCIETARIOS =
  /\b(SACOMP|CPORA|C POR A|CXA|C X A|EIRL|E I R L|SRL|S R L|SAS|SA|S A|CORP|INC|LTD)\b/g;

export function normalizeRazonSocial(raw: string): string {
  const base = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (marcas combinantes)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ') // puntuación → espacio
    .replace(/\s+/g, ' ')
    .trim();
  return base.replace(SUFIJOS_SOCIETARIOS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * ¿Coinciden dos razones sociales? Igualdad tras normalizar, o que una contenga
 * a la otra (tolera "Colmado Don José" vs "Colmado Don José SRL" y variantes).
 */
export function matchRazonSocial(a: string, b: string): boolean {
  const na = normalizeRazonSocial(a);
  const nb = normalizeRazonSocial(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

export interface PadronEntry {
  rnc: string;
  razonSocial: string;
  estado?: string | null;
}

export interface PadronValidation {
  rnc: string;
  existe: boolean;
  /** El RNC figura como activo en el padrón. */
  activo: boolean;
  /** La razón social capturada coincide con la del padrón. */
  razonSocialCoincide: boolean;
  /** Razón social oficial según el padrón (para sugerir corrección). */
  razonSocialOficial?: string;
}

/** Estados del padrón que se consideran "activo". */
const ESTADOS_ACTIVOS = new Set(['ACTIVO', 'NORMAL', '']);

/** Evalúa un RNC contra su registro de padrón (o ausencia de él). */
export function validateAgainstPadron(
  rnc: string,
  razonSocialCapturada: string | null,
  entry: PadronEntry | null,
): PadronValidation {
  if (!entry) {
    return { rnc, existe: false, activo: false, razonSocialCoincide: false };
  }
  const estado = (entry.estado ?? '').toUpperCase().trim();
  return {
    rnc,
    existe: true,
    activo: ESTADOS_ACTIVOS.has(estado),
    razonSocialCoincide: razonSocialCapturada
      ? matchRazonSocial(razonSocialCapturada, entry.razonSocial)
      : false,
    razonSocialOficial: entry.razonSocial,
  };
}
