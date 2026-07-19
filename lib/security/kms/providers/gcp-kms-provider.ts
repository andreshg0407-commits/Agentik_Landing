/**
 * lib/security/kms/providers/gcp-kms-provider.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * GCP Cloud KMS Provider — Adapter Contract (No SDK Integration)
 *
 * Server-only. Stub implementation for future GCP integration.
 *
 * When GCP SDK is integrated (AGENTIK-SECURITY-KMS-GCP-01):
 *   1. Install @google-cloud/kms
 *   2. Implement using KeyManagementServiceClient
 *   3. Use AES-256 symmetric encryption keys
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

// ── GCP KMS Configuration Contract ───────────────────────────────────────────

export interface GcpKmsConfig {
  /** GCP project ID. */
  projectId:   string;
  /** GCP location (e.g. "global", "us-central1"). */
  locationId:  string;
  /** Key ring name in Cloud KMS. */
  keyRingId:   string;
  /** Path to service account credentials JSON (or use Workload Identity). */
  credentialsPath?: string;
}

// ── GCP SDK Adapter Contract ──────────────────────────────────────────────────

export interface GcpSdkAdapter {
  createCryptoKey(params: { parent: string; cryptoKeyId: string; cryptoKey: { purpose: string } }): Promise<[{ name?: string }]>;
  encrypt(params: { name: string; plaintext: Buffer }): Promise<[{ ciphertext: Buffer }]>;
  decrypt(params: { name: string; ciphertext: Buffer }): Promise<[{ plaintext: Buffer }]>;
  destroyCryptoKeyVersion(params: { name: string }): Promise<void>;
  updateCryptoKeyPrimaryVersion(params: { name: string; cryptoKeyVersionId: string }): Promise<void>;
  getCryptoKey(params: { name: string }): Promise<[{ primary?: { state: string; createTime?: { seconds: number } } }]>;
}

// ── GCP KMS Provider (Stub) ───────────────────────────────────────────────────

export class GcpKmsProvider implements KmsProvider {
  readonly providerType = "GCP_KMS" as const;

  constructor(
    private readonly _config: GcpKmsConfig,
    private readonly _sdk?: GcpSdkAdapter,
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
      provider:  "GCP_KMS",
      latencyMs: 0,
      details:   `gcp_kms_sdk_not_integrated: project=${this._config.projectId} ring=${this._config.keyRingId}`,
      checkedAt: new Date().toISOString(),
    };
  }

  async getKeyMetadata(_keyAlias: string, _orgSlug: string): Promise<KmsResult<KmsKeyMetadata>> {
    return this._notImplemented("getKeyMetadata");
  }

  private _notImplemented(method: string): Promise<KmsResult<never>> {
    return Promise.resolve({
      ok:        false as const,
      error:     `gcp_kms_not_integrated:${method} — implement in AGENTIK-SECURITY-KMS-GCP-01`,
      riskLevel: "HIGH" as const,
    });
  }
}
