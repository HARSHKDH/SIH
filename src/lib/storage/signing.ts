import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';

import { requireJwtSecret } from '@/lib/env';

import type { UploadPurpose } from './types';

/**
 * The local-disk driver mimics an S3 presigned PUT: instead of letting any
 * authenticated caller write to any key, we hand out a short-lived signed token
 * that pins one key and one content type. The upload route refuses anything else.
 *
 * Keeping the semantics identical between drivers means the frontend upload code
 * is written once and the S3 swap is a config change, not a rewrite.
 */

const UPLOAD_AUDIENCE = 'lm-upload';
const ISSUER = 'legal-metrology-compliance-checker';

export interface UploadGrant {
  key: string;
  contentType: string;
  userId: string;
  /**
   * What the grant may be spent on. Signed rather than passed as a query parameter
   * because it selects the size cap and the accepted media types — a caller who could
   * change it at will could upload a 15 MB label photograph past the 12 MB image cap.
   */
  purpose: UploadPurpose;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireJwtSecret());
}

export async function signUploadToken(grant: UploadGrant, expiresInSeconds: number): Promise<string> {
  return new SignJWT({ key: grant.key, contentType: grant.contentType, purpose: grant.purpose })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(grant.userId)
    .setIssuer(ISSUER)
    .setAudience(UPLOAD_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(secretKey());
}

export async function verifyUploadToken(token: string): Promise<UploadGrant | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: UPLOAD_AUDIENCE,
    });
    if (typeof payload.key !== 'string' || typeof payload.contentType !== 'string') return null;
    if (!payload.sub) return null;
    // An unrecognised purpose is treated as absent rather than accepted, so a token
    // can never widen its own limits by naming a purpose this build does not know.
    const purpose: UploadPurpose = payload.purpose === 'attachment' ? 'attachment' : 'scan-image';
    return { key: payload.key, contentType: payload.contentType, userId: payload.sub, purpose };
  } catch {
    return null;
  }
}
