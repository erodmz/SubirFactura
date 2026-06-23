import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @HttpCode(200)
  @Post('auth/refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(204)
  @Post('auth/logout')
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
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
        select: { nombre: true },
      }),
      this.prisma.membership.findMany({
        where: { userId: user.userId },
        include: { organization: { select: { id: true, nombre: true, estadoSuscripcion: true } } },
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
      memberships: memberships.map((m) => ({
        membershipId: m.id,
        rol: m.rol,
        organization: m.organization,
      })),
      clientProfiles,
    };
  }
}
