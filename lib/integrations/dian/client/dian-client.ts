/**
 * dian-client.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01 / AGENTIK-DIAN-MULTITENANT-SECURITY-01
 * DIAN Integration Layer — Main Client
 *
 * Enterprise-safe, multi-tenant DIAN web services client.
 *
 * Two instantiation modes:
 *
 *   1. Global env mode (single-org / fallback):
 *      const client = new DianClient(buildDianClientConfig());
 *      Reads from DIAN_ENVIRONMENT / DIAN_CERT_PATH / DIAN_CERT_PASSWORD env vars.
 *
 *   2. Tenant-aware mode (multi-tenant, preferred):
 *      const client = DianClient.forTenant(tenantContext);
 *      Receives per-tenant config loaded from Integration.configJson/secretsJson.
 *      Supports 60+ concurrent tenants with isolated certificates.
 *
 * Implementation status:
 *   Global env config loading  COMPLETE
 *   Tenant-aware factory       COMPLETE
 *   Environment validation     COMPLETE
 *   Certificate validation     COMPLETE (buffer load + config check)
 *   SOAP request building      COMPLETE (timestamp only — no signature)
 *   Response parsing           COMPLETE (parser contracts in place)
 *   HTTP dispatch              STUB — pending DIAN-SECURITY-01
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: No real HTTP requests in FOUNDATION-01.
 */

import type {
  DianClientConfig,
  DianServiceResult,
  DianErrorCode,
  GetAcquirerRequest,
  GetAcquirerResponse,
} from "../types/dian-types";
import type { TenantDianContext } from "../tenant/tenant-types";
import {
  loadDianEnvironmentConfig,
  loadDianCertificateConfig,
  getTimeoutMs,
  isDebugLogXmlEnabled,
} from "../config/environment";
import {
  buildDianWsSecurityConfig,
} from "../security/ws-security";
import { DIAN_WS_ADDRESSING_CONFIG } from "../soap/soap-envelope";
import {
  loadCertificateBuffer,
  validateCertificateConfig,
  parseCertificateFromBuffer,
} from "../security/certificate-manager";
import {
  buildGetAcquirerRequest,
  injectSignatureIntoEnvelope,
} from "../soap/soap-builder";
import { signWssElements, DianSigningError } from "../security/xml-signer";
import {
  parseGetAcquirerResponse,
  validateSoapResponse,
} from "../xml/xml-parser";

// ── Global env factory (single-org / fallback) ───────────────────────────────

/**
 * Build a DianClientConfig from environment variables.
 *
 * Single-org fallback. For multi-tenant use, prefer DianClient.forTenant().
 *
 * Throws DianEnvironmentError if required env vars are missing.
 * Never call in client components or edge runtime.
 */
export function buildDianClientConfig(): DianClientConfig {
  const environment  = loadDianEnvironmentConfig();
  const certConfig   = loadDianCertificateConfig();
  const wsSecurity   = buildDianWsSecurityConfig("outgoing", certConfig);
  const wsAddressing = DIAN_WS_ADDRESSING_CONFIG;

  return {
    environment,
    wsSecurity,
    wsAddressing,
    timeoutMs:   getTimeoutMs(),
    maxRetries:  1,
    debugLogXml: isDebugLogXmlEnabled(),
  };
}

// ── Tenant-aware config builder ───────────────────────────────────────────────

/**
 * Build a DianClientConfig from a TenantDianContext.
 *
 * This is the multi-tenant path. The context is assembled by
 * loadTenantDianContext() from the tenant's Integration record —
 * it carries per-tenant endpoints, certificate config, and a
 * runtime-loaded certificate password (never persisted).
 *
 * The resulting DianClient is scoped to a single tenant + environment.
 * There is no shared state between tenants.
 */
function buildDianClientConfigFromTenant(ctx: TenantDianContext): DianClientConfig {
  const wsSecurity = buildDianWsSecurityConfig("outgoing", ctx.certificate);

  return {
    environment: {
      environment:  ctx.environment,
      wsdlUrl:      ctx.wsdlUrl,
      soapEndpoint: ctx.soapEndpoint,
      hasTestData:  ctx.environment === "habilitacion",
    },
    wsSecurity,
    wsAddressing:  ctx.wsAddressing,
    timeoutMs:     ctx.timeoutMs,
    maxRetries:    1,
    debugLogXml:   ctx.debugLogXml,
  };
}

