/**
 * soap-envelope.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — SOAP Envelope Architecture
 *
 * Foundation for SOAP 1.2 envelope construction for DIAN web services.
 *
 * Key architecture facts (from DIAN guide):
 * - SOAP version: 1.2 (namespace: http://www.w3.org/2003/05/soap-envelope)
 * - WS-A version: 200508 (namespace: http://www.w3.org/2005/08/addressing)
 * - SOAPAction: embedded in Content-Type (SOAP 1.2 convention, not HTTP header)
 *   Format: application/soap+xml; charset=UTF-8; action="..."
 * - WS-Security header: prepended to <soap:Header>
 * - WS-A headers (Action + To): follow WS-Security in Header
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { DIAN_NAMESPACES } from "../types/dian-types";
import type { DianSoapAction, WsAddressingConfig } from "../types/dian-types";

// ── WS-Addressing defaults ────────────────────────────────────────────────────

/**
 * Default WS-Addressing configuration for DIAN.
 * Version 200508 as required by DIAN guide Section 2.8.
 */
export const DIAN_WS_ADDRESSING_CONFIG: WsAddressingConfig = {
  version:          "200508",
  mustUnderstand:   "NONE",
  addDefaultAction: true,
  addDefaultTo:     true,
};

// ── Namespace map ─────────────────────────────────────────────────────────────

/**
 * Complete namespace declaration map for DIAN SOAP envelopes.
 * Prefix → namespace URI mapping for serialization.
 */
export const DIAN_SOAP_NAMESPACES: Record<string, string> = {
  soap: DIAN_NAMESPACES.SOAP_ENVELOPE,
  a:    DIAN_NAMESPACES.WS_ADDRESSING,
  wcf:  DIAN_NAMESPACES.WCF_SERVICE,
  o:    DIAN_NAMESPACES.WSS_SECEXT,
  u:    DIAN_NAMESPACES.WSS_UTILITY,
};

// ── Content-Type builder ──────────────────────────────────────────────────────

/**
 * Build the Content-Type header for a DIAN SOAP 1.2 request.
 *
 * SOAP 1.2 encodes the SOAPAction in the Content-Type action parameter,
 * NOT as a separate SOAPAction HTTP header (which is SOAP 1.1 convention).
 *
 * Source: DIAN guide note, page 9:
 *   "action = http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer"
 *
 * @example
 *   application/soap+xml; charset=UTF-8;
 *   action="http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer"
 */
export function buildSoapContentType(action: DianSoapAction): string {
  return `application/soap+xml; charset=UTF-8; action="${action}"`;
}

// ── Envelope structure types ──────────────────────────────────────────────────

/** Slot model for building a complete SOAP envelope. */
export interface SoapEnvelopeSlots {
  /** Namespace declarations (prefix → URI). */
  namespaces:   Record<string, string>;
  /** Header child elements as XML strings (order matters). */
  headerSlots:  string[];
  /** Body content as XML string. */
  bodyContent:  string;
  /** SOAPAction (embedded in Content-Type for SOAP 1.2). */
  soapAction:   DianSoapAction;
}

/** WS-Addressing header slot strings. */
export interface WsaHeaderSlots {
  actionElement: string;
  toElement:     string;
}

// ── WS-Addressing header builders ─────────────────────────────────────────────

/**
 * Build WS-Addressing header XML elements for a DIAN operation.
 *
 * Produces <a:Action> and <a:To> elements that go into <soap:Header>.
 *
 * @param toId  Optional wsu:Id for the To element (required for WS-Security signing).
 *              When provided, adds u:Id attribute for XML-DSIG Reference.
 */
export function buildWsaHeaders(
  action:      DianSoapAction,
  endpointUrl: string,
  _config:     WsAddressingConfig = DIAN_WS_ADDRESSING_CONFIG,
  toId?:       string,
): WsaHeaderSlots {
  const toElement = toId
    ? `<a:To u:Id="${toId}">${escapeXml(endpointUrl)}</a:To>`
    : `<a:To>${escapeXml(endpointUrl)}</a:To>`;

  return {
    actionElement: `<a:Action>${escapeXml(action)}</a:Action>`,
    toElement,
  };
}

// ── Envelope serializer ───────────────────────────────────────────────────────

/**
 * Serialize SOAP envelope slots into a complete XML document string.
 *
 * Output structure:
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <soap:Envelope xmlns:soap="..." xmlns:a="..." ...>
 *     <soap:Header>
 *       <o:Security ...> [WS-Security] </o:Security>
 *       <a:Action>...</a:Action>
 *       <a:To>...</a:To>
 *     </soap:Header>
 *     <soap:Body>
 *       <wcf:GetAcquirer>...</wcf:GetAcquirer>
 *     </soap:Body>
 *   </soap:Envelope>
 */
export function serializeSoapEnvelope(slots: SoapEnvelopeSlots): string {
  const nsDeclarations = Object.entries(slots.namespaces)
    .map(([prefix, uri]) => `xmlns:${prefix}="${escapeXml(uri)}"`)
    .join(" ");

  const headers = slots.headerSlots.join("\n    ");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<soap:Envelope ${nsDeclarations}>`,
    `  <soap:Header>`,
    `    ${headers}`,
    `  </soap:Header>`,
    `  <soap:Body>`,
    `    ${slots.bodyContent}`,
    `  </soap:Body>`,
    `</soap:Envelope>`,
  ].join("\n");
}

// ── XML escaping ──────────────────────────────────────────────────────────────

/**
 * Escape XML special characters.
 *
 * Must be applied to all user-provided or external values before
 * embedding them in XML strings. Prevents XML injection.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;");
}
