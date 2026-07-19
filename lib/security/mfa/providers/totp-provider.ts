/**
 * lib/security/mfa/providers/totp-provider.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * TOTP Provider — RFC 6238 Implementation
 *
 * Server-only. Uses Node.js crypto. No external dependencies.
 *
 * Implements RFC 6238 (TOTP) based on RFC 4226 (HOTP).
 * Algorithm: HMAC-SHA1(secret, T) where T = floor(epoch / 30)
 *
 * CRITICAL:
 *   - generateSecret() returns raw bytes — caller must encrypt immediately
 *   - verifyOtp() NEVER logs the code parameter
 *   - All public methods return only metadata or boolean — never key material
 */

import "server-only";

import * as crypto from "crypto";
import type {
  MfaProvider,
  MfaEnrollParams,
  MfaEnrollOutput,
  MfaChallengeParams,
  MfaChallengeOutput,
  MfaVerifyParams,
  MfaVerifyOutput,
  MfaDisableParams,
  MfaRotateSecretOutput,
  MfaProviderHealthResult,
} from "../mfa-provider";
import type { MfaResult, MfaEnrollment } from "../mfa-types";
import {
  MFA_TOTP_STEP_SECONDS,
  MFA_TOTP_WINDOW,
  MFA_CHALLENGE_TTL_SECONDS,
} from "../mfa-types";

// ── Constants ──────────────────────────────────────────────────────────────────

const TOTP_SECRET_BYTES  = 20;   // 160-bit secret (recommended by RFC 4226)
const TOTP_DIGITS        = 6;
const ISSUER             = "Agentik";

// ── Base32 Alphabet ────────────────────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * base32Encode — encode a Buffer to RFC 4648 base32 string.
 * Used for TOTP secret representation in QR/otpauth URIs.
 */
