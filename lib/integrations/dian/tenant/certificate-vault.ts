/**
 * certificate-vault.ts
 *
 * AGENTIK-DIAN-MULTITENANT-SECURITY-01
 * DIAN Integration Layer — Certificate Vault Abstraction
 *
 * Provides a pluggable interface for retrieving tenant certificate
 * material at runtime. The abstraction allows swapping storage backends
 * without touching the rest of the DIAN stack.
 *
 * Vault implementations:
 *
 *   FilesystemCertificateVault    COMPLETE (FOUNDATION)
 *     Reads .p12 from a filesystem path stored in configJson.
 *     Reads password from the in-memory secrets object.
 *     For infrastructure-managed cert files (not in repo).
 *
 *   ExternalVaultCertificateVault PENDING (future)
 *     HashiCorp Vault / AWS Secrets Manager / GCP Secret Manager.
 *     Retrieves both bytes and password from an external KMS.
 *     Zero filesystem dependency.
 *
 *   EncryptedDbCertificateVault   PENDING (future)
 *     Stores encrypted cert bytes in the database.
 *     Requires a symmetric encryption key managed by infrastructure.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Certificate passwords must never be logged.
 */

import { readFileSync, existsSync } from "node:fs";
import type { TenantCertificateRef, DianIntegrationSecrets } from "./tenant-types";

// ── Vault interface ───────────────────────────────────────────────────────────

/**
 * Certificate vault interface.
 *
 * All implementations must satisfy this contract.
 * The DIAN client uses this interface — never a concrete vault directly.
 */
export interface CertificateVault {
  /**
   * Load the raw PKCS#12 certificate bytes for a tenant certificate reference.
   *
   * @param ref    Certificate reference from TenantDianIntegration.certificates
   * @param orgId  Organization ID (for audit logging and vault path resolution)
   * @returns      Raw .p12 buffer (in-memory only — never persist)
   * @throws       DianVaultError on any retrieval failure
   */
  loadCertBytes(ref: TenantCertificateRef, orgId: string): Promise<Buffer>;

  /**
   * Retrieve the PKCS#12 password for a certificate.
   *
   * @param certId Certificate reference ID (matches secretsJson entry)
   * @param orgId  Organization ID
   * @returns      Password string (runtime only — never log)
   * @throws       DianVaultError if password not found
   */
  getCertPassword(certId: string, orgId: string): Promise<string>;
}

// ── Filesystem vault ──────────────────────────────────────────────────────────

/**
 * FilesystemCertificateVault
 *
 * Reads certificate bytes from the local filesystem.
 * Password is provided from the pre-loaded secrets object (Integration.secretsJson).
 *
 * Designed for:
 * - Server deployments where infra manages certificate files
 * - Certificates at fixed absolute paths, NOT in the repository
 * - Docker volumes, NFS mounts, or secrets mounted as files
 *
 * The secrets object is passed in at construction time — loaded from
 * Integration.secretsJson by the tenant loader, held in memory only
 * for the duration of the request.
 */
export class FilesystemCertificateVault implements CertificateVault {
  private readonly secrets: DianIntegrationSecrets;

  constructor(secrets: DianIntegrationSecrets) {
    this.secrets = secrets;
  }

