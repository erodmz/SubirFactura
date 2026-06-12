import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? '',
  },
  forcePathStyle: true, // requerido por MinIO
});

const BUCKET = process.env.S3_BUCKET ?? 'invoices';

export async function getImageBase64(
  key: string,
): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  const response = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await response.Body!.transformToByteArray();
  const contentType = response.ContentType ?? 'image/jpeg';
  if (contentType !== 'image/jpeg' && contentType !== 'image/png' && contentType !== 'image/webp') {
    throw new Error(`Tipo de imagen no soportado: ${contentType}`);
  }
  return { data: Buffer.from(bytes).toString('base64'), mediaType: contentType };
}
