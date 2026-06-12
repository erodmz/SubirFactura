import { describe, expect, it, vi } from 'vitest';
import { PlanLimitsService } from './plan-limits.service';

function buildService(opts: {
  plan?: { id: string; nombre: string; maxContadores: number; maxClientes: number; maxFacturasMes: number } | null;
  estadoSuscripcion?: string | null;
  contadores?: number;
  clientes?: number;
  facturasMes?: number;
}) {
  const prisma = {
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'org1',
        plan: opts.plan ?? null,
        estadoSuscripcion: opts.estadoSuscripcion ?? null,
      }),
    },
    membership: { count: vi.fn().mockResolvedValue(opts.contadores ?? 0) },
    forOrg: vi.fn().mockReturnValue({
      clientProfile: { count: vi.fn().mockResolvedValue(opts.clientes ?? 0) },
      invoice: { count: vi.fn().mockResolvedValue(opts.facturasMes ?? 0) },
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PlanLimitsService(prisma as any);
}

const planBasico = {
  id: 'p1',
  nombre: 'Básico',
  maxContadores: 5,
  maxClientes: 10,
  maxFacturasMes: 200,
};

describe('PlanLimitsService.getUsage', () => {
  it('reporta uso sin aviso por debajo del 80%', async () => {
    const service = buildService({
      plan: planBasico,
      estadoSuscripcion: 'activa',
      contadores: 2,
      clientes: 5,
    });
    const usage = await service.getUsage('org1');
    expect(usage.contadores).toEqual({ used: 2, max: 5, warning: false });
    expect(usage.clientes).toEqual({ used: 5, max: 10, warning: false });
  });

  it('marca aviso al alcanzar el 80% (§7)', async () => {
    const service = buildService({ plan: planBasico, estadoSuscripcion: 'activa', clientes: 8 });
    const usage = await service.getUsage('org1');
    expect(usage.clientes!.warning).toBe(true);
  });

  it('sin plan devuelve límites nulos', async () => {
    const service = buildService({ plan: null });
    const usage = await service.getUsage('org1');
    expect(usage.plan).toBeNull();
    expect(usage.contadores).toBeNull();
  });
});

describe('PlanLimitsService.ensureCanAdd*', () => {
  it('bloquea al 100% del límite con CTA de upgrade', async () => {
    const service = buildService({ plan: planBasico, estadoSuscripcion: 'activa', clientes: 10 });
    await expect(service.ensureCanAddCliente('org1')).rejects.toThrow(/Mejora tu plan/);
  });

  it('bloquea cuando la suscripción no está activa', async () => {
    const service = buildService({ plan: planBasico, estadoSuscripcion: 'suspendida', clientes: 1 });
    await expect(service.ensureCanAddCliente('org1')).rejects.toThrow(/no está activa/);
  });

  it('permite y devuelve aviso cuando el alta cruza el 80%', async () => {
    const service = buildService({ plan: planBasico, estadoSuscripcion: 'activa', clientes: 7 });
    await expect(service.ensureCanAddCliente('org1')).resolves.toBe(true); // (7+1)/10 = 80%
  });

  it('permite sin aviso lejos del límite', async () => {
    const service = buildService({ plan: planBasico, estadoSuscripcion: 'activa', contadores: 1 });
    await expect(service.ensureCanAddContador('org1')).resolves.toBe(false);
  });

  it('aplica también al límite mensual de facturas (Fase 2)', async () => {
    const service = buildService({
      plan: planBasico,
      estadoSuscripcion: 'activa',
      facturasMes: 200,
    });
    await expect(service.ensureCanAddFactura('org1')).rejects.toThrow(/Mejora tu plan/);
  });
});
