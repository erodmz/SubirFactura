import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { INVOICE_STATUSES } from '@facturard/shared';

export class UploadInvoiceDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica a qué cliente pertenece la factura' })
  clientProfileId!: string;
}

export class ListInvoicesQueryDto {
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  estado?: (typeof INVOICE_STATUSES)[number];

  @IsOptional()
  @IsString()
  clientProfileId?: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Período fiscal inválido (AAAAMM)' })
  periodoFiscal?: string;
}

/** Edición campo a campo en la cola de revisión (§5.3). Todos opcionales. */
export class ReviewInvoiceDto {
  @IsOptional()
  @IsString()
  ncf?: string;

  @IsOptional()
  @IsString()
  rncProveedor?: string;

  @IsOptional()
  @IsString()
  razonSocialProveedor?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (AAAA-MM-DD)' })
  fecha?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montoFacturado?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  itbis?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otrosImpuestos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  propinaLegal?: number;

  /** Total impreso en la factura — solo para la validación aritmética */
  @IsOptional()
  @IsNumber()
  @Min(0)
  montoTotal?: number;

  @IsOptional()
  @Matches(/^(0[1-9]|1[01])$/, { message: 'Categoría 606 inválida (01–11)' })
  categoria606?: string;

  @IsOptional()
  @IsString()
  tipoComprobante?: string;
}
