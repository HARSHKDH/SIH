import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '@/lib/env';

import { assertSafeKey } from './keys';
import {
  contentTypeForKey,
  type ObjectBytes,
  type StorageDriver,
  type StoredObject,
  type UploadPurpose,
  type UploadTarget,
} from './types';

/**
 * AWS S3 driver. Uploads go direct from the browser via a presigned PUT so label
 * photos never transit the Node process — which keeps the API responsive on the
 * patchy mobile connections officers actually work on.
 */
class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private client: S3Client | null = null;

  private get s3(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: env.AWS_REGION,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
        ...(env.AWS_S3_ENDPOINT ? { endpoint: env.AWS_S3_ENDPOINT } : {}),
        forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
      });
    }
    return this.client;
  }

  private get bucket(): string {
    return env.AWS_S3_BUCKET;
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    if (env.AWS_S3_ENDPOINT) {
      const base = env.AWS_S3_ENDPOINT.replace(/\/+$/, '');
      return env.AWS_S3_FORCE_PATH_STYLE
        ? `${base}/${this.bucket}/${key}`
        : `${base}/${key}`;
    }
    return `https://${this.bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
  }

  /**
   * `purpose` is accepted for parity with the local driver but is not signed into the
   * URL. A presigned PUT can only pin an exact `Content-Length`, not a ceiling, and the
   * browser does not know the exact size until the file is chosen — so the size and
   * media-type limits for this driver are enforced where the upload is *recorded*,
   * which re-reads the object and re-sniffs its magic bytes before any row is written.
   */
  async createUploadTarget({
    key,
    contentType,
    expiresInSeconds = 900,
    purpose = 'scan-image',
  }: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
    purpose?: UploadPurpose;
  }): Promise<UploadTarget> {
    assertSafeKey(key);
    void purpose;
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );

    return {
      driver: this.name,
      key,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      // Reads still funnel through the app so bucket policy can stay private.
      publicUrl: `/api/files/${key}`,
      expiresInSeconds,
    };
  }

  async putObject({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredObject> {
    assertSafeKey(key);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, url: `/api/files/${key}` };
  }

  async getObject(key: string): Promise<ObjectBytes> {
    assertSafeKey(key);
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`S3 object has no body: ${key}`);

    const bytes = await result.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType ?? contentTypeForKey(key),
    };
  }

  async objectExists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return (head.ContentLength ?? 0) > 0;
    } catch {
      // 404 / 403 both mean "not usable by us".
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    assertSafeKey(key);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const s3Storage = new S3StorageDriver();
