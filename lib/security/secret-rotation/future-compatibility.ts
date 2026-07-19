/**
 * lib/security/secret-rotation/future-compatibility.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Future Compatibility Contracts — Forward-looking extension points
 *
 * No server-only. No Prisma. Pure type contracts and stub registry.
 *
 * These contracts define how the rotation layer will evolve.
 * Each capability is marked PLANNED and must be implemented in its own sprint.
 *
 * Future sprints:
 *   AGENTIK-SECURITY-AUTO-ROTATION-01   — Automatic Rotation Engine
 *   AGENTIK-SECURITY-KMS-01             — External KMS Integration
 *   AGENTIK-SECURITY-VAULT-EXTERNAL-01  — External Vault Backends
 *   AGENTIK-SECURITY-COMPLIANCE-01      — Automated Compliance Reporting
 *   AGENTIK-SECURITY-EMERGENCY-01       — Emergency Response Playbooks
 */

// ── Capability Status ─────────────────────────────────────────────────────────

export type FutureCapabilityStatus =
  | "PLANNED"        // Defined, not yet implemented
  | "IN_PROGRESS"    // Active sprint
  | "AVAILABLE"      // Implemented and available
  | "DEPRECATED";    // Superseded

export interface FutureCapabilityEntry {
  id:          string;
  name:        string;
  description: string;
  status:      FutureCapabilityStatus;
  sprintId:    string;
  dependsOn:   string[];
}

// ── 1. Automatic Rotation Engine ──────────────────────────────────────────────
// AGENTIK-SECURITY-AUTO-ROTATION-01

export type AutoRotationTrigger =
  | "EXPIRY"          // Secret is within the expiry warning window
  | "AGE"             // Secret has exceeded the recommended age
  | "SCHEDULE"        // Cron-based scheduled rotation
  | "POLICY_CHANGE"   // A policy change mandates rotation
  | "COMPROMISE_SIGNAL"; // External signal indicates possible compromise

export interface AutoRotationRule {
  secretId:     string;
  trigger:      AutoRotationTrigger;
  leadTimeDays: number;    // How many days before expiry to trigger
  enabled:      boolean;
  strategy:     "MANUAL" | "SCHEDULED";
}

/** PLANNED — not yet implemented. */
export interface AutoRotationEngine {
  readonly status: "PLANNED";
  scheduleAutoRotation(rule: AutoRotationRule): Promise<{ scheduled: boolean; rotationId?: string }>;
  cancelAutoRotation(secretId: string, orgSlug: string): Promise<{ cancelled: boolean }>;
  getScheduledRotations(orgSlug: string): Promise<AutoRotationRule[]>;
  triggerNow(secretId: string, orgSlug: string, trigger: AutoRotationTrigger): Promise<{ triggered: boolean }>;
}

// ── 2. External KMS Integration ───────────────────────────────────────────────
// AGENTIK-SECURITY-KMS-01

export type KmsProvider =
  | "AWS_KMS"
  | "GCP_KMS"
  | "AZURE_KEY_VAULT"
  | "HASHICORP_TRANSIT";

export interface KmsKeyReference {
  provider:   KmsProvider;
  keyId:      string;
  keyVersion: string;
  region:     string;
}

/** PLANNED — not yet implemented. */
export interface KmsRotationAdapter {
  readonly status: "PLANNED";
  readonly provider: KmsProvider;
  createDataKey(orgSlug: string, keyRef: KmsKeyReference): Promise<{ keyId: string; encryptedKey: string }>;
  rotateKey(orgSlug: string, keyRef: KmsKeyReference): Promise<{ newVersion: string }>;
  decryptWithKms(ciphertext: string, keyRef: KmsKeyReference): Promise<{ plaintext: string }>;
  isAvailable(): Promise<boolean>;
}

// ── 3. External Vault Backends ────────────────────────────────────────────────
// AGENTIK-SECURITY-VAULT-EXTERNAL-01

export type ExternalVaultProvider =
  | "HASHICORP_VAULT"
  | "AWS_SECRETS_MANAGER"
  | "GCP_SECRET_MANAGER"
  | "AZURE_KEY_VAULT";

export interface ExternalVaultConfig {
  provider: ExternalVaultProvider;
  endpoint: string;
  authMethod: "TOKEN" | "IAM" | "APPID" | "KUBERNETES";
  namespace?: string;
  mountPath?: string;
}

/** PLANNED — not yet implemented. */
export interface ExternalVaultBackend {
  readonly status: "PLANNED";
  readonly provider: ExternalVaultProvider;
  writeSecret(path: string, value: string, orgSlug: string): Promise<{ version: number }>;
  readSecret(path: string, version: number, orgSlug: string): Promise<{ value: string; version: number }>;
  listVersions(path: string, orgSlug: string): Promise<number[]>;
  revokeVersion(path: string, version: number, orgSlug: string): Promise<{ revoked: boolean }>;
  isHealthy(): Promise<boolean>;
}

// ── 4. Compliance Automation ──────────────────────────────────────────────────
// AGENTIK-SECURITY-COMPLIANCE-01

export type ComplianceFramework =
  | "SOC2_TYPE_II"
  | "ISO_27001"
  | "GDPR"
  | "PCI_DSS"
  | "HIPAA"
  | "NIST_800_53";

export interface ComplianceRequirement {
  framework:   ComplianceFramework;
  controlId:   string;
  description: string;
  rotation:    {
    required:       boolean;
    maxAgeDays:     number;
    requiresAudit:  boolean;
    requiresApproval: boolean;
  };
}

