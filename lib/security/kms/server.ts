/**
 * lib/security/kms/server.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Server-Only Barrel
 *
 * This barrel exports ALL KMS exports including server-only modules.
 * Import from here in server components, API routes, and server actions.
 *
 * DO NOT import from this barrel in client components — use index.ts instead.
 */

import "server-only";

// ── Types and domain contracts (safe everywhere) ───────────────────────────
export type {
  KmsProviderType,
  KmsKeyStatus,
  KmsOperation,
  KmsRiskLevel,
  KmsHealthStatus,
  KmsResult,
  KmsErrorCode,
  KmsAuditEventType,
  KmsAccessContext,
} from "./kms-types";
export {
  KMS_OPERATION_RISK,
  KMS_PROVIDER_PRIORITY,
} from "./kms-types";

export type {
  KmsKeyMetadata,
  KmsKeyCreateInput,
  KmsKeyVersionRef,
  KmsEncryptedEnvelope,
} from "./kms-key";
export {
  getKeyRiskLevel,
  isKeyActive,
  isKeyExpired,
  isKeyOperational,
  buildKeyVersionRef,
} from "./kms-key";

export type {
  KmsProvider,
  KmsEncryptParams,
  KmsDecryptParams,
  KmsDecryptResult,
  KmsRotateParams,
  KmsRotateResult,
  KmsKeyLifecycleParams,
  KmsProviderHealthResult,
} from "./kms-provider";

// ── Engine ─────────────────────────────────────────────────────────────────
export { KmsEngine, kmsEngine } from "./kms-engine";

// ── Key Registry ───────────────────────────────────────────────────────────
export {
  registerKey,
  getKey,
  getKeyByAlias,
  getKeyVersion,
  listKeys,
  listKeysByTenant,
  updateKey,
  removeKey,
  getRegistryStats,
} from "./key-registry";

// ── Provider Registry ──────────────────────────────────────────────────────
export {
  registerProvider,
  getProvider,
  resolveProvider,
  listRegisteredProviders,
  isProviderRegistered,
} from "./provider-registry";

// ── Providers ──────────────────────────────────────────────────────────────
export { localKmsProvider, LocalKmsProvider } from "./providers/local-kms-provider";
export { AwsKmsProvider } from "./providers/aws-kms-provider";
export type { AwsKmsConfig, AwsSdkAdapter } from "./providers/aws-kms-provider";
export { AzureKeyVaultProvider } from "./providers/azure-key-vault-provider";
export type { AzureKeyVaultConfig, AzureSdkAdapter } from "./providers/azure-key-vault-provider";
export { GcpKmsProvider } from "./providers/gcp-kms-provider";
export type { GcpKmsConfig, GcpSdkAdapter } from "./providers/gcp-kms-provider";

// ── Audit ──────────────────────────────────────────────────────────────────
export { recordKmsEvent, kmsAuditLog } from "./kms-audit";
export type { KmsAuditEvent, KmsAuditInput } from "./kms-audit";

// ── RBAC Integration ───────────────────────────────────────────────────────
export { checkKmsRbac, getRequiredKmsPermission, isAgentAllowedKmsOperation } from "./integrations/kms-rbac";
export type { KmsRbacInput, KmsRbacResult } from "./integrations/kms-rbac";

// ── Zero Trust Integration ─────────────────────────────────────────────────
export { checkKmsZeroTrust, getKmsZeroTrustAction } from "./integrations/kms-zero-trust";
export type { KmsZeroTrustInput } from "./integrations/kms-zero-trust";

// ── Encryption Adapter ─────────────────────────────────────────────────────
export { KmsEncryptionAdapter, kmsEncryptionAdapter, buildEncryptionContext } from "./integrations/kms-encryption";
export type { KmsEncryptionRequest, KmsDecryptionRequest } from "./integrations/kms-encryption";

// ── Vault Adapter ──────────────────────────────────────────────────────────
export { VaultKmsAdapter, vaultKmsAdapter, buildVaultKmsContext, getVaultKeyAlias } from "./integrations/kms-vault";
export type { VaultKmsEncryptRequest, VaultKmsDecryptRequest } from "./integrations/kms-vault";

// ── Secret Rotation Adapter ────────────────────────────────────────────────
export {
  KmsSecretRotationAdapter,
  kmsSecretRotationAdapter,
  buildRotationContext,
  getSecretKeyAlias,
} from "./integrations/kms-secret-rotation";
export type {
  RotationKmsRequest,
  RotationEncryptRequest,
  RotationDecryptRequest,
} from "./integrations/kms-secret-rotation";

// ── Health ─────────────────────────────────────────────────────────────────
export { evaluateKmsHealth, isKmsOperational } from "./kms-health";
export type { KmsHealthReport } from "./kms-health";

// ── Readiness ──────────────────────────────────────────────────────────────
export { scanKmsReadiness } from "./kms-readiness";
export type { KmsReadinessReport, KmsSubsystemCheck, KmsReadinessStatus } from "./kms-readiness";

// ── Dashboard ──────────────────────────────────────────────────────────────
export {
  buildKmsDashboard,
  buildEmptyKmsDashboard,
  buildTenantSummaries,
} from "./kms-dashboard-contract";
export type {
  KmsDashboardPayload,
  KmsTenantSummary,
} from "./kms-dashboard-contract";

// ── Repository ─────────────────────────────────────────────────────────────
export { InMemoryKmsRepository, inMemoryKmsRepository } from "./kms-repository";
export type { KmsRepository } from "./kms-repository";
export { PrismaKmsRepository, prismaKmsRepository } from "./persistence/prisma-kms-repository";

// ── Query ──────────────────────────────────────────────────────────────────
export {
  getActiveKeys,
  getRotatingKeys,
  getDisabledKeys,
  getRevokedKeys,
  getExpiredKeys,
  getProviderSummary,
  getTenantKeySummary,
  findKeyByAlgorithm,
  findKeyByVersion,
} from "./kms-query";
export type { KmsProviderSummary, KmsTenantKeySummary } from "./kms-query";

// ── Reports ────────────────────────────────────────────────────────────────
export {
  buildKeyInventoryReport,
  buildProviderReport,
  buildRotationReport,
  buildComplianceReport,
} from "./kms-report-builder";
export type {
  KmsKeyInventoryReport,
  KmsProviderReport,
  KmsRotationReport,
  KmsComplianceReport,
} from "./kms-report-builder";
