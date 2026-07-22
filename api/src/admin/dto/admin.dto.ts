import { IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminCreateOrganizationDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la empresa no puede ir vacío' })
  nombre!: string;

  @IsOptional()
  @IsString()
  rnc?: string;

  @IsOptional()
  @IsString()
  planNombre?: string; // Básico | Pro | Empresarial (default: Básico)

  /** Correo del contador que será org_admin; recibe un enlace de invitación. */
  @IsOptional()
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  adminEmail?: string;
}

export class SetSubscriptionDto {
  @IsString()
  planNombre!: string; // Básico | Pro | Empresarial

  @IsIn(['activa', 'vencida', 'suspendida', 'cancelada'])
  estado!: 'activa' | 'vencida' | 'suspendida' | 'cancelada';

  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsDateString()
  fin?: string;

  @IsOptional()
  @IsString()
  metodoPago?: string; // 'transferencia' en v1 (§7)
}
