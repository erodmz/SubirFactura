import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Almacenamiento de imágenes en MinIO (S3-compatible). 12-factor: migrar a S3
 * real es cambiar S3_ENDPOINT y credenciales (§2). Las imágenes se sirven solo
 * con URLs firmadas y temporales — nunca buckets públicos (§8).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly bucket = process.env.S3_BUCKET ?? 'invoices';

  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? '',
    },
    forcePathStyle: true, // requerido por MinIO
  });

  async onModuleInit() {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" creado`);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
        // No tumbar el API si MinIO aún no está arriba; la subida fallará con error claro
        this.logger.warn(`No se pudo verificar el bucket "${this.bucket}": ${name}`);
      }
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** URL firmada temporal para ver la imagen (default 1 hora). */
  presignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
