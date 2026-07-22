import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

type Overrides = {
  plan?: { id: string; nombre: string } | null;
  org?: { id: string; nombre: string; deletedAt: Date | null } | null;
};

function buildService(opts: Overrides = {}) {
  const createdOrg = { id: 'org1', nombre: 'Despacho X', rnc: null, deletedAt: null };
  const tx = {
    organization: {
      create: vi.fn().mockResolvedValue(createdOrg),
    },
    subscription: { create: vi.fn().mockResolvedValue({ id: 'sub1' }) },
    invitation: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'inv1', email: data.email, rol: data.rol, expiresAt: data.expiresAt }),
      ),
    },
  };
  const prisma = {
    plan: {
      findUnique: vi.fn().mockResolvedValue(opts.plan === undefined ? { id: 'p1', nombre: 'Pro' } : opts.plan),
    },
    organization: {
      findUnique: vi.fn().mockResolvedValue(opts.org === undefined ? { id: 'org1', nombre: 'Despacho X', deletedAt: null } : opts.org),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'org1', ...data })),
    },
    subscription: { create: vi.fn(), findMany: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
  };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new AdminService(prisma as any, audit as any), prisma, tx, audit };
}

describe('AdminService.createOrganization', () => {
  it('crea la org con el plan elegido y suscripción activa', async () => {
    const { service, tx } = buildService();
    const result = await service.createOrganization('admin1', { nombre: 'Despacho X', planNombre: 'Pro' });
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nombre: 'Despacho X', planId: 'p1', estadoSuscripcion: 'activa' }),
    });
    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planId: 'p1', estado: 'activa', metodoPago: 'manual' }),
    });
    expect(result.invitation).toBeNull();
  });

  it('con adminEmail crea la invitación org_admin y devuelve el enlace', async () => {
    const { service, tx } = buildService();
    const result = await service.createOrganization('admin1', {
      nombre: 'Despacho X',
      adminEmail: 'contadora@despacho.do',
    });
    expect(tx.invitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'contadora@despacho.do', rol: 'org_admin', invitedById: 'admin1' }),
    });
    expect(result.invitation?.inviteUrl).toMatch(/\/invitations\/[0-9a-f]{64}$/);
  });

  it('rechaza un plan inexistente', async () => {
    const { service } = buildService({ plan: null });
    await expect(
      service.createOrganization('admin1', { nombre: 'X', planNombre: 'Diamante' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza un RNC inválido', async () => {
    const { service } = buildService();
    await expect(
      service.createOrganization('admin1', { nombre: 'X', rnc: '123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminService borrado lógico', () => {
  it('marca deletedAt al borrar', async () => {
    const { service, prisma } = buildService();
    await service.softDeleteOrganization('org1', 'admin1');
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('no borra dos veces', async () => {
    const { service } = buildService({ org: { id: 'org1', nombre: 'X', deletedAt: new Date() } });
    await expect(service.softDeleteOrganization('org1', 'admin1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restaura poniendo deletedAt en null', async () => {
    const { service, prisma } = buildService({ org: { id: 'org1', nombre: 'X', deletedAt: new Date() } });
    await service.restoreOrganization('org1', 'admin1');
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org1' },
      data: { deletedAt: null },
    });
  });

  it('no restaura una org que no está borrada', async () => {
    const { service } = buildService();
    await expect(service.restoreOrganization('org1', 'admin1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