  async loadCertBytes(
    ref:   TenantCertificateRef,
    orgId: string,
  ): Promise<Buffer> {
    if (ref.storageType !== "filesystem") {
      throw new DianVaultError(
        `Certificate "${ref.id}" has storageType "${ref.storageType}" — ` +
        "FilesystemCertificateVault can only handle storageType 'filesystem'",
      );
    }

    if (!ref.certPath) {
      throw new DianVaultError(
        `Certificate "${ref.id}" (org: ${orgId}) has storageType "filesystem" ` +
        "but certPath is null. Set certPath in Integration.configJson.",
      );
    }

    if (!existsSync(ref.certPath)) {
      throw new DianVaultError(
        `Certificate file not found at: ${ref.certPath} ` +
        `(org: ${orgId}, certId: ${ref.id}). ` +
        "Verify the certificate file exists at the configured path.",
      );
    }

    try {
      return readFileSync(ref.certPath);
    } catch (err) {
      throw new DianVaultError(
        `Failed to read certificate file at: ${ref.certPath} ` +
        `(org: ${orgId}, certId: ${ref.id}). ` +
        `Reason: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  async getCertPassword(certId: string, orgId: string): Promise<string> {
    const entry = this.secrets.certificates.find(c => c.id === certId);
    if (!entry) {
      throw new DianVaultError(
        `Certificate password not found for certId "${certId}" ` +
        `(org: ${orgId}). ` +
        "Ensure secretsJson.certificates contains an entry with this id.",
      );
    }
    if (!entry.password) {
      throw new DianVaultError(
        `Certificate password is empty for certId "${certId}" (org: ${orgId}).`,
      );
    }
    return entry.password;
  }
}

// ── Vault stub (for testing / dry runs) ──────────────────────────────────────

/**
 * StubCertificateVault
 *
 * Returns configurable stub responses for testing pipeline components
 * that depend on the vault without needing real certificates.
 *
 * DO NOT use in production. Enforced via environment check.
 */
export class StubCertificateVault implements CertificateVault {
  private readonly stubCertBuffer: Buffer;
  private readonly stubPassword:   string;

  constructor(stubCertBuffer: Buffer = Buffer.alloc(0), stubPassword = "stub") {
    if (process.env["NODE_ENV"] === "production") {
      throw new DianVaultError(
        "StubCertificateVault cannot be used in production environment.",
      );
    }
    this.stubCertBuffer = stubCertBuffer;
    this.stubPassword   = stubPassword;
  }

  async loadCertBytes(_ref: TenantCertificateRef, _orgId: string): Promise<Buffer> {
    return this.stubCertBuffer;
  }

  async getCertPassword(_certId: string, _orgId: string): Promise<string> {
    return this.stubPassword;
  }
}

// ── External vault placeholder ────────────────────────────────────────────────

/**
 * ExternalVaultCertificateVault — PENDING (future)
 *
 * Implementation for HashiCorp Vault / AWS Secrets Manager.
 * Will be implemented when:
 *   1. The tenant count exceeds filesystem management capacity, OR
 *   2. A cloud-native deployment requires zero filesystem dependency
 *
 * API shape is defined here to guarantee interface compatibility.
 */
export class ExternalVaultCertificateVault implements CertificateVault {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_vaultEndpoint: string, _authToken: string) {
    throw new DianVaultError(
      "ExternalVaultCertificateVault is not yet implemented. " +
      "Use FilesystemCertificateVault for the current foundation phase.",
    );
  }

  async loadCertBytes(_ref: TenantCertificateRef, _orgId: string): Promise<Buffer> {
    throw new DianVaultError("ExternalVaultCertificateVault not implemented.");
  }

  async getCertPassword(_certId: string, _orgId: string): Promise<string> {
    throw new DianVaultError("ExternalVaultCertificateVault not implemented.");
  }
}

// ── Vault factory ─────────────────────────────────────────────────────────────

/**
 * Build the appropriate vault implementation for a given certificate reference.
 *
 * Selects the vault implementation based on storageType.
 * The secrets object must be pre-loaded from Integration.secretsJson.
 */
export function buildVaultForCertificate(
  ref:     TenantCertificateRef,
  secrets: DianIntegrationSecrets,
): CertificateVault {
  switch (ref.storageType) {
    case "filesystem":
      return new FilesystemCertificateVault(secrets);
    case "vault_reference":
      throw new DianVaultError(
        "vault_reference storage is not yet implemented. " +
        "Use storageType 'filesystem' for current deployments.",
      );
    case "encrypted_db":
      throw new DianVaultError(
        "encrypted_db storage is not yet implemented. " +
        "Use storageType 'filesystem' for current deployments.",
      );
    default: {
      const _exhaustive: never = ref.storageType;
      throw new DianVaultError(`Unknown storageType: ${_exhaustive}`);
    }
  }
}

// ── Vault error ───────────────────────────────────────────────────────────────

export class DianVaultError extends Error {
  constructor(message: string) {
    super(`[DIAN Vault] ${message}`);
    this.name = "DianVaultError";
  }
}