/** PLANNED — not yet implemented. */
export interface ComplianceAutomationEngine {
  readonly status: "PLANNED";
  evaluateCompliance(orgSlug: string, framework: ComplianceFramework): Promise<{
    compliant: boolean;
    violations: Array<{ controlId: string; reason: string }>;
    evidencePackage: string; // JSON-serializable evidence bundle
  }>;
  generateAuditReport(orgSlug: string, framework: ComplianceFramework, periodDays: number): Promise<string>;
  getRequirements(framework: ComplianceFramework): ComplianceRequirement[];
}

// ── 5. Emergency Response Playbooks ───────────────────────────────────────────
// AGENTIK-SECURITY-EMERGENCY-01

export type EmergencyIncidentType =
  | "CREDENTIAL_LEAK"
  | "UNAUTHORIZED_ACCESS"
  | "INSIDER_THREAT"
  | "SUPPLY_CHAIN_COMPROMISE"
  | "RANSOMWARE"
  | "DATA_EXFILTRATION";

export interface EmergencyRotationPlaybook {
  incidentType:     EmergencyIncidentType;
  priorityOrder:    string[]; // secretIds ordered by rotation priority
  parallelAllowed:  boolean;  // Can multiple rotations run at once?
  notifyChannels:   string[]; // e.g. ["slack:security", "pagerduty:on-call"]
  requiresApproval: boolean;
  maxDurationMs:    number;
}

/** PLANNED — not yet implemented. */
export interface EmergencyResponseEngine {
  readonly status: "PLANNED";
  triggerEmergencyRotation(params: {
    orgSlug:       string;
    incidentType:  EmergencyIncidentType;
    affectedSecrets: string[];
    requestedBy:   string;
    reason:        string;
  }): Promise<{
    playbookId:  string;
    rotationIds: string[];
    started:     boolean;
  }>;
  getPlaybook(incidentType: EmergencyIncidentType): EmergencyRotationPlaybook | null;
  getActiveIncidents(orgSlug: string): Promise<Array<{ playbookId: string; incidentType: EmergencyIncidentType; startedAt: string }>>;
}

// ── 6. Zero-Downtime Rotation Coordinator ────────────────────────────────────
// (Extension of existing rotation-service in a future sprint)

/** PLANNED — not yet implemented. */
export interface ZeroDowntimeRotationCoordinator {
  readonly status: "PLANNED";
  /**
   * Orchestrate a blue-green rotation:
   * 1. Create new version (green)
   * 2. Validate green version in staging
   * 3. Gradually shift traffic to green
   * 4. Revoke old version (blue) after grace period
   */
  coordinateBlueGreen(params: {
    secretId:        string;
    orgSlug:         string;
    gracePeriodMs:   number;
    validationFn:    string; // Identifier of the validation function to call
    requestedBy:     string;
  }): Promise<{
    coordinationId: string;
    status:         "STARTED" | "FAILED";
  }>;
}

// ── Capability Registry ────────────────────────────────────────────────────────

export const ROTATION_FUTURE_CAPABILITIES: ReadonlyArray<FutureCapabilityEntry> = [
  {
    id:          "AUTO_ROTATION",
    name:        "Automatic Rotation Engine",
    description: "Trigger and schedule rotations automatically based on expiry, age, or policy signals.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-AUTO-ROTATION-01",
    dependsOn:   ["AGENTIK-SECURITY-SECRET-ROTATION-01"],
  },
  {
    id:          "KMS_INTEGRATION",
    name:        "External KMS Integration",
    description: "Delegate key management to AWS KMS, GCP KMS, Azure Key Vault, or HashiCorp Transit.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-KMS-01",
    dependsOn:   ["AGENTIK-SECURITY-SECRET-ROTATION-01", "AGENTIK-SECURITY-ENCRYPTION-01"],
  },
  {
    id:          "EXTERNAL_VAULT",
    name:        "External Vault Backends",
    description: "Replace in-memory vault simulation with real secrets backends (HashiCorp Vault, AWS Secrets Manager, etc.).",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-VAULT-EXTERNAL-01",
    dependsOn:   ["AGENTIK-SECURITY-SECRET-ROTATION-01"],
  },
  {
    id:          "COMPLIANCE_AUTOMATION",
    name:        "Automated Compliance Reporting",
    description: "Evaluate rotation compliance against SOC2, ISO27001, GDPR, PCI-DSS frameworks.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-COMPLIANCE-01",
    dependsOn:   ["AGENTIK-SECURITY-SECRET-ROTATION-01", "AGENTIK-SECURITY-RBAC-01"],
  },
  {
    id:          "EMERGENCY_RESPONSE",
    name:        "Emergency Response Playbooks",
    description: "Pre-defined incident playbooks for credential leaks, insider threats, and supply chain compromises.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-EMERGENCY-01",
    dependsOn:   ["AGENTIK-SECURITY-SECRET-ROTATION-01", "AGENTIK-SECURITY-AUTO-ROTATION-01"],
  },
  {
    id:          "ZERO_DOWNTIME",
    name:        "Zero-Downtime Blue-Green Rotation Coordinator",
    description: "Orchestrate blue-green rotations with staged traffic shifting and automated rollback.",
    status:      "PLANNED",
    sprintId:    "AGENTIK-SECURITY-ZERO-DOWNTIME-01",
    dependsOn:   ["AGENTIK-SECURITY-AUTO-ROTATION-01", "AGENTIK-SECURITY-VAULT-EXTERNAL-01"],
  },
] as const;

/** Get all planned capabilities. */
export function getPlannedCapabilities(): FutureCapabilityEntry[] {
  return ROTATION_FUTURE_CAPABILITIES.filter(c => c.status === "PLANNED");
}

/** Get a capability by id. */
export function getFutureCapability(id: string): FutureCapabilityEntry | undefined {
  return ROTATION_FUTURE_CAPABILITIES.find(c => c.id === id);
}
