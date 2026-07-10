import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;

  // org_admin se otorga cambiando el rol de un miembro existente, no por invitación
  @IsIn(['contador', 'cliente'], { message: 'Rol inválido (contador o cliente)' })
  rol!: 'contador' | 'cliente';

  /** Solo para rol `cliente`: negocio al que queda vinculado al aceptar. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El negocio del cliente no puede ir vacío' })
  clientProfileId?: string;
}
