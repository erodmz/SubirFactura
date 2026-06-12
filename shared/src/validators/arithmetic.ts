// Coherencia aritmética de la factura (ESPECIFICACION.md §5.4):
// subtotal + ITBIS + propina + otros impuestos ≈ total.
// Todos los montos se manejan en CENTAVOS (enteros) — nunca float (§10).

export interface InvoiceAmountsCents {
  subtotal: number;
  itbis?: number;
  propinaLegal?: number;
  otrosImpuestos?: number;
  total: number;
}

export interface ArithmeticCheckResult {
  ok: boolean;
  expectedTotal: number;
  differenceCents: number;
}

/** Convierte un monto en pesos (string o number) a centavos enteros, redondeando. */
export function toCents(amount: number | string): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new Error(`Monto inválido: ${amount}`);
  }
  return Math.round(value * 100);
}

export function checkInvoiceArithmetic(
  amounts: InvoiceAmountsCents,
  toleranceCents = 1,
): ArithmeticCheckResult {
  const expectedTotal =
    amounts.subtotal +
    (amounts.itbis ?? 0) +
    (amounts.propinaLegal ?? 0) +
    (amounts.otrosImpuestos ?? 0);
  const differenceCents = Math.abs(expectedTotal - amounts.total);
  return { ok: differenceCents <= toleranceCents, expectedTotal, differenceCents };
}
