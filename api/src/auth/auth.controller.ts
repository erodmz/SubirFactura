import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
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

  /** Perfil + membresías (selector de empresa de la app móvil — Fase 2). */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.userId },
      include: { organization: { select: { id: true, nombre: true, estadoSuscripcion: true } } },
    });
    return {
      ...user,
      memberships: memberships.map((m) => ({
        membershipId: m.id,
        rol: m.rol,
        organization: m.organization,
      })),
    };
  }
}