// ── DIAN Client ───────────────────────────────────────────────────────────────

export class DianClient {
  private readonly config:        DianClientConfig;
  private readonly tenantContext: TenantDianContext | null;

  constructor(config: DianClientConfig, tenantContext?: TenantDianContext) {
    this.config        = config;
    this.tenantContext = tenantContext ?? null;
  }

  /**
   * Create a DianClient scoped to a specific tenant and environment.
   *
   * Preferred instantiation for multi-tenant deployments.
   * The tenant context is loaded by loadTenantDianContext() and carries
   * per-tenant certificates, endpoints, and credentials.
   *
   * Each tenant gets an isolated client instance — no shared state.
   * Supports 60+ concurrent tenants without any global certificate sharing.
   *
   * @param ctx  TenantDianContext from loadTenantDianContext()
   */
  static forTenant(ctx: TenantDianContext): DianClient {
    return new DianClient(buildDianClientConfigFromTenant(ctx), ctx);
  }

  /** The organization this client is scoped to (null when using global env mode). */
  get organizationId(): string | null {
    return this.tenantContext?.organizationId ?? null;
  }

  /** The integration ID this client is using (null when using global env mode). */
  get integrationId(): string | null {
    return this.tenantContext?.integrationId ?? null;
  }

  /**
   * Query DIAN to retrieve buyer (adquiriente) information.
   *
   * Given an identification type code and document number, returns
   * the buyer's registered business name and email from the DIAN
   * electronic invoicing system (Sistema de Factura Electrónica).
   *
   * Use cases:
   *   - Auto-complete buyer information on electronic invoices
   *   - Validate buyer identity before invoice generation
   *   - Look up customer email for invoice delivery
   *
   * Flow (DIAN-SECURITY-01):
   *   1. Validate certificate config
   *   2. Load .p12 buffer from filesystem
   *   3. Parse PKCS#12 → extract private key + DER cert
   *   4. Build unsigned SOAP envelope with signing inputs
   *   5. Sign Timestamp + To elements with RSA-SHA256 + Exclusive C14N
   *   6. Inject BST + Signature into envelope
   *   7. Dispatch signed XML to DIAN endpoint
   *   8. Parse + return typed response
   *
   * @param request  identificationType + identificationNumber
   */
  async getAcquirer(
    request: GetAcquirerRequest,
  ): Promise<DianServiceResult<GetAcquirerResponse>> {
    const startedAt = Date.now();

    // Step 1: Validate certificate configuration
    const certValidation = validateCertificateConfig(this.config.wsSecurity.certificate);
    if (!certValidation.valid) {
      return this.err(
        "CERTIFICATE_INVALID",
        certValidation.reason ?? "Certificate configuration is invalid",
        startedAt,
      );
    }

    // Step 2: Load certificate buffer
    let certBuffer: Buffer;
    try {
      certBuffer = loadCertificateBuffer(this.config.wsSecurity.certificate);
    } catch (err) {
      return this.err(
        "CERTIFICATE_LOAD_FAILED",
        err instanceof Error ? err.message : "Certificate load failed",
        startedAt,
      );
    }

    // Step 3: Parse PKCS#12 — extract private key + DER cert + metadata
    let privateKeyPem: string;
    let certDer: Buffer;
    try {
      const { parsed } = parseCertificateFromBuffer(
        this.config.wsSecurity.certificate,
        certBuffer,
      );
      privateKeyPem = parsed.privateKeyPem;
      certDer       = parsed.certDer;
    } catch (err) {
      return this.err(
        "CERTIFICATE_LOAD_FAILED",
        err instanceof Error ? err.message : "PKCS#12 parsing failed",
        startedAt,
      );
    }

    // Step 4: Build unsigned SOAP envelope
    let builtRequest;
    try {
      builtRequest = buildGetAcquirerRequest({
        request,
        endpointUrl:  this.config.environment.soapEndpoint,
        certificate:  this.config.wsSecurity.certificate,
        wsAddressing: this.config.wsAddressing,
        timestamp:    this.config.wsSecurity.timestamp,
      });
    } catch (err) {
      return this.err(
        "SOAP_BUILD_FAILED",
        err instanceof Error ? err.message : "SOAP envelope build failed",
        startedAt,
      );
    }

    // Step 5: Sign WS-Security elements (RSA-SHA256 + Exclusive C14N)
    let signedXml: string;
    try {
      const { bstXml, signatureXml } = signWssElements(
        builtRequest.signingInputs,
        privateKeyPem,
        certDer,
      );
      signedXml = injectSignatureIntoEnvelope(builtRequest.xmlBody, bstXml, signatureXml);
    } catch (err) {
      const code = err instanceof DianSigningError ? "WSSE_SIGNING_FAILED" : "SOAP_BUILD_FAILED";
      return this.err(
        code,
        err instanceof Error ? err.message : "WS-Security signing failed",
        startedAt,
      );
    }

    // Step 6: Dispatch signed SOAP envelope to DIAN endpoint
    let rawBody: string;
    try {
      rawBody = await this.dispatch(signedXml, builtRequest.headers, builtRequest.endpointUrl);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return this.err(
          "HTTP_TIMEOUT",
          `DIAN request timed out after ${this.config.timeoutMs}ms`,
          startedAt,
        );
      }
      return this.err(
        "HTTP_ERROR",
        err instanceof Error ? err.message : "HTTP dispatch failed",
        startedAt,
      );
    }

