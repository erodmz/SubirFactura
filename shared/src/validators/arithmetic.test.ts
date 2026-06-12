import { describe, expect, it } from 'vitest';
import { checkInvoiceArithmetic, toCents } from './arithmetic';

describe('toCents', () => {
  it('convierte pesos a centavos enteros', () => {
    expect(toCents(1500)).toBe(150000);
    expect(toCents('1500.50')).toBe(150050);
    expect(toCents(0.1 + 0.2)).toBe(30); // redondeo, sin error de float
  });

  it('rechaza montos no numéricos', () => {
    expect(() => toCents('no-es-numero')).toThrow();
  });
});

describe('checkInvoiceArithmetic', () => {
  it('acepta subtotal + ITBIS 18% + propina 10% = total', () => {
    // 1,500.00 + 270.00 + 150.00 = 1,920.00
    const result = checkInvoiceArithmetic({
      subtotal: 150000,
      itbis: 27000,
      propinaLegal: 15000,
      total: 192000,
    });
    expect(result.ok).toBe(true);
    expect(result.differenceCents).toBe(0);
  });

  it('tolera diferencia de 1 centavo por redondeo', () => {
    const result = checkInvoiceArithmetic({ subtotal: 10000, itbis: 1800, total: 11801 });
    expect(result.ok).toBe(true);
  });

  it('rechaza totales incoherentes', () => {
    const result = checkInvoiceArithmetic({ subtotal: 150000, itbis: 27000, total: 200000 });
    expect(result.ok).toBe(false);
    expect(result.differenceCents).toBe(23000);
  });

  it('trata impuestos ausentes como cero', () => {
    expect(checkInvoiceArithmetic({ subtotal: 5000, total: 5000 }).ok).toBe(true);
  });
});
