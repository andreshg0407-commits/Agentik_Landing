/**
 * lib/security/security-inventory.ts
 *
 * Agentik — Security Foundation — Integration Points Inventory
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Centralized inventory of all attack surfaces and integration points
 * in the Agentik platform. Each entry documents the risk profile of
 * a platform component or integration.
 *
 * This inventory is the foundation for:
 *   - Security reviews
 *   - Threat modeling
 *   - Compliance audits
 *   - AGENTIK-SECURITY-ZERO-TRUST-01
 *
 * No DB. No server-only. Pure domain data.
 */

import type { SecuritySeverity, DataSensitivity } from "./security-types";

// ── Inventory Entry ───────────────────────────────────────────────────────────

/**
 * RiskLevel — how exposed a surface is to attack.
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * SecurityInventoryEntry — describes a platform component's risk profile.
 */
export interface SecurityInventoryEntry {
  /** Stable, unique identifier for this surface. */
  id:                     string;
  /** Human-readable name. */
  name:                   string;
  /** Description of what this component does and what data it handles. */
  description:            string;
  /** The domain responsible for this component. */
  owner:                  string;
  /** Inherent risk level of this surface. */
  riskLevel:              RiskLevel;
  /** Maximum data sensitivity this component processes. */
  maxSensitivity:         DataSensitivity;
  /** Whether this component has external network access. */
  hasExternalAccess:      boolean;
  /** Whether this component handles secrets or credentials. */
  handlesSecrets:         boolean;
  /** Whether this component processes financial data. */
  handlesFinancialData:   boolean;
  /** Whether this component has an audit log. */
  hasAuditLog:            boolean;
  /** Known security controls already implemented. */
  implementedControls:    string[];
  /** Known security gaps — items for future sprints. */
  knownGaps:              string[];
  /** Related security debt sprint IDs. */
  relatedDebtItems:       string[];
}

// ── Platform Inventory ────────────────────────────────────────────────────────

/**
 * SECURITY_INVENTORY — the canonical catalog of all Agentik platform surfaces.
 */
