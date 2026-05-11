/**
 * dian-types.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — Core Type Definitions
 *
 * All TypeScript types, interfaces, and enums for the DIAN
 * Web Services integration layer.
 *
 * Source: Guía Herramienta para el Consumo de Web Services
 *         DIAN — Sistema de Factura Electrónica
 *         Completar información de Adquirientes
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: No Prisma, no SAG, no financial modules — isolated layer.
 */

// ── Environment ───────────────────────────────────────────────────────────────

/** DIAN operational environment. Prevents accidental env mixing. */
export type DianEnvironment = "habilitacion" | "produccion";

/** Per-environment configuration. */
export interface DianEnvironmentConfig {
  environment:  DianEnvironment;
  /** WSDL endpoint URL (from DIAN Participants catalog > Facturador). */
  wsdlUrl:      string;
  /** SOAP service endpoint URL. */
  soapEndpoint: string;
  /** Test data available (habilitación only). */
  hasTestData:  boolean;
}

// ── Certificate ───────────────────────────────────────────────────────────────

/** Certificate configuration (no inline secrets — all from env). */
export interface DianCertificateConfig {
  /** Absolute path to .p12 (PKCS#12) certificate file. From env only. */
  certPath:     string;
  /** Certificate password. From env only — never hardcoded. */
  certPassword: string;
  /** Optional alias to select specific certificate from keystore. */
  alias?:       string;
}

/** Loaded certificate material (runtime only — never persisted). */
export interface DianCertificate {
  config:      DianCertificateConfig;
  /** Raw PKCS#12 buffer (in memory only — never serialized). */
  rawBuffer:   Buffer;
  /** Loaded timestamp. */
  loadedAt:    Date;
  /** Common name from the certificate (null until PKCS#12 parsing is implemented). */
  commonName:  string | null;
  /** Certificate expiry date (null until PKCS#12 parsing is implemented). */
  validUntil:  Date | null;
}

/** Result of a certificate validation check. */
export interface CertificateValidationResult {
  valid:       boolean;
  reason:      string | null;
  /** Days until expiry (only set when validUntil is known). */
  expiresIn?:  number;
}

// ── WS-Security (WSSE) ────────────────────────────────────────────────────────

/**
 * WS-Security Signature configuration.
 *
 * Mandated values from DIAN guide Section 2.6:
 *   keyIdentifierType:         BinarySecurityToken
 *   signatureAlgorithm:        RSA-SHA256
 *   signatureCanonicalization: Exclusive C14N
 *   digestAlgorithm:           SHA-256
 *   useSingleCertificate:      true
 *   prependSignatureElement:   true
 */
export interface WsSecuritySignatureConfig {
  keyIdentifierType:         WssKeyIdentifierType;
  signatureAlgorithm:        WssSignatureAlgorithm;
  signatureCanonicalization: WssCanonicalizationAlgorithm;
  digestAlgorithm:           WssDigestAlgorithm;
  useSingleCertificate:      boolean;
  prependSignatureElement:   boolean;
  signatureParts:            WssSignaturePart[];
}

export type WssKeyIdentifierType =
  | "BinarySecurityToken"
  | "IssuerSerial"
  | "SKIKeyIdentifier"
  | "Thumbprint";

export type WssSignatureAlgorithm =
  | "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
  | "http://www.w3.org/2001/04/xmldsig#rsa-sha1";

export type WssCanonicalizationAlgorithm =
  | "http://www.w3.org/2001/10/xml-exc-c14n#"
  | "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

export type WssDigestAlgorithm =
  | "http://www.w3.org/2001/04/xmlenc#sha256"
  | "http://www.w3.org/2000/09/xmldsig#sha1";

/** An XML element to include in the WS-Security signature. */
export interface WssSignaturePart {
  /** Element local name (e.g. "To"). */
  name:      string;
  /** Element namespace URI. */
  namespace: string;
  /** Encoding type. */
  encode:    "Element" | "Content";
}

/** WS-Security Timestamp configuration. */
export interface WssTimestampConfig {
  /** Token validity window in milliseconds. DIAN guide: 60,000ms. */
  timeToLiveMs:         number;
  /** Use millisecond precision. DIAN guide: true. */
  millisecondPrecision: boolean;
}

/** Complete WS-Security outgoing configuration. */
export interface WsSecurityConfig {
  name:        string;
  signature:   WsSecuritySignatureConfig;
  timestamp:   WssTimestampConfig;
  certificate: DianCertificateConfig;
}

// ── WS-Addressing (WS-A) ──────────────────────────────────────────────────────

/**
 * WS-Addressing configuration.
 * DIAN uses version 200508 per guide Section 2.8.
 */
export interface WsAddressingConfig {
  version:          WsaVersion;
  /** Must-understand level. DIAN: "NONE". */
  mustUnderstand:   "0" | "1" | "NONE";
  addDefaultAction: boolean;
  addDefaultTo:     boolean;
}

export type WsaVersion =
  | "200408"  // http://schemas.xmlsoap.org/ws/2004/08/addressing
  | "200508"; // http://www.w3.org/2005/08/addressing (DIAN)

// ── SOAP ──────────────────────────────────────────────────────────────────────

/** SOAP protocol version. */
export type SoapVersion = "1.1" | "1.2";

/**
 * SOAPAction values per DIAN service operation.
 * For SOAP 1.2, the action is embedded in the Content-Type header.
 */
