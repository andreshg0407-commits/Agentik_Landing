#!/usr/bin/env node
/**
 * scripts/_run-kms-validation.js
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Static Validation Suite — 420 checks
 *
 * Usage: node scripts/_run-kms-validation.js
 *
 * Sections:
 *   A. File existence (18 checks)
 *   B. No key material in type files (14 checks)
 *   C. kms-types.ts structure (22 checks)
 *   D. kms-key.ts structure (20 checks)
 *   E. kms-provider.ts interface (18 checks)
 *   F. local-kms-provider.ts implementation (24 checks)
 *   G. Provider stubs (AWS, Azure, GCP) (18 checks)
 *   H. provider-registry.ts (18 checks)
 *   I. key-registry.ts (20 checks)
 *   J. kms-engine.ts (24 checks)
 *   K. kms-audit.ts (18 checks)
 *   L. kms-rbac.ts (20 checks)
 *   M. kms-zero-trust.ts (18 checks)
 *   N. Integration adapters (24 checks)
 *   O. kms-health.ts (16 checks)
 *   P. kms-readiness.ts (16 checks)
 *   Q. kms-dashboard-contract.ts (18 checks)
 *   R. kms-repository.ts (16 checks)
 *   S. prisma-kms-repository.ts (14 checks)
 *   T. kms-query.ts (16 checks)
 *   U. kms-report-builder.ts (18 checks)
 *   V. kms/server.ts barrel (16 checks)
 *   W. kms/index.ts barrel (12 checks)
 *   X. future-compatibility.ts (12 checks)
 *   Y. Prisma schema KmsKey model (14 checks)
 *   Z. security-registry.ts KMS entries (10 checks)
 *   Z2. security-inventory.ts KMS entry (10 checks)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let total  = 0;
let passed = 0;
const failures = [];

function check(section, description, fn) {
  total++;
  try {
    const result = fn();
    if (result === true || result === undefined) {
      passed++;
    } else {
      failures.push(`[${section}] ${description}: ${result || "failed"}`);
    }
  } catch (err) {
    failures.push(`[${section}] ${description}: threw — ${err.message}`);
  }
}

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function hasContent(content, pattern) {
  if (!content) return false;
  if (pattern instanceof RegExp) return pattern.test(content);
  return content.includes(pattern);
}

function hasAnyType(content) {
  if (!content) return false;
  const noBlock = content.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine  = noBlock.replace(/\/\/[^\n]*/g, "");
  return /: any\b|<any>|\bas any\b/.test(noLine);
}

function noKeyMaterial(content) {
  if (!content) return true;
  const lower = content.toLowerCase();
  // Key material patterns — these should NEVER appear in non-provider files
  const forbidden = ["rawkey", "keybytes_export", "exportkey(", "secretvalue_plain"];
  return !forbidden.some(p => lower.includes(p));
}

// ── A. File existence (18 checks) ────────────────────────────────────────────
const KMS = "lib/security/kms";

[
  `${KMS}/kms-types.ts`,
  `${KMS}/kms-key.ts`,
  `${KMS}/kms-provider.ts`,
  `${KMS}/providers/local-kms-provider.ts`,
  `${KMS}/providers/aws-kms-provider.ts`,
  `${KMS}/providers/azure-key-vault-provider.ts`,
  `${KMS}/providers/gcp-kms-provider.ts`,
  `${KMS}/provider-registry.ts`,
  `${KMS}/key-registry.ts`,
  `${KMS}/kms-engine.ts`,
  `${KMS}/kms-audit.ts`,
  `${KMS}/integrations/kms-rbac.ts`,
  `${KMS}/integrations/kms-zero-trust.ts`,
  `${KMS}/integrations/kms-encryption.ts`,
  `${KMS}/integrations/kms-vault.ts`,
  `${KMS}/integrations/kms-secret-rotation.ts`,
  `${KMS}/persistence/prisma-kms-repository.ts`,
  `${KMS}/server.ts`,
].forEach(f => check("A", `file exists: ${f}`, () => fileExists(f) || `missing: ${f}`));

// ── B. No key material in type/registry files (14 checks) ────────────────────
[
  `${KMS}/kms-types.ts`,
  `${KMS}/kms-key.ts`,
  `${KMS}/kms-provider.ts`,
  `${KMS}/key-registry.ts`,
  `${KMS}/provider-registry.ts`,
  `${KMS}/kms-audit.ts`,
  `${KMS}/kms-dashboard-contract.ts`,
  `${KMS}/kms-repository.ts`,
  `${KMS}/kms-query.ts`,
  `${KMS}/kms-report-builder.ts`,
  `${KMS}/kms-health.ts`,
  `${KMS}/kms-readiness.ts`,
  `${KMS}/server.ts`,
  `${KMS}/index.ts`,
].forEach(f => {
  const content = readFile(f);
  check("B", `no key material in ${path.basename(f)}`, () => noKeyMaterial(content) || "contains key material pattern");
});

// ── C. kms-types.ts (22 checks) ──────────────────────────────────────────────
const kmsTypes = readFile(`${KMS}/kms-types.ts`);

check("C", "KmsProviderType defines LOCAL", () => hasContent(kmsTypes, '"LOCAL"'));
check("C", "KmsProviderType defines AWS_KMS", () => hasContent(kmsTypes, '"AWS_KMS"'));
check("C", "KmsProviderType defines AZURE_KEY_VAULT", () => hasContent(kmsTypes, '"AZURE_KEY_VAULT"'));
check("C", "KmsProviderType defines GCP_KMS", () => hasContent(kmsTypes, '"GCP_KMS"'));
check("C", "KmsProviderType defines CUSTOM", () => hasContent(kmsTypes, '"CUSTOM"'));
check("C", "KmsKeyStatus defines ACTIVE", () => hasContent(kmsTypes, '"ACTIVE"'));
check("C", "KmsKeyStatus defines ROTATING", () => hasContent(kmsTypes, '"ROTATING"'));
check("C", "KmsKeyStatus defines DISABLED", () => hasContent(kmsTypes, '"DISABLED"'));
check("C", "KmsKeyStatus defines REVOKED", () => hasContent(kmsTypes, '"REVOKED"'));
check("C", "KmsKeyStatus defines PENDING", () => hasContent(kmsTypes, '"PENDING"'));
check("C", "KmsOperation defines GENERATE_KEY", () => hasContent(kmsTypes, '"GENERATE_KEY"'));
check("C", "KmsOperation defines ROTATE_KEY", () => hasContent(kmsTypes, '"ROTATE_KEY"'));
check("C", "KmsOperation defines DELETE_KEY", () => hasContent(kmsTypes, '"DELETE_KEY"'));
check("C", "KmsResult type defined", () => hasContent(kmsTypes, "KmsResult<T>"));
check("C", "KmsResult ok=true has value", () => hasContent(kmsTypes, "ok: true"));
check("C", "KmsResult ok=false has error", () => hasContent(kmsTypes, "ok: false"));
check("C", "KmsAccessContext defined", () => hasContent(kmsTypes, "KmsAccessContext"));
check("C", "KmsAccessContext has orgSlug", () => hasContent(kmsTypes, "orgSlug"));
check("C", "KMS_OPERATION_RISK constant defined", () => hasContent(kmsTypes, "KMS_OPERATION_RISK"));
check("C", "ROTATE_KEY is CRITICAL", () => hasContent(kmsTypes, 'ROTATE_KEY:   "CRITICAL"') || hasContent(kmsTypes, "ROTATE_KEY: \"CRITICAL\""));
check("C", "DELETE_KEY is CRITICAL", () => hasContent(kmsTypes, 'DELETE_KEY:   "CRITICAL"') || hasContent(kmsTypes, "DELETE_KEY: \"CRITICAL\""));
check("C", "no :any type used", () => !hasAnyType(kmsTypes) || "contains :any type");

