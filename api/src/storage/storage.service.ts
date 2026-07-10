import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

/**
 * Almacenamiento de imágenes en MinIO (S3-compatible). 12-factor: migrar a S3
 * real es cambiar S3_ENDPOINT y credenciales (§2). Las imágenes se sirven solo
 * con URLs firmadas y temporales — nunca buckets públicos (§8).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly bucket = process.env.S3_BUCKET ?? 'invoices';

  private readonly credentials = {
    accessKeyId: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? '',
  };
  private readonly region = process.env.S3_REGION ?? 'us-east-1';

  // Endpoint interno: lo usa el API para subir (PUT) las imágenes.
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: this.region,
    credentials: this.credentials,
    forcePathStyle: true, // requerido por MinIO
  });

  // Endpoint público: host alcanzable desde el navegador y el teléfono. Las URL
  // firmadas se generan contra este host (en dev, la IP LAN de la Mac).
  private readonly presignClient = new S3Client({
    endpoint: process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: this.region,
    credentials: this.credentials,
    forcePathStyle: true,
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

  /** Borra un objeto (best-effort: no tumba la operación si falla). */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`No se pudo borrar el objeto "${key}": ${(err as Error).message}`);
    }
  }

  /**
   * Stream de un objeto (+ content-type y tamaño). Lo usa el proxy de imágenes
   * del API: el móvil no puede alcanzar el host de MinIO (localhost/IP LAN), así
   * que servimos la imagen por el mismo host del API, que ya funciona.
   */
  async getObject(
    key: string,
  ): Promise<{ body: Readable; contentType: string; contentLength?: number }> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      body: out.Body as Readable,
      contentType: out.ContentType ?? 'application/octet-stream',
      contentLength: out.ContentLength,
    };
  }

  /** URL firmada temporal para ver la imagen (default 1 hora). */
  presignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
