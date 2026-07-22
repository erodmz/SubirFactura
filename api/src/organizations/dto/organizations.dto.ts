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