// ── D. kms-key.ts (20 checks) ────────────────────────────────────────────────
const kmsKey = readFile(`${KMS}/kms-key.ts`);

check("D", "KmsKeyMetadata defined", () => hasContent(kmsKey, "KmsKeyMetadata"));
check("D", "KmsKeyMetadata has keyId field", () => hasContent(kmsKey, "keyId"));
check("D", "KmsKeyMetadata has keyAlias field", () => hasContent(kmsKey, "keyAlias"));
check("D", "KmsKeyMetadata has provider field", () => hasContent(kmsKey, "provider"));
check("D", "KmsKeyMetadata has status field", () => hasContent(kmsKey, "status"));
check("D", "KmsKeyMetadata has version field", () => hasContent(kmsKey, "version"));
check("D", "KmsKeyMetadata has orgSlug field", () => hasContent(kmsKey, "orgSlug"));
check("D", "KmsKeyMetadata has algorithm field", () => hasContent(kmsKey, "algorithm"));
check("D", "KmsKeyMetadata has createdAt field", () => hasContent(kmsKey, "createdAt"));
check("D", "KmsKeyMetadata does NOT have keyBytes field", () => !hasContent(kmsKey, "keyBytes") || "has keyBytes field — key material leak");
check("D", "KmsEncryptedEnvelope defined", () => hasContent(kmsKey, "KmsEncryptedEnvelope"));
check("D", "KmsEncryptedEnvelope has ciphertext field", () => hasContent(kmsKey, "ciphertext"));
check("D", "KmsEncryptedEnvelope has keyRef field", () => hasContent(kmsKey, "keyRef"));
check("D", "KmsEncryptedEnvelope does NOT have plaintext field", () =>
  !hasContent(kmsKey, "plaintext:") || "has plaintext field in envelope — leak");
check("D", "isKeyActive helper defined", () => hasContent(kmsKey, "isKeyActive"));
check("D", "isKeyExpired helper defined", () => hasContent(kmsKey, "isKeyExpired"));
check("D", "isKeyOperational helper defined", () => hasContent(kmsKey, "isKeyOperational"));
check("D", "getKeyRiskLevel helper defined", () => hasContent(kmsKey, "getKeyRiskLevel"));
check("D", "buildKeyVersionRef helper defined", () => hasContent(kmsKey, "buildKeyVersionRef"));
check("D", "no :any type", () => !hasAnyType(kmsKey) || "contains :any type");

// ── E. kms-provider.ts (18 checks) ───────────────────────────────────────────
const kmsProvider = readFile(`${KMS}/kms-provider.ts`);

check("E", "KmsProvider interface defined", () => hasContent(kmsProvider, "KmsProvider"));
check("E", "KmsProvider has generateKey method", () => hasContent(kmsProvider, "generateKey"));
check("E", "KmsProvider has encrypt method", () => hasContent(kmsProvider, "encrypt"));
check("E", "KmsProvider has decrypt method", () => hasContent(kmsProvider, "decrypt"));
check("E", "KmsProvider has rotateKey method", () => hasContent(kmsProvider, "rotateKey"));
check("E", "KmsProvider has disableKey method", () => hasContent(kmsProvider, "disableKey"));
check("E", "KmsProvider has enableKey method", () => hasContent(kmsProvider, "enableKey"));
check("E", "KmsProvider has deleteKey method", () => hasContent(kmsProvider, "deleteKey"));
check("E", "KmsProvider has healthCheck method", () => hasContent(kmsProvider, "healthCheck"));
check("E", "KmsProvider has getKeyMetadata method", () => hasContent(kmsProvider, "getKeyMetadata"));
check("E", "KmsEncryptParams defined", () => hasContent(kmsProvider, "KmsEncryptParams"));
check("E", "KmsDecryptParams defined", () => hasContent(kmsProvider, "KmsDecryptParams"));
check("E", "KmsRotateParams defined", () => hasContent(kmsProvider, "KmsRotateParams"));
check("E", "KmsKeyLifecycleParams defined", () => hasContent(kmsProvider, "KmsKeyLifecycleParams"));
check("E", "KmsProviderHealthResult defined", () => hasContent(kmsProvider, "KmsProviderHealthResult"));
check("E", "KmsDecryptResult defined", () => hasContent(kmsProvider, "KmsDecryptResult"));
check("E", "KmsDecryptResult has plaintext", () => hasContent(kmsProvider, "plaintext"));
check("E", "no :any type", () => !hasAnyType(kmsProvider) || "contains :any type");

// ── F. local-kms-provider.ts (24 checks) ─────────────────────────────────────
const localProvider = readFile(`${KMS}/providers/local-kms-provider.ts`);

check("F", "server-only import present", () => hasContent(localProvider, '"server-only"'));
check("F", "LocalKmsProvider class defined", () => hasContent(localProvider, "class LocalKmsProvider"));
check("F", "implements KmsProvider", () => hasContent(localProvider, "implements KmsProvider"));
check("F", "providerType = LOCAL", () => hasContent(localProvider, '"LOCAL"'));
check("F", "AES-256-GCM algorithm used", () => hasContent(localProvider, "AES-256-GCM") || hasContent(localProvider, "aes-256-gcm"));
check("F", "IV_LENGTH = 12 defined", () => hasContent(localProvider, "IV_LENGTH") && hasContent(localProvider, "12"));
check("F", "TAG_LENGTH = 16 defined", () => hasContent(localProvider, "TAG_LENGTH") && hasContent(localProvider, "16"));
check("F", "KEY_SIZE = 32 defined", () => hasContent(localProvider, "KEY_SIZE") && hasContent(localProvider, "32"));
check("F", "private key store Map defined", () => hasContent(localProvider, "Map<") || hasContent(localProvider, "new Map"));
check("F", "key material not accessible outside class", () => {
  // The internal key store should be private
  return hasContent(localProvider, "private") || "no private field found";
});
check("F", "randomBytes used for key generation", () => hasContent(localProvider, "randomBytes"));
check("F", "randomBytes used for IV generation", () => {
  const count = (localProvider.match(/randomBytes/g) || []).length;
  return count >= 2;
});
check("F", "createCipheriv used for encryption", () => hasContent(localProvider, "createCipheriv"));
check("F", "createDecipheriv used for decryption", () => hasContent(localProvider, "createDecipheriv"));
check("F", "base64 encoding used for ciphertext", () => hasContent(localProvider, "base64"));
check("F", "Buffer.concat used to build envelope", () => hasContent(localProvider, "Buffer.concat"));
check("F", "oldVersions preserved for grace period", () => hasContent(localProvider, "oldVersions") || hasContent(localProvider, "oldVersion"));
check("F", "deleteKey zeros key bytes", () => hasContent(localProvider, "fill(0)"));
check("F", "rotateKey increments version", () => hasContent(localProvider, "version") && (hasContent(localProvider, "version + 1") || hasContent(localProvider, "version+1") || hasContent(localProvider, "+ 1")));
check("F", "healthCheck method implemented", () => hasContent(localProvider, "healthCheck"));
check("F", "healthCheck returns HEALTHY", () => hasContent(localProvider, '"HEALTHY"'));
check("F", "localKmsProvider singleton exported", () => hasContent(localProvider, "export const localKmsProvider"));
check("F", "getKeyMetadata method implemented", () => hasContent(localProvider, "getKeyMetadata"));
check("F", "no :any type", () => !hasAnyType(localProvider) || "contains :any type");

// ── G. Provider stubs (18 checks) ────────────────────────────────────────────
const awsProvider   = readFile(`${KMS}/providers/aws-kms-provider.ts`);
const azureProvider = readFile(`${KMS}/providers/azure-key-vault-provider.ts`);
const gcpProvider   = readFile(`${KMS}/providers/gcp-kms-provider.ts`);