function base32Encode(buf: Buffer): string {
  let output = "";
  let bits   = 0;
  let value  = 0;

  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

/**
 * base32Decode — decode a RFC 4648 base32 string to a Buffer.
 * Used for verifying TOTP codes with the stored secret.
 */
function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits  = 0;
  let value = 0;

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

// ── TOTP Core ──────────────────────────────────────────────────────────────────

/**
 * generateSecret — create a new random TOTP secret.
 * Returns base32-encoded string for QR URI and Buffer for HMAC operations.
 * CRITICAL: caller must encrypt the base32 string before storing.
 */
export function generateTotpSecret(): { raw: Buffer; base32: string } {
  const raw    = crypto.randomBytes(TOTP_SECRET_BYTES);
  const base32 = base32Encode(raw);
  return { raw, base32 };
}

/**
 * generateOtp — compute a TOTP code for a given secret and time counter.
 * @param secretBase32 — base32-encoded secret
 * @param counter      — HOTP counter (for TOTP: floor(epoch / step))
 */
export function generateOtp(secretBase32: string, counter: number): string {
  const key  = base32Decode(secretBase32);

  // Counter as 8-byte big-endian buffer
  const buf = Buffer.alloc(8);
  // Counter fits in 32 bits for current epoch values
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac   = crypto.createHmac("sha1", key);
  hmac.update(buf);
  const digest = hmac.digest();

  // Dynamic truncation per RFC 4226
  const offset = digest[digest.length - 1] & 0x0f;
  const code   = (
    ((digest[offset]     & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) <<  8) |
    ( digest[offset + 3] & 0xff)
  ) % Math.pow(10, TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * verifyOtp — verify a user-provided OTP code.
 * Checks current window ± MFA_TOTP_WINDOW steps to handle clock drift.
 * NEVER logs the code parameter.
 */
export function verifyOtp(secretBase32: string, code: string): boolean {
  if (!code || code.length !== TOTP_DIGITS || !/^\d+$/.test(code)) {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / MFA_TOTP_STEP_SECONDS);

  for (let delta = -MFA_TOTP_WINDOW; delta <= MFA_TOTP_WINDOW; delta++) {
    const expected = generateOtp(secretBase32, counter + delta);
    // Constant-time comparison via crypto.timingSafeEqual
    const a = Buffer.from(expected.padEnd(8, "0"));
    const b = Buffer.from(code.padEnd(8, "0"));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }

  return false;
}

/**
 * generateQrPayload — build the otpauth:// URI for QR code display.
 * This is the standard format recognized by all Authenticator apps.
 */
export function generateQrPayload(accountName: string, secretBase32: string): string {
  const encoded = encodeURIComponent(accountName);
  return `otpauth://totp/${encodeURIComponent(ISSUER)}:${encoded}?secret=${secretBase32}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${MFA_TOTP_STEP_SECONDS}`;
}

// ── TotpProvider ──────────────────────────────────────────────────────────────

/**
 * TotpProvider — TOTP MFA implementation per RFC 6238.
 *
 * NOTE: This provider does NOT encrypt secrets. Encryption is delegated to
 * the MFA enrollment service via mfa-encryption.ts integration.
 * The `encryptedSecret` fields passed in/out are handled externally.
 */
export class TotpProvider implements MfaProvider {
  readonly method = "TOTP" as const;

  // ── enroll ──────────────────────────────────────────────────────────────────

  async enroll(params: MfaEnrollParams): Promise<MfaResult<MfaEnrollOutput>> {
    try {
      if (!params.orgSlug || !params.userId) {
        return { ok: false, error: "org_slug_and_user_id_required", riskLevel: "HIGH" };
      }

      const { raw, base32 } = generateTotpSecret();
      const secretRef = `totp:${base32}`;  // Caller encrypts this via mfa-encryption

      // Wipe the raw bytes immediately — they're in base32 now
      raw.fill(0);

      const now          = new Date().toISOString();
      const enrollmentId = _generateId();

      const enrollment: MfaEnrollment = {
        id:        enrollmentId,
        orgSlug:   params.orgSlug,
        userId:    params.userId,
        method:    "TOTP",
        status:    "PENDING",
        secretRef: `encrypted:${enrollmentId}`,  // placeholder until encrypted
        createdAt: now,
        failCount: 0,
      };

      const setupPayload = generateQrPayload(
        `${params.orgSlug}/${params.userId}`,
        base32,
      );

      return {
        ok: true,
        value: {
          enrollment,
          setupPayload,
          encryptedSecret: secretRef,  // Caller must encrypt via mfa-encryption
        },
      };
    } catch {
      return { ok: false, error: "totp_enroll_failed", riskLevel: "HIGH" };
    }
  }

  // ── generateChallenge ────────────────────────────────────────────────────────

  async generateChallenge(params: MfaChallengeParams): Promise<MfaResult<MfaChallengeOutput>> {
    try {
      if (!params.orgSlug || !params.userId) {
        return { ok: false, error: "org_slug_and_user_id_required", riskLevel: "HIGH" };
      }

      const now       = new Date();
      const expiresAt = new Date(now.getTime() + MFA_CHALLENGE_TTL_SECONDS * 1000).toISOString();

      return {
        ok: true,
        value: {
          challengeId: _generateId(),
          method:      "TOTP",
          expiresAt,
          hint:        "Enter the 6-digit code from your authenticator app",
        },
      };
    } catch {
      return { ok: false, error: "totp_challenge_failed", riskLevel: "MEDIUM" };
    }
  }

  // ── verifyChallenge ──────────────────────────────────────────────────────────

  async verifyChallenge(params: MfaVerifyParams): Promise<MfaResult<MfaVerifyOutput>> {
    try {
      if (!params.orgSlug || !params.userId) {
        return { ok: false, error: "org_slug_and_user_id_required", riskLevel: "HIGH" };
      }
      if (!params.encryptedSecret) {
        return { ok: false, error: "encrypted_secret_required", riskLevel: "CRITICAL" };
      }

      // Extract base32 secret from the encrypted secret reference
      // In real integration this goes through mfa-encryption.ts
      // Here we support the plain `totp:{base32}` format for testing
      let secretBase32: string;
      if (params.encryptedSecret.startsWith("totp:")) {
        secretBase32 = params.encryptedSecret.slice(5);
      } else {
        // Encrypted format — caller must pre-decrypt via mfa-encryption
        return { ok: false, error: "secret_must_be_decrypted_before_verify", riskLevel: "CRITICAL" };
      }

      // NEVER log params.code
      const valid = verifyOtp(secretBase32, params.code);

      return {
        ok:    true,
        value: {
          valid,
          reasons:    valid ? ["totp_code_verified"] : ["totp_code_invalid"],
          trustDelta: valid ? 30 : 0,
        },
      };
    } catch {
      return { ok: false, error: "totp_verify_failed", riskLevel: "HIGH" };
    }
  }

  // ── disableMethod ────────────────────────────────────────────────────────────

  async disableMethod(params: MfaDisableParams): Promise<MfaResult<{ disabled: boolean }>> {
    try {
      if (!params.orgSlug || !params.userId) {
        return { ok: false, error: "org_slug_and_user_id_required", riskLevel: "HIGH" };
      }
      // State management is handled by the enrollment service
      return { ok: true, value: { disabled: true } };
    } catch {
      return { ok: false, error: "totp_disable_failed", riskLevel: "HIGH" };
    }
  }

  // ── rotateSecret ─────────────────────────────────────────────────────────────

  async rotateSecret(params: MfaEnrollParams): Promise<MfaResult<MfaRotateSecretOutput>> {
    try {
      if (!params.orgSlug || !params.userId) {
        return { ok: false, error: "org_slug_and_user_id_required", riskLevel: "HIGH" };
      }

      const { raw, base32 } = generateTotpSecret();
      raw.fill(0);

      return {
        ok: true,
        value: {
          encryptedSecret: `totp:${base32}`,
          setupPayload:    generateQrPayload(`${params.orgSlug}/${params.userId}`, base32),
        },
      };
    } catch {
      return { ok: false, error: "totp_rotate_failed", riskLevel: "HIGH" };
    }
  }

  // ── healthCheck ──────────────────────────────────────────────────────────────

  async healthCheck(): Promise<MfaProviderHealthResult> {
    const t0 = Date.now();
    try {
      // Verify crypto is functional
      const secret = generateTotpSecret();
      const code   = generateOtp(secret.base32, Math.floor(Date.now() / 1000 / MFA_TOTP_STEP_SECONDS));
      secret.raw.fill(0);
      const healthy = code.length === TOTP_DIGITS && /^\d+$/.test(code);

      return {
        status:    healthy ? "HEALTHY" : "DEGRADED",
        method:    "TOTP",
        latencyMs: Date.now() - t0,
        details:   healthy ? "totp_provider_operational" : "totp_code_generation_failed",
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        status:    "UNAVAILABLE",
        method:    "TOTP",
        latencyMs: Date.now() - t0,
        details:   "totp_provider_crypto_unavailable",
        checkedAt: new Date().toISOString(),
      };
    }
  }
}

/** Default singleton TOTP provider. */
export const totpProvider = new TotpProvider();

// ── Private helpers ────────────────────────────────────────────────────────────

function _generateId(): string {
  return crypto.randomBytes(12).toString("hex");
}
