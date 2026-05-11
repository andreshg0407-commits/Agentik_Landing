/**
 * certificate-manager.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — Certificate Management Architecture
 *
 * Manages PKCS#12 (.p12) certificate loading and validation for
 * WS-Security signing operations.
 *
 * Implementation status:
 * - Configuration validation:  COMPLETE
 * - File existence check:      COMPLETE
 * - Raw buffer loading:        COMPLETE
 * - PKCS#12 parsing:           PENDING (DIAN-SECURITY-01)
 *   Requires: node-forge or Node.js crypto with p12 support
 *   Provides: private key extraction, cert chain, commonName, validUntil
 *
 * Security policy:
 * - Certificate path from env only (DIAN_CERT_PATH)
 * - Password from env only (DIAN_CERT_PASSWORD) — injected from secret manager
 * - Loaded buffer in memory only — never persisted, never logged
 * - No certificate content in any log output
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { readFileSync, existsSync } from "node:fs";
import type {
  DianCertificate,
  DianCertificateConfig,
  CertificateValidationResult,
} from "../types/dian-types";
import { parsePkcs12 } from "./pkcs12-parser";
import type { ParsedPkcs12 } from "./pkcs12-parser";

// ── Certificate loader ────────────────────────────────────────────────────────

/**
 * Load a PKCS#12 certificate as a raw buffer from the filesystem.
 *
 * This is the only I/O operation in the certificate pipeline —
 * it reads bytes from disk and nothing else. No parsing, no decryption.
 *
 * Full PKCS#12 parsing (private key extraction, cert chain decoding,
 * commonName + validUntil) will be implemented in DIAN-SECURITY-01
 * using node-forge or equivalent.
 *
 * @throws {DianCertificateError} if file not found or unreadable.
 */