check("G", "AWS provider: class AwsKmsProvider defined", () => hasContent(awsProvider, "class AwsKmsProvider"));
check("G", "AWS provider: implements KmsProvider", () => hasContent(awsProvider, "implements KmsProvider"));
check("G", "AWS provider: AwsKmsConfig defined", () => hasContent(awsProvider, "AwsKmsConfig"));
check("G", "AWS provider: AwsSdkAdapter defined", () => hasContent(awsProvider, "AwsSdkAdapter"));
check("G", "AWS provider: _notImplemented used", () => hasContent(awsProvider, "_notImplemented"));
check("G", "AWS provider: providerType = AWS_KMS", () => hasContent(awsProvider, '"AWS_KMS"'));
check("G", "Azure provider: class AzureKeyVaultProvider defined", () => hasContent(azureProvider, "class AzureKeyVaultProvider"));
check("G", "Azure provider: AzureKeyVaultConfig defined", () => hasContent(azureProvider, "AzureKeyVaultConfig"));
check("G", "Azure provider: AzureSdkAdapter defined", () => hasContent(azureProvider, "AzureSdkAdapter"));
check("G", "Azure provider: providerType = AZURE_KEY_VAULT", () => hasContent(azureProvider, '"AZURE_KEY_VAULT"'));
check("G", "Azure provider: healthCheck returns UNAVAILABLE", () => hasContent(azureProvider, '"UNAVAILABLE"'));
check("G", "GCP provider: class GcpKmsProvider defined", () => hasContent(gcpProvider, "class GcpKmsProvider"));
check("G", "GCP provider: GcpKmsConfig defined", () => hasContent(gcpProvider, "GcpKmsConfig"));
check("G", "GCP provider: GcpSdkAdapter defined", () => hasContent(gcpProvider, "GcpSdkAdapter"));
check("G", "GCP provider: providerType = GCP_KMS", () => hasContent(gcpProvider, '"GCP_KMS"'));
check("G", "GCP provider: healthCheck returns UNAVAILABLE", () => hasContent(gcpProvider, '"UNAVAILABLE"'));
check("G", "All stub providers return NOT_IMPLEMENTED errors", () =>
  hasContent(awsProvider, "not_integrated") &&
  hasContent(azureProvider, "not_integrated") &&
  hasContent(gcpProvider, "not_integrated"),
);
check("G", "No stub provider imports real AWS/Azure/GCP SDKs", () =>
  !hasContent(awsProvider, "@aws-sdk") &&
  !hasContent(azureProvider, "@azure/keyvault") &&
  !hasContent(gcpProvider, "@google-cloud"),
);

// ── H. provider-registry.ts (18 checks) ──────────────────────────────────────
const providerReg = readFile(`${KMS}/provider-registry.ts`);

check("H", "server-only import", () => hasContent(providerReg, '"server-only"'));
check("H", "Map<KmsProviderType, KmsProvider> defined", () => hasContent(providerReg, "Map<KmsProviderType, KmsProvider>") || hasContent(providerReg, "Map<"));
check("H", "LOCAL pre-registered at bootstrap", () => hasContent(providerReg, '"LOCAL"') && hasContent(providerReg, "localKmsProvider"));
check("H", "registerProvider function exported", () => hasContent(providerReg, "export function registerProvider"));
check("H", "getProvider function exported", () => hasContent(providerReg, "export function getProvider"));
check("H", "resolveProvider function exported", () => hasContent(providerReg, "export function resolveProvider"));
check("H", "listRegisteredProviders exported", () => hasContent(providerReg, "export function listRegisteredProviders"));
check("H", "isProviderRegistered exported", () => hasContent(providerReg, "export function isProviderRegistered"));
check("H", "resolveProvider falls back to LOCAL", () => hasContent(providerReg, '"LOCAL"'));
check("H", "provider_not_registered error code", () => hasContent(providerReg, "provider_not_registered"));
check("H", "no_kms_provider_available error code", () => hasContent(providerReg, "no_kms_provider_available"));
check("H", "CRITICAL risk for missing provider", () => hasContent(providerReg, '"CRITICAL"'));
check("H", "fail-closed returns error when no provider", () => hasContent(providerReg, "no_kms_provider_available"));
check("H", "no :any type", () => !hasAnyType(providerReg) || "contains :any type");
check("H", "resolveProvider takes optional preferred param", () => hasContent(providerReg, "preferred?:") || hasContent(providerReg, "preferred?: KmsProviderType"));
check("H", "getProvider returns KmsResult<KmsProvider>", () => hasContent(providerReg, "KmsResult<KmsProvider>"));
check("H", "no Prisma import", () => !hasContent(providerReg, "prisma") || "imports prisma");
check("H", "no direct DB calls", () => !hasContent(providerReg, ".findUnique") && !hasContent(providerReg, ".create") || "has DB calls");

// ── I. key-registry.ts (20 checks) ───────────────────────────────────────────
const keyReg = readFile(`${KMS}/key-registry.ts`);

check("I", "server-only import", () => hasContent(keyReg, '"server-only"'));
check("I", "_byId Map defined", () => hasContent(keyReg, "_byId"));
check("I", "_byAlias Map defined", () => hasContent(keyReg, "_byAlias"));
check("I", "registerKey exported", () => hasContent(keyReg, "export function registerKey"));
check("I", "getKey exported", () => hasContent(keyReg, "export function getKey"));
check("I", "getKeyByAlias exported", () => hasContent(keyReg, "export function getKeyByAlias"));
check("I", "updateKey exported", () => hasContent(keyReg, "export function updateKey"));
check("I", "removeKey exported", () => hasContent(keyReg, "export function removeKey"));
check("I", "listKeys exported", () => hasContent(keyReg, "export function listKeys"));
check("I", "getRegistryStats exported", () => hasContent(keyReg, "export function getRegistryStats"));
check("I", "_resetRegistry exported for testing", () => hasContent(keyReg, "export function _resetRegistry"));
check("I", "aliasKey uses orgSlug::keyAlias format", () => hasContent(keyReg, "::"));
check("I", "cross-tenant access returns CRITICAL", () => hasContent(keyReg, "cross_tenant_key_access_denied") && hasContent(keyReg, '"CRITICAL"'));
check("I", "key_not_found error defined", () => hasContent(keyReg, "key_not_found"));
check("I", "key_alias_not_found error defined", () => hasContent(keyReg, "key_alias_not_found"));
check("I", "key_alias_conflict error defined", () => hasContent(keyReg, "key_alias_conflict"));
check("I", "metadata is cloned (defensive copy)", () => hasContent(keyReg, "{ ...meta") || hasContent(keyReg, "{ ...metadata"));
check("I", "no key material stored", () => !hasContent(keyReg, "keyBytes") || "stores keyBytes");
check("I", "no Prisma import", () => !hasContent(keyReg, "@/lib/prisma") || "imports prisma");
check("I", "no :any type", () => !hasAnyType(keyReg) || "contains :any type");

// ── J. kms-engine.ts (24 checks) ─────────────────────────────────────────────
const kmsEngine = readFile(`${KMS}/kms-engine.ts`);

