import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  nombre!: string;

  @IsOptional()
  @IsString()
  rnc?: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsString()
  rnc?: string;
}

export class UpdateMemberRoleDto {
  @IsIn(['org_admin', 'contador', 'cliente'])
  rol!: 'org_admin' | 'contador' | 'cliente';
}
