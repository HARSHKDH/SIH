import bcrypt from 'bcryptjs';

/**
 * bcryptjs is a pure-JS implementation, chosen over native `bcrypt` so the
 * project installs cleanly on Windows/macOS/Linux with no build toolchain.
 */
const SALT_ROUNDS = 10;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/** Minimum policy for officer accounts created through the admin panel. */
export const PASSWORD_MIN_LENGTH = 8;