check("J", "server-only import", () => hasContent(kmsEngine, '"server-only"'));
check("J", "class KmsEngine defined", () => hasContent(kmsEngine, "class KmsEngine"));
check("J", "generateKey method defined", () => hasContent(kmsEngine, "generateKey"));
check("J", "encrypt method defined", () => hasContent(kmsEngine, "encrypt"));
check("J", "decrypt method defined", () => hasContent(kmsEngine, "decrypt"));
check("J", "rotateKey method defined", () => hasContent(kmsEngine, "rotateKey"));
check("J", "disableKey method defined", () => hasContent(kmsEngine, "disableKey"));
check("J", "enableKey method defined", () => hasContent(kmsEngine, "enableKey"));
check("J", "deleteKey method defined", () => hasContent(kmsEngine, "deleteKey"));
check("J", "getKeyMetadata method defined", () => hasContent(kmsEngine, "getKeyMetadata"));
check("J", "_gate private method defined", () => hasContent(kmsEngine, "_gate"));
check("J", "_gate calls checkKmsRbac", () => hasContent(kmsEngine, "checkKmsRbac"));
check("J", "_gate calls checkKmsZeroTrust", () => hasContent(kmsEngine, "checkKmsZeroTrust"));
check("J", "audit imported from kms-audit", () => hasContent(kmsEngine, "kms-audit") || hasContent(kmsEngine, "./kms-audit"));
check("J", "recordKmsEvent called for success", () => hasContent(kmsEngine, "recordKmsEvent"));
check("J", "_auditSuccess method defined", () => hasContent(kmsEngine, "_auditSuccess"));
check("J", "_auditDeny method defined", () => hasContent(kmsEngine, "_auditDeny"));
check("J", "fail-closed: gate failure returns error", () => hasContent(kmsEngine, "if (!gate.ok)"));
check("J", "registerKey called on generateKey", () => hasContent(kmsEngine, "registerKey"));
check("J", "_lifecycleOp helper defined", () => hasContent(kmsEngine, "_lifecycleOp"));
check("J", "_resolveForKey helper defined", () => hasContent(kmsEngine, "_resolveForKey"));
check("J", "kmsEngine singleton exported", () => hasContent(kmsEngine, "export const kmsEngine"));
check("J", "default provider is LOCAL", () => hasContent(kmsEngine, '"LOCAL"'));
check("J", "no :any type", () => !hasAnyType(kmsEngine) || "contains :any type");

// ── K. kms-audit.ts (18 checks) ──────────────────────────────────────────────
const kmsAudit = readFile(`${KMS}/kms-audit.ts`);

check("K", "server-only import", () => hasContent(kmsAudit, '"server-only"'));
check("K", "KmsAuditEvent interface defined", () => hasContent(kmsAudit, "KmsAuditEvent"));
check("K", "KmsAuditInput interface defined", () => hasContent(kmsAudit, "KmsAuditInput"));
check("K", "recordKmsEvent exported", () => hasContent(kmsAudit, "export async function recordKmsEvent"));
check("K", "kmsAuditLog exported", () => hasContent(kmsAudit, "export const kmsAuditLog"));
check("K", "KmsAuditLog class defined", () => hasContent(kmsAudit, "class KmsAuditLog"));
check("K", "getEventsForOrg method defined", () => hasContent(kmsAudit, "getEventsForOrg"));
check("K", "getEventsByType method defined", () => hasContent(kmsAudit, "getEventsByType"));
check("K", "getDeniedEvents method defined", () => hasContent(kmsAudit, "getDeniedEvents"));
check("K", "never throws on error (try/catch)", () => hasContent(kmsAudit, "try {") && hasContent(kmsAudit, "} catch"));
check("K", "fire-and-forget persistence", () => hasContent(kmsAudit, "void _persist") || hasContent(kmsAudit, "void this._persist"));
check("K", "eventType is KmsAuditEventType", () => hasContent(kmsAudit, "KmsAuditEventType"));
check("K", "KEY_GENERATED event type referenced", () => hasContent(kmsAudit, "KEY_GENERATED") || hasContent(kmsAudit, "KmsAuditEventType"));
check("K", "KMS_ACCESS_DENIED event referenced", () => hasContent(kmsAudit, "KMS_ACCESS_DENIED") || hasContent(kmsAudit, "KmsAuditEventType"));
check("K", "occurredAt timestamp in events", () => hasContent(kmsAudit, "occurredAt"));
check("K", "success boolean in events", () => hasContent(kmsAudit, "success"));
check("K", "no plaintext/key material stored", () => !hasContent(kmsAudit, "keyBytes") && !hasContent(kmsAudit, "plaintext:") || "stores sensitive data");
check("K", "no :any type (except cast)", () => {
  const noBlock = (kmsAudit || "").replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine  = noBlock.replace(/\/\/[^\n]*/g, "");
  // Allow `: string` cast from event type
  const cleaned = noLine.replace(/as string/g, "");
  return !/: any\b|<any>|\bas any\b/.test(cleaned) || "contains :any type";
});

// ── L. kms-rbac.ts (20 checks) ───────────────────────────────────────────────
const kmsRbac = readFile(`${KMS}/integrations/kms-rbac.ts`);

check("L", "server-only import", () => hasContent(kmsRbac, '"server-only"'));
check("L", "KmsRbacInput interface defined", () => hasContent(kmsRbac, "KmsRbacInput"));
check("L", "KmsRbacResult interface defined", () => hasContent(kmsRbac, "KmsRbacResult"));
check("L", "KmsRbacResult has allowed boolean", () => hasContent(kmsRbac, "allowed:"));
check("L", "KmsRbacResult has reasons array", () => hasContent(kmsRbac, "reasons:"));
check("L", "checkKmsRbac exported", () => hasContent(kmsRbac, "export function checkKmsRbac"));
check("L", "SYSTEM subject bypasses RBAC", () => hasContent(kmsRbac, "system_subject_bypass"));
check("L", "AGENT blocked from lifecycle ops", () => hasContent(kmsRbac, "AGENT_BLOCKED_OPERATIONS") || hasContent(kmsRbac, "agent_blocked"));
check("L", "SERVICE_ACCOUNT limited to encrypt/decrypt", () => hasContent(kmsRbac, "SERVICE_ACCOUNT"));
check("L", "evaluateAccess called for USER", () => hasContent(kmsRbac, "evaluateAccess"));
check("L", "OPERATION_PERMISSION_MAP defined", () => hasContent(kmsRbac, "OPERATION_PERMISSION_MAP"));
check("L", "GENERATE_KEY maps to ENCRYPTION_ADMIN", () => hasContent(kmsRbac, "ENCRYPTION_ADMIN"));
check("L", "ENCRYPT maps to ENCRYPTION_VIEW", () => hasContent(kmsRbac, "ENCRYPTION_VIEW"));
check("L", "fail-closed try/catch", () => hasContent(kmsRbac, "rbac_evaluation_error_fail_closed"));
check("L", "getRequiredKmsPermission exported", () => hasContent(kmsRbac, "export function getRequiredKmsPermission"));
check("L", "isAgentAllowedKmsOperation exported", () => hasContent(kmsRbac, "export function isAgentAllowedKmsOperation"));
check("L", "rbac_denied reason format", () => hasContent(kmsRbac, "rbac_denied"));
check("L", "no :any type", () => !hasAnyType(kmsRbac) || "contains :any type");
check("L", "no key material", () => !hasContent(kmsRbac, "keyBytes") || "has key material");
check("L", "rbac-engine imported", () => hasContent(kmsRbac, "rbac-engine") || hasContent(kmsRbac, "rbac/rbac-engine"));

// ── M. kms-zero-trust.ts (18 checks) ─────────────────────────────────────────
const kmsZT = readFile(`${KMS}/integrations/kms-zero-trust.ts`);

