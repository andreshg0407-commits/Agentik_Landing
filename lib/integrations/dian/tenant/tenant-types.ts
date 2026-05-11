/**
 * tenant-types.ts
 *
 * AGENTIK-DIAN-MULTITENANT-SECURITY-01
 * DIAN Integration Layer — Multi-Tenant Type Definitions
 *
 * Defines the per-tenant fiscal domain model for DIAN integration.
 *
 * Architecture:
 *   - Each tenant (Organization) owns their certificates and credentials
 *   - Agentik never holds a "global" DIAN certificate
 *   - One tenant can have multiple fiscal identities, certificates,
 *     environments, and software registrations
 *   - Scales to 60+ concurrent fiscal tenants (ARKETOPS model)
 *
 * Storage mapping:
 *   Integration.configJson  → DianIntegrationConfig  (non-sensitive)
 *   Integration.secretsJson → DianIntegrationSecrets (encrypted at app layer)
 *
 * No new Prisma models required — built on existing Integration model
 * (provider: "DIAN", organizationId scoped).
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: No raw certificate material, no passwords in this type file.
 */

import type { DianEnvironment, WsAddressingConfig, DianCertificateConfig } from "../types/dian-types";

// ── Integration status ────────────────────────────────────────────────────────

/**
 * Operational status of a tenant's DIAN integration.
 *
 * not_configured  — Integration row exists but setup is incomplete
 * habilitacion    — Testing environment configured and active
 * ready           — Production environment configured and validated
 * error           — Last operation failed (see lastError)
 * suspended       — Manually suspended by admin
 */
export type DianIntegrationStatus =
  | "not_configured"
  | "habilitacion"
  | "ready"
  | "error"
  | "suspended";

// ── Certificate storage strategy ──────────────────────────────────────────────

/**
 * How a certificate is physically stored.
 *
 * filesystem      — .p12 at a server-managed absolute path (current foundation)
 * vault_reference — Reference key into HashiCorp Vault / AWS Secrets Manager (future)
 * encrypted_db    — Encrypted blob stored in DB (future, for cloud-native deployments)
 */
export type CertStorageType =
  | "filesystem"
  | "vault_reference"
  | "encrypted_db";

// ── Certificate reference ─────────────────────────────────────────────────────

/**
 * Reference to a tenant's PKCS#12 certificate.
 *
 * This is a reference — not the certificate itself.
 * The actual bytes are retrieved via CertificateVault at runtime.
 *
 * A tenant may have multiple certificate references:
 *   - One per fiscal environment (habilitación vs producción)
 *   - Rotation: new cert active, old cert retained until expiry
 *   - Multiple fiscal identities (e.g. parent + subsidiary NITs)
 */
export interface TenantCertificateRef {
  /** Internal reference ID. Matches secretsJson certificate entry. */
  id:              string;
  /** Human-readable label (e.g. "Castillitos producción 2024"). */
  label:           string;
  /** Alias registered in the PKCS#12 keystore. */
  alias:           string;
  /** How the certificate bytes are stored. */
  storageType:     CertStorageType;
  /**
   * For storageType "filesystem":
   * Absolute path to .p12 file on server — managed by infrastructure.
   * Must NOT be a path inside the repository.
   */
  certPath:        string | null;
  /**
   * For storageType "vault_reference":
   * Opaque key into the external vault (e.g. "secret/dian/castillitos/prod").
   */
  vaultRef:        string | null;
  /** Which DIAN environment this certificate is valid for. */
  environment:     DianEnvironment;
  /** Whether this is the currently active certificate for its environment. */
  isActive:        boolean;
  /** ISO date string of certificate expiry. Null until PKCS#12 is parsed. */
  expiresAt:       string | null;
  /** Certificate subject common name. Null until PKCS#12 is parsed. */
  commonName:      string | null;
}

// ── Fiscal identity ───────────────────────────────────────────────────────────

/**
 * The tenant's fiscal identity registered with DIAN.
 *
 * For companies: NIT is the primary identifier.
 * For natural persons: cédula + nombre.
 *
 * A tenant may have multiple fiscal identities (e.g. holding + subsidiary).
 */
export interface TenantFiscalIdentity {
  /** NIT without check digit (digits only, no formatting). */
  nit:               string;
  /** NIT check digit (dígito de verificación). */
  digitoVerificacion: string;
  /** Razón social (legal business name). */
  razonSocial:       string;
  /** Given name, for natural persons. Null for legal entities. */
  nombre:            string | null;
  /** Primary DIAN identification type code. Usually 31 (NIT). */
  identificationType: number;
}

// ── Software identity ─────────────────────────────────────────────────────────

/**
 * DIAN software provider registration for a tenant.
 *
 * This identifies the software solution used to generate documents.
 * Required for electronic invoicing; optional for pure consultation (GetAcquirer).
 */
export interface TenantSoftwareIdentity {
  /** UUID of the software registered with DIAN (softwareId). */
  softwareId:           string;
  /** NIT of the software provider (proveedor tecnológico). */
  providerNit:          string;
  /** Razón social of the software provider. */
  providerRazonSocial:  string;
  /**
   * Software PIN (provided by DIAN during habilitación).
   * Stored in secretsJson — never in configJson.
   */
  pinRef:               "secretsJson.softwarePin";
}

// ── Sync state ────────────────────────────────────────────────────────────────

/**
 * Current operational state of a tenant's DIAN fiscal sync.
 *
 * Used for observability and operational dashboards.
 * Stored in Integration.metaJson — non-sensitive operational state.
 */
