import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  nombre!: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Ingresa tu contraseña' })
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el token de sesión' })
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Ingresa tu contraseña actual' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el token del enlace' })
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el token del enlace' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  newPassword!: string;
}
