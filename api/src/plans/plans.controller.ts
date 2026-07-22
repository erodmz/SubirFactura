import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Catálogo de planes (autenticado, sin ámbito de organización): lo consumen el
 * onboarding y la pantalla de configuración para mostrar límites y precios.
 * La verdad vive en la BD (seeds), nunca hardcodeada en el cliente.
 */
@Controller('plans')
export class PlansController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.plan.findMany({
      select: {
        nombre: true,
        maxContadores: true,
        maxClientes: true,
        maxFacturasMes: true,
        precio: true,
      },
      orderBy: { precio: 'asc' },
    });
  }
}
