/**
 * lib/integrations/vault/vault-errors.ts
 *
 * MS-10 — Vault Error Types
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Error messages MUST NOT contain secret values or key material.
 */

export class VaultError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

export class VaultSecretNotFoundError extends VaultError {
  constructor(connectionId: string, secretType: string) {
    super(
      `No secret found for connection ${connectionId} type ${secretType}`,
      "SECRET_NOT_FOUND",
    );
    this.name = "VaultSecretNotFoundError";
  }
}

export class VaultSecretRevokedError extends VaultError {
  constructor(connectionId: string, secretType: string) {
    super(
      `Secret revoked for connection ${connectionId} type ${secretType}`,
      "SECRET_REVOKED",
    );
    this.name = "VaultSecretRevokedError";
  }
}

export class VaultSecretExpiredError extends VaultError {
  constructor(connectionId: string, secretType: string) {
    super(
      `Secret expired for connection ${connectionId} type ${secretType}`,
      "SECRET_EXPIRED",
    );
    this.name = "VaultSecretExpiredError";
  }
}

export class VaultEncryptionError extends VaultError {
  constructor() {
    super("Vault encryption operation failed", "ENCRYPTION_ERROR");
    this.name = "VaultEncryptionError";
  }
}

export class VaultKeyMissingError extends VaultError {
  constructor() {
    super(
      "VAULT_ENCRYPTION_KEY environment variable is not set",
      "KEY_MISSING",
    );
    this.name = "VaultKeyMissingError";
  }
}

export class VaultTenantIsolationError extends VaultError {
  constructor() {
    super("Secret organizationId mismatch — possible cross-tenant access", "TENANT_ISOLATION");
    this.name = "VaultTenantIsolationError";
  }
}
