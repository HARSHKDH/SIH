import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '@/lib/env';

import { assertSafeKey } from './keys';
import { signUploadToken } from './signing';
import {
  contentTypeForKey,
  type ObjectBytes,
  type StorageDriver,
  type StoredObject,
  type UploadPurpose,
  type UploadTarget,
} from './types';

/**
 * Local-disk storage driver — the fallback used when S3 credentials are absent.
 *
 * Objects land under LOCAL_STORAGE_PATH, are written through a signed PUT at
 * /api/uploads/local, and are read back through /api/files/<key>. Nothing in the
 * storage root is served by the static file server, so access still passes
 * through the authenticated route handler.
 */
class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  private get root(): string {
    return path.resolve(process.cwd(), env.LOCAL_STORAGE_PATH);
  }

  /** Resolves a key to an absolute path, refusing anything outside the root. */
  private resolve(key: string): string {
    assertSafeKey(key);
    const root = this.root;
    const target = path.resolve(root, key);
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (target !== root && !target.startsWith(rootWithSep)) {
      throw new Error(`Refusing to touch a path outside the storage root: ${key}`);
    }
    return target;
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `/api/files/${key}`;
  }

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
    // userId is stamped by the caller through the route; the token only needs to
    // bind key, content type and purpose, so a placeholder subject is fine here.
    const token = await signUploadToken(
      { key, contentType, userId: 'upload', purpose },
      expiresInSeconds,
    );

    return {
      driver: this.name,
      key,
      uploadUrl: `/api/uploads/local?token=${encodeURIComponent(token)}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      publicUrl: this.publicUrl(key),
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
    void contentType; // Content type is derived from the extension on read.
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, url: this.publicUrl(key) };
  }

  async getObject(key: string): Promise<ObjectBytes> {
    const target = this.resolve(key);
    const body = await readFile(target);
    return { body, contentType: contentTypeForKey(key) };
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      const info = await stat(this.resolve(key));
      return info.isFile() && info.size > 0;
    } catch {
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const target = this.resolve(key);
    await rm(target, { force: true });
  }
}

export const localStorage = new LocalStorageDriver();
