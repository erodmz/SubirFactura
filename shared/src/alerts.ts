// Alertas operativas de "ruptura" (algo del sistema se dañó: un scraper dejó de
// parsear, una dependencia externa cambió, etc.). Dos canales:
//   1. Log estructurado SIEMPRE (línea con prefijo [ALERTA] + JSON) → grepeable
//      y analizable después, aunque no haya ntfy configurado.
//   2. ntfy (https://ntfy.sh u otro) si NTFY_TOPIC está definido.
//
// Regla de oro: es best-effort y NUNCA lanza. Alertar no puede tumbar el flujo
// que intenta reportar. Además hace dedup por clave (cooldown) para que una
// ruptura que se repite en cada factura no dispare cientos de notificaciones.

const NTFY_URL = process.env.NTFY_URL ?? 'https://ntfy.sh';
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? '';
const COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MS ?? 10 * 60 * 1000); // 10 min

/** Última vez (ms) que se envió cada clave, para el cooldown de dedup. */
const lastAlertAt = new Map<string, number>();

function errText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error == null) return '';
  try {
    return typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export interface RuptureAlert {
  /** Identificador estable de la ruptura (para dedup y para agrupar en logs). */
  key: string;
  /** Título corto y humano. */
  title: string;
  /** Detalle de qué pasó y con qué dato. */
  message: string;
  /** Error asociado, si lo hay. */
  error?: unknown;
  /** Contexto extra que ayude a diagnosticar (ids, RNC, NCF…). */
  context?: Record<string, unknown>;
}

/**
 * Registra (y notifica) una ruptura. Siempre deja el log; envía a ntfy si está
 * configurado y no está en cooldown. No lanza jamás.
 */
export async function alertRupture(alert: RuptureAlert): Promise<void> {
  const detail = errText(alert.error);
  // 1) Log estructurado, siempre.
  try {
    console.error(
      `[ALERTA] ${alert.key} :: ${JSON.stringify({
        title: alert.title,
        message: alert.message,
        ...(detail ? { error: detail } : {}),
        ...(alert.context ? { context: alert.context } : {}),
      })}`,
    );
  } catch {
    console.error(`[ALERTA] ${alert.key} :: ${alert.title} — ${alert.message}`);
  }

  // 2) ntfy, best-effort y con cooldown por clave.
  if (!NTFY_TOPIC) return;
  const now = Date.now();
  const last = lastAlertAt.get(alert.key) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastAlertAt.set(alert.key, now);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(`${NTFY_URL.replace(/\/$/, '')}/${NTFY_TOPIC}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Title: alert.title,
        Priority: 'high',
        Tags: 'warning,subirfactura',
      },
      body: `${alert.message}${detail ? `\n\n${detail}` : ''}`,
    });
  } catch {
    // ntfy caído / sin internet: el log ya quedó; no propagamos.
  } finally {
    clearTimeout(timer);
  }
}
