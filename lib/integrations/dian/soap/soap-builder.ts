/**
 * soap-builder.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — SOAP Request Builder
 *
 * Builds typed, complete SOAP request objects for DIAN operations.
 *
 * Current operations:  GetAcquirer
 * Future operations:   SendBillAsync, SendBillSync, GetStatus, GetStatusZip
 *
 * Build output is a BuiltSoapRequest — ready for HTTP dispatch once
 * WS-Security signing is implemented in DIAN-SECURITY-01.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: No real HTTP requests — FOUNDATION-01 is build-only.
 */

import type {
  GetAcquirerRequest,
  DianSoapAction,
  DianCertificateConfig,
  WsAddressingConfig,
  WssTimestampConfig,
} from "../types/dian-types";
import { DIAN_NAMESPACES } from "../types/dian-types";
import {
  buildCanonicalTimestamp,
  buildCanonicalToElement,
} from "../security/xml-signer";
import type { SoapSigningInputs } from "../security/xml-signer";
import {
  DIAN_WS_ADDRESSING_CONFIG,
  DIAN_SOAP_NAMESPACES,
  buildWsaHeaders,
  buildSoapContentType,
  serializeSoapEnvelope,
  escapeXml,
} from "./soap-envelope";
import {
  buildWssTimestamp,
  DIAN_WSS_TIMESTAMP_CONFIG,
} from "../security/ws-security";
import type { WssTimestamp } from "../security/ws-security";

// ── GetAcquirer SOAPAction ────────────────────────────────────────────────────

const GET_ACQUIRER_ACTION: DianSoapAction =
  "http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer";

// ── Build option types ────────────────────────────────────────────────────────

/** Options for building a GetAcquirer SOAP request. */
export interface GetAcquirerBuildOptions {
  /** The buyer identification to query. */
  request:      GetAcquirerRequest;
  /** SOAP endpoint URL (from environment config). */
  endpointUrl:  string;
  /** Certificate config — present now for future WSSE signing wiring. */
  certificate:  DianCertificateConfig;
  wsAddressing: WsAddressingConfig;
  timestamp:    WssTimestampConfig;
}

// Re-export so callers import from one place
export type { SoapSigningInputs } from "../security/xml-signer";

/** A fully built SOAP request, ready for HTTP dispatch. */
export interface BuiltSoapRequest {
  /** Complete SOAP envelope as an XML string (unsigned — placeholders for BST/Sig). */
  xmlBody:        string;
  /** Content-Type header value (includes SOAPAction for SOAP 1.2). */
  contentType:    string;
  /** Target endpoint URL. */
  endpointUrl:    string;
  /** HTTP method — always POST for SOAP. */
  method:         "POST";
  /** Additional HTTP headers to send. */
  headers:        Record<string, string>;
  /**
   * Signing inputs for WS-Security XML-DSIG.
   * Contains Exclusive C14N forms of elements to be signed (Timestamp, To).
   * Pass to signWssElements() in xml-signer.ts, then call injectSignatureIntoEnvelope().
   */
  signingInputs:  SoapSigningInputs;
}

// ── GetAcquirer builder ───────────────────────────────────────────────────────

/**
 * Build a complete GetAcquirer SOAP request envelope.
 *
 * Implements the request structure documented in DIAN guide Sections 2.8-2.9:
 *   - SOAP 1.2 envelope with all namespace declarations
 *   - WS-Security header (Timestamp only — BST + Signature pending DIAN-SECURITY-01)
 *   - WS-Addressing headers (Action + To)
 *   - GetAcquirer body with identificationType + identificationNumber
 *
 * NOTE: The built request will be rejected by the DIAN live endpoint because
 * the WS-Security signature is not yet applied. This is intentional for
 * FOUNDATION-01. Full signing is implemented in DIAN-SECURITY-01.
 */
