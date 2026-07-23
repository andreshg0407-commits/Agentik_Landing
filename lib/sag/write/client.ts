/**
 * lib/sag/write/client.ts
 *
 * Raw SOAP wrapper for SAG insercionSag().
 *
 * Mirrors the pattern in lib/connectors/pya/client.ts::consultaSagJson()
 * with the same SOAP namespace, same escaping, same fault-parsing —
 * only the operation name, action header, and parameters differ.
 *
 * insercionSag parameters:
 *   a_s_token  — auth token (same as read operations)
 *   a_n_tipo   — write type integer (1, 2, 3, 5, 6, 28)
 *   a_s_xml    — XML payload built by the xml-builders module
 *
 * SAG response: a plain string in insercionSagResult, e.g.:
 *   "OK"
 *   "OK: 900123456"
 *   "ERROR: NIT inválido"
 *   "FALLIDO: ..."
 *
 * This function is intentionally low-level — it does NOT touch the queue DB.
 * Call it only from executor.ts (after human approval).
 */

import type { PyaApiConfig }  from "@/lib/connectors/pya/types";
import type { SagWriteResponse, SagWriteType } from "./types";
import { sanitizeEndpoint, safePayloadMetrics } from "./sanitizer";

const SOAP_NS_ENV = "http://schemas.xmlsoap.org/soap/envelope/";
const SOAP_NS_TNS = "http://tempuri.org/";
const SOAP_ACTION = "http://tempuri.org/IServiceSagWeb/insercionSag";

const DEBUG = process.env.PYA_DEBUG === "true";

// ── SOAP envelope ─────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWriteEnvelope(
  token:   string,
  tipo:    SagWriteType,
  xmlData: string,
): string {
  // SAG expects the XML payload to be escaped inside the SOAP element
  const escToken = escapeXml(token);
  const escXml   = escapeXml(xmlData);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_NS_ENV}" xmlns:tns="${SOAP_NS_TNS}">` +
      `<soap:Body>` +
        `<tns:insercionSag>` +
          `<tns:a_s_token>${escToken}</tns:a_s_token>` +
          `<tns:a_n_tipo>${tipo}</tns:a_n_tipo>` +
          `<tns:a_s_xml>${escXml}</tns:a_s_xml>` +
        `</tns:insercionSag>` +
      `</soap:Body>` +
    `</soap:Envelope>`
  );
}

// ── Response parsing ──────────────────────────────────────────────────────────

function extractXmlValue(xml: string, localTag: string): string | null {
  const open  = new RegExp(`<[^>:]*:?${localTag}[^>]*>`, "i");
  const close = new RegExp(`</[^>:]*:?${localTag}>`, "i");
  const start = xml.search(open);
  if (start === -1) return null;
  const afterOpen = xml.indexOf(">", start) + 1;
  const end = xml.search(close);
  if (end === -1 || end < afterOpen) return null;
  const raw = xml.slice(afterOpen, end);
  const cdataMatch = raw.match(/^<!\[CDATA\[([\s\S]*?)]]>$/);
  return cdataMatch ? cdataMatch[1] : raw;
}

function parseSagWriteResponse(raw: string): SagWriteResponse {
  const trimmed = raw.trim();
  const ok = trimmed.toUpperCase().startsWith("OK");

  // Extract any ref SAG echoes back: "OK: 900123456" → sagRef = "900123456"
  const colonIdx = trimmed.indexOf(":");
  const message  = colonIdx > -1 ? trimmed.slice(colonIdx + 1).trim() : trimmed;
  const sagRef   = ok && message ? message : undefined;

  return { raw: trimmed, ok, message, sagRef };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call SAG insercionSag() with the provided XML payload.
 *
 * Returns a structured SagWriteResponse.
 * Throws only on network errors or SOAP faults (malformed request).
 * A SAG-level "FALLIDO" is returned as a non-throwing response with ok=false.
 */
export async function insercionSag(
  config:  PyaApiConfig,
  tipo:    SagWriteType,
  xmlData: string,
): Promise<SagWriteResponse> {
  const body = buildWriteEnvelope(config.token, tipo, xmlData);

  if (DEBUG) {
    const metrics = safePayloadMetrics(xmlData);
    console.error("[SAG WRITE DEBUG] → POST", sanitizeEndpoint(config.endpointUrl));
    console.error("[SAG WRITE DEBUG] → tipo:", tipo);
    console.error("[SAG WRITE DEBUG] → payload: %d bytes, %d items", metrics.bytes, metrics.lineCount);
  }

  const res = await fetch(config.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: SOAP_ACTION,
    },
    body,
  });

  const responseText = await res.text();

  if (DEBUG) {
    console.error("[SAG WRITE DEBUG] ← Status:", res.status);
    console.error("[SAG WRITE DEBUG] ← Body length:", responseText.length, "bytes");
  }

  // SOAP fault — structural error (bad token, wrong namespace, etc.)
  const faultcode   = extractXmlValue(responseText, "faultcode");
  const faultstring = extractXmlValue(responseText, "faultstring");
  if (faultcode || faultstring) {
    throw new Error(
      `SAG_SOAP_FAULT [${faultcode ?? "UNKNOWN"}]: ${faultstring ?? "UNKNOWN"}`
    );
  }

  if (!res.ok) {
    throw new Error(
      `SAG_HTTP_ERROR: ${res.status} ${res.statusText} — ${responseText.slice(0, 300)}`
    );
  }

  const resultStr = extractXmlValue(responseText, "insercionSagResult");
  if (resultStr === null) {
    throw new Error(
      `SAG_PARSE_ERROR: insercionSagResult not found — ${responseText.slice(0, 300)}`
    );
  }

  return parseSagWriteResponse(resultStr);
}