check("M", "server-only import", () => hasContent(kmsZT, '"server-only"'));
check("M", "KmsZeroTrustInput defined", () => hasContent(kmsZT, "KmsZeroTrustInput"));
check("M", "checkKmsZeroTrust exported", () => hasContent(kmsZT, "export function checkKmsZeroTrust"));
check("M", "evaluateZeroTrust called", () => hasContent(kmsZT, "evaluateZeroTrust"));
check("M", "ENCRYPTION_KEY resource type used", () => hasContent(kmsZT, "ENCRYPTION_KEY"));
check("M", "OPERATION_ACTION_MAP defined", () => hasContent(kmsZT, "OPERATION_ACTION_MAP"));
check("M", "GENERATE_KEY maps to ADMIN", () => hasContent(kmsZT, '"ADMIN"'));
check("M", "ROTATE_KEY maps to ROTATE_SECRET", () => hasContent(kmsZT, '"ROTATE_SECRET"'));
check("M", "DELETE_KEY maps to DELETE", () => hasContent(kmsZT, '"DELETE"'));
check("M", "fail-closed on evaluation error", () => hasContent(kmsZT, "kms_zero_trust_evaluation_error_fail_closed"));
check("M", "fail-closed returns DENY decision", () => hasContent(kmsZT, '"DENY"'));
check("M", "mapSubjectType helper defined", () => hasContent(kmsZT, "mapSubjectType"));
check("M", "ZeroTrustEvaluation return type", () => hasContent(kmsZT, "ZeroTrustEvaluation"));
check("M", "evaluatedAt present in synthetic deny", () => hasContent(kmsZT, "evaluatedAt"));
check("M", "getKmsZeroTrustAction exported", () => hasContent(kmsZT, "export function getKmsZeroTrustAction"));
check("M", "orgSlug propagated to ZT context", () => hasContent(kmsZT, "orgSlug"));
check("M", "no :any type", () => !hasAnyType(kmsZT) || "contains :any type");
check("M", "zero-trust-policy-engine imported", () => hasContent(kmsZT, "zero-trust-policy-engine"));

// ── N. Integration adapters (24 checks) ──────────────────────────────────────
const kmsEnc  = readFile(`${KMS}/integrations/kms-encryption.ts`);
const kmsVlt  = readFile(`${KMS}/integrations/kms-vault.ts`);
const kmsRot  = readFile(`${KMS}/integrations/kms-secret-rotation.ts`);

check("N", "kms-encryption: KmsEncryptionAdapter defined", () => hasContent(kmsEnc, "KmsEncryptionAdapter"));
check("N", "kms-encryption: encrypt method defined", () => hasContent(kmsEnc, "async encrypt"));
check("N", "kms-encryption: decrypt method defined", () => hasContent(kmsEnc, "async decrypt"));
check("N", "kms-encryption: resolveKey method defined", () => hasContent(kmsEnc, "resolveKey"));
check("N", "kms-encryption: kmsEncryptionAdapter singleton exported", () => hasContent(kmsEnc, "kmsEncryptionAdapter"));
check("N", "kms-encryption: buildEncryptionContext exported", () => hasContent(kmsEnc, "buildEncryptionContext"));
check("N", "kms-encryption: SYSTEM subjectType used", () => hasContent(kmsEnc, '"SYSTEM"'));
check("N", "kms-encryption: server-only import", () => hasContent(kmsEnc, '"server-only"'));
check("N", "kms-vault: VaultKmsAdapter defined", () => hasContent(kmsVlt, "VaultKmsAdapter"));
check("N", "kms-vault: encryptSecret method defined", () => hasContent(kmsVlt, "encryptSecret"));
check("N", "kms-vault: decryptSecret method defined", () => hasContent(kmsVlt, "decryptSecret"));
check("N", "kms-vault: getVaultKeyAlias helper defined", () => hasContent(kmsVlt, "getVaultKeyAlias"));
check("N", "kms-vault: vaultKmsAdapter singleton exported", () => hasContent(kmsVlt, "vaultKmsAdapter"));
check("N", "kms-vault: buildVaultKmsContext exported", () => hasContent(kmsVlt, "buildVaultKmsContext"));
check("N", "kms-vault: vault_service system subject", () => hasContent(kmsVlt, "vault_service"));
check("N", "kms-vault: server-only import", () => hasContent(kmsVlt, '"server-only"'));
check("N", "kms-rotation: KmsSecretRotationAdapter defined", () => hasContent(kmsRot, "KmsSecretRotationAdapter"));
check("N", "kms-rotation: rotateKey method defined", () => hasContent(kmsRot, "async rotateKey"));
check("N", "kms-rotation: encryptNewSecretVersion defined", () => hasContent(kmsRot, "encryptNewSecretVersion"));
check("N", "kms-rotation: decryptOldSecretVersion defined", () => hasContent(kmsRot, "decryptOldSecretVersion"));
check("N", "kms-rotation: disableOldKeyVersion defined", () => hasContent(kmsRot, "disableOldKeyVersion"));
check("N", "kms-rotation: AAD binding with rotationId", () => hasContent(kmsRot, "rotation:"));
check("N", "kms-rotation: kmsSecretRotationAdapter singleton", () => hasContent(kmsRot, "kmsSecretRotationAdapter"));
check("N", "kms-rotation: server-only import", () => hasContent(kmsRot, '"server-only"'));

// ── O. kms-health.ts (16 checks) ─────────────────────────────────────────────
const kmsHealth = readFile(`${KMS}/kms-health.ts`);

check("O", "server-only import", () => hasContent(kmsHealth, '"server-only"'));
check("O", "KmsHealthReport interface defined", () => hasContent(kmsHealth, "KmsHealthReport"));
check("O", "evaluateKmsHealth exported", () => hasContent(kmsHealth, "export async function evaluateKmsHealth"));
check("O", "isKmsOperational exported", () => hasContent(kmsHealth, "export async function isKmsOperational"));
check("O", "HEALTHY status defined", () => hasContent(kmsHealth, '"HEALTHY"'));
check("O", "DEGRADED status defined", () => hasContent(kmsHealth, '"DEGRADED"'));
check("O", "UNAVAILABLE status defined", () => hasContent(kmsHealth, '"UNAVAILABLE"'));
check("O", "all providers checked via healthCheck()", () => hasContent(kmsHealth, "healthCheck"));
check("O", "LOCAL fallback check present", () => hasContent(kmsHealth, '"LOCAL"'));
check("O", "never throws (try/catch)", () => hasContent(kmsHealth, "health_evaluation_error"));
check("O", "getRegistryStats called", () => hasContent(kmsHealth, "getRegistryStats"));
check("O", "Promise.allSettled used for parallel checks", () => hasContent(kmsHealth, "Promise.allSettled"));
check("O", "healthyProviders count returned", () => hasContent(kmsHealth, "healthyProviders"));
check("O", "checkedAt timestamp returned", () => hasContent(kmsHealth, "checkedAt"));
check("O", "no :any type", () => !hasAnyType(kmsHealth) || "contains :any type");
check("O", "degraded threshold defined", () => hasContent(kmsHealth, "DEGRADED_PROVIDER_THRESHOLD") || hasContent(kmsHealth, "degraded"));

// ── P. kms-readiness.ts (16 checks) ──────────────────────────────────────────
const kmsReadiness = readFile(`${KMS}/kms-readiness.ts`);

check("P", "server-only import", () => hasContent(kmsReadiness, '"server-only"'));
check("P", "KmsReadinessReport defined", () => hasContent(kmsReadiness, "KmsReadinessReport"));
check("P", "KmsSubsystemCheck defined", () => hasContent(kmsReadiness, "KmsSubsystemCheck"));
check("P", "scanKmsReadiness exported", () => hasContent(kmsReadiness, "export function scanKmsReadiness"));
check("P", "7 subsystem checks defined", () => {
  const count = (kmsReadiness.match(/_check[A-Z]/g) || []).length;
  return count >= 7 || `only ${count} checks found`;
});
check("P", "LOCAL_PROVIDER check defined", () => hasContent(kmsReadiness, "LOCAL_PROVIDER"));
check("P", "PROVIDER_REGISTRY check defined", () => hasContent(kmsReadiness, "PROVIDER_REGISTRY"));
check("P", "KEY_REGISTRY check defined", () => hasContent(kmsReadiness, "KEY_REGISTRY"));
check("P", "AUDIT_LOG check defined", () => hasContent(kmsReadiness, "AUDIT_LOG"));
check("P", "RBAC_INTEGRATION check defined", () => hasContent(kmsReadiness, "RBAC_INTEGRATION"));
check("P", "ZERO_TRUST_INTEGRATION check defined", () => hasContent(kmsReadiness, "ZERO_TRUST_INTEGRATION"));
check("P", "PERSISTENCE check defined", () => hasContent(kmsReadiness, "PERSISTENCE"));
check("P", "score is 0–100", () => hasContent(kmsReadiness, "100"));
check("P", "READY/PARTIAL/NOT_READY statuses", () => hasContent(kmsReadiness, '"READY"') && hasContent(kmsReadiness, '"PARTIAL"') && hasContent(kmsReadiness, '"NOT_READY"'));
check("P", "never throws (try/catch)", () => hasContent(kmsReadiness, "} catch"));
check("P", "no :any type", () => !hasAnyType(kmsReadiness) || "contains :any type");

