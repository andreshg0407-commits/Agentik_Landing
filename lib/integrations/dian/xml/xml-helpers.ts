/**
 * xml-helpers.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — XML Utilities
 *
 * Safe, namespace-aware XML utilities for DIAN response processing.
 *
 * Security principles:
 * - No innerHTML, no eval, no DOM manipulation
 * - All inputs treated as untrusted external data
 * - Text extraction via controlled regex on leaf elements only
 * - XML output always escaped via escapeXml()
 * - No entity expansion (no XEE vulnerability surface)
 *
 * Scope: leaf element text extraction + SOAP fault detection.
 * Complex nested document parsing is out of scope for FOUNDATION-01.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

// ── Safe text extraction ──────────────────────────────────────────────────────

/**
 * Extract the text content of a named XML element from a raw XML string.
 *
 * Handles both namespace-prefixed and unnamespaced elements:
 *   <b:NombreRazonSocial>Empresa</b:NombreRazonSocial>
 *   <NombreRazonSocial>Empresa</NombreRazonSocial>
 *
 * Intended for simple leaf elements (no nested children).
 * Returns null if element is absent, empty, or self-closing.
 */
export function extractXmlTextContent(
  xml:       string,
  localName: string,
): string | null {
  const safeLocalName = escapeRegex(localName);
  // Match both "prefix:LocalName" and bare "LocalName"
  const pattern = new RegExp(
    `<(?:[a-zA-Z][a-zA-Z0-9]*:)?${safeLocalName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z][a-zA-Z0-9]*:)?${safeLocalName}>`,
    "i",
  );
  const match = pattern.exec(xml);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return null;
  return unescapeXml(raw);
}

/**
 * Extract all occurrences of a named element's text content.
 * Returns values in document order.
 */
export function extractXmlTextContentAll(
  xml:       string,
  localName: string,
): string[] {
  const safeLocalName = escapeRegex(localName);
  const pattern = new RegExp(
    `<(?:[a-zA-Z][a-zA-Z0-9]*:)?${safeLocalName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z][a-zA-Z0-9]*:)?${safeLocalName}>`,
    "gi",
  );
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const raw = match[1].trim();
    if (raw) results.push(unescapeXml(raw));
  }
  return results;
}

// ── SOAP Fault extraction ─────────────────────────────────────────────────────

export interface SoapFault {
  code:   string | null;
  reason: string | null;
  detail: string | null;
}

/**
 * Extract a SOAP Fault from a SOAP response XML string.
 *
 * Handles SOAP 1.2 (<soap:Fault><Code><Value> / <Reason><Text>)
 * and SOAP 1.1 (<faultcode> / <faultstring>) structures.
 *
 * Returns null if no fault element is found.
 */
export function extractSoapFault(xml: string): SoapFault | null {
  if (!xml.includes("Fault")) return null;

  // SOAP 1.2 fault
  const code12   = extractXmlTextContent(xml, "Value");
  const reason12 = extractXmlTextContent(xml, "Text");

  // SOAP 1.1 fault (fallback)
  const code11   = extractXmlTextContent(xml, "faultcode");
  const reason11 = extractXmlTextContent(xml, "faultstring");

  const code   = code12   ?? code11;
  const reason = reason12 ?? reason11;
  const detail = extractXmlTextContent(xml, "Detail") ??
                 extractXmlTextContent(xml, "detail");

  if (!code && !reason) return null;

  return { code, reason, detail };
}

// ── Structural validation ─────────────────────────────────────────────────────

/**
 * Basic structural check: is this string XML?
 * Not a full parser — used for quick rejection of non-XML responses
 * (e.g. HTML error pages, plain text).
 */
export function isWellFormedXml(xml: string): boolean {
  if (!xml || typeof xml !== "string") return false;
  const trimmed = xml.trim();
  if (!trimmed.startsWith("<")) return false;
  // Must have at least one closing tag
  return /<\/[a-zA-Z]/.test(trimmed);
}

/**
 * Check if a SOAP response indicates a successful operation.
 * Returns false when a Fault element is present or StatusCode is non-200.
 */
export function isSoapResponseSuccess(
  xml:        string,
  statusCode: string | null,
): boolean {
  if (!xml) return false;
  if (xml.includes(":Fault>") || xml.includes("<Fault>")) return false;
  if (statusCode !== null && statusCode !== "200") return false;
  return true;
}

// ── XML escape / unescape ─────────────────────────────────────────────────────

/** Unescape XML character entities in extracted text. */
export function unescapeXml(value: string): string {
  return value
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Escape XML special characters (safe for embedding values in XML output). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;");
}

/** Escape a string literal for use inside a RegExp pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
