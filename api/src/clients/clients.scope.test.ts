import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import type { Membership } from '@facturard/shared/db';

// Cubre el corazón del aislamiento intra-despacho: assertClientInScope. Un
// contador solo alcanza a sus clientes asignados; un cliente, a sus negocios
// habilitados; el org_admin, a todos. Cerró un IDOR real (leer/cerrar el 606
// de un cliente ajeno pasando su UUID por query).

function build(overrides: Record<string, unknown> = {}) {
  const prisma = {
    assignment: { findFirst: vi.fn() },
    clientMember: { findFirst: vi.fn() },
    ...overrides,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ClientsService(prisma as any, {} as any, {} as any);
  return { service, prisma };
}

const mem = (rol: Membership['rol'], extra: Partial<Membership> = {}) =>
  ({ id: 'mem-1', userId: 'user-1', rol, ...extra }) as Membership;

describe('ClientsService.assertClientInScope', () => {
  it('org_admin alcanza cualquier cliente (sin consultar asignaciones)', async () => {
    const { service, prisma } = build();
    await expect(service.assertClientInScope('org', 'cli', mem('org_admin'))).resolves.toBeUndefined();
    expect(prisma.assignment.findFirst).not.toHaveBeenCalled();
  });

  it('contador ASIGNADO al cliente: permitido', async () => {
    const { service, prisma } = build();
    prisma.assignment.findFirst.mockResolvedValue({ clientProfileId: 'cli' });
    await expect(service.assertClientInScope('org', 'cli', mem('contador'))).resolves.toBeUndefined();
  });

  it('contador NO asignado: 403 (el IDOR que se cerró)', async () => {
    const { service, prisma } = build();
    prisma.assignment.findFirst.mockResolvedValue(null);
    await expect(service.assertClientInScope('org', 'ajeno', mem('contador'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('cliente habilitado en el negocio: permitido', async () => {
    const { service, prisma } = build();
    prisma.clientMember.findFirst.mockResolvedValue({ clientProfileId: 'cli' });
    await expect(service.assertClientInScope('org', 'cli', mem('cliente'))).resolves.toBeUndefined();
  });

  it('cliente NO habilitado: 403', async () => {
    const { service, prisma } = build();
    prisma.clientMember.findFirst.mockResolvedValue(null);
    await expect(service.assertClientInScope('org', 'ajeno', mem('cliente'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