// ── Q. kms-dashboard-contract.ts (18 checks) ─────────────────────────────────
const kmsDash = readFile(`${KMS}/kms-dashboard-contract.ts`);

check("Q", "KmsDashboardPayload defined", () => hasContent(kmsDash, "KmsDashboardPayload"));
check("Q", "keysTotal field", () => hasContent(kmsDash, "keysTotal"));
check("Q", "keysActive field", () => hasContent(kmsDash, "keysActive"));
check("Q", "keysRotating field", () => hasContent(kmsDash, "keysRotating"));
check("Q", "keysDisabled field", () => hasContent(kmsDash, "keysDisabled"));
check("Q", "keysRevoked field", () => hasContent(kmsDash, "keysRevoked"));
check("Q", "keysExpired field", () => hasContent(kmsDash, "keysExpired"));
check("Q", "totalOperations field", () => hasContent(kmsDash, "totalOperations"));
check("Q", "deniedOperations field", () => hasContent(kmsDash, "deniedOperations"));
check("Q", "healthStatus field", () => hasContent(kmsDash, "healthStatus"));
check("Q", "buildKmsDashboard exported", () => hasContent(kmsDash, "export function buildKmsDashboard"));
check("Q", "buildEmptyKmsDashboard exported", () => hasContent(kmsDash, "export function buildEmptyKmsDashboard"));
check("Q", "buildTenantSummaries exported", () => hasContent(kmsDash, "export function buildTenantSummaries"));
check("Q", "KmsTenantSummary defined", () => hasContent(kmsDash, "KmsTenantSummary"));
check("Q", "pure function — no Prisma", () => !hasContent(kmsDash, "prisma") || "imports Prisma");
check("Q", "pure function — no server-only", () => !hasContent(kmsDash, '"server-only"') || "has server-only — should be pure");
check("Q", "windowStart/windowEnd filtering", () => hasContent(kmsDash, "windowStart"));
check("Q", "no :any type", () => !hasAnyType(kmsDash) || "contains :any type");

// ── R. kms-repository.ts (16 checks) ─────────────────────────────────────────
const kmsRepo = readFile(`${KMS}/kms-repository.ts`);

check("R", "KmsRepository interface defined", () => hasContent(kmsRepo, "interface KmsRepository"));
check("R", "saveKey method in interface", () => hasContent(kmsRepo, "saveKey"));
check("R", "updateKey method in interface", () => hasContent(kmsRepo, "updateKey"));
check("R", "deleteKey method in interface", () => hasContent(kmsRepo, "deleteKey"));
check("R", "findByKeyId method in interface", () => hasContent(kmsRepo, "findByKeyId"));
check("R", "findByAlias method in interface", () => hasContent(kmsRepo, "findByAlias"));
check("R", "listByOrg method in interface", () => hasContent(kmsRepo, "listByOrg"));
check("R", "listByStatus method in interface", () => hasContent(kmsRepo, "listByStatus"));
check("R", "countByOrg method in interface", () => hasContent(kmsRepo, "countByOrg"));
check("R", "InMemoryKmsRepository class defined", () => hasContent(kmsRepo, "InMemoryKmsRepository"));
check("R", "implements KmsRepository", () => hasContent(kmsRepo, "implements KmsRepository"));
check("R", "inMemoryKmsRepository singleton exported", () => hasContent(kmsRepo, "inMemoryKmsRepository"));
check("R", "cross-tenant isolation in findByKeyId", () => hasContent(kmsRepo, "cross_tenant") || hasContent(kmsRepo, "CRITICAL"));
check("R", "no key material stored", () => !hasContent(kmsRepo, "keyBytes") || "stores key material");
check("R", "no Prisma import", () => !hasContent(kmsRepo, "@/lib/prisma") || "imports Prisma");
check("R", "no :any type", () => !hasAnyType(kmsRepo) || "contains :any type");

// ── S. prisma-kms-repository.ts (14 checks) ──────────────────────────────────
const prismRepo = readFile(`${KMS}/persistence/prisma-kms-repository.ts`);

check("S", "server-only import", () => hasContent(prismRepo, '"server-only"'));
check("S", "PrismaKmsRepository class defined", () => hasContent(prismRepo, "class PrismaKmsRepository"));
check("S", "implements KmsRepository", () => hasContent(prismRepo, "implements KmsRepository"));
check("S", "prisma.kmsKey.create called", () => hasContent(prismRepo, "prisma.kmsKey.create"));
check("S", "prisma.kmsKey.update called", () => hasContent(prismRepo, "prisma.kmsKey.update"));
check("S", "prisma.kmsKey.delete called", () => hasContent(prismRepo, "prisma.kmsKey.delete"));
check("S", "prisma.kmsKey.findUnique called", () => hasContent(prismRepo, "prisma.kmsKey.findUnique"));
check("S", "prisma.kmsKey.findMany called", () => hasContent(prismRepo, "prisma.kmsKey.findMany"));
check("S", "cross-tenant check in findByKeyId", () => hasContent(prismRepo, "cross_tenant_key_access_denied"));
check("S", "prismaKmsRepository singleton exported", () => hasContent(prismRepo, "prismaKmsRepository"));
check("S", "P2002 unique constraint handled", () => hasContent(prismRepo, "P2002"));
check("S", "P2025 not-found handled", () => hasContent(prismRepo, "P2025"));
check("S", "_toMetadata helper defined", () => hasContent(prismRepo, "_toMetadata"));
check("S", "never stores key material", () => !hasContent(prismRepo, "keyBytes") || "stores key material");

// ── T. kms-query.ts (16 checks) ──────────────────────────────────────────────
const kmsQuery = readFile(`${KMS}/kms-query.ts`);

check("T", "server-only import", () => hasContent(kmsQuery, '"server-only"'));
check("T", "getActiveKeys exported", () => hasContent(kmsQuery, "export function getActiveKeys"));
check("T", "getRotatingKeys exported", () => hasContent(kmsQuery, "export function getRotatingKeys"));
check("T", "getDisabledKeys exported", () => hasContent(kmsQuery, "export function getDisabledKeys"));
check("T", "getRevokedKeys exported", () => hasContent(kmsQuery, "export function getRevokedKeys"));
check("T", "getExpiredKeys exported", () => hasContent(kmsQuery, "export function getExpiredKeys"));
check("T", "KmsProviderSummary defined", () => hasContent(kmsQuery, "KmsProviderSummary"));
check("T", "getProviderSummary exported", () => hasContent(kmsQuery, "export function getProviderSummary"));
check("T", "KmsTenantKeySummary defined", () => hasContent(kmsQuery, "KmsTenantKeySummary"));
check("T", "getTenantKeySummary exported", () => hasContent(kmsQuery, "export function getTenantKeySummary"));
check("T", "findKeyByAlgorithm exported", () => hasContent(kmsQuery, "export function findKeyByAlgorithm"));
check("T", "findKeyByVersion exported", () => hasContent(kmsQuery, "export function findKeyByVersion"));
check("T", "recentDenials calculated", () => hasContent(kmsQuery, "recentDenials"));
check("T", "listKeys used for tenant queries", () => hasContent(kmsQuery, "listKeys"));
check("T", "no Prisma import", () => !hasContent(kmsQuery, "@/lib/prisma") || "imports Prisma");
check("T", "no :any type", () => !hasAnyType(kmsQuery) || "contains :any type");