export function loadCertificateBuffer(config: DianCertificateConfig): Buffer {
  if (!existsSync(config.certPath)) {
    throw new DianCertificateError(
      `Certificate file not found at: ${config.certPath}. ` +
      "Verify DIAN_CERT_PATH is set to the correct absolute path.",
    );
  }

  try {
    return readFileSync(config.certPath);
  } catch (err) {
    throw new DianCertificateError(
      `Failed to read certificate file: ${config.certPath}. ` +
      `Reason: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}

/**
 * Validate certificate configuration before attempting to load.
 *
 * Checks path format, file existence, and password presence.
 * Does NOT read certificate content or validate the password.
 */
export function validateCertificateConfig(
  config: DianCertificateConfig,
): CertificateValidationResult {
  if (!config.certPath || !config.certPath.trim()) {
    return { valid: false, reason: "certPath is empty or missing" };
  }

  const hasValidExtension =
    config.certPath.endsWith(".p12") ||
    config.certPath.endsWith(".pfx");

  if (!hasValidExtension) {
    return {
      valid:  false,
      reason: `certPath must point to a .p12 or .pfx file, got: "${config.certPath}"`,
    };
  }

  if (!config.certPassword || !config.certPassword.trim()) {
    return {
      valid:  false,
      reason: "certPassword is empty — PKCS#12 certificate requires a password",
    };
  }

  if (!existsSync(config.certPath)) {
    return {
      valid:  false,
      reason: `Certificate file does not exist at: ${config.certPath}`,
    };
  }

  return { valid: true, reason: null };
}

/**
 * Validate that a loaded certificate has not expired.
 *
 * NOTE: In FOUNDATION-01, validUntil is always null because PKCS#12
 * parsing is not yet implemented. This passes as a safe no-op.
 * Full expiry validation will activate in DIAN-SECURITY-01.
 */
export function validateCertificateExpiry(
  cert: DianCertificate,
): CertificateValidationResult {
  if (!cert.validUntil) {
    // Expiry parsing not yet available — safe pass for foundation phase
    return { valid: true, reason: "Expiry not parsed (PKCS#12 parsing pending DIAN-SECURITY-01)" };
  }

  const now       = Date.now();
  const expiresIn = Math.floor((cert.validUntil.getTime() - now) / 86_400_000);

  if (expiresIn < 0) {
    return {
      valid:     false,
      reason:    `Certificate expired ${Math.abs(expiresIn)} days ago`,
      expiresIn,
    };
  }

  if (expiresIn < CERTIFICATE_SECURITY_POLICY.expiryWarningDays) {
    return {
      valid:     true,
      reason:    `Certificate expires in ${expiresIn} days — renewal recommended`,
      expiresIn,
    };
  }

  return { valid: true, reason: null, expiresIn };
}

/**
 * Build a DianCertificate from a raw buffer — stub version (no P12 parsing).
 *
 * Returns a DianCertificate with commonName and validUntil as null.
 * Use parseCertificateFromBuffer() for full metadata extraction.
 */
export function buildCertificateStub(
  config:    DianCertificateConfig,
  rawBuffer: Buffer,
): DianCertificate {
  return {
    config,
    rawBuffer,
    loadedAt:   new Date(),
    commonName: null,
    validUntil: null,
  };
}

/**
 * Parse a PKCS#12 certificate buffer and build a full DianCertificate.
 *
 * Populates commonName and validUntil from the X.509 certificate metadata.
 * The returned ParsedPkcs12 is also provided so the caller can use the
 * private key and DER cert for WS-Security signing.
 *
 * @returns { cert, parsed } — cert for DianClient state, parsed for signing
 * @throws DianCertificateError on parse failure (wrong password, corrupt P12)
 */
export function parseCertificateFromBuffer(
  config:    DianCertificateConfig,
  rawBuffer: Buffer,
): { cert: DianCertificate; parsed: ParsedPkcs12 } {
  const parsed = parsePkcs12(rawBuffer, config.certPassword, config.alias);

  const cert: DianCertificate = {
    config,
    rawBuffer,
    loadedAt:   new Date(),
    commonName: parsed.commonName,
    validUntil: parsed.validUntil,
  };

  return { cert, parsed };
}

// Re-export ParsedPkcs12 so callers import from one place
export type { ParsedPkcs12 } from "./pkcs12-parser";

// ── Certificate error ─────────────────────────────────────────────────────────

export class DianCertificateError extends Error {
  constructor(message: string) {
    super(`[DIAN Certificate] ${message}`);
    this.name = "DianCertificateError";
  }
}

// ── Security policy ───────────────────────────────────────────────────────────

/**
 * DIAN Certificate Security Policy
 *
 * 1. BACKEND ONLY
 *    All certificate operations are server-side exclusively.
 *    Certificate material never reaches the browser or client bundle.
 *
 * 2. PATH FROM ENV ONLY
 *    DIAN_CERT_PATH points to infrastructure-managed storage.
 *    The .p12 file must NOT be committed to version control.
 *
 * 3. PASSWORD FROM SECRET MANAGER
 *    DIAN_CERT_PASSWORD is injected from a secret manager at runtime.
 *    It is never stored in .env files committed to the repository.
 *
 * 4. MEMORY ONLY
 *    Loaded certificate buffers exist only during request handling.
 *    Never stored in the database, cache, or logs.
 *
 * 5. NO CONTENT LOGGING
 *    Certificate content, private keys, and passwords must never
 *    appear in application logs — at any log level.
 *
 * 6. EXPIRY MONITORING
 *    Certificates must be monitored for upcoming expiry.
 *    Warning threshold: 30 days before expiry.
 */
export const CERTIFICATE_SECURITY_POLICY = {
  backendOnly:          true,
  pathFromEnvOnly:      true,
  passwordFromEnvOnly:  true,
  neverPersistInDb:     true,
  neverLogContent:      true,
  expiryWarningDays:    30,
  expiryErrorDays:      0,
} as const;
