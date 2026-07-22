import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  nombre!: string;

  @IsOptional()
  @IsString()
  rnc?: string;

  /** Plan elegido en el onboarding (default: Básico). Cobro manual en v1. */
  @IsOptional()
  @IsString()
  planNombre?: string;
}

export class ChangePlanDto {
  @IsString()
  @IsNotEmpty()
  planNombre!: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsString()
  rnc?: string;

  @IsOptional()
  @IsBoolean()
  requiereValidacionAritmetica?: boolean;

  /** Default de la empresa: los registros manuales requieren aprobación. */
  @IsOptional()
  @IsBoolean()
  requiereAprobacionManual?: boolean;
}

export class UpdateMemberRoleDto {
  @IsIn(['org_admin', 'contador', 'cliente'])
  rol!: 'org_admin' | 'contador' | 'cliente';
}

export class SetValidatePermissionDto {
  @IsBoolean()
  puedeValidar!: boolean;
}

export class SetReportsPermissionDto {
  @IsBoolean()
  puedeVerReportes!: boolean;
}

export class SetExemptApprovalDto {
  @IsBoolean()
  exentoAprobacion!: boolean;
}

export class UpdateMemberNameDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede ir vacío' })
  nombre!: string;
}