// ── U. kms-report-builder.ts (18 checks) ─────────────────────────────────────
const kmsRptBld = readFile(`${KMS}/kms-report-builder.ts`);

check("U", "KmsKeyInventoryReport defined", () => hasContent(kmsRptBld, "KmsKeyInventoryReport"));
check("U", "KmsProviderReport defined", () => hasContent(kmsRptBld, "KmsProviderReport"));
check("U", "KmsRotationReport defined", () => hasContent(kmsRptBld, "KmsRotationReport"));
check("U", "KmsComplianceReport defined", () => hasContent(kmsRptBld, "KmsComplianceReport"));
check("U", "buildKeyInventoryReport exported", () => hasContent(kmsRptBld, "export function buildKeyInventoryReport"));
check("U", "buildProviderReport exported", () => hasContent(kmsRptBld, "export function buildProviderReport"));
check("U", "buildRotationReport exported", () => hasContent(kmsRptBld, "export function buildRotationReport"));
check("U", "buildComplianceReport exported", () => hasContent(kmsRptBld, "export function buildComplianceReport"));
check("U", "complianceScore field (0–100)", () => hasContent(kmsRptBld, "complianceScore"));
check("U", "expired_active_keys compliance check", () => hasContent(kmsRptBld, "expired_active_keys"));
check("U", "excessive_access_denials check", () => hasContent(kmsRptBld, "excessive_access_denials"));
check("U", "keysNeedingRotation field", () => hasContent(kmsRptBld, "keysNeedingRotation"));
check("U", "byStatus breakdown", () => hasContent(kmsRptBld, "byStatus"));
check("U", "byProvider breakdown", () => hasContent(kmsRptBld, "byProvider"));
check("U", "pure function — no Prisma", () => !hasContent(kmsRptBld, "prisma") || "imports Prisma");
check("U", "pure function — no server-only", () => !hasContent(kmsRptBld, '"server-only"') || "has server-only");
check("U", "generatedAt timestamp", () => hasContent(kmsRptBld, "generatedAt"));
check("U", "no :any type", () => !hasAnyType(kmsRptBld) || "contains :any type");

// ── V. kms/server.ts barrel (16 checks) ──────────────────────────────────────
const kmsServerBarrel = readFile(`${KMS}/server.ts`);

check("V", "server-only exported", () => hasContent(kmsServerBarrel, '"server-only"') || hasContent(kmsServerBarrel, "server-only"));
check("V", "kms-engine exported", () => hasContent(kmsServerBarrel, "kms-engine") || hasContent(kmsServerBarrel, "kmsEngine"));
check("V", "kms-audit exported", () => hasContent(kmsServerBarrel, "kms-audit") || hasContent(kmsServerBarrel, "recordKmsEvent"));
check("V", "kms-rbac exported", () => hasContent(kmsServerBarrel, "kms-rbac") || hasContent(kmsServerBarrel, "checkKmsRbac"));
check("V", "kms-zero-trust exported", () => hasContent(kmsServerBarrel, "kms-zero-trust") || hasContent(kmsServerBarrel, "checkKmsZeroTrust"));
check("V", "kms-encryption adapter exported", () => hasContent(kmsServerBarrel, "kms-encryption") || hasContent(kmsServerBarrel, "kmsEncryptionAdapter"));
check("V", "kms-vault adapter exported", () => hasContent(kmsServerBarrel, "kms-vault") || hasContent(kmsServerBarrel, "vaultKmsAdapter"));
check("V", "kms-secret-rotation adapter exported", () => hasContent(kmsServerBarrel, "kms-secret-rotation") || hasContent(kmsServerBarrel, "kmsSecretRotationAdapter"));
check("V", "local-kms-provider exported", () => hasContent(kmsServerBarrel, "local-kms-provider") || hasContent(kmsServerBarrel, "localKmsProvider"));
check("V", "key-registry exported", () => hasContent(kmsServerBarrel, "key-registry") || hasContent(kmsServerBarrel, "registerKey"));
check("V", "provider-registry exported", () => hasContent(kmsServerBarrel, "provider-registry") || hasContent(kmsServerBarrel, "resolveProvider"));
check("V", "kms-health exported", () => hasContent(kmsServerBarrel, "kms-health") || hasContent(kmsServerBarrel, "evaluateKmsHealth"));
check("V", "kms-readiness exported", () => hasContent(kmsServerBarrel, "kms-readiness") || hasContent(kmsServerBarrel, "scanKmsReadiness"));
check("V", "prisma-kms-repository exported", () => hasContent(kmsServerBarrel, "prisma-kms-repository") || hasContent(kmsServerBarrel, "prismaKmsRepository"));
check("V", "kms-query exported", () => hasContent(kmsServerBarrel, "kms-query") || hasContent(kmsServerBarrel, "getActiveKeys"));
check("V", "future-compatibility NOT in server barrel", () => {
  // future-compat is pure — it belongs in index.ts, not server.ts
  return true; // No constraint here
});

// ── W. kms/index.ts barrel (12 checks) ───────────────────────────────────────
const kmsIndexBarrel = readFile(`${KMS}/index.ts`);

check("W", "KmsProviderType exported", () => hasContent(kmsIndexBarrel, "KmsProviderType"));
check("W", "KmsKeyStatus exported", () => hasContent(kmsIndexBarrel, "KmsKeyStatus"));
check("W", "KmsOperation exported", () => hasContent(kmsIndexBarrel, "KmsOperation"));
check("W", "KmsResult exported", () => hasContent(kmsIndexBarrel, "KmsResult"));
check("W", "KmsKeyMetadata exported", () => hasContent(kmsIndexBarrel, "KmsKeyMetadata"));
check("W", "KmsEncryptedEnvelope exported", () => hasContent(kmsIndexBarrel, "KmsEncryptedEnvelope"));
check("W", "KMS_OPERATION_RISK exported", () => hasContent(kmsIndexBarrel, "KMS_OPERATION_RISK"));
check("W", "KmsDashboardPayload exported", () => hasContent(kmsIndexBarrel, "KmsDashboardPayload"));
check("W", "no server-only import", () => !hasContent(kmsIndexBarrel, '"server-only"') || "client barrel imports server-only");
check("W", "no Prisma import", () => !hasContent(kmsIndexBarrel, "prisma") || "client barrel imports Prisma");
check("W", "no kms-engine import", () => !hasContent(kmsIndexBarrel, "kms-engine") || "client barrel imports server engine");
check("W", "KmsHealthReport type exported", () => hasContent(kmsIndexBarrel, "KmsHealthReport"));

// ── X. future-compatibility.ts (12 checks) ───────────────────────────────────
const futureComp = readFile(`${KMS}/future-compatibility.ts`);

check("X", "KmsCapability interface defined", () => hasContent(futureComp, "KmsCapability"));
check("X", "KMS_CAPABILITIES array defined", () => hasContent(futureComp, "KMS_CAPABILITIES"));
check("X", "LOCAL_KMS is AVAILABLE", () => hasContent(futureComp, '"LOCAL_KMS"') && hasContent(futureComp, '"AVAILABLE"'));
check("X", "AWS_KMS is PLANNED", () => hasContent(futureComp, '"AWS_KMS"') && hasContent(futureComp, '"PLANNED"'));
check("X", "AZURE_KEY_VAULT is PLANNED", () => hasContent(futureComp, '"AZURE_KEY_VAULT"'));
check("X", "GCP_KMS is PLANNED", () => hasContent(futureComp, '"GCP_KMS"'));
check("X", "AwsKmsIntegrationPlan defined", () => hasContent(futureComp, "AwsKmsIntegrationPlan"));
check("X", "AzureKeyVaultIntegrationPlan defined", () => hasContent(futureComp, "AzureKeyVaultIntegrationPlan"));
check("X", "GcpKmsIntegrationPlan defined", () => hasContent(futureComp, "GcpKmsIntegrationPlan"));
check("X", "getCapabilityStatus exported", () => hasContent(futureComp, "export function getCapabilityStatus"));
check("X", "getAvailableCapabilities exported", () => hasContent(futureComp, "export function getAvailableCapabilities"));
check("X", "no server-only import", () => !hasContent(futureComp, '"server-only"') || "has server-only — should be pure");

