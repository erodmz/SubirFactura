import { IsEmail, IsIn } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;

  // org_admin se otorga cambiando el rol de un miembro existente, no por invitación
  @IsIn(['contador', 'cliente'])
  rol!: 'contador' | 'cliente';
}
