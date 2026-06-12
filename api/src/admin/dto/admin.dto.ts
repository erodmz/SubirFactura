import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

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