export type DianSoapAction =
  | "http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer"
  | "http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatus"
  | "http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatusZip"
  | "http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillAsync"
  | "http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync"
  | "http://wcf.dian.colombia/IWcfDianCustomerServices/SendTestSetAsync";

/** SOAP envelope build options. */
export interface SoapEnvelopeOptions {
  version:           SoapVersion;
  soapAction:        DianSoapAction;
  wsAddressing:      WsAddressingConfig;
  includeWsSecurity: boolean;
}

// ── Identification Types ──────────────────────────────────────────────────────

/**
 * DIAN identification type codes.
 * Source: DIAN guide — Tabla de prueba (habilitación), page 9.
 */
export const DIAN_IDENTIFICATION_TYPES = {
  11: "Registro civil",
  12: "Tarjeta de identidad",
  13: "Cédula de ciudadanía",
  21: "Tarjeta de extranjería",
  22: "Cédula de extranjería",
  31: "NIT",
  41: "Pasaporte",
  42: "Documento de identificación extranjero",
  47: "PEP (Permiso Especial de Permanencia)",
  48: "PPT (Permiso Protección Temporal)",
  50: "NIT de otro país",
  91: "NUIP",
} as const;

export type DianIdentificationTypeCode = keyof typeof DIAN_IDENTIFICATION_TYPES;

// ── GetAcquirer ───────────────────────────────────────────────────────────────

/**
 * GetAcquirer request payload.
 *
 * Maps to SOAP body:
 *   <wcf:GetAcquirer>
 *     <wcf:identificationType>{code}</wcf:identificationType>
 *     <wcf:identificationNumber>{number}</wcf:identificationNumber>
 *   </wcf:GetAcquirer>
 */
export interface GetAcquirerRequest {
  /** DIAN identification type code (e.g. 13 = Cédula, 31 = NIT). */
  identificationType:   DianIdentificationTypeCode;
  /** Document number without formatting (digits only for NIT). */
  identificationNumber: string;
}

/**
 * Raw field strings extracted from the GetAcquirer XML response.
 *
 * Source element: <GetAcquirerResult
 *   xmlns:b="http://schemas.datacontract.org/2004/07/Gosocket.Dian.Services.Utils.Common">
 */
export interface GetAcquirerRawResult {
  correoElectronico: string | null;
  message:           string | null;
  nombreRazonSocial: string | null;
  statusCode:        string | null;
}

/** Normalized GetAcquirer response. */
export interface GetAcquirerResponse {
  success:           boolean;
  statusCode:        number | null;
  /** Business name or full name from DIAN registry. */
  nombreRazonSocial: string | null;
  /** Email registered with DIAN. */
  correoElectronico: string | null;
  /** Raw message from DIAN (may be empty on success). */
  message:           string | null;
  /** Original request echoed back for traceability. */
  request:           GetAcquirerRequest;
  /** ISO timestamp of when the request was made. */
  requestedAt:       string;
}

// ── Client ────────────────────────────────────────────────────────────────────

/** DIAN client configuration. */
export interface DianClientConfig {
  environment:  DianEnvironmentConfig;
  wsSecurity:   WsSecurityConfig;
  wsAddressing: WsAddressingConfig;
  /** HTTP request timeout in milliseconds. */
  timeoutMs:    number;
  /** Maximum retry attempts on transient failure (network / 5xx). */
  maxRetries:   number;
  /**
   * Log raw XML request/response.
   * NEVER enable in production — XML contains WS-Security tokens.
   */
  debugLogXml:  boolean;
}

/** Generic DIAN service call result wrapper. */
export interface DianServiceResult<T> {
  success:    boolean;
  data:       T | null;
  error:      DianServiceError | null;
  durationMs: number;
}

/** Classified DIAN service error. */
export interface DianServiceError {
  code:       DianErrorCode;
  message:    string;
  /**
   * Raw SOAP fault string — included only when debugLogXml is enabled
   * and environment is NOT production. Never log in production.
   */
  soapFault?: string;
}

export type DianErrorCode =
  | "CERTIFICATE_LOAD_FAILED"
  | "CERTIFICATE_EXPIRED"
  | "CERTIFICATE_INVALID"
  | "WSSE_SIGNING_FAILED"
  | "SOAP_BUILD_FAILED"
  | "HTTP_TIMEOUT"
  | "HTTP_ERROR"
  | "SOAP_FAULT"
  | "XML_PARSE_FAILED"
  | "RESPONSE_INVALID"
  | "ENVIRONMENT_NOT_CONFIGURED"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "UNKNOWN";

// ── XML Namespace Constants ───────────────────────────────────────────────────

/**
 * All XML namespace URIs used in DIAN SOAP communication.
 * Source: DIAN guide screenshots + SOAP response examples.
 */
export const DIAN_NAMESPACES = {
  SOAP_ENVELOPE: "http://www.w3.org/2003/05/soap-envelope",
  WS_ADDRESSING: "http://www.w3.org/2005/08/addressing",
  WCF_SERVICE:   "http://wcf.dian.colombia",
  WCF_RESULT:    "http://schemas.datacontract.org/2004/07/Gosocket.Dian.Services.Utils.Common",
  WSS_SECEXT:    "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
  WSS_UTILITY:   "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd",
  XML_DSIG:      "http://www.w3.org/2000/09/xmldsig#",
  XML_EXC_C14N:  "http://www.w3.org/2001/10/xml-exc-c14n#",
} as const;

export type DianNamespaceKey = keyof typeof DIAN_NAMESPACES;
