// Imported from jose's JWS submodules rather than the package root. The root
// re-exports the JWE decrypt path, which pulls in DecompressionStream — a Node API
// unavailable in the Edge runtime the middleware runs on. We only ever sign and
// verify JWS, so importing narrowly keeps the middleware bundle Edge-clean.
import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';

import { env, isProduction, requireJwtSecret } from '@/lib/env';

export type AppRole = 'OFFICER' | 'ADMIN';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
}

export interface SessionPayload extends SessionUser {
  iat?: number;
  exp?: number;
}

export const SESSION_COOKIE = 'lm_session';

const ISSUER = 'legal-metrology-compliance-checker';
const AUDIENCE = 'lm-web';

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireJwtSecret());
}

/**
 * `jose` is used instead of `jsonwebtoken` because it runs on the Edge runtime,
 * which lets Next middleware verify the session without a Node runtime opt-out.
 */
export async function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (!payload.sub || typeof payload.email !== 'string' || typeof payload.name !== 'string') {
      return null;
    }
    if (payload.role !== 'OFFICER' && payload.role !== 'ADMIN') return null;

    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    // Expired, tampered, or signed with a rotated secret — all mean "no session".
    return null;
  }
}

/** Cookie options shared by the login and logout routes. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Translates `JWT_EXPIRES_IN` ("8h", "45m", "7d", "3600") into seconds. */
export function sessionMaxAgeSeconds(): number {
  const raw = env.JWT_EXPIRES_IN.trim();
  const match = /^(\d+)\s*([smhd])?$/i.exec(raw);
  if (!match) return 8 * 60 * 60;

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplier = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  return amount * multiplier;
}