export function buildGetAcquirerRequest(
  options: GetAcquirerBuildOptions,
): BuiltSoapRequest {
  const wsaConfig = options.wsAddressing ?? DIAN_WS_ADDRESSING_CONFIG;
  const tsConfig  = options.timestamp    ?? DIAN_WSS_TIMESTAMP_CONFIG;

  const timestamp  = buildWssTimestamp(tsConfig);
  const toId       = `_to_${Date.now()}`;

  // Build canonical element forms for signing
  const timestampCanonical = buildCanonicalTimestamp(
    timestamp.id, timestamp.created, timestamp.expires,
  );
  const toCanonical = buildCanonicalToElement(options.endpointUrl, toId);

  const wsaHeaders = buildWsaHeaders(GET_ACQUIRER_ACTION, options.endpointUrl, wsaConfig, toId);
  const wssHeader  = buildWssHeaderXml(timestamp, timestampCanonical);
  const bodyXml    = buildGetAcquirerBodyXml(options.request);

  const xmlBody = serializeSoapEnvelope({
    namespaces:  DIAN_SOAP_NAMESPACES,
    headerSlots: [
      wssHeader,
      wsaHeaders.actionElement,
      wsaHeaders.toElement,
    ],
    bodyContent: bodyXml,
    soapAction:  GET_ACQUIRER_ACTION,
  });

  const contentType = buildSoapContentType(GET_ACQUIRER_ACTION);

  return {
    xmlBody,
    contentType,
    endpointUrl:  options.endpointUrl,
    method:       "POST",
    headers:      { "Content-Type": contentType },
    signingInputs: {
      timestampId:         timestamp.id,
      timestampCanonical,
      toId,
      toCanonical,
    },
  };
}

// ── Signature injection ────────────────────────────────────────────────────────

/**
 * Inject WS-Security BST and Signature elements into an unsigned SOAP envelope.
 *
 * Replaces the placeholder comments left by buildWssHeaderXml() with the
 * actual signed XML produced by xml-signer.ts signWssElements().
 *
 * Call order:
 *   1. const built = buildGetAcquirerRequest(options)
 *   2. const { bstXml, signatureXml } = signWssElements(built.signingInputs, ...)
 *   3. const signedXml = injectSignatureIntoEnvelope(built.xmlBody, bstXml, signatureXml)
 *   4. fetch(built.endpointUrl, { body: signedXml, ... })
 */
export function injectSignatureIntoEnvelope(
  xmlBody:      string,
  bstXml:       string,
  signatureXml: string,
): string {
  return xmlBody
    .replace("<!-- __DIAN_BST_PLACEHOLDER__ -->", bstXml)
    .replace("<!-- __DIAN_SIG_PLACEHOLDER__ -->", signatureXml);
}

// ── GetAcquirer body XML ──────────────────────────────────────────────────────

/**
 * Build the SOAP Body XML for the GetAcquirer operation.
 *
 * Structure per DIAN guide Section 2.9:
 *   <wcf:GetAcquirer>
 *     <wcf:identificationType>13</wcf:identificationType>
 *     <wcf:identificationNumber>12345678</wcf:identificationNumber>
 *   </wcf:GetAcquirer>
 *
 * The identificationNumber is always XML-escaped to prevent injection.
 */
function buildGetAcquirerBodyXml(request: GetAcquirerRequest): string {
  const ns = DIAN_NAMESPACES.WCF_SERVICE;
  return [
    `<wcf:GetAcquirer xmlns:wcf="${escapeXml(ns)}">`,
    `  <wcf:identificationType>${request.identificationType}</wcf:identificationType>`,
    `  <wcf:identificationNumber>${escapeXml(request.identificationNumber)}</wcf:identificationNumber>`,
    `</wcf:GetAcquirer>`,
  ].join("\n");
}

// ── WS-Security header XML ────────────────────────────────────────────────────

/**
 * Build the WS-Security SOAP header XML fragment.
 *
 * SECURITY-01: Timestamp in canonical form + placeholders for BST and Signature.
 * The BST and Signature XML are injected by injectSignatureIntoEnvelope()
 * after signWssElements() produces them.
 *
 * The Timestamp is in Exclusive C14N form (compact, namespace declarations inline)
 * so that it exactly matches the canonical form used for signing.
 */
function buildWssHeaderXml(_ts: WssTimestamp, timestampCanonical: string): string {
  const secNs  = DIAN_NAMESPACES.WSS_SECEXT;
  const utilNs = DIAN_NAMESPACES.WSS_UTILITY;

  return [
    `<o:Security xmlns:o="${escapeXml(secNs)}" xmlns:u="${escapeXml(utilNs)}" soap:mustUnderstand="1">`,
    `  ${timestampCanonical}`,
    `  <!-- __DIAN_BST_PLACEHOLDER__ -->`,
    `  <!-- __DIAN_SIG_PLACEHOLDER__ -->`,
    `</o:Security>`,
  ].join("\n");
}
