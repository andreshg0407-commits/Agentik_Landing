/**
 * ws-security.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — WS-Security Foundation
 *
 * Foundation constants, types, and builders for OASIS WS-Security
 * (WSS) operations required by DIAN web services.
 *
 * Implementation status:
 * - Constants and config defaults: COMPLETE
 * - Timestamp builder:            COMPLETE
 * - PKCS#12 key extraction:       PENDING (DIAN-SECURITY-01)
 * - RSA-SHA256 XML signing:       PENDING (DIAN-SECURITY-01)
 * - BinarySecurityToken XML:      PENDING (DIAN-SECURITY-01)
 *
 * DIAN WS-Security requirements (guide Section 2.6 + 2.7):
 *   Key Identifier Type:         Binary Security Token
 *   Signature Algorithm:         RSA-SHA256
 *   Signature Canonicalization:  Exclusive C14N
 *   Digest Algorithm:            SHA-256
 *   Use Single Certificate:      true
 *   Prepend Signature Element:   true
 *   Signed parts:                To (WS-Addressing, http://www.w3.org/2005/08/addressing)
 *   Timestamp TTL:               60,000ms
 *   Millisecond Precision:       true
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type {
  WsSecurityConfig,
  WsSecuritySignatureConfig,
  WssTimestampConfig,
  WssSignaturePart,
  DianCertificateConfig,
} from "../types/dian-types";
import { DIAN_NAMESPACES } from "../types/dian-types";

// ── DIAN-mandated WS-Addressing signature part ────────────────────────────────

/**
 * DIAN requires signing the wsa:To element.
 * Part config from guide Section 2.6 (Parts table).
 */
const DIAN_WSS_TO_PART: WssSignaturePart = {
  name:      "To",
  namespace: DIAN_NAMESPACES.WS_ADDRESSING,
  encode:    "Element",
};

// ── DIAN WS-Security config defaults ─────────────────────────────────────────

/**
 * Canonical WS-Security Signature configuration for DIAN.
 * These values are mandated by the DIAN guide and must not be changed.
 */
export const DIAN_WSS_SIGNATURE_CONFIG: WsSecuritySignatureConfig = {
  keyIdentifierType:         "BinarySecurityToken",
  signatureAlgorithm:        "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  signatureCanonicalization: "http://www.w3.org/2001/10/xml-exc-c14n#",
  digestAlgorithm:           "http://www.w3.org/2001/04/xmlenc#sha256",
  useSingleCertificate:      true,
  prependSignatureElement:   true,
  signatureParts:            [DIAN_WSS_TO_PART],
};

/**
 * Canonical WS-Security Timestamp configuration for DIAN.
 * TTL 60,000ms and millisecond precision per guide Section 2.7.
 */
export const DIAN_WSS_TIMESTAMP_CONFIG: WssTimestampConfig = {
  timeToLiveMs:         60_000, // 60 seconds as specified in DIAN guide
  millisecondPrecision: true,
};

// ── Config factory ────────────────────────────────────────────────────────────

/**
 * Build the complete WS-Security configuration for DIAN.
 * Uses all DIAN-mandated defaults — only the certificate is variable.
 *
 * @param name        Identifier for this configuration (e.g. "outgoing")
 * @param certificate Certificate config (certPath + certPassword from env)
 */
export function buildDianWsSecurityConfig(
  name:        string,
  certificate: DianCertificateConfig,
): WsSecurityConfig {
  return {
    name,
    signature:   { ...DIAN_WSS_SIGNATURE_CONFIG },
    timestamp:   { ...DIAN_WSS_TIMESTAMP_CONFIG },
    certificate,
  };
}

// ── Timestamp builder ─────────────────────────────────────────────────────────

/** Resolved WS-Security timestamp values. */
export interface WssTimestamp {
  /** XML id attribute for the Timestamp element. */
  id:      string;
  /** u:Created ISO value. */
  created: string;
  /** u:Expires ISO value. */
  expires: string;
}

/**
 * Build WS-Security timestamp values.
 *
 * DIAN requires millisecond precision and a 60-second validity window.
 * The timestamp is used in both the SOAP header XML and the signature.
 */
export function buildWssTimestamp(
  config: WssTimestampConfig = DIAN_WSS_TIMESTAMP_CONFIG,
): WssTimestamp {
  const created = new Date();
  const expires = new Date(created.getTime() + config.timeToLiveMs);

  const format = (d: Date): string =>
    config.millisecondPrecision
      ? d.toISOString()          // includes milliseconds: 2024-11-26T18:36:33.989Z
      : d.toISOString().slice(0, 19) + "Z"; // truncates to seconds

  return {
    id:      `_ts_${created.getTime()}`,
    created: format(created),
    expires: format(expires),
  };
}

// ── Security header structure types ──────────────────────────────────────────

/**
 * WS-Security header element structure (for XML generation planning).
 *
 * Represents the content of the <o:Security> header element.
 * In FOUNDATION-01: timestamp is populated, bst and signature are null.
 * DIAN-SECURITY-01 will populate bst and signature using node-forge.
 */
export interface WssSecurityHeader {
  namespace:  string;
  utilityNs:  string;
  timestamp:  WssTimestamp;
  /**
   * Binary Security Token (base64-encoded DER certificate).
   * PENDING: DIAN-SECURITY-01
   */
  bst:        WssBinarySecurityToken | null;
  /**
   * XML Signature element.
   * PENDING: DIAN-SECURITY-01
   */
  signature:  WssSignaturePlaceholder | null;
}

/** Binary Security Token structure for WSSE. */
export interface WssBinarySecurityToken {
  id:           string;
  valueType:    "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3";
  encodingType: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";
  /** Base64-encoded DER form of the public certificate (not the PKCS#12). */
  value:        string;
}

/** Typed placeholder — marks where XML Signature will be injected. */
export interface WssSignaturePlaceholder {
  readonly _pending: "XML Signature — implement in DIAN-SECURITY-01";
}

/**
 * Build a WS-Security header stub (timestamp only, no BST or Signature).
 * Safe for dry runs, config validation, and envelope structure testing.
 */
export function buildWssHeaderStub(
  config: WssTimestampConfig = DIAN_WSS_TIMESTAMP_CONFIG,
): WssSecurityHeader {
  return {
    namespace:  DIAN_NAMESPACES.WSS_SECEXT,
    utilityNs:  DIAN_NAMESPACES.WSS_UTILITY,
    timestamp:  buildWssTimestamp(config),
    bst:        null, // DIAN-SECURITY-01
    signature:  null, // DIAN-SECURITY-01
  };
}
