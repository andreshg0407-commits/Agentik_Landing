/**
 * tenant-loader.ts
 *
 * AGENTIK-DIAN-MULTITENANT-SECURITY-01
 * DIAN Integration Layer — Tenant Integration Loader
 *
 * Loads and assembles a TenantDianIntegration from the existing
 * Integration model (provider: "DIAN") in the database.
 *
 * No new Prisma models required — uses the existing Integration record:
 *   Integration.configJson  → DianIntegrationConfig (non-sensitive)
 *   Integration.secretsJson → DianIntegrationSecrets (encrypted)
 *   Integration.status      → maps to DianIntegrationStatus
 *
 * Tenant isolation: all queries are scoped by organizationId.
 * Cross-tenant access is structurally impossible — every query requires
 * both organizationId AND provider=DIAN.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Never log secretsJson content.
 */

import { prisma }               from "@/lib/prisma";
import { DIAN_ENDPOINT_REGISTRY } from "../config/environment";
import { DIAN_WS_ADDRESSING_CONFIG } from "../soap/soap-envelope";
import { buildVaultForCertificate }  from "./certificate-vault";
import { SecureVault }              from "@/lib/security/vault/secure-vault";
import { dianCertRef }              from "@/lib/security/vault/vault-references";
import type { DianCertSecretPayload } from "@/lib/security/vault/vault-types";
import type {
  TenantDianIntegration,
  TenantDianContext,
  DianIntegrationConfig,
  DianIntegrationSecrets,
  DianIntegrationStatus,
  TenantCertificateRef,
  TenantFiscalSyncState,
} from "./tenant-types";
import type { DianEnvironment } from "../types/dian-types";
import { isDebugLogXmlEnabled, getTimeoutMs } from "../config/environment";

// ── Raw DB type ───────────────────────────────────────────────────────────────

type RawIntegration = {
  id:            string;
  organizationId: string;
  name:          string | null;
  status:        string;
  configJson:    unknown;
  secretsJson:   unknown;
  lastSyncedAt:  Date | null;
  createdAt:     Date;
  updatedAt:     Date;
};

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Load the DIAN integration for a given organization.
 *
 * Returns null if no DIAN integration exists for the org.
 * The integration may exist but be in "not_configured" state.
 *
 * Tenant isolation: query always filters by organizationId + provider=DIAN.
 */
export async function loadTenantDianIntegration(
  organizationId: string,
): Promise<TenantDianIntegration | null> {
  const raw = await prisma.integration.findFirst({
    where: {
      organizationId,
      provider:  "DIAN" as never, // cast: IntegrationProvider.DIAN
      deletedAt: null,
    },
    select: {
      id:             true,
      organizationId: true,
      name:           true,
      status:         true,
      configJson:     true,
      secretsJson:    true,
      lastSyncedAt:   true,
      createdAt:      true,
      updatedAt:      true,
    },
  }) as RawIntegration | null;

  if (!raw) return null;

  return assembleTenantDianIntegration(raw);
}

/**
 * Load the DIAN integration and resolve a full TenantDianContext for
 * making authenticated DIAN calls.
 *
 * This is the entry point for DianClient.forTenant().
 *
 * Loads:
 *   - Integration config (non-sensitive, from configJson)
 *   - Certificate bytes and password (via CertificateVault)
 *   - Builds DianCertificateConfig for use in DianClient
 *
 * Returns null if no DIAN integration configured.
 * Returns an error-state context if integration exists but is not ready.
 */
export async function loadTenantDianContext(
  organizationId: string,
  environment:     DianEnvironment,
): Promise<TenantDianContextResult> {
  const integration = await loadTenantDianIntegration(organizationId);

  if (!integration) {
    return {
      success: false,
      error:   `No DIAN integration found for organization ${organizationId}`,
      context: null,
    };
  }

  if (integration.environment !== environment) {
    return {
      success: false,
      error:   `Integration is configured for "${integration.environment}" but "${environment}" was requested`,
      context: null,
    };
  }

  if (integration.status === "suspended") {
    return {
      success: false,
      error:   `DIAN integration for org ${organizationId} is suspended`,
      context: null,
    };
  }

  // Find the active certificate for this environment
  const activeCert = integration.certificates.find(
    c => c.isActive && c.environment === environment,
  );

  if (!activeCert) {
    return {
      success: false,
      error:   `No active certificate for environment "${environment}" in org ${organizationId}`,
      context: null,
    };
  }

  // Load secrets (needed for cert password)
  const rawSecrets = await prisma.integration.findFirst({
    where: { organizationId, provider: "DIAN" as never, deletedAt: null },
    select: { secretsJson: true },
  }) as { secretsJson: unknown } | null;

  if (!rawSecrets?.secretsJson) {
    return {
      success: false,
      error:   `No secrets configured for DIAN integration in org ${organizationId}`,
      context: null,
    };
  }

  // Retrieve cert password — try SecureVault (v2) first, fall back to legacy (v1)
  let certPassword: string;

  const secretsVersion = (rawSecrets.secretsJson as Record<string, unknown> | null)?.["version"];

  if (secretsVersion === "2") {
    // SECURITY-01: SecureVault path — encrypted AES-256-GCM envelope
    const envelope   = SecureVault.unpackEnvelope(rawSecrets.secretsJson);
    const certRef    = dianCertRef(organizationId, activeCert.id);
    const vaultResult = SecureVault.readSecret<DianCertSecretPayload>(certRef, envelope, {
      accessedBy:     "dian-tenant-loader",
      role:           "AGENTIK_SERVICE",
      organizationId,
    });
    if (!vaultResult.success) {
      return {
        success: false,
        error:   vaultResult.error,
        context: null,
      };
    }
    certPassword = vaultResult.payload.certPassword;
  } else {
    // Legacy v1 path — ad-hoc { version: "1", certificates: [{id, password}] }
    // Remains until all tenants are migrated to v2 SecureVault envelopes
    const secrets = parseIntegrationSecrets(rawSecrets.secretsJson);
    if (!secrets) {
      return {
        success: false,
        error:   "DIAN integration secrets are malformed or missing version field",
        context: null,
      };
    }
    const vault = buildVaultForCertificate(activeCert, secrets);
    try {
      certPassword = await vault.getCertPassword(activeCert.id, organizationId);
    } catch (err) {
      return {
        success: false,
        error:   err instanceof Error ? err.message : "Failed to load certificate password",
        context: null,
      };
    }
  }

  // Resolve endpoint from environment registry (can be overridden in configJson)
  const endpointDefaults = DIAN_ENDPOINT_REGISTRY[environment];

  const context: TenantDianContext = {
    organizationId,
    integrationId:  integration.integrationId,
    environment,
    soapEndpoint:   endpointDefaults.soapEndpoint,
    wsdlUrl:        endpointDefaults.wsdlUrl,
    wsAddressing:   DIAN_WS_ADDRESSING_CONFIG,
    certificate: {
      certPath:     activeCert.certPath ?? "",
      certPassword,
      alias:        activeCert.alias || undefined,
    },
    timeoutMs:      getTimeoutMs(),
    debugLogXml:    isDebugLogXmlEnabled(),
  };

  return { success: true, error: null, context };
}