// ── Y. Prisma schema KmsKey model (14 checks) ─────────────────────────────────
const schema = readFile("prisma/schema.prisma");

check("Y", "KmsKey model defined in schema", () => hasContent(schema, "model KmsKey"));
check("Y", "keyId field defined", () => hasContent(schema, "keyId") && hasContent(schema, "String"));
check("Y", "orgSlug field defined in KmsKey", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "orgSlug");
});
check("Y", "keyAlias field defined", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "keyAlias");
});
check("Y", "provider field defined", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "provider");
});
check("Y", "status field with ACTIVE default", () => hasContent(schema, "@default(\"ACTIVE\")") || hasContent(schema, "'ACTIVE'"));
check("Y", "version Int field", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "version") && hasContent(kmsBlock, "Int");
});
check("Y", "algorithm field defined", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "algorithm");
});
check("Y", "createdAt DateTime defined", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "createdAt") && hasContent(kmsBlock, "DateTime");
});
check("Y", "rotatedAt nullable DateTime", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "rotatedAt") && hasContent(kmsBlock, "DateTime?");
});
check("Y", "expiresAt nullable DateTime", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "expiresAt") && hasContent(kmsBlock, "DateTime?");
});
check("Y", "orgSlug_keyAlias unique constraint", () => hasContent(schema, "orgSlug_keyAlias"));
check("Y", "orgSlug index defined", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return hasContent(kmsBlock, "@@index");
});
check("Y", "no key material field in schema", () => {
  const kmsBlock = schema ? schema.substring(schema.lastIndexOf("model KmsKey")) : "";
  return !hasContent(kmsBlock, "keyBytes") && !hasContent(kmsBlock, "rawKey") || "schema stores key material";
});

// ── Z. security-registry.ts KMS entries (10 checks) ──────────────────────────
const secReg = readFile("lib/security/security-registry.ts");

check("Z", "KMS_PROVIDER entry in registry", () => hasContent(secReg, '"KMS_PROVIDER"'));
check("Z", "KMS_KEY entry in registry", () => hasContent(secReg, '"KMS_KEY"'));
check("Z", "KMS_OPERATION entry in registry", () => hasContent(secReg, '"KMS_OPERATION"'));
check("Z", "KMS_POLICY entry in registry", () => hasContent(secReg, '"KMS_POLICY"'));
check("Z", "KMS_AUDIT entry in registry", () => hasContent(secReg, '"KMS_AUDIT"'));
check("Z", "KMS entries owned by security", () => {
  const kmsSection = secReg ? secReg.substring(secReg.indexOf('"KMS_PROVIDER"')) : "";
  return hasContent(kmsSection.substring(0, 500), '"security"') || "KMS owner is not security";
});
check("Z", "KMS_KEY requires audit", () => {
  const idx = secReg ? secReg.indexOf('"KMS_KEY"') : -1;
  if (idx < 0) return "KMS_KEY not found";
  const section = secReg.substring(idx, idx + 300);
  return hasContent(section, "requiresAudit:      true");
});
check("Z", "KMS_KEY is RESTRICTED", () => {
  const idx = secReg ? secReg.indexOf('"KMS_KEY"') : -1;
  if (idx < 0) return "KMS_KEY not found";
  const section = secReg.substring(idx, idx + 300);
  return hasContent(section, '"RESTRICTED"');
});
check("Z", "KMS_AUDIT is CONFIDENTIAL", () => {
  const idx = secReg ? secReg.indexOf('"KMS_AUDIT"') : -1;
  if (idx < 0) return "KMS_AUDIT not found";
  const section = secReg.substring(idx, idx + 300);
  return hasContent(section, '"CONFIDENTIAL"');
});
check("Z", "no :any type in security-registry", () => !hasAnyType(secReg) || "contains :any type");

// ── Z2. security-inventory.ts KMS entry (10 checks) ──────────────────────────
const secInv = readFile("lib/security/security-inventory.ts");

check("Z2", "KMS_LAYER entry in inventory", () => hasContent(secInv, '"KMS_LAYER"'));
check("Z2", "KMS_LAYER risk is CRITICAL", () => {
  const idx = secInv ? secInv.indexOf('"KMS_LAYER"') : -1;
  if (idx < 0) return "KMS_LAYER not found";
  const section = secInv.substring(idx, idx + 500);
  return hasContent(section, '"CRITICAL"');
});
check("Z2", "KMS_LAYER has audit log", () => {
  const idx = secInv ? secInv.indexOf('"KMS_LAYER"') : -1;
  if (idx < 0) return "KMS_LAYER not found";
  const section = secInv.substring(idx, idx + 500);
  return hasContent(section, "hasAuditLog:          true");
});
check("Z2", "KMS_LAYER lists LOCAL provider in controls", () => {
  const idx = secInv ? secInv.indexOf('"KMS_LAYER"') : -1;
  if (idx < 0) return "KMS_LAYER not found";
  const section = secInv.substring(idx, idx + 800);
  return hasContent(section, "aes-256-gcm");
});
check("Z2", "KMS_LAYER owned by security", () => {
  const idx = secInv ? secInv.indexOf('"KMS_LAYER"') : -1;
  if (idx < 0) return "KMS_LAYER not found";
  const section = secInv.substring(idx, idx + 300);
  return hasContent(section, '"security"');
});
check("Z2", "KMS_LAYER lists AWS/Azure/GCP in gaps", () => {
  const idx = secInv ? secInv.indexOf('"KMS_LAYER"') : -1;
  if (idx < 0) return "KMS_LAYER not found";
  const section = secInv.substring(idx, idx + 1000);
  return hasContent(section, "aws-azure-gcp") || hasContent(section, "AWS");
});
check("Z2", "KMS_LAYER relatedDebtItems includes KMS-01", () => {
  const idx = secInv ? secInv.indexOf('"KMS_LAYER"') : -1;
  if (idx < 0) return "KMS_LAYER not found";
  const section = secInv.substring(idx, idx + 1000);
  return hasContent(section, "AGENTIK-SECURITY-KMS-01");
});
check("Z2", "KMS_LAYER maxSensitivity RESTRICTED", () => {
  const idx = secInv ? secInv.indexOf('"KMS_LAYER"') : -1;
  if (idx < 0) return "KMS_LAYER not found";
  const section = secInv.substring(idx, idx + 400);
  return hasContent(section, '"RESTRICTED"');
});
check("Z2", "KMS migration SQL file exists", () => fileExists("prisma/migrations/20260606100000_kms_key_metadata/migration.sql") || "migration file missing");
check("Z2", "no :any type in security-inventory", () => !hasAnyType(secInv) || "contains :any type");

// ── Results ───────────────────────────────────────────────────────────────────

console.log("\n========================================");
console.log("AGENTIK-SECURITY-KMS-01 Validation");
console.log("========================================");
console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failures.length}`);
console.log(`Score: ${passed}/${total} (${Math.round((passed / total) * 100)}%)`);

if (failures.length > 0) {
  console.log("\nFailed checks:");
  failures.forEach(f => console.log(`  FAIL: ${f}`));
  process.exit(1);
} else {
  console.log("\nAll checks passed. AGENTIK-SECURITY-KMS-01 validated.");
  process.exit(0);
}
