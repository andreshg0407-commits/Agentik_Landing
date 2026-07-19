/**
 * lib/security/mfa/recovery-codes.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * Recovery Codes — Emergency Single-Use Codes
 *
 * Server-only. Uses Node.js crypto.
 *
 * CRITICAL:
 *   - Recovery codes are NEVER stored in plaintext
 *   - Only bcrypt-equivalent hashes (using crypto.scrypt) are persisted
 *   - Plain codes are shown to the user ONCE at generation time, then discarded
 *   - Codes are single-use — mark as used immediately after verification
 *   - NEVER log code values
 */

import "server-only";

import * as crypto from "crypto";
import {
  MFA_RECOVERY_CODE_COUNT,
  MFA_RECOVERY_CODE_LENGTH,
} from "./mfa-types";

// ── Constants ──────────────────────────────────────────────────────────────────

/** scrypt parameters — memory-hard hash for recovery codes. */
const SCRYPT_N       = 16384;
const SCRYPT_R       = 8;
const SCRYPT_P       = 1;
const SCRYPT_KEYLEN  = 32;
const SALT_BYTES     = 16;

/** Character set for recovery code generation (unambiguous alphanumeric). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ── Code Generation ────────────────────────────────────────────────────────────

/**
 * generateRecoveryCodes — produce a set of single-use recovery codes.
 *
 * Returns plain codes to show the user ONCE.
 * Caller must immediately hash and store. Never store the plain codes.
 *
 * @returns Array of plain-text codes (length = MFA_RECOVERY_CODE_COUNT)
 */
export function generateRecoveryCodes(
  count: number = MFA_RECOVERY_CODE_COUNT,
): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    codes.push(_generateCode(MFA_RECOVERY_CODE_LENGTH));
  }

  return codes;
}

/**
 * hashRecoveryCode — produce a salted scrypt hash of a recovery code.
 *
 * Format: `scrypt:${saltHex}:${hashHex}`
 * NEVER log the input code.
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const salt    = crypto.randomBytes(SALT_BYTES);
  const saltHex = salt.toString("hex");
  const hashBuf = await _scrypt(code, salt);
  const hashHex = hashBuf.toString("hex");
  return `scrypt:${saltHex}:${hashHex}`;
}

/**
 * verifyRecoveryCode — check a plain code against a stored hash.
 *
 * Timing-safe comparison. NEVER logs the code.
 * Returns true if the code matches, false otherwise.
 */
export async function verifyRecoveryCode(code: string, storedHash: string): Promise<boolean> {
  try {
    if (!storedHash.startsWith("scrypt:")) return false;

    const parts = storedHash.split(":");
    if (parts.length !== 3) return false;

    const [, saltHex, expectedHex] = parts;
    const salt     = Buffer.from(saltHex, "hex");
    const hashBuf  = await _scrypt(code, salt);
    const expected = Buffer.from(expectedHex, "hex");

    if (hashBuf.length !== expected.length) return false;
    return crypto.timingSafeEqual(hashBuf, expected);
  } catch {
    return false;
  }
}

/**
 * hashAllRecoveryCodes — hash a batch of recovery codes in parallel.
 * Returns stored hashes in the same order.
 * NEVER stores plain codes.
 */
export async function hashAllRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(c => hashRecoveryCode(c)));
}

// ── Private helpers ────────────────────────────────────────────────────────────

/** Generate a random code from CODE_ALPHABET with dashes for readability. */
function _generateCode(length: number): string {
  const bytes  = crypto.randomBytes(length * 2);  // over-generate for rejection sampling
  let result   = "";
  let i        = 0;

  while (result.length < length && i < bytes.length) {
    const val = bytes[i++];
    if (val < 256 - (256 % CODE_ALPHABET.length)) {
      result += CODE_ALPHABET[val % CODE_ALPHABET.length];
    }
  }

  // Fallback if rejection sampling didn't produce enough
  while (result.length < length) {
    const extra = crypto.randomBytes(1)[0];
    result += CODE_ALPHABET[extra % CODE_ALPHABET.length];
  }

  // Format: XXXX-XXXX-XXXX for length-12 codes
  const half = Math.floor(length / 3);
  return [
    result.slice(0, half),
    result.slice(half, half * 2),
    result.slice(half * 2),
  ].join("-");
}

/** Promisified scrypt wrapper. */
function _scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
}
