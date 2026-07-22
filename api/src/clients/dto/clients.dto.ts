import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty({ message: 'El RNC o cédula es obligatorio' })
  rncOCedula!: string;

  @IsString()
  @IsNotEmpty({ message: 'La razón social es obligatoria' })
  razonSocial!: string;

  /** Opcional: vincular a un usuario ya registrado (cliente final con app) */
  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  razonSocial?: string;

  @IsOptional()
  @IsString()
  userId?: string | null;

  /** Workflow de aprobación: los registros manuales de este cliente entran en revisión. */
  @IsOptional()
  @IsBoolean()
  requiereAprobacion?: boolean;
}

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  contadorMembershipId!: string;
}

export class AddClientMemberDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el usuario a habilitar' })
  userId!: string;
}
