/**
 * lib/sag/write/sanitizer.ts
 *
 * Shared log sanitizer for the SAG write layer.
 * Ensures tokens, NITs, passwords, addresses, and other PII
 * never appear in structured logs or observability events.
 *
 * Sprint: AGENTIK-ORDERS-SAG-WRITE-ADAPTER-01
 */

const SENSITIVE_KEYS = new Set([
  "token",
  "a_s_token",
  "password",
  "secret",
  "credential",
  "authorization",
  "cookie",
  "apiKey",
  "api_key",
]);

const PII_KEYS = new Set([
  "nit",
  "customerNit",
  "customerCode",
  "sellerNit",
  "NIT",
  "NIT_VENDEDOR",
  "direccion",
  "address",
  "customerAddress",
  "DIRECCION",
  "customerName",
  "sellerName",
  "NOMBRE",
  "VENDEDOR",
]);

function maskValue(key: string, value: unknown): unknown {
  if (value == null) return value;
  const lower = key.toLowerCase();

  if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(lower)) {
    return "***REDACTED***";
  }

  if (PII_KEYS.has(key)) {
    const s = String(value);
    if (s.length <= 3) return "***";
    return s.slice(0, 2) + "*".repeat(Math.min(s.length - 2, 10));
  }

  return value;
}

export interface SanitizedLogEntry {
  ts: string;
  module: string;
  event: string;
  [key: string]: unknown;
}

/**
 * Build a sanitized structured log entry.
 * Sensitive values are redacted. PII values are masked.
 * Returns a plain object safe for JSON.stringify.
 */
export function sanitizeLogEntry(
  module: string,
  event: string,
  data: Record<string, unknown>,
): SanitizedLogEntry {
  const sanitized: SanitizedLogEntry = {
    ts: new Date().toISOString(),
    module,
    event,
  };

  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = maskValue(key, value);
  }

  return sanitized;
}

/**
 * Emit a sanitized structured log line.
 */
export function sagWriteLog(
  module: string,
  event: string,
  data: Record<string, unknown>,
): void {
  const entry = sanitizeLogEntry(module, event, data);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

/**
 * Sanitize a URL to only show host, stripping path, query, and credentials.
 */
export function sanitizeEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return "***INVALID_URL***";
  }
}

/**
 * Strip SOAP envelope contents to only show structure, no values.
 * Returns payload byte size without exposing content.
 */
export function safePayloadMetrics(xml: string): { bytes: number; lineCount: number } {
  return {
    bytes: Buffer.byteLength(xml, "utf-8"),
    lineCount: (xml.match(/<ITEM>/g) || []).length,
  };
}