export interface TenantFiscalSyncState {
  /**
   * not_configured  — DIAN integration not yet set up
   * habilitacion    — In testing phase
   * ready           — Production environment active
   * error           — Last sync/operation failed
   * suspended       — Integration paused
   */
  status:     DianIntegrationStatus;
  lastError:  string | null;
  /**
   * Habilitación test set ID assigned by DIAN.
   * Required for testing set-level operations.
   */
  testSetId:  string | null;
  lastCheckedAt: string | null;  // ISO timestamp
}

// ── Tenant DIAN integration (assembled from DB) ───────────────────────────────

/**
 * Fully assembled tenant DIAN integration.
 *
 * Assembled from:
 *   Integration.configJson  → fiscal identity, software identity, cert refs
 *   Integration.secretsJson → passwords, PINs (loaded separately, not present here)
 *   Integration.status      → operational status
 *
 * Certificates are references only — bytes loaded via CertificateVault.
 */
export interface TenantDianIntegration {
  integrationId:   string;
  organizationId:  string;
  /** Human-readable name (e.g. "Castillitos DIAN Producción"). */
  name:            string;
  status:          DianIntegrationStatus;
  environment:     DianEnvironment;

  fiscalIdentity:  TenantFiscalIdentity;
  certificates:    TenantCertificateRef[];
  softwareIdentity: TenantSoftwareIdentity | null;
  syncState:       TenantFiscalSyncState;

  lastSyncedAt:    string | null;
  createdAt:       string;
  updatedAt:       string;
}

// ── Runtime context (passed to DianClient) ────────────────────────────────────

/**
 * Tenant-aware context provided to DianClient for a specific request.
 *
 * Assembled by DianClient.forTenant() from a TenantDianIntegration.
 * The certificate config includes the password loaded from secretsJson
 * at runtime — it is never stored or logged.
 */
export interface TenantDianContext {
  organizationId:  string;
  integrationId:   string;
  environment:     DianEnvironment;
  soapEndpoint:    string;
  wsdlUrl:         string;
  wsAddressing:    WsAddressingConfig;
  /** Full certificate config with password — runtime only, never persisted. */
  certificate:     DianCertificateConfig;
  timeoutMs:       number;
  debugLogXml:     boolean;
}

// ── Stored config schemas (Integration.configJson / secretsJson) ──────────────

/**
 * Shape of Integration.configJson for provider=DIAN.
 *
 * Non-sensitive. Safe to read without decryption.
 * Version field allows future schema migrations.
 */
export interface DianIntegrationConfig {
  version:          "1";
  environment:      DianEnvironment;
  fiscalIdentity:   {
    nit:                string;
    digitoVerificacion: string;
    razonSocial:        string;
    nombre:             string | null;
    identificationType: number;
  };
  software?: {
    softwareId:          string;
    providerNit:         string;
    providerRazonSocial: string;
  };
  certificates: Array<{
    id:          string;
    label:       string;
    alias:       string;
    storageType: CertStorageType;
    certPath:    string | null;  // filesystem path (infra-managed)
    vaultRef:    string | null;  // vault reference key
    environment: DianEnvironment;
    isActive:    boolean;
    expiresAt:   string | null;
    commonName:  string | null;
  }>;
  syncState?: {
    status:       DianIntegrationStatus;
    lastError:    string | null;
    testSetId:    string | null;
    lastCheckedAt: string | null;
  };
}

/**
 * Shape of Integration.secretsJson for provider=DIAN.
 *
 * Sensitive. Must be encrypted at the application layer before storage.
 * Never log, never serialize to client, never include in error messages.
 */
export interface DianIntegrationSecrets {
  version: "1";
  /** Per-certificate passwords, keyed by certificate id. */
  certificates: Array<{
    /** Matches a certificate id in configJson. */
    id:       string;
    /** PKCS#12 keystore password. */
    password: string;
  }>;
  /** DIAN software PIN (from habilitación / producción registration). */
  softwarePin?: string;
}

// ── Validation result ─────────────────────────────────────────────────────────

/** Result of validating a TenantDianIntegration is ready for use. */
export interface TenantDianValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Validate that a TenantDianIntegration has the minimum required fields
 * to make DIAN calls.
 */
export function validateTenantDianIntegration(
  integration: TenantDianIntegration,
): TenantDianValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!integration.organizationId) {
    errors.push("organizationId is required");
  }

  if (!integration.fiscalIdentity?.nit) {
    errors.push("fiscalIdentity.nit is required");
  }

  const activeCerts = integration.certificates.filter(
    c => c.isActive && c.environment === integration.environment,
  );

  if (activeCerts.length === 0) {
    errors.push(
      `No active certificate for environment "${integration.environment}"`,
    );
  } else {
    const cert = activeCerts[0];
    if (cert.storageType === "filesystem" && !cert.certPath) {
      errors.push(`Certificate "${cert.id}" has storageType "filesystem" but certPath is null`);
    }
    if (cert.storageType === "vault_reference" && !cert.vaultRef) {
      errors.push(`Certificate "${cert.id}" has storageType "vault_reference" but vaultRef is null`);
    }
    if (cert.expiresAt) {
      const daysUntilExpiry = Math.floor(
        (new Date(cert.expiresAt).getTime() - Date.now()) / 86_400_000,
      );
      if (daysUntilExpiry < 0) {
        errors.push(`Certificate "${cert.label}" expired ${Math.abs(daysUntilExpiry)} days ago`);
      } else if (daysUntilExpiry < 30) {
        warnings.push(`Certificate "${cert.label}" expires in ${daysUntilExpiry} days`);
      }
    }
  }

  if (integration.status === "suspended") {
    errors.push("Integration is suspended");
  }

  if (integration.status === "error" && integration.syncState.lastError) {
    warnings.push(`Last error: ${integration.syncState.lastError}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
