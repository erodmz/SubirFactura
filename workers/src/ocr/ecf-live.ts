// Verificación en vivo del e-CF contra ecf.dgii.gov.do (Fase 4). Sigue la URL
// del QR y parsea el estado oficial. Va detrás del flag DGII_LIVE_VERIFICATION
// porque hace una llamada de red externa; ante timeout/fallo devuelve null y el
// flujo se apoya en el padrón (degradación elegante).

import { parseEcfVerificacion, type EcfVerificacion } from '@facturard/shared';

export async function verifyEcfLive(
  url: string,
  timeoutMs = 5000,
): Promise<EcfVerificacion | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (SubirFactura)' },
    });
    if (!res.ok) return null;
    return parseEcfVerificacion(await res.text());
  } catch {
    return null; // timeout, red, DNS, etc.
  } finally {
    clearTimeout(timer);
  }
}
