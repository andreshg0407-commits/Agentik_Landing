/**
 * lib/security/kms/future-compatibility.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Future Compatibility Contracts
 *
 * No server-only. Pure interface contracts for future KMS capabilities.
 *
 * This file defines the integration contracts for:
 *   - AWS KMS SDK integration (AGENTIK-SECURITY-KMS-AWS-01)
 *   - Azure Key Vault SDK integration (AGENTIK-SECURITY-KMS-AZURE-01)
 *   - GCP Cloud KMS SDK integration (AGENTIK-SECURITY-KMS-GCP-01)
 *   - Hardware Security Module (HSM) support
 *   - External Vault integration (HashiCorp Vault)
 *   - Compliance and key lifecycle automation
 *
 * Capability flags indicate readiness level for each integration.
 * Update these flags as sprints complete.
 */

// ── KMS Capability Flags ──────────────────────────────────────────────────────

export type KmsCapabilityStatus = "AVAILABLE" | "PARTIAL" | "NOT_AVAILABLE" | "PLANNED";

export interface KmsCapability {
  id:          string;
  name:        string;
  description: string;
  status:      KmsCapabilityStatus;
  sprintId:    string;
  blockedBy?:  string[];
}

/**
 * KMS_CAPABILITIES — registry of all planned and implemented KMS capabilities.
 */
export const KMS_CAPABILITIES: ReadonlyArray<KmsCapability> = [
  {
    id:          "LOCAL_KMS",
    name:        "Local KMS Provider",
    description: "AES-256-GCM in-process key management. Default fallback for all environments.",
    status:      "AVAILABLE",
    sprintId:    "AGENTIK-SECURITY-KMS-01",
  },
  {
    id:          "AWS_KMS",
    name:        "AWS Key Management Service",
    description: "Integration with AWS KMS using @aws-sdk/client-kms. Envelope encryption with CMKs.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-AWS-01",
    blockedBy:   ["aws-sdk-install", "iam-role-config"],
  },
  {
    id:          "AZURE_KEY_VAULT",
    name:        "Azure Key Vault",
    description: "Integration with Azure Key Vault using @azure/keyvault-keys and @azure/identity.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-AZURE-01",
    blockedBy:   ["azure-sdk-install", "service-principal-config"],
  },
  {
    id:          "GCP_KMS",
    name:        "Google Cloud KMS",
    description: "Integration with Google Cloud KMS using @google-cloud/kms.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-GCP-01",
    blockedBy:   ["gcp-sdk-install", "service-account-config"],
  },
  {
    id:          "HSM_SUPPORT",
    name:        "Hardware Security Module Support",
    description: "PKCS#11 interface for HSM-backed key operations. Required for FIPS 140-2 compliance.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-HSM-01",
    blockedBy:   ["hsm-hardware-provisioning", "pkcs11-library"],
  },
  {
    id:          "HASHICORP_VAULT",
    name:        "HashiCorp Vault Integration",
    description: "Vault Transit engine adapter for external secret and key management.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-VAULT-01",
    blockedBy:   ["hashicorp-vault-instance"],
  },
  {
    id:          "KEY_ROTATION_AUTOMATION",
    name:        "Automated Key Rotation",
    description: "Scheduled key rotation based on rotation policies. Integrates with Secret Rotation Layer.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-ROTATION-01",
    blockedBy:   ["AGENTIK-SECURITY-KMS-01"],
  },
  {
    id:          "COMPLIANCE_REPORTING",
    name:        "Compliance Reporting",
    description: "SOC 2, ISO 27001, and PCI-DSS key management compliance reports.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-COMPLIANCE-01",
    blockedBy:   ["AGENTIK-SECURITY-KMS-01"],
  },
] as const;

// ── AWS SDK Integration Contract ──────────────────────────────────────────────

/**
 * AwsKmsIntegrationPlan — steps required to activate the AWS KMS provider.
 * Used as a migration guide for AGENTIK-SECURITY-KMS-AWS-01.
 */
export interface AwsKmsIntegrationPlan {
  /**
   * Step 1: Install the AWS SDK.
   * npm install @aws-sdk/client-kms
   */
  sdkPackage:         "@aws-sdk/client-kms";
  /**
   * Step 2: Configure the AwsKmsProvider with region and key ARN.
   */
  providerClass:      "AwsKmsProvider";
  /**
   * Step 3: Register the provider at app startup.
   * registerProvider(new AwsKmsProvider(config, sdkClient))
   */
  registrationHook:   "registerProvider(awsProvider)";
  /**
   * Step 4: Set ENCRYPTION_PROVIDER=AWS_KMS in the tenant config.
   */
  envVar:             "AWS_KMS_KEY_ARN";
  /**
   * Step 5: Migrate existing LOCAL keys to AWS KMS via rotation.
   */
  migrationStrategy:  "rotate-and-re-encrypt";
}

// ── Azure SDK Integration Contract ────────────────────────────────────────────

/**
 * AzureKeyVaultIntegrationPlan — steps for AGENTIK-SECURITY-KMS-AZURE-01.
 */
export interface AzureKeyVaultIntegrationPlan {
  sdkPackages:        ["@azure/keyvault-keys", "@azure/identity"];
  providerClass:      "AzureKeyVaultProvider";
  registrationHook:   "registerProvider(azureProvider)";
  envVars:            ["AZURE_KEY_VAULT_URI", "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"];
  migrationStrategy:  "rotate-and-re-encrypt";
}

// ── GCP SDK Integration Contract ──────────────────────────────────────────────

/**
 * GcpKmsIntegrationPlan — steps for AGENTIK-SECURITY-KMS-GCP-01.
 */
export interface GcpKmsIntegrationPlan {
  sdkPackage:         "@google-cloud/kms";
  providerClass:      "GcpKmsProvider";
  registrationHook:   "registerProvider(gcpProvider)";
  envVars:            ["GCP_PROJECT_ID", "GCP_LOCATION_ID", "GCP_KEY_RING_ID", "GOOGLE_APPLICATION_CREDENTIALS"];
  migrationStrategy:  "rotate-and-re-encrypt";
}

// ── Multi-Provider Migration ───────────────────────────────────────────────────

/**
 * KmsProviderMigrationStrategy — how to migrate keys between providers.
 * All migrations use the rotate-and-re-encrypt pattern:
 *   1. Generate new key in target provider
 *   2. Re-encrypt all data with new key
 *   3. Disable old key (grace period)
 *   4. Revoke old key after grace period
 */
export type KmsProviderMigrationStrategy =
  | "rotate-and-re-encrypt"   // Standard migration via rotation
  | "parallel-operation"       // Run both providers simultaneously during cutover
  | "emergency-migration";     // Immediate migration with no grace period

// ── Capability Helpers ────────────────────────────────────────────────────────

/**
 * getCapabilityStatus — look up the status of a KMS capability.
 */
export function getCapabilityStatus(capabilityId: string): KmsCapabilityStatus {
  const cap = KMS_CAPABILITIES.find(c => c.id === capabilityId);
  return cap?.status ?? "NOT_AVAILABLE";
}

/**
 * getAvailableCapabilities — return all capabilities that are currently available.
 */
export function getAvailableCapabilities(): KmsCapability[] {
  return KMS_CAPABILITIES.filter(c => c.status === "AVAILABLE" || c.status === "PARTIAL");
}

/**
 * getPlannedCapabilities — return all capabilities not yet implemented.
 */
export function getPlannedCapabilities(): KmsCapability[] {
  return KMS_CAPABILITIES.filter(c => c.status === "PLANNED" || c.status === "NOT_AVAILABLE");
}