export interface TenantDianContextResult {
  success: boolean;
  error:   string | null;
  context: TenantDianContext | null;
}

// ── Assembly helpers ──────────────────────────────────────────────────────────

function assembleTenantDianIntegration(raw: RawIntegration): TenantDianIntegration {
  const config = parseIntegrationConfig(raw.configJson);

  const status = resolveIntegrationStatus(raw.status, config);

  const certificates: TenantCertificateRef[] = (config?.certificates ?? []).map(c => ({
    id:          c.id,
    label:       c.label,
    alias:       c.alias,
    storageType: c.storageType,
    certPath:    c.certPath,
    vaultRef:    c.vaultRef,
    environment: c.environment,
    isActive:    c.isActive,
    expiresAt:   c.expiresAt,
    commonName:  c.commonName,
  }));

  const syncState: TenantFiscalSyncState = {
    status:       status,
    lastError:    config?.syncState?.lastError ?? null,
    testSetId:    config?.syncState?.testSetId ?? null,
    lastCheckedAt: config?.syncState?.lastCheckedAt ?? null,
  };

  return {
    integrationId:   raw.id,
    organizationId:  raw.organizationId,
    name:            raw.name ?? `DIAN ${config?.environment ?? ""}`,
    status,
    environment:     config?.environment ?? "habilitacion",
    fiscalIdentity: {
      nit:                config?.fiscalIdentity?.nit ?? "",
      digitoVerificacion: config?.fiscalIdentity?.digitoVerificacion ?? "",
      razonSocial:        config?.fiscalIdentity?.razonSocial ?? "",
      nombre:             config?.fiscalIdentity?.nombre ?? null,
      identificationType: config?.fiscalIdentity?.identificationType ?? 31,
    },
    certificates,
    softwareIdentity: config?.software
      ? {
          softwareId:          config.software.softwareId,
          providerNit:         config.software.providerNit,
          providerRazonSocial: config.software.providerRazonSocial,
          pinRef:              "secretsJson.softwarePin",
        }
      : null,
    syncState,
    lastSyncedAt: raw.lastSyncedAt?.toISOString() ?? null,
    createdAt:    raw.createdAt.toISOString(),
    updatedAt:    raw.updatedAt.toISOString(),
  };
}

// ── Config/secrets parsers ────────────────────────────────────────────────────

function parseIntegrationConfig(raw: unknown): DianIntegrationConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj["version"] !== "1") return null;
  return obj as unknown as DianIntegrationConfig;
}

function parseIntegrationSecrets(raw: unknown): DianIntegrationSecrets | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj["version"] !== "1") return null;
  return obj as unknown as DianIntegrationSecrets;
}

function resolveIntegrationStatus(
  dbStatus: string,
  config:   DianIntegrationConfig | null,
): DianIntegrationStatus {
  if (dbStatus === "ERROR")        return "error";
  if (dbStatus === "DISCONNECTED") return config ? "not_configured" : "not_configured";
  if (dbStatus === "CONNECTED") {
    return config?.environment === "produccion" ? "ready" : "habilitacion";
  }
  return "not_configured";
}

// ── Multi-tenant listing ──────────────────────────────────────────────────────

/**
 * List all DIAN integrations in an org group (e.g. ARKETOPS and all clients).
 *
 * Used for multi-tenant observability — certificate expiry monitoring,
 * sync health checks, escalation routing.
 *
 * Never returns secrets — config only.
 */
export async function listDianIntegrationsForGroup(
  organizationIds: string[],
): Promise<TenantDianIntegration[]> {
  if (organizationIds.length === 0) return [];

  const rows = await prisma.integration.findMany({
    where: {
      organizationId: { in: organizationIds },
      provider:       "DIAN" as never,
      deletedAt:      null,
    },
    select: {
      id:             true,
      organizationId: true,
      name:           true,
      status:         true,
      configJson:     true,
      secretsJson:    false, // deliberately excluded from batch listing
      lastSyncedAt:   true,
      createdAt:      true,
      updatedAt:      true,
    },
  }) as Array<Omit<RawIntegration, "secretsJson"> & { secretsJson: null }>;

  return rows.map(r => assembleTenantDianIntegration({ ...r, secretsJson: null }));
}