export const SECURITY_INVENTORY: ReadonlyArray<SecurityInventoryEntry> = [
  // ── Memory Engine ──────────────────────────────────────────────────────────
  {
    id:                   "MEMORY_ENGINE",
    name:                 "Copilot Memory Engine",
    description:          "Stores and retrieves strategic and operational business memory. Contains business insights, operational history, and tenant preferences.",
    owner:                "copilot",
    riskLevel:            "HIGH",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: true,
    hasAuditLog:          false,
    implementedControls:  ["tenant-isolation-at-manager", "orgSlug-ownership-check", "soft-delete"],
    knownGaps:            ["no-audit-log", "no-encryption-at-rest", "no-access-control-beyond-tenant"],
    relatedDebtItems:     ["AGENTIK-SECURITY-AUDIT-PERSISTENCE-01", "AGENTIK-SECURITY-ENCRYPTION-01"],
  },

  // ── Playbooks ──────────────────────────────────────────────────────────────
  {
    id:                   "PLAYBOOKS",
    name:                 "Operational Playbooks",
    description:          "Stores structured business knowledge. Contains how the company operates across all domains. Considered CONFIDENTIAL operational data.",
    owner:                "copilot",
    riskLevel:            "MEDIUM",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  ["tenant-isolation-at-manager", "orgSlug-ownership-check", "audit-log"],
    knownGaps:            ["no-encryption-at-rest", "no-rbac"],
    relatedDebtItems:     ["AGENTIK-SECURITY-RBAC-01", "AGENTIK-SECURITY-ENCRYPTION-01"],
  },

  // ── Executive Brain ────────────────────────────────────────────────────────
  {
    id:                   "EXECUTIVE_BRAIN",
    name:                 "Executive Brain Layer",
    description:          "Generates strategic intelligence from memory, playbooks, and context. Produces signals, insights, and risk assessments.",
    owner:                "copilot",
    riskLevel:            "HIGH",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: true,
    hasAuditLog:          true,
    implementedControls:  ["audit-log", "tenant-scoped-context", "pure-domain-no-server-io"],
    knownGaps:            ["no-data-masking-in-insights", "executive-signals-not-access-controlled"],
    relatedDebtItems:     ["AGENTIK-SECURITY-RBAC-01"],
  },

  // ── AI Billing ────────────────────────────────────────────────────────────
  {
    id:                   "AI_BILLING",
    name:                 "AI Billing & Credit System",
    description:          "Manages AI usage credits, billing events, and consumption tracking. Contains financial transaction data and API usage patterns.",
    owner:                "ai-layer",
    riskLevel:            "HIGH",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    true,
    handlesSecrets:       false,
    handlesFinancialData: true,
    hasAuditLog:          false,
    implementedControls:  ["tenant-isolation", "idempotent-billing"],
    knownGaps:            ["no-audit-log", "no-rate-limiting", "no-anomaly-detection"],
    relatedDebtItems:     ["AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"],
  },

  // ── AI Layer ──────────────────────────────────────────────────────────────
  {
    id:                   "AI_LAYER",
    name:                 "AI Provider Layer",
    description:          "Routes AI requests to external providers (Anthropic, OpenAI). Handles API key management and model selection.",
    owner:                "ai-layer",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    true,
    handlesSecrets:       true,
    handlesFinancialData: false,
    hasAuditLog:          false,
    implementedControls:  ["provider-abstraction", "model-selection"],
    knownGaps:            ["api-keys-in-env-not-vault", "no-prompt-injection-protection", "no-output-filtering"],
    relatedDebtItems:     ["AGENTIK-SECURITY-VAULT-01", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"],
  },

  // ── Agent Runtime ─────────────────────────────────────────────────────────
  {
    id:                   "AGENT_RUNTIME",
    name:                 "Agent Runtime Layer",
    description:          "Executes agent goals and proposals. Coordinates with tasks, approvals, and workflow chains. May trigger real-world actions.",
    owner:                "agents",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: true,
    hasAuditLog:          true,
    implementedControls:  ["approval-gates", "capability-guards", "human-confirmation-required"],
    knownGaps:            ["no-action-rate-limiting", "no-agent-impersonation-prevention"],
    relatedDebtItems:     ["AGENTIK-SECURITY-RBAC-01", "AGENTIK-SECURITY-ZERO-TRUST-01"],
  },

  // ── Autonomous Operations ─────────────────────────────────────────────────
  {
    id:                   "AUTONOMOUS_OPERATIONS",
    name:                 "Autonomous Operations Layer",
    description:          "Enables agents to take autonomous actions (messaging, task creation, workflow triggers). Highest risk surface in the platform.",
    owner:                "agents",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    true,
    handlesSecrets:       false,
    handlesFinancialData: true,
    hasAuditLog:          true,
    implementedControls:  ["idempotency", "human-approval-gates", "retry-limits", "dead-letter"],
    knownGaps:            ["no-outbound-filtering", "no-action-sandboxing", "no-rollback"],
    relatedDebtItems:     ["AGENTIK-SECURITY-ZERO-TRUST-01", "AGENTIK-SECURITY-RBAC-01"],
  },

  // ── WhatsApp Integration ──────────────────────────────────────────────────
  {
    id:                   "WHATSAPP",
    name:                 "WhatsApp Business API Integration",
    description:          "Sends and receives messages via WhatsApp Business API. Handles customer communications and webhook events.",
    owner:                "integrations",
    riskLevel:            "HIGH",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    true,
    handlesSecrets:       true,
    handlesFinancialData: false,
    hasAuditLog:          false,
    implementedControls:  ["webhook-signature-validation"],
    knownGaps:            ["token-in-db-unencrypted", "no-message-content-audit", "no-rate-limiting"],
    relatedDebtItems:     ["AGENTIK-SECURITY-VAULT-01", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"],
  },

  // ── DIAN ──────────────────────────────────────────────────────────────────
  {
    id:                   "DIAN",
    name:                 "DIAN Electronic Invoicing Integration",
    description:          "Submits electronic invoices to DIAN (Colombian tax authority). Uses PKCS#12 certificates for digital signing.",
    owner:                "integrations",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    true,
    handlesSecrets:       true,
    handlesFinancialData: true,
    hasAuditLog:          false,
    implementedControls:  ["certificate-abstraction"],
    knownGaps:            ["certificate-in-db-unencrypted", "no-certificate-expiry-monitoring", "no-signing-audit"],
    relatedDebtItems:     ["AGENTIK-SECURITY-VAULT-01", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01", "AGENTIK-SECURITY-SECRET-ROTATION-01"],
  },

  // ── ERP Integrations ──────────────────────────────────────────────────────
  {
    id:                   "ERP_INTEGRATIONS",
    name:                 "ERP System Integrations",
    description:          "Bidirectional data sync with ERP systems (SAP, Siigo, etc.). Handles financial, inventory, and operational data.",
    owner:                "integrations",
    riskLevel:            "HIGH",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    true,
    handlesSecrets:       true,
    handlesFinancialData: true,
    hasAuditLog:          false,
    implementedControls:  ["connector-abstraction", "tenant-isolation"],
    knownGaps:            ["credentials-in-db-unencrypted", "no-sync-audit", "no-data-validation"],
    relatedDebtItems:     ["AGENTIK-SECURITY-VAULT-01", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"],
  },

  // ── Audit Persistence ─────────────────────────────────────────────────────
  {
    id:                   "AUDIT_PERSISTENCE",
    name:                 "Security Audit Persistence Layer",
    description:          "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01. Persistent, append-only, multi-tenant security audit event log. Persists SecurityAuditLog, VaultServiceAuditLog, ExecutiveAuditLog, and CopilotAuditLog events to PostgreSQL via Prisma.",
    owner:                "security",
    riskLevel:            "HIGH",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  [
      "append-only-no-update-or-delete",
      "tenant-isolation-orgSlug-required",
      "fail-safe-never-throws",
      "metadata-only-no-secret-values",
      "persistent-postgresql-backend",
      "query-engine-deterministic",
      "retention-policy-defined",
      "health-monitor-available",
    ],
    knownGaps:            [
      "retention-cleanup-not-implemented",
      "no-external-siem-integration",
      "health-check-writes-to-db",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01",
      "AGENTIK-SECURITY-AUDIT-RETENTION-01",
      "AGENTIK-SECURITY-ENCRYPTION-01",
    ],
  },

  // ── Encryption Layer ──────────────────────────────────────────────────────
  {
    id:                   "ENCRYPTION_LAYER",
    name:                 "Enterprise Encryption Layer",
    description:          "AGENTIK-SECURITY-ENCRYPTION-01. Transversal AES-256-GCM encryption for sensitive business data: Copilot Memory, Playbooks, Executive Context, Financial Records, Customer Records, Employee Records, Agent Configurations. Complements Vault (credentials) and Audit Persistence (events).",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: true,
    hasAuditLog:          true,
    implementedControls:  [
      "aes-256-gcm-authenticated-encryption",
      "tenant-isolation-orgSlug-enforced",
      "fail-closed-null-on-failure",
      "encryption-audit-every-operation",
      "metadata-separated-from-ciphertext",
      "key-version-references-only-no-key-material",
      "sanitized-logs-no-plaintext",
      "classification-policy-deterministic",
      "encrypted-envelope-pattern",
      "server-only-all-crypto",
      "health-monitor-round-trip",
      "migration-planner-defined",
      "compatibility-layer-coexistence",
      "adapters-memory-playbooks-executive",
    ],
    knownGaps:            [
      "data-migration-not-yet-executed",
      "financial-customer-employee-adapters-pending",
      "kms-integration-future-sprint",
      "key-rotation-not-automated",
      "hsm-not-implemented",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-ENCRYPTION-01",
      "AGENTIK-SECURITY-ENCRYPTION-02",
      "AGENTIK-SECURITY-SECRET-ROTATION-01",
      "AGENTIK-SECURITY-KMS-01",
    ],
  },

  // ── RBAC Engine ───────────────────────────────────────────────────────────
  {
    id:                   "RBAC_ENGINE",
    name:                 "RBAC Authorization Engine",
    description:          "AGENTIK-SECURITY-RBAC-01. Formal Role-Based Access Control layer. Evaluates authorization decisions for all platform resources. Fail-closed: DENY by default. SUPER_ADMIN bypass explicit. Multi-tenant: orgSlug enforced on every check.",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  [
      "fail-closed-deny-by-default",
      "super-admin-explicit-bypass",
      "tenant-isolation-orgSlug-required",
      "permission-registry-explicit-grants",
      "role-permission-matrix-no-wildcards",
      "structured-access-result-with-reason",
      "rbac-audit-log",
      "domain-integration-adapters",
      "authorization-service-semantic-api",
      "server-only-engine-and-service",
    ],
    knownGaps:            [
      "no-prisma-bridge-yet-uses-in-memory-store",
      "no-attribute-based-access-control",
      "no-dynamic-role-creation",
      "no-policy-simulation-ui",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-RBAC-01",
      "AGENTIK-SECURITY-RBAC-02",
      "AGENTIK-SECURITY-ZERO-TRUST-01",
    ],
  },

  // ── Vault Migration ───────────────────────────────────────────────────────
  {
    id:                   "VAULT_MIGRATION",
    name:                 "Vault Secret Migration Layer",
    description:          "AGENTIK-SECURITY-VAULT-MIGRATION-01. Vault-First resolver and per-integration secret providers for AI, WhatsApp, TikTok, Shopify, DIAN, and ERP. Replaces direct process.env access with auditable, org-scoped secret resolution.",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    false,
    handlesSecrets:       true,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  [
      "vault-first-resolution",
      "tenant-isolation-per-resolution",
      "shadow-mode-validation",
      "never-throws-structured-not-found",
      "audit-event-per-resolution",
      "secret-masking-in-logs",
      "per-integration-providers",
      "backward-compatible-legacy-fallback",
    ],
    knownGaps:            [
      "vault-stub-returns-not-found-until-prisma-regenerated",
      "erp-secrets-status-not-started",
      "dian-cert-in-legacy-is-path-not-bytes",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-VAULT-01",
      "AGENTIK-SECURITY-VAULT-MIGRATION-01",
      "AGENTIK-SECURITY-MIGRATION-02",
    ],
  },

  // ── KMS Layer ─────────────────────────────────────────────────────────────
  {
    id:                   "KMS_LAYER",
    name:                 "KMS Abstraction Layer",
    description:          "AGENTIK-SECURITY-KMS-01. Universal Key Management System abstraction. Provides AES-256-GCM encryption via LOCAL provider, with provider-agnostic interface for AWS_KMS, Azure Key Vault, GCP KMS, and Custom/HSM backends. RBAC + Zero Trust gated. Fail-closed engine. Multi-tenant key registry. Audit trail for all operations. Compatible with Vault, Encryption Layer, Secret Rotation, and Zero Trust.",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  [
      "aes-256-gcm-local-provider",
      "provider-agnostic-interface",
      "multi-tenant-key-registry",
      "fail-closed-engine",
      "rbac-gated-all-operations",
      "zero-trust-gated-all-operations",
      "audit-every-operation",
      "never-expose-key-material",
      "tenant-isolation-orgSlug-enforced",
      "server-only-all-crypto",
      "key-version-tracking",
      "grace-period-decryption",
      "memory-zeroing-on-delete",
    ],
    knownGaps:            [
      "aws-azure-gcp-sdks-not-integrated",
      "hsm-not-integrated",
      "persistence-in-memory-only-until-prisma-migrate",
      "no-automated-key-rotation-scheduling",
      "no-key-backup-recovery",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-KMS-01",
      "AGENTIK-SECURITY-KMS-AWS-01",
      "AGENTIK-SECURITY-KMS-AZURE-01",
      "AGENTIK-SECURITY-KMS-GCP-01",
      "AGENTIK-SECURITY-ENCRYPTION-02",
    ],
  },

  // ── Secret Rotation Layer ─────────────────────────────────────────────────
  {
    id:                   "SECRET_ROTATION",
    name:                 "Secret Rotation Layer",
    description:          "AGENTIK-SECURITY-SECRET-ROTATION-01. Enterprise secret rotation infrastructure: version management, rotation lifecycle (PENDING→VALIDATING→READY→ACTIVE→REVOKED), approval workflows, audit trail, vault adapter, and RBAC access control for all rotation operations.",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  [
      "rotation-lifecycle-pending-to-revoked",
      "secret-version-metadata-only-no-values",
      "approval-workflow-per-risk-level",
      "double-approval-for-critical-secrets",
      "emergency-bypass-logged",
      "audit-every-state-change",
      "vault-adapter-simulation-layer",
      "rbac-gated-all-rotation-operations",
      "fail-closed-on-policy-violations",
      "tenant-isolation-orgSlug-enforced",
      "server-only-all-rotation-operations",
    ],
    knownGaps:            [
      "no-real-vault-integration-yet",
      "no-automated-rotation-scheduling",
      "no-kms-integration",
      "no-external-provider-api-calls",
      "grace-period-not-persisted-in-db",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-SECRET-ROTATION-01",
      "AGENTIK-SECURITY-SECRET-ROTATION-02",
      "AGENTIK-SECURITY-KMS-01",
      "AGENTIK-SECURITY-ZERO-TRUST-01",
    ],
  },

  // ── MFA Layer ─────────────────────────────────────────────────────────────
  {
    id:                   "MFA_LAYER",
    name:                 "Multi-Factor Authentication Layer",
    description:          "AGENTIK-SECURITY-MFA-01. Enterprise MFA infrastructure: TOTP (RFC 6238), recovery codes (scrypt-hashed), enrollment lifecycle, verification service, session binding, adaptive MFA engine, RBAC + Zero Trust integration, audit trail. Fail-closed. Multi-tenant. Never stores plain secrets or codes.",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "RESTRICTED",
    hasExternalAccess:    false,
    handlesSecrets:       true,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  [
      "totp-rfc-6238-hmac-sha1",
      "recovery-codes-scrypt-hashed",
      "never-store-plain-secrets",
      "never-log-otp-codes",
      "multi-tenant-enrollment-orgSlug-scoped",
      "fail-closed-verification",
      "enrollment-lockout-max-5-failures",
      "session-binding-prevents-replay",
      "adaptive-mfa-risk-signals",
      "rbac-gated-admin-operations",
      "zero-trust-integration-trust-delta",
      "audit-all-mfa-events",
      "server-only-crypto-operations",
      "timing-safe-code-comparison",
    ],
    knownGaps:            [
      "passkey-webauthn-not-implemented",
      "email-sms-providers-not-integrated",
      "kms-encryption-requires-key-provisioning",
      "session-binding-not-wired-to-nextauth-jwt",
      "no-adaptive-device-fingerprinting",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-MFA-01",
      "AGENTIK-SECURITY-MFA-02",
      "AGENTIK-SECURITY-MFA-WEBAUTHN-01",
      "AGENTIK-SECURITY-MFA-SSO-01",
    ],
  },

  // ── Anomaly Detection Layer ────────────────────────────────────────────────
  {
    id:                   "ANOMALY_DETECTION_LAYER",
    name:                 "Security Anomaly Detection Layer",
    description:          "AGENTIK-SECURITY-ANOMALY-DETECTION-01. Multi-tenant, fail-closed anomaly detection layer. Orchestrates 11 detectors covering login failures, MFA failures, new devices, new locations, Vault spikes, KMS spikes, secret rotation spikes, RBAC violations, Zero Trust denials, agent permission violations, and cross-tenant attempts. Produces AnomalySignals and AnomalyAlerts. Detection only — no remediation. Compatible with Zero Trust, MFA, Vault, KMS, Secret Rotation, Executive Brain, and SOC.",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls:  [
      "11-detectors-covering-all-anomaly-types",
      "multi-tenant-orgSlug-enforced",
      "fail-closed-fail-safe",
      "detection-only-no-remediation",
      "correlation-engine-5-rules",
      "risk-scoring-diminishing-returns-0-100",
      "cross-tenant-always-critical",
      "alert-lifecycle-open-acknowledged-resolved",
      "anomaly-audit-log-fire-and-forget",
      "integration-adapters-zero-trust-mfa-vault-kms-session-executive-brain",
      "no-raw-secrets-in-signals",
      "no-otp-in-signals",
      "no-key-material-in-signals",
      "serializable-alerts-soc-compatible",
      "prisma-persistence-anomalyalert-anomalysignal",
      "server-only-all-detection",
    ],
    knownGaps:            [
      "executive-brain-api-not-yet-connected",
      "soc-workflow-not-yet-implemented",
      "siem-connectors-not-yet-configured",
      "no-ml-based-baseline-detection",
      "retention-cleanup-not-implemented",
    ],
    relatedDebtItems:     [
      "AGENTIK-SECURITY-ANOMALY-DETECTION-01",
      "AGENTIK-SECURITY-SOC-01",
      "AGENTIK-SECURITY-SIEM-01",
      "AGENTIK-SECURITY-ANOMALY-ML-01",
    ],
  },

  // ── Compliance & Governance Layer ──────────────────────────────────────────
  {
    id:                   "COMPLIANCE_LAYER",
    name:                 "Compliance & Governance Engine",
    description:          "Central compliance engine. Evaluates 11 controls against SOC2, ISO27001, GDPR, HIPAA. Generates evidence, findings, violations, reports, and executive signals. Persists to ComplianceEvidence + ComplianceFinding + ComplianceControlStatus Prisma models. Integration adapters for all 7 security subsystems. AGENTIK-SECURITY-COMPLIANCE-01.",
    owner:                "security",
    riskLevel:            "CRITICAL",
    maxSensitivity:       "CONFIDENTIAL",
    hasExternalAccess:    false,
    handlesSecrets:       false,
    handlesFinancialData: false,
    hasAuditLog:          true,
    implementedControls: [
      "multi-tenant-orgSlug-scoping",
      "fail-closed-evaluation",
      "11-compliance-controls-catalog",
      "soc2-iso27001-gdpr-hipaa-framework-coverage",
      "7-evidence-builders",
      "evidence-ttl-and-expiration",
      "violation-detection-with-blocking-flag",
      "compliance-scoring-0-100",
      "5-report-types",
      "executive-brain-signal-integration",
      "data-classification-5-levels",
      "14-retention-policies",
      "prisma-persistence-3-models",
      "health-monitor-8-subsystems",
      "readiness-scanner-14-checks",
      "siem-soar-external-auditor-future-contracts",
    ],
    knownGaps: [
      "Prisma migration not yet applied — run migrate dev before production use",
      "Evidence collection is manual — no automated collection cron yet",
      "SOC2 Type II evidence timeline (12-month window) not yet tracked",
      "GDPR data subject request workflow not implemented",
      "External auditor API not implemented (planned AGENTIK-SECURITY-COMPLIANCE-AUDIT-01)",
    ],
    relatedDebtItems: [
      "AGENTIK-SECURITY-COMPLIANCE-AUDIT-01",
      "AGENTIK-SECURITY-COMPLIANCE-GDPR-01",
      "AGENTIK-SECURITY-COMPLIANCE-SOC2-TIMELINE-01",
      "AGENTIK-SECURITY-COMPLIANCE-AUTO-COLLECT-01",
    ],
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Find an inventory entry by its id. */
export function getInventoryEntry(id: string): SecurityInventoryEntry | undefined {
  return SECURITY_INVENTORY.find(e => e.id === id);
}

/** Find all entries with CRITICAL risk. */
export function getCriticalRiskSurfaces(): SecurityInventoryEntry[] {
  return SECURITY_INVENTORY.filter(e => e.riskLevel === "CRITICAL");
}

/** Find all entries that handle secrets. */
export function getSecretHandlingSurfaces(): SecurityInventoryEntry[] {
  return SECURITY_INVENTORY.filter(e => e.handlesSecrets);
}

/** Find all entries with external access. */
export function getExternalFacingSurfaces(): SecurityInventoryEntry[] {
  return SECURITY_INVENTORY.filter(e => e.hasExternalAccess);
}

/** Find all entries without an audit log. */
export function getSurfacesWithoutAuditLog(): SecurityInventoryEntry[] {
  return SECURITY_INVENTORY.filter(e => !e.hasAuditLog);
}

/** Summary: count of surfaces by risk level. */
export function getInventorySummary(): Record<RiskLevel, number> {
  return SECURITY_INVENTORY.reduce(
    (acc, e) => { acc[e.riskLevel]++; return acc; },
    { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
  );
}