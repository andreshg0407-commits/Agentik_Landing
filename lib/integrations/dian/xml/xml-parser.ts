/**
 * xml-parser.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — XML Response Parsers
 *
 * Typed, safe parsers for DIAN web service XML responses.
 * Operates on raw XML strings — no DOM, no external parser dependency.
 *
 * Parsers implemented:
 *   - parseGetAcquirerResponse()   — GetAcquirer XML → GetAcquirerResponse
 *   - validateSoapResponse()       — Quick structural check of any response
 *
 * Future parsers (DIAN-FOUNDATION-02+):
 *   - parseGetStatusResponse()
 *   - parseGetStatusZipResponse()
 *   - parseSendBillResponse()
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type {
  GetAcquirerRawResult,
  GetAcquirerResponse,
  GetAcquirerRequest,
} from "../types/dian-types";
import {
  extractXmlTextContent,
  extractSoapFault,
  isSoapResponseSuccess,
} from "./xml-helpers";

// ── GetAcquirer response parser ───────────────────────────────────────────────

/**
 * Parse a raw GetAcquirer XML response into a typed GetAcquirerResponse.
 *
 * Expected XML structure (DIAN guide Section 2.9, illustration 9):
 *
 *   <s:Body>
 *     <GetAcquirerResponse xmlns="http://wcf.dian.colombia">
 *       <GetAcquirerResult
 *         xmlns:b="http://schemas.datacontract.org/2004/07/Gosocket.Dian.Services.Utils.Common"
 *         xmlns:i="...">
 *         <b:CorreoElectronico>email@example.com</b:CorreoElectronico>
 *         <b:Message>...</b:Message>
 *         <b:NombreRazonSocial>Empresa S.A.S.</b:NombreRazonSocial>
 *         <b:StatusCode>200</b:StatusCode>
 *       </GetAcquirerResult>
 *     </GetAcquirerResponse>
 *   </s:Body>
 *
 * Always returns a typed response — never throws.
 */
export function parseGetAcquirerResponse(
  xml:     string,
  request: GetAcquirerRequest,
): GetAcquirerResponse {
  const requestedAt = new Date().toISOString();

  // Check for SOAP Fault before attempting field extraction
  const fault = extractSoapFault(xml);
  if (fault) {
    return {
      success:           false,
      statusCode:        null,
      nombreRazonSocial: null,
      correoElectronico: null,
      message:           fault.reason ?? fault.code ?? "SOAP Fault received",
      request,
      requestedAt,
    };
  }

  // Extract raw field strings
  const raw        = extractGetAcquirerRawResult(xml);
  const statusCode = raw.statusCode ? parseInt(raw.statusCode, 10) : null;
  const isSuccess  = isSoapResponseSuccess(xml, raw.statusCode);

  return {
    success:           isSuccess && statusCode === 200,
    statusCode:        statusCode !== null && !isNaN(statusCode) ? statusCode : null,
    nombreRazonSocial: raw.nombreRazonSocial,
    correoElectronico: raw.correoElectronico,
    message:           raw.message,
    request,
    requestedAt,
  };
}

// ── Raw field extractor ───────────────────────────────────────────────────────

/**
 * Extract the four raw string fields from a GetAcquirerResult element.
 * Handles namespace-prefixed variants (b:CorreoElectronico, etc.).
 */
function extractGetAcquirerRawResult(xml: string): GetAcquirerRawResult {
  return {
    correoElectronico: extractXmlTextContent(xml, "CorreoElectronico"),
    message:           extractXmlTextContent(xml, "Message"),
    nombreRazonSocial: extractXmlTextContent(xml, "NombreRazonSocial"),
    statusCode:        extractXmlTextContent(xml, "StatusCode"),
  };
}

// ── Generic SOAP response validation ─────────────────────────────────────────

export interface SoapResponseValidation {
  isXml:       boolean;
  hasFault:    boolean;
  faultCode:   string | null;
  faultReason: string | null;
}

/**
 * Validate that a raw HTTP response body is a parsable SOAP response.
 *
 * Use this as a pre-check before passing to operation-specific parsers.
 * Useful for logging and error classification.
 */
export function validateSoapResponse(rawBody: string): SoapResponseValidation {
  if (!rawBody || typeof rawBody !== "string") {
    return { isXml: false, hasFault: false, faultCode: null, faultReason: null };
  }

  const trimmed = rawBody.trim();
  const isXml   = trimmed.startsWith("<");
  const fault   = isXml ? extractSoapFault(trimmed) : null;

  return {
    isXml,
    hasFault:    fault !== null,
    faultCode:   fault?.code   ?? null,
    faultReason: fault?.reason ?? null,
  };
}
