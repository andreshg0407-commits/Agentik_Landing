/**
 * pkcs12-parser.ts
 *
 * AGENTIK-DIAN-SECURITY-01
 * DIAN Integration Layer — PKCS#12 Certificate Parser
 *
 * Parses a PKCS#12 (.p12/.pfx) certificate file using node-forge.
 *
 * Extracts:
 *   - Private key in PEM format (for RSA-SHA256 signing)
 *   - Certificate in DER format (for BinarySecurityToken in WSSE)
 *   - Certificate in PEM format (optional, for reference)
 *   - Common name from Subject (CN)
 *   - Valid-from and valid-until dates (for expiry monitoring)
 *
 * Supports:
 *   - PKCS#8 shrouded key bags (pkcs8ShroudedKeyBag) — most common in DIAN certs
 *   - PKCS#1 key bags (keyBag) — fallback for older P12 structures
 *   - Optional alias selection when the keystore has multiple cert/key pairs
 *
 * After parsing:
 *   - Private key is used by xml-signer.ts for RSA-SHA256 signing
 *   - DER cert is embedded as the BinarySecurityToken value
 *   - commonName + validUntil populate TenantCertificateRef fields
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: The parsed private key is memory-only and must never be logged.
 * IMPORTANT: certPassword is used transiently and must never be stored.
 */

import * as forge from "node-forge";
import { DianCertificateError } from "./certificate-manager";

// ── Parsed output ─────────────────────────────────────────────────────────────

/**
 * Parsed certificate material extracted from a PKCS#12 file.
 *
 * All values are runtime-only — never persist or serialize.
 */
export interface ParsedPkcs12 {
  /** RSA private key in PEM format. Runtime only — never log. */
  privateKeyPem: string;
  /** Certificate in DER (binary) format — used as BinarySecurityToken value. */
  certDer:       Buffer;
  /** Certificate in PEM format (for reference / debugging). */
  certPem:       string;
  /** Subject Common Name from the certificate. Null if not present. */
  commonName:    string | null;
  /** Certificate validity start date. */
  validFrom:     Date | null;
  /** Certificate expiry date. Used for expiry monitoring. */
  validUntil:    Date | null;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a PKCS#12 binary buffer and extract signing material.
 *
 * @param buffer    Raw bytes from the .p12 file (loaded via CertificateVault)
 * @param password  PKCS#12 keystore password (from vault — never hardcoded)
 * @param alias     Optional keystore alias to select specific cert/key pair
 *
 * @throws DianCertificateError on wrong password, corrupt P12, or missing material
 */
export function parsePkcs12(
  buffer:   Buffer,
  password: string,
  alias?:   string,
): ParsedPkcs12 {
  // node-forge requires a binary string, not a Buffer
  const binaryString = buffer.toString("binary");
  const p12Der       = forge.util.createBuffer(binaryString);

  let p12Asn1: forge.asn1.Asn1;
  try {
    p12Asn1 = forge.asn1.fromDer(p12Der);
  } catch (err) {
    throw new DianCertificateError(
      "Failed to parse PKCS#12 ASN.1 structure — file may be corrupt or not a valid .p12. " +
      `Reason: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (err) {
    // Most common cause: wrong password
    throw new DianCertificateError(
      "Failed to decrypt PKCS#12 — wrong password or unsupported cipher. " +
      `Reason: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  // ── Extract private key ────────────────────────────────────────────────────

  const privateKeyPem = extractPrivateKey(p12);

  // ── Extract certificate ────────────────────────────────────────────────────

  const cert = extractCertificate(p12, alias);

  // ── Convert cert to DER and PEM ───────────────────────────────────────────

  const certAsn1          = forge.pki.certificateToAsn1(cert);
  const certDerBinaryStr  = forge.asn1.toDer(certAsn1).getBytes();
  const certDer           = Buffer.from(certDerBinaryStr, "binary");
  const certPem           = forge.pki.certificateToPem(cert);

  // ── Extract metadata ───────────────────────────────────────────────────────

  const cnField     = cert.subject.getField({ name: "commonName" });
  const commonName  = cnField?.value ? String(cnField.value) : null;
  const validFrom   = toDate(cert.validity.notBefore);
  const validUntil  = toDate(cert.validity.notAfter);

  return { privateKeyPem, certDer, certPem, commonName, validFrom, validUntil };
}

// ── Private key extractor ─────────────────────────────────────────────────────

function extractPrivateKey(p12: forge.pkcs12.Pkcs12Pfx): string {
  // Try PKCS#8 shrouded key bag (most common)
  const shroudedBags = p12.getBags({
    bagType: forge.pki.oids["pkcs8ShroudedKeyBag"],
  });
  const shroudedBag = shroudedBags[forge.pki.oids["pkcs8ShroudedKeyBag"]]?.[0];

  if (shroudedBag?.key) {
    return forge.pki.privateKeyToPem(shroudedBag.key as forge.pki.rsa.PrivateKey);
  }

  // Fallback: PKCS#1 key bag
  const keyBags    = p12.getBags({ bagType: forge.pki.oids["keyBag"] });
  const keyBag     = keyBags[forge.pki.oids["keyBag"]]?.[0];

  if (keyBag?.key) {
    return forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey);
  }

  throw new DianCertificateError(
    "No private key found in PKCS#12 keystore. " +
    "Expected a pkcs8ShroudedKeyBag or keyBag entry. " +
    "Verify the .p12 file was exported with the private key included.",
  );
}

// ── Certificate extractor ─────────────────────────────────────────────────────

function extractCertificate(
  p12:    forge.pkcs12.Pkcs12Pfx,
  alias?: string,
): forge.pki.Certificate {
  const certBags    = p12.getBags({ bagType: forge.pki.oids["certBag"] });
  const allCertBags = certBags[forge.pki.oids["certBag"]] ?? [];

  if (allCertBags.length === 0) {
    throw new DianCertificateError(
      "No certificate found in PKCS#12 keystore. " +
      "Verify the .p12 file was exported with the certificate chain.",
    );
  }

  // If alias provided and multiple certs, try to match by friendlyName
  if (alias && allCertBags.length > 1) {
    const matching = allCertBags.find(bag => {
      const friendlyName = bag.attributes?.["friendlyName"];
      return Array.isArray(friendlyName)
        ? friendlyName.some(n => String(n) === alias)
        : String(friendlyName) === alias;
    });
    if (matching?.cert) return matching.cert;

    // Log warning but continue with first cert
    process.stderr.write(
      `[DIAN PKCS12] Alias "${alias}" not found in keystore — using first certificate.\n`,
    );
  }

  const cert = allCertBags[0]?.cert;
  if (!cert) {
    throw new DianCertificateError("Certificate bag is malformed — cert field is null.");
  }

  return cert;
}

// ── Date conversion ───────────────────────────────────────────────────────────

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  try {
    const d = new Date(value as string | number);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
