import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { User } from '@facturard/shared/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 10;

/** Normaliza el correo para búsqueda/almacenamiento: sin espacios y en minúsculas. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Bloqueo de fuerza bruta POR CORREO. El throttle del controller limita por IP;
// esto añade la dimensión por cuenta para frenar el credential stuffing
// distribuido que rota IPs contra un mismo correo. En memoria: basta para un
// despliegue de una instancia (igual que el cooldown de alertas y el caché del
// padrón); si algún día hay varias réplicas, mover a Redis.
const LOGIN_MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS ?? 10);
const LOGIN_FAIL_WINDOW_MS = Number(process.env.LOGIN_FAIL_WINDOW_MS ?? 15 * 60_000);
const loginFails = new Map<string, { count: number; firstAt: number }>();

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** '15m' | '12h' | '7d' → milisegundos */
export function parseDuration(value: string): number {
  const match = value.trim().match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Duración inválida: ${value}`);
  const amount = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * unit;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private refreshTtlMs(): number {
    return parseDuration(process.env.JWT_REFRESH_EXPIRES_IN ?? '7d');
  }

  async register(dto: RegisterDto, baseUrl?: string) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Ya existe una cuenta con ese correo');

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        nombre: dto.nombre,
        telefono: dto.telefono,
      },
    });
    await this.audit.log({ userId: user.id, accion: 'user.register', entidad: 'user', entidadId: user.id });

    // Verificación de correo: se emite un enlace y (fuera de producción) se
    // devuelve para poder probar sin proveedor de correo conectado. NO bloquea
    // el registro: el usuario entra y ve un aviso hasta confirmar.
    const devVerifyUrl = await this.sendVerificationEmail(user, baseUrl);

    return {
      user: this.publicUser(user),
      tokens: await this.issueTokens(user),
      ...(devVerifyUrl ? { devVerifyUrl } : {}),
    };
  }

  /**
   * Emite un token de verificación de correo (24 h, un solo uso), lo envía y
   * devuelve el enlace SOLO fuera de producción (para probar sin proveedor).
   */
  private async sendVerificationEmail(
    user: Pick<User, 'id' | 'email'>,
    baseUrl?: string,
  ): Promise<string | undefined> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 86_400_000), // 24 horas
      },
    });
    const base = (baseUrl ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3001').replace(/\/$/, '');
    const verifyUrl = `${base}/verificar-correo?token=${token}`;
    await this.mail.sendEmailVerification(user.email, verifyUrl);
    return process.env.NODE_ENV === 'production' ? undefined : verifyUrl;
  }

  /**
   * Reenvía el correo de verificación. No revela si el correo existe ni si ya
   * estaba verificado (evita enumeración de cuentas).
   */
  async resendVerification(email: string, baseUrl?: string): Promise<{ devVerifyUrl?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user || user.emailVerifiedAt) return {};
    const devVerifyUrl = await this.sendVerificationEmail(user, baseUrl);
    return devVerifyUrl ? { devVerifyUrl } : {};
  }

  /** Confirma el correo con el token del enlace (no usado, no vencido). */
  async verifyEmail(token: string): Promise<void> {
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('El enlace no es válido o ya venció. Solicita uno nuevo.');
    }
    await this.prisma.user.update({
      where: { id: stored.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.prisma.emailVerificationToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    });
    await this.audit.log({
      userId: stored.userId,
      accion: 'user.verify_email',
      entidad: 'user',
      entidadId: stored.userId,
    });
  }

  async login(rawEmail: string, password: string) {
    const email = normalizeEmail(rawEmail);
    const now = Date.now();

    // Cuenta bloqueada temporalmente por demasiados fallos recientes.
    const rec = loginFails.get(email);
    if (rec && now - rec.firstAt < LOGIN_FAIL_WINDOW_MS && rec.count >= LOGIN_MAX_FAILS) {
      throw new HttpException(
        'Demasiados intentos fallidos para esta cuenta. Espera unos minutos e inténtalo de nuevo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      this.recordLoginFailure(email, now);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    loginFails.delete(email); // login correcto: limpia el contador de la cuenta
    await this.audit.log({ userId: user.id, accion: 'user.login', entidad: 'user', entidadId: user.id });

    return { user: this.publicUser(user), tokens: await this.issueTokens(user) };
  }

  /** Suma un fallo de login a la cuenta, reiniciando la ventana si venció. */
  private recordLoginFailure(email: string, now: number): void {
    const rec = loginFails.get(email);
    if (!rec || now - rec.firstAt >= LOGIN_FAIL_WINDOW_MS) {
      loginFails.set(email, { count: 1, firstAt: now });
    } else {
      rec.count += 1;
    }
  }

  /**
   * Rotación de refresh tokens (§8). Si llega un token ya rotado (reuso),
   * se asume robo y se revocan TODAS las sesiones del usuario.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Refresh token inválido');

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        userId: stored.userId,
        accion: 'auth.refresh_reuse_detected',
        entidad: 'refresh_token',
        entidadId: stored.id,
      });
      throw new UnauthorizedException('Sesión revocada por seguridad, inicia sesión de nuevo');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión expirada, inicia sesión de nuevo');
    }

    const tokens = await this.issueTokens(stored.user);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedById: hashToken(tokens.refreshToken).slice(0, 36),
      },
    });
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cambia la contraseña del usuario autenticado. Verifica la actual, revoca
   * TODAS las sesiones (por seguridad) y emite tokens nuevos para que la sesión
   * actual siga viva sin tener que volver a iniciar sesión.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      userId,
      accion: 'user.change_password',
      entidad: 'user',
      entidadId: userId,
    });

    return this.issueTokens(updated);
  }

  /**
   * Solicitud de restablecimiento. Siempre resuelve sin revelar si el correo
   * existe (evita enumeración de cuentas). Si existe, crea un token de un solo
   * uso (1 h) y envía el enlace. Devuelve el enlace SOLO fuera de producción,
   * para poder probar sin proveedor de correo conectado.
   */
  async forgotPassword(email: string, baseUrl: string): Promise<{ devResetUrl?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user) return {};

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3_600_000), // 1 hora
      },
    });
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    await this.mail.sendPasswordReset(user.email, resetUrl);
    await this.audit.log({
      userId: user.id,
      accion: 'user.forgot_password',
      entidad: 'user',
      entidadId: user.id,
    });

    return process.env.NODE_ENV === 'production' ? {} : { devResetUrl: resetUrl };
  }

  /**
   * Restablece la contraseña con un token válido (no usado, no vencido). Marca
   * el token como usado y revoca todas las sesiones del usuario.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('El enlace no es válido o ya venció. Solicita uno nuevo.');
    }

    await this.prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });
    await this.prisma.passwordResetToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      userId: stored.userId,
      accion: 'user.reset_password',
      entidad: 'user',
      entidadId: stored.userId,
    });
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
    });
    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    return { accessToken, refreshToken };
  }

  private publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      telefono: user.telefono,
      isSuperAdmin: user.isSuperAdmin,
      emailVerified: user.emailVerifiedAt != null,
    };
  }
}
