import { describe, expect, it, vi } from 'vitest';
import { AuthService, hashToken, parseDuration } from './auth.service';

describe('parseDuration', () => {
  it('convierte duraciones a milisegundos', () => {
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('12h')).toBe(43_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('30s')).toBe(30_000);
  });

  it('rechaza formatos inválidos', () => {
    expect(() => parseDuration('una semana')).toThrow();
    expect(() => parseDuration('7w')).toThrow();
  });
});

describe('hashToken', () => {
  it('es determinístico y no expone el token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toContain('abc');
    expect(hashToken('abc')).toHaveLength(64); // sha256 hex
  });
});

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    emailVerificationToken: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    oAuthAccount: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('access-token') };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const mail = { sendPasswordReset: vi.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AuthService(prisma as any, jwt as any, audit as any, mail as any);
  return { service, prisma, jwt, audit, mail };
}

const user = {
  id: 'u1',
  email: 'ana@ejemplo.com',
  passwordHash: '$2b$10$invalido',
  nombre: 'Ana',
  isSuperAdmin: false,
};

describe('AuthService.login', () => {
  it('rechaza usuarios inexistentes', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('nadie@x.com', 'clave1234')).rejects.toThrow(
      'Credenciales inválidas',
    );
  });

  it('rechaza contraseña incorrecta sin revelar cuál campo falló', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(service.login(user.email, 'clave-mala')).rejects.toThrow('Credenciales inválidas');
  });

  it('bloquea la cuenta tras demasiados fallos (fuerza bruta por correo)', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(user);
    // Correo propio de este test para no chocar con el contador global en memoria.
    const email = 'brute-force@ejemplo.com';
    // Los primeros 10 intentos fallan por credenciales (umbral por defecto = 10).
    for (let i = 0; i < 10; i++) {
      await expect(service.login(email, 'mala')).rejects.toThrow('Credenciales inválidas');
    }
    // El 11.º ya no llega a comparar la contraseña: la cuenta está bloqueada.
    await expect(service.login(email, 'mala')).rejects.toThrow(/Demasiados intentos/);
  });

  it('normaliza el correo (mayúsculas/espacios) al buscar la cuenta', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(service.login('  ANA@Ejemplo.com ', 'clave-mala')).rejects.toThrow(
      'Credenciales inválidas',
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ana@ejemplo.com' } });
  });
});

describe('AuthService.verifyEmail', () => {
  it('rechaza un token inexistente', async () => {
    const { service, prisma } = buildService();
    prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
    await expect(service.verifyEmail('token-x')).rejects.toThrow(/no es válido/);
  });

  it('rechaza un token ya usado', async () => {
    const { service, prisma } = buildService();
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 10_000),
    });
    await expect(service.verifyEmail('token-x')).rejects.toThrow(/no es válido/);
  });

  it('rechaza un token vencido', async () => {
    const { service, prisma } = buildService();
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 10_000),
    });
    await expect(service.verifyEmail('token-x')).rejects.toThrow(/venció/);
  });

  it('con un token válido marca el correo como verificado y consume el token', async () => {
    const { service, prisma } = buildService();
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
    });
    await service.verifyEmail('token-x');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' } }),
    );
  });
});

describe('AuthService.resendVerification', () => {
  it('no revela nada si el correo no existe', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.resendVerification('nadie@x.com')).resolves.toEqual({});
    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  it('no reenvía si el correo ya está verificado', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ ...user, emailVerifiedAt: new Date() });
    await expect(service.resendVerification(user.email)).resolves.toEqual({});
    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.refresh (rotación)', () => {
  const baseToken = {
    id: 'rt1',
    userId: 'u1',
    tokenHash: hashToken('token-viejo'),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    user,
  };

  it('rota: revoca el token usado y emite uno nuevo', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue(baseToken);

    const tokens = await service.refresh('token-viejo');

    expect(tokens.accessToken).toBe('access-token');
    expect(tokens.refreshToken).toBeTruthy();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('detecta reuso (token ya revocado) y revoca todas las sesiones', async () => {
    const { service, prisma, audit } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue({ ...baseToken, revokedAt: new Date() });

    await expect(service.refresh('token-viejo')).rejects.toThrow(/revocada por seguridad/);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'auth.refresh_reuse_detected' }),
    );
  });

  it('rechaza tokens expirados', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      ...baseToken,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.refresh('token-viejo')).rejects.toThrow(/expirada/);
  });

  it('rechaza tokens desconocidos', async () => {
    const { service, prisma } = buildService();
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.refresh('token-falso')).rejects.toThrow(/inválido/);
  });
});

describe('AuthService.loginWithProvider (Google/Facebook)', () => {
  const perfil = {
    provider: 'google',
    providerAccountId: 'g-123',
    email: 'Nueva@Ejemplo.com',
    emailVerified: true,
    nombre: 'Nueva Persona',
  };

  it('rechaza si el proveedor no entregó correo verificado', async () => {
    const { service } = buildService();
    await expect(
      service.loginWithProvider({ ...perfil, emailVerified: false }),
    ).rejects.toThrow(/verificado/);
  });

  it('si ya está enlazado, entra con ese usuario (sin crear ni enlazar)', async () => {
    const { service, prisma } = buildService();
    prisma.oAuthAccount.findUnique.mockResolvedValue({ userId: 'u1', user });
    const r = await service.loginWithProvider(perfil);
    expect(r.user.email).toBe(user.email);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
  });

  it('si existe un usuario con ese correo, ENLAZA el proveedor (misma cuenta)', async () => {
    const { service, prisma } = buildService();
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(user); // ya existe por correo
    await service.loginWithProvider(perfil);
    expect(prisma.user.create).not.toHaveBeenCalled(); // no crea otro
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', provider: 'google' }) }),
    );
  });

  it('si no existe, crea usuario SIN contraseña y con correo verificado, y enlaza', async () => {
    const { service, prisma } = buildService();
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null); // no existe
    prisma.user.create.mockResolvedValue({ ...user, id: 'u2', email: 'nueva@ejemplo.com' });
    await service.loginWithProvider(perfil);
    const arg = prisma.user.create.mock.calls[0][0].data;
    expect(arg.passwordHash).toBeUndefined(); // sin contraseña
    expect(arg.emailVerifiedAt).toBeInstanceOf(Date); // el proveedor ya verificó
    expect(arg.email).toBe('nueva@ejemplo.com'); // normalizado
    expect(prisma.oAuthAccount.create).toHaveBeenCalled();
  });
});
