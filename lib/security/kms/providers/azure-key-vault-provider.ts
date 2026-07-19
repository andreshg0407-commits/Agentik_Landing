/**
 * lib/security/kms/providers/azure-key-vault-provider.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * Azure Key Vault Provider — Adapter Contract (No SDK Integration)
 *
 * Server-only. Stub implementation for future Azure integration.
 *
 * When Azure SDK is integrated (AGENTIK-SECURITY-KMS-AZURE-01):
 *   1. Install @azure/keyvault-keys and @azure/identity
 *   2. Implement using CryptographyClient and KeyClient
 *   3. Use RSA-OAEP or AES key wrapping
 *   4. Register provider in provider-registry.ts
 */

import "server-only";

import type {
  KmsProvider,
  KmsEncryptParams,
  KmsDecryptParams,
  KmsRotateParams,
  KmsKeyLifecycleParams,
  KmsProviderHealthResult,
} from "../kms-provider";
import type { KmsKeyMetadata, KmsKeyCreateInput, KmsEncryptedEnvelope } from "../kms-key";
import type { KmsResult } from "../kms-types";

// ── Azure Key Vault Configuration Contract ────────────────────────────────────

export interface AzureKeyVaultConfig {
  /** Azure Key Vault URI (e.g. https://mykeyvault.vault.azure.net). */
  vaultUri:     string;
  /** Azure tenant ID for service principal authentication. */
  tenantId:     string;
  /** Key type to use (RSA, EC, oct-HSM). Default: RSA. */
  keyType?:     "RSA" | "EC" | "oct-HSM";
  /** HSM-backed keys (Premium tier only). */
  useHsm?:     boolean;
}

// ── Azure SDK Adapter Contract ────────────────────────────────────────────────

export interface AzureSdkAdapter {
  createKey(name: string, keyType: string): Promise<{ id?: string; name: string }>;
  encrypt(keyId: string, algorithm: string, plaintext: Uint8Array): Promise<{ result: Uint8Array }>;
  decrypt(keyId: string, algorithm: string, ciphertext: Uint8Array): Promise<{ result: Uint8Array }>;
  updateKeyProperties(keyId: string, properties: { enabled?: boolean }): Promise<void>;
  beginDeleteKey(keyId: string): Promise<void>;
  getKey(keyId: string): Promise<{ id?: string; name: string; properties: { enabled?: boolean; createdOn?: Date } }>;
}

// ── Azure Key Vault Provider (Stub) ───────────────────────────────────────────

export class AzureKeyVaultProvider implements KmsProvider {
  readonly providerType = "AZURE_KEY_VAULT" as const;

  constructor(
    private readonly _config: AzureKeyVaultConfig,
    private readonly _sdk?: AzureSdkAdapter,
  ) {}

  async generateKey(_input: KmsKeyCreateInput): Promise<KmsResult<KmsKeyMetadata>> {
    return this._notImplemented("generateKey");
  }

  async encrypt(_params: KmsEncryptParams): Promise<KmsResult<KmsEncryptedEnvelope>> {
    return this._notImplemented("encrypt");
  }

  async decrypt(_params: KmsDecryptParams): Promise<KmsResult<{ plaintext: string; keyAlias: string; keyVersion: number }>> {
    return this._notImplemented("decrypt");
  }

  async rotateKey(_params: KmsRotateParams): Promise<KmsResult<{ previousVersion: number; newVersion: number; metadata: KmsKeyMetadata }>> {
    return this._notImplemented("rotateKey");
  }

  async disableKey(_params: KmsKeyLifecycleParams): Promise<KmsResult<KmsKeyMetadata>> {
    return this._notImplemented("disableKey");
  }

  async enableKey(_params: KmsKeyLifecycleParams): Promise<KmsResult<KmsKeyMetadata>> {
    return this._notImplemented("enableKey");
  }

  async deleteKey(_params: KmsKeyLifecycleParams): Promise<KmsResult<{ deleted: boolean; keyAlias: string }>> {
    return this._notImplemented("deleteKey");
  }

  async healthCheck(): Promise<KmsProviderHealthResult> {
    return {
      status:    "UNAVAILABLE",
      provider:  "AZURE_KEY_VAULT",
      latencyMs: 0,
      details:   `azure_key_vault_sdk_not_integrated: vaultUri=${this._config.vaultUri}`,
      checkedAt: new Date().toISOString(),
    };
  }

  async getKeyMetadata(_keyAlias: string, _orgSlug: string): Promise<KmsResult<KmsKeyMetadata>> {
    return this._notImplemented("getKeyMetadata");
  }

  private _notImplemented(method: string): Promise<KmsResult<never>> {
    return Promise.resolve({
      ok:        false as const,
      error:     `azure_key_vault_not_integrated:${method} — implement in AGENTIK-SECURITY-KMS-AZURE-01`,
      riskLevel: "HIGH" as const,
    });
  }
}