    // Step 7: Validate SOAP response structure
    const validation = validateSoapResponse(rawBody);
    if (!validation.isXml) {
      return this.err(
        "RESPONSE_INVALID",
        "DIAN returned a non-XML response. Check endpoint URL and network connectivity.",
        startedAt,
      );
    }
    if (validation.hasFault) {
      const soapFault = validation.faultReason ?? validation.faultCode ?? "SOAP Fault received";
      return {
        success:    false,
        data:       null,
        error: {
          code:    "SOAP_FAULT",
          message: soapFault,
          // Only include raw fault in non-production debug mode
          ...(this.config.debugLogXml ? { soapFault: rawBody.slice(0, 500) } : {}),
        },
        durationMs: Date.now() - startedAt,
      };
    }

    // Step 8: Parse typed response
    const parsed = parseGetAcquirerResponse(rawBody, request);
    return {
      success:    parsed.success,
      data:       parsed,
      error:      parsed.success ? null : {
        code:    "NOT_FOUND",
        message: parsed.message ?? "DIAN did not find the requested document",
      },
      durationMs: Date.now() - startedAt,
    };
  }

  // ── HTTP dispatch ────────────────────────────────────────────────────────────

  /**
   * Dispatch a signed SOAP envelope to the DIAN endpoint.
   *
   * Retries once on HTTP 5xx or network timeout.
   * Never retries on 4xx (authentication / authorization errors).
   * Never logs the request body (contains WS-Security tokens).
   */
  private async dispatch(
    signedXml:   string,
    headers:     Record<string, string>,
    endpointUrl: string,
  ): Promise<string> {
    let attempt = 0;
    const maxAttempts = this.config.maxRetries + 1;

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      let response: Response;
      try {
        response = await fetch(endpointUrl, {
          method:  "POST",
          headers,
          body:    signedXml,
          signal:  controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (response.ok || (response.status >= 400 && response.status < 500)) {
        // 2xx success or 4xx client error — read body and return (no retry on 4xx)
        return response.text();
      }

      if (response.status >= 500 && attempt < maxAttempts) {
        // 5xx server error — retry
        continue;
      }

      // Last attempt or non-retriable status
      const body = await response.text();
      return body; // Let the SOAP fault parser handle it
    }

    // Should never reach here
    throw new Error("Dispatch loop exited unexpectedly");
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private err<T>(
    code:      DianErrorCode,
    message:   string,
    startedAt: number,
  ): DianServiceResult<T> {
    return {
      success:    false,
      data:       null,
      error:      { code, message },
      durationMs: Date.now() - startedAt,
    };
  }
}
