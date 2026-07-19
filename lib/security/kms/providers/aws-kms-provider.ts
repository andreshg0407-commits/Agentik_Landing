/**
 * lib/security/kms/providers/aws-kms-provider.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * AWS KMS Provider — Adapter Contract (No SDK Integration)
 *
 * Server-only. Stub implementation for AGENTIK-SECURITY-KMS-01.
 *
 * This file establishes the adapter contract and configuration types
 * for AWS KMS. The actual AWS SDK (@aws-sdk/client-kms) is NOT imported
 * here — it will be wired in a future sprint (AGENTIK-SECURITY-KMS-AWS-01).
 *
 * When AWS SDK is integrated:
 *   1. Install @aws-sdk/client-kms
 *   2. Implement AwsKmsProvider.generateKey() using CreateKey API
 *   3. Implement encrypt() using Encrypt API with DataKeySpec: AES_256
 *   4. Implement decrypt() using Decrypt API
 *   5. Register provider in provider-registry.ts
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

// ── AWS KMS Configuration Contract ────────────────────────────────────────────

/**
 * AwsKmsConfig — configuration required to connect to AWS KMS.
 * Never include access keys directly — use IAM roles or env vars.
 */
export interface AwsKmsConfig {
  /** AWS region (e.g. "us-east-1", "us-west-2"). */
  region:        string;
  /** ARN of the KMS key policy to attach to new keys. */
  keyPolicyArn?: string;
  /** KMS endpoint override (for VPC endpoints or LocalStack). */
  endpoint?:     string;
  /** Tag to apply to all generated keys. */
  defaultTags?:  Record<string, string>;
}

// ── Future AWS SDK Adapter Contract ──────────────────────────────────────────

/**
 * AwsSdkAdapter — the interface the AWS SDK client must satisfy.
 * Defined here so the provider can be unit-tested without the real SDK.
 * AGENTIK-SECURITY-KMS-AWS-01 will implement this using @aws-sdk/client-kms.
 */
export interface AwsSdkAdapter {
  createKey(params: { Description?: string; Tags?: Array<{ TagKey: string; TagValue: string }> }): Promise<{ KeyMetadata: { KeyId: string; Arn: string } }>;
  encrypt(params: { KeyId: string; Plaintext: Uint8Array }): Promise<{ CiphertextBlob: Uint8Array }>;
  decrypt(params: { CiphertextBlob: Uint8Array; KeyId?: string }): Promise<{ Plaintext: Uint8Array; KeyId?: string }>;
  scheduleKeyDeletion(params: { KeyId: string; PendingWindowInDays: number }): Promise<void>;
  disableKey(params: { KeyId: string }): Promise<void>;
  enableKey(params: { KeyId: string }): Promise<void>;
  describeKey(params: { KeyId: string }): Promise<{ KeyMetadata: { KeyId: string; KeyState: string; CreationDate: Date } }>;
}

// ── AWS KMS Provider (Stub) ───────────────────────────────────────────────────

/**
 * AwsKmsProvider — stub adapter for AWS KMS.
 * All methods return a NOT_IMPLEMENTED error until the SDK is wired.
 * Replace the stub methods in AGENTIK-SECURITY-KMS-AWS-01.
 */
export class AwsKmsProvider implements KmsProvider {
  readonly providerType = "AWS_KMS" as const;

  constructor(
    private readonly _config: AwsKmsConfig,
    private readonly _sdk?: AwsSdkAdapter,
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
      provider:  "AWS_KMS",
      latencyMs: 0,
      details:   "aws_kms_sdk_not_integrated: implement in AGENTIK-SECURITY-KMS-AWS-01",
      checkedAt: new Date().toISOString(),
    };
  }

  async getKeyMetadata(_keyAlias: string, _orgSlug: string): Promise<KmsResult<KmsKeyMetadata>> {
    return this._notImplemented("getKeyMetadata");
  }

  getConfig(): Omit<AwsKmsConfig, "keyPolicyArn"> {
    return { region: this._config.region, endpoint: this._config.endpoint, defaultTags: this._config.defaultTags };
  }

  private _notImplemented(method: string): Promise<KmsResult<never>> {
    return Promise.resolve({
      ok:        false as const,
      error:     `aws_kms_not_integrated:${method} — implement in AGENTIK-SECURITY-KMS-AWS-01`,
      riskLevel: "HIGH" as const,
    });
  }
}
