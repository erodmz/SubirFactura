import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  GoogleLoginDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { logoPath } from '../organizations/organizations.service';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauth: OAuthService,
    private readonly prisma: PrismaService,
  ) {}

  // Rutas de credenciales: límite estricto contra fuerza bruta / credential
  // stuffing / enumeración de correos (10 intentos por minuto y por IP).
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('auth/register')
  register(@Body() dto: RegisterDto, @Headers('origin') origin?: string) {
    const baseUrl = origin ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3001';
    return this.authService.register(dto, baseUrl);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(200)
  @Post('auth/refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Entra o se registra con Google (verifica el ID token y emite nuestros tokens). */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @Post('auth/google')
  google(@Body() dto: GoogleLoginDto) {
    return this.oauth.loginWithGoogle(dto.idToken);
  }

  @Public()
  @HttpCode(204)
  @Post('auth/logout')
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
  }

  /**
   * Solicita el restablecimiento de contraseña. Responde 200 siempre (no revela
   * si el correo existe). El enlace apunta al panel web que hizo la petición.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('auth/forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Headers('origin') origin?: string) {
    const baseUrl = origin ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3001';
    return this.authService.forgotPassword(dto.email, baseUrl);
  }

  /** Restablece la contraseña con el token del enlace. */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('auth/reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  /** Confirma el correo con el token del enlace. */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @Post('auth/verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
    return { ok: true };
  }

  /** Reenvía el correo de verificación. Responde 200 siempre (no revela nada). */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('auth/resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto, @Headers('origin') origin?: string) {
    const baseUrl = origin ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3001';
    return this.authService.resendVerification(dto.email, baseUrl);
  }

  /** Cambio de contraseña del usuario autenticado. Devuelve tokens nuevos. */
  @HttpCode(200)
  @Post('auth/change-password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  /** Perfil + membresías (selector de empresa de la app móvil — Fase 2). */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const [profile, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { nombre: true, emailVerifiedAt: true },
      }),
      this.prisma.membership.findMany({
        // Las orgs con borrado lógico desaparecen del selector (web y móvil);
        // las membresías inactivas (miembro "quitado") también.
        where: { userId: user.userId, deletedAt: null, organization: { deletedAt: null } },
        include: {
          organization: {
            select: {
              id: true,
              nombre: true,
              estadoSuscripcion: true,
              estadoAprobacion: true,
              logoKey: true,
            },
          },
        },
      }),
    ]);

    // Negocios (client_profiles) que el usuario puede subir como cliente.
    // Para un cliente, "sus empresas" son estos negocios, no el despacho.
    const links = await this.prisma.clientMember.findMany({
      where: { userId: user.userId },
      select: { clientProfileId: true },
    });
    const profileIds = links.map((l) => l.clientProfileId);
    const clientProfiles: {
      id: string;
      razonSocial: string;
      rncOCedula: string;
      organizationId: string;
      organizationNombre: string;
    }[] = [];
    if (profileIds.length > 0) {
      // client_profiles está bajo RLS: leer por cada org del usuario (forOrg)
      for (const m of memberships) {
        const profiles = await this.prisma.forOrg(m.organizationId).clientProfile.findMany({
          where: { id: { in: profileIds } },
          select: { id: true, razonSocial: true, rncOCedula: true },
        });
        for (const p of profiles) {
          clientProfiles.push({
            ...p,
            organizationId: m.organizationId,
            organizationNombre: m.organization.nombre,
          });
        }
      }
    }

    return {
      ...user,
      nombre: profile?.nombre ?? null,
      emailVerified: profile?.emailVerifiedAt != null,
      memberships: memberships.map((m) => ({
        membershipId: m.id,
        rol: m.rol,
        puedeValidar: m.puedeValidar,
        puedeVerReportes: m.puedeVerReportes,
        organization: {
          id: m.organization.id,
          nombre: m.organization.nombre,
          estadoSuscripcion: m.organization.estadoSuscripcion,
          estadoAprobacion: m.organization.estadoAprobacion,
          logoUrl: logoPath(m.organization.id, m.organization.logoKey),
        },
      })),
      clientProfiles,
    };
  }
}
