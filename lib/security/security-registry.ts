/**
 * lib/security/security-registry.ts
 *
 * Agentik — Security Foundation — Sensitive Asset Registry
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Centralized catalog of all sensitive assets in the Agentik platform.
 * Each asset entry defines how it should be protected.
 *
 * No DB. No server-only. Pure domain data.
 *
 * Usage:
 *   const entry = getRegistryEntry("COPILOT_MEMORY");
 *   if (entry?.classification === "CONFIDENTIAL") { ... }
 */

import type { DataSensitivity, SecurityCategory } from "./security-types";

// ── Registry Entry ────────────────────────────────────────────────────────────

/**
 * SecurityRegistryEntry — defines a known sensitive asset in the platform.
 */
export interface SecurityRegistryEntry {
  /** Stable, unique asset identifier. */
  id:             string;
  /** Human-readable name. */
  name:           string;
  /** Description of what this asset contains and why it is sensitive. */
  description:    string;
  /** Data sensitivity classification. */
  classification: DataSensitivity;
  /** Primary security domain this asset belongs to. */
  category:       SecurityCategory;
  /**
   * Who owns this asset type (the domain responsible for protecting it).
   * Examples: "copilot", "finance", "integrations", "security"
   */
  owner:          string;
  /**
   * Whether this asset requires encryption at rest.
   * (Deferred to AGENTIK-SECURITY-ENCRYPTION-01)
   */
  requiresEncryption: boolean;
  /**
   * Whether access to this asset must produce an audit event.
   */
  requiresAudit:  boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * SECURITY_REGISTRY — the canonical catalog of all sensitive Agentik assets.
 *
 * Add new entries here as new data types are introduced.
 * Entries are immutable constants — use getRegistryEntry() for lookup.
 */
export const SECURITY_REGISTRY: ReadonlyArray<SecurityRegistryEntry> = [
  // ── Copilot Memory ─────────────────────────────────────────────────────────
  {
    id:                 "COPILOT_MEMORY",
    name:               "Copilot Memory Entry",
    description:        "Strategic and operational memory stored by the Copilot Intelligence layer. Contains business insights, preferences, and operational history.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Playbooks ──────────────────────────────────────────────────────────────
  {
    id:                 "PLAYBOOK",
    name:               "Operational Playbook",
    description:        "Structured business knowledge and operational procedures. Contains how the company operates in each domain.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Executive Brain ────────────────────────────────────────────────────────
  {
    id:                 "EXECUTIVE_CONTEXT",
    name:               "Executive Brain Context",
    description:        "Strategic intelligence context produced by the Executive Brain. Contains signals, insights, and risk assessments.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── AI Tokens ──────────────────────────────────────────────────────────────
  {
    id:                 "AI_TOKEN",
    name:               "AI Provider API Token",
    description:        "Authentication token for external AI providers (Anthropic, OpenAI, etc.). Grants billing and usage rights.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "security",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  // ── WhatsApp Token ─────────────────────────────────────────────────────────
  {
    id:                 "WHATSAPP_TOKEN",
    name:               "WhatsApp Business API Token",
    description:        "Access token for WhatsApp Business API. Enables messaging to customers.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "integrations",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  // ── DIAN Certificate ───────────────────────────────────────────────────────
  {
    id:                 "DIAN_CERTIFICATE",
    name:               "DIAN Digital Certificate",
    description:        "PKCS#12 certificate for electronic invoicing with DIAN (Colombian tax authority). Grants signing authority.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "integrations",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  // ── Bank Account ───────────────────────────────────────────────────────────
  {
    id:                 "BANK_ACCOUNT",
    name:               "Bank Account Credentials",
    description:        "Banking credentials, account numbers, and access tokens for financial institution APIs.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "finance",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  // ── Customer Record ────────────────────────────────────────────────────────
  {
    id:                 "CUSTOMER_RECORD",
    name:               "Customer Record",
    description:        "Customer personal data, contact information, purchase history, and commercial relationships.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "comercial",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Employee Record ────────────────────────────────────────────────────────
  {
    id:                 "EMPLOYEE_RECORD",
    name:               "Employee Record",
    description:        "Employee personal data, salary information, roles, and employment history.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "operations",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── OAuth Token ────────────────────────────────────────────────────────────
  {
    id:                 "OAUTH_TOKEN",
    name:               "OAuth Access/Refresh Token",
    description:        "OAuth tokens for external platform integrations (Meta, Shopify, TikTok, etc.).",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "integrations",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  // ── Webhook Secret ─────────────────────────────────────────────────────────
  {
    id:                 "WEBHOOK_SECRET",
    name:               "Webhook Signing Secret",
    description:        "HMAC signing secret used to verify webhook payloads from external providers.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "integrations",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  // ── Encrypted Data ─────────────────────────────────────────────────────────
  {
    id:                 "ENCRYPTED_DATA",
    name:               "Encrypted Business Data Envelope",
    description:        "AES-256-GCM encrypted envelope produced by the Agentik Encryption Layer (AGENTIK-SECURITY-ENCRYPTION-01). Contains ciphertext, IV, auth tag, and key version reference. Never contains plaintext or key material.",
    classification:     "RESTRICTED",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Encryption Key Reference ───────────────────────────────────────────────
  {
    id:                 "ENCRYPTION_KEY_REFERENCE",
    name:               "Encryption Key Reference",
    description:        "Opaque reference to an encryption key version (keyId, version, status, envVarName). Never contains actual key material. Used for key rotation planning and health checks.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Encryption Policy ──────────────────────────────────────────────────────
  {
    id:                 "ENCRYPTION_POLICY",
    name:               "Data Encryption Policy",
    description:        "Classification-driven policy that determines which asset types require encryption. Includes ASSET_CLASSIFICATION_MAP, requiresEncryption(), and ENCRYPTION_REGISTRY definitions.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── RBAC Role ──────────────────────────────────────────────────────────────
  {
    id:                 "RBAC_ROLE",
    name:               "RBAC Role Definition",
    description:        "System role definitions (SUPER_ADMIN, ORG_ADMIN, MANAGER, etc.). Immutable system roles cannot be deleted. Controls what permission sets are available per user type.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── RBAC Permission ────────────────────────────────────────────────────────
  {
    id:                 "RBAC_PERMISSION",
    name:               "RBAC Permission Entry",
    description:        "Registered permission definitions (FINANCE_VIEW, VAULT_ADMIN, etc.). Maps permission IDs to risk levels and audit requirements. Source of truth for what actions exist in the platform.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── RBAC Assignment ────────────────────────────────────────────────────────
  {
    id:                 "RBAC_ASSIGNMENT",
    name:               "User Role Assignment",
    description:        "Binding of a userId to a roleId within an orgSlug scope. Controls which roles a user holds. Every assignment change must produce an audit event.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── RBAC Policy ────────────────────────────────────────────────────────────
  {
    id:                 "RBAC_POLICY",
    name:               "RBAC Authorization Policy",
    description:        "The role-permission matrix that maps each role to its granted permission set. Defines the complete access control policy for the Agentik platform.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── Financial Report ───────────────────────────────────────────────────────
  {
    id:                 "FINANCIAL_REPORT",
    name:               "Financial Report",
    description:        "Generated financial reports including P&L, cash flow, collections portfolio, and reconciliation results.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_EXPORT",
    owner:              "finance",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  // ── Secret Version ────────────────────────────────────────────────────────
  {
    id:                 "SECRET_VERSION",
    name:               "Secret Version Metadata",
    description:        "Metadata for a versioned secret (secretId, version, status, timestamps, rotationId). Never stores the actual secret value. Tracks version lifecycle: PENDING→ACTIVE→GRACE→REVOKED.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Secret Rotation ────────────────────────────────────────────────────────
  {
    id:                 "SECRET_ROTATION",
    name:               "Secret Rotation Record",
    description:        "Rotation operation record: strategy, status, requester, approver, reason, timestamps. Never stores secret values. Persisted in SecretRotation Prisma model.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Rotation Policy ────────────────────────────────────────────────────────
  {
    id:                 "ROTATION_POLICY",
    name:               "Secret Rotation Policy",
    description:        "Policy rules governing rotation frequency, approval requirements, emergency bypass, and grace periods for each secret class.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── Rotation Approval ──────────────────────────────────────────────────────
  {
    id:                 "ROTATION_APPROVAL",
    name:               "Rotation Approval Record",
    description:        "Approval decision for a rotation operation. Records approver identity, timestamp, and decision. Critical for double-approval verification on CRITICAL secrets.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Zero Trust Policy ──────────────────────────────────────────────────────
  {
    id:                 "ZERO_TRUST_POLICY",
    name:               "Zero Trust Policy Engine",
    description:        "Evaluation flow for every access request: tenant isolation, subject validation, risk level, trust score, RBAC check, threshold, decision. Fail-closed. AGENTIK-SECURITY-ZERO-TRUST-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── Trust Scoring ──────────────────────────────────────────────────────────
  {
    id:                 "TRUST_SCORING",
    name:               "Trust Score Engine",
    description:        "Computes 0–100 trust score from 8 weighted factors: valid role, session, tenant, MFA, known IP, known device, recent activity, no suspicious signals. Critical factors cap at 50. Subject deductions per type.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── Tenant Isolation ───────────────────────────────────────────────────────
  {
    id:                 "TENANT_ISOLATION",
    name:               "Tenant Isolation Boundary",
    description:        "Enforces strict multi-tenant boundary. Every access request carries orgSlug; resource owner org must match. Cross-tenant access is CRITICAL risk. Fail-closed on missing or mismatched orgSlug.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Agent Security Domain ──────────────────────────────────────────────────
  {
    id:                 "AGENT_SECURITY",
    name:               "Agent Security Domain Registry",
    description:        "Per-agent domain definitions: canRead/canWrite/canExecute/denied resource types. Agents luca/diego/laura/david/sofia/mila/pablo each have scoped access. Agents cannot APPROVE, ROTATE_SECRET, MANAGE_USERS, or ADMIN.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Integration Security ───────────────────────────────────────────────────
  {
    id:                 "INTEGRATION_SECURITY",
    name:               "Integration Security Scope Registry",
    description:        "Per-integration scope definitions for Shopify, Meta, WhatsApp, TikTok, DIAN, FedEx, Stripe, CRM. Compromised or revoked integrations are denied immediately. Secret version must be present.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── KMS Provider ───────────────────────────────────────────────────────────
  {
    id:                 "KMS_PROVIDER",
    name:               "KMS Provider Registry",
    description:        "Registry of KMS providers (LOCAL, AWS_KMS, AZURE_KEY_VAULT, GCP_KMS, CUSTOM). LOCAL is always registered as fallback. resolveProvider() falls back to LOCAL if preferred is unavailable. Fail-closed: no provider → deny all ops. AGENTIK-SECURITY-KMS-01.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── KMS Key ────────────────────────────────────────────────────────────────
  {
    id:                 "KMS_KEY",
    name:               "KMS Key Metadata",
    description:        "Metadata-only record for KMS-managed keys: keyId, keyAlias, provider, status (ACTIVE/ROTATING/DISABLED/REVOKED/PENDING), version, orgSlug, algorithm. NEVER stores key material. Tenant-scoped. Cross-tenant access is CRITICAL risk. Persisted in KmsKey Prisma model. AGENTIK-SECURITY-KMS-01.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── KMS Operation ──────────────────────────────────────────────────────────
  {
    id:                 "KMS_OPERATION",
    name:               "KMS Operation Gate",
    description:        "All KMS operations pass through RBAC + Zero Trust gates before reaching the provider. Operations: GENERATE_KEY (HIGH), ENCRYPT (MEDIUM), DECRYPT (HIGH), ROTATE_KEY (CRITICAL), DISABLE_KEY (CRITICAL), ENABLE_KEY (HIGH), DELETE_KEY (CRITICAL). Fail-closed engine. AGENTIK-SECURITY-KMS-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── KMS Policy ────────────────────────────────────────────────────────────
  {
    id:                 "KMS_POLICY",
    name:               "KMS Access Policy",
    description:        "RBAC permission mapping for KMS operations. KMS_VIEW/KMS_USE → ENCRYPTION_VIEW. KMS_ROTATE/KMS_ADMIN → ENCRYPTION_ADMIN. Agents blocked from lifecycle operations. SERVICE_ACCOUNT limited to encrypt/decrypt. AGENTIK-SECURITY-KMS-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── KMS Audit ─────────────────────────────────────────────────────────────
  {
    id:                 "KMS_AUDIT",
    name:               "KMS Audit Event Log",
    description:        "Audit trail for all KMS operations: KEY_GENERATED, KEY_USED, KEY_ROTATED, KEY_DISABLED, KEY_ENABLED, KEY_DELETED, KMS_ACCESS_DENIED, KMS_PROVIDER_FAILURE. Never records key material. In-memory + async persistence via SecurityAuditEvent. AGENTIK-SECURITY-KMS-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── MFA Provider ──────────────────────────────────────────────────────────
  {
    id:                 "MFA_PROVIDER",
    name:               "MFA Provider Registry",
    description:        "Registry of MFA providers: TOTP (RFC 6238), EMAIL, SMS, PASSKEY, WEBAUTHN. TOTP is the default and only fully-implemented provider. Others are planned stubs. AGENTIK-SECURITY-MFA-01.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── MFA Enrollment ────────────────────────────────────────────────────────
  {
    id:                 "MFA_ENROLLMENT",
    name:               "MFA Enrollment Record",
    description:        "User MFA enrollment state: method, status (DISABLED/PENDING/ENABLED/LOCKED), failCount, enabledAt, lastUsedAt. NEVER stores plain secrets — only encrypted secret references. Tenant-scoped. Persisted in MfaEnrollment Prisma model. AGENTIK-SECURITY-MFA-01.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "security",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  // ── MFA Challenge ─────────────────────────────────────────────────────────
  {
    id:                 "MFA_CHALLENGE",
    name:               "MFA Challenge",
    description:        "Active MFA challenge waiting for verification. Contains challengeId, userId, method, expiresAt, type (STEP_UP/ADAPTIVE/POLICY/ZERO_TRUST). Never contains OTP codes or secrets. TTL-enforced. AGENTIK-SECURITY-MFA-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── MFA Recovery Code ─────────────────────────────────────────────────────
  {
    id:                 "MFA_RECOVERY_CODE",
    name:               "MFA Recovery Code Hash",
    description:        "scrypt hash of a single-use emergency MFA recovery code. NEVER stores plain codes. Format: scrypt:{saltHex}:{hashHex}. Single-use enforcement via usedAt timestamp. 10 codes per enrollment. AGENTIK-SECURITY-MFA-01.",
    classification:     "RESTRICTED",
    category:           "SECRET",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── MFA Policy ────────────────────────────────────────────────────────────
  {
    id:                 "MFA_POLICY",
    name:               "MFA Resource Policy",
    description:        "Resource-level MFA requirement policy: Vault/KMS/Secret Rotation → CRITICAL required (TOTP/PASSKEY/WEBAUTHN only). Identity/Tenant Admin → HIGH required (all methods). Financial/AI → optional. Zero Trust CHALLENGE trigger. AGENTIK-SECURITY-MFA-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── Anomaly Engine ─────────────────────────────────────────────────────────
  {
    id:                 "ANOMALY_ENGINE",
    name:               "Anomaly Detection Engine",
    description:        "Multi-tenant anomaly detection layer. Orchestrates 11 detectors, correlation engine, risk scoring, and alert builder. Detection only — no remediation. Fail-closed. Compatible with Zero Trust, MFA, Vault, KMS, Secret Rotation, Executive Brain, SOC. AGENTIK-SECURITY-ANOMALY-DETECTION-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Anomaly Alert ──────────────────────────────────────────────────────────
  {
    id:                 "ANOMALY_ALERT",
    name:               "Anomaly Alert",
    description:        "Correlated security alert produced by the Anomaly Detection Engine. Aggregates one or more AnomalySignals into an actionable alert with riskScore (0–100), severity, and status lifecycle (OPEN→ACKNOWLEDGED→RESOLVED|IGNORED). Persisted in AnomalyAlert Prisma model. AGENTIK-SECURITY-ANOMALY-DETECTION-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Anomaly Signal ─────────────────────────────────────────────────────────
  {
    id:                 "ANOMALY_SIGNAL",
    name:               "Anomaly Signal",
    description:        "Single detection event emitted by one AnomalyDetector. Carries orgSlug, type, severity, weight (0–100), reason, detectorId, and time window. Immutable after creation. NEVER stores raw secrets, OTP codes, key material, or recovery codes. Persisted in AnomalySignal Prisma model. AGENTIK-SECURITY-ANOMALY-DETECTION-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Anomaly Policy ─────────────────────────────────────────────────────────
  {
    id:                 "ANOMALY_POLICY",
    name:               "Anomaly Detection Policy",
    description:        "Threshold policies for each AnomalyType: MFA failure spike (5 in 10min=MEDIUM), Vault access spike (10 in 5min=HIGH), Cross-tenant attempt (always CRITICAL, weight=100), Agent permission violation (HIGH, weight=80), etc. 14 policies active. AGENTIK-SECURITY-ANOMALY-DETECTION-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── Anomaly Detector ───────────────────────────────────────────────────────
  {
    id:                 "ANOMALY_DETECTOR",
    name:               "Anomaly Detector Registry",
    description:        "Registry of 11 registered detectors: login-failure, mfa-failure, new-device, new-location, vault-anomaly, kms-anomaly, secret-rotation, rbac-anomaly, zero-trust, agent-anomaly, cross-tenant. Each implements AnomalyDetector interface: evaluate(context, history) → Promise<AnomalyResult<AnomalySignal[]>>. AGENTIK-SECURITY-ANOMALY-DETECTION-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },


  // ── Compliance Engine (AGENTIK-SECURITY-COMPLIANCE-01) ───────────────────────
  {
    id:                 "COMPLIANCE_ENGINE",
    name:               "Compliance & Governance Engine",
    description:        "Central compliance layer. Evaluates SOC2, ISO27001, GDPR, HIPAA controls. Generates evidence, findings, violations, and reports. Integrates with all security subsystems. AGENTIK-SECURITY-COMPLIANCE-01.",
    classification:     "CONFIDENTIAL",
    category:           "SYSTEM",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  {
    id:                 "COMPLIANCE_CONTROL",
    name:               "Compliance Control Catalog",
    description:        "Catalog of 11 compliance controls: ACCESS_CONTROL, AUDIT_LOGGING, TENANT_ISOLATION, ENCRYPTION, KEY_MANAGEMENT, MFA, ZERO_TRUST, SECRET_ROTATION, ANOMALY_DETECTION, DATA_RETENTION, INCIDENT_TRACKING. Maps to SOC2, ISO27001, GDPR, HIPAA. AGENTIK-SECURITY-COMPLIANCE-01.",
    classification:     "INTERNAL",
    category:           "SYSTEM",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  {
    id:                 "COMPLIANCE_EVIDENCE",
    name:               "Compliance Evidence Record",
    description:        "Evidence items supporting or refuting a compliance control evaluation. Org-scoped. Append-only. Carries source (AUDIT_LOG|RBAC|MFA|VAULT|KMS|ZERO_TRUST|ANOMALY_DETECTION|SECRET_ROTATION|MANUAL|SYSTEM), isSupporting flag, and TTL. NEVER stores raw secrets. AGENTIK-SECURITY-COMPLIANCE-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: true,
    requiresAudit:      true,
  },

  {
    id:                 "COMPLIANCE_FINDING",
    name:               "Compliance Finding",
    description:        "Result of evaluating one compliance control for one org. Aggregates evidence, violations, score (0–100), and status (COMPLIANT|PARTIAL|NON_COMPLIANT|UNKNOWN). Persisted in ComplianceFinding Prisma model. AGENTIK-SECURITY-COMPLIANCE-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  {
    id:                 "COMPLIANCE_REPORT",
    name:               "Compliance Report",
    description:        "Generated compliance reports: SOC2 Readiness, ISO27001 Readiness, Tenant Compliance, Security Compliance, Executive Summary. Contains framework scores, control statuses, top risks, and remediation recommendations. AGENTIK-SECURITY-COMPLIANCE-01.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "security",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Executive Brain V2 ─────────────────────────────────────────────────────
  {
    id:                 "EXECUTIVE_BRAIN_V2",
    name:               "Executive Brain V2",
    description:        "Strategic executive intelligence layer.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "EXECUTIVE_BRIEFING",
    name:               "Executive Briefing",
    description:        "Structured executive briefings (CEO, Finance, Commercial, Operations).",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "EXECUTIVE_DIGEST",
    name:               "Executive Digest",
    description:        "Periodic executive digests. Aggregated strategic intelligence per period.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "EXECUTIVE_PRIORITY",
    name:               "Executive Priority",
    description:        "Computed executive priorities with impact, urgency, alignment, and risk scores.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "EXECUTIVE_CONFLICT",
    name:               "Executive Conflict",
    description:        "Detected strategic conflicts between objectives, priorities, and constraints.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },


  // ── Strategic Advisor ──────────────────────────────────────────────────────
  {
    id:                 "STRATEGIC_ADVISOR",
    name:               "Strategic Advisor",
    description:        "Virtual strategic advisory layer — generates concerns, opportunities, recommendations, and briefings.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "STRATEGIC_ADVICE",
    name:               "Strategic Advice",
    description:        "Strategic advice narratives generated by the advisor engine.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "STRATEGIC_RECOMMENDATION",
    name:               "Strategic Recommendation",
    description:        "Actionable strategic recommendations with evidence and confidence.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "STRATEGIC_BRIEFING",
    name:               "Strategic Briefing",
    description:        "CEO, Board, Finance, Growth, Operations, and Custom strategic briefings.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "STRATEGIC_DIGEST",
    name:               "Strategic Digest",
    description:        "Daily, weekly, monthly, and quarterly strategic advisor digests.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Strategic Simulations (AGENTIK-STRATEGIC-SIMULATIONS-01) ────────────────
  {
    id:                 "STRATEGIC_SIMULATION_ENGINE",
    name:               "Strategic Simulation Engine",
    description:        "Hypothetical scenario simulation engine — never executes, never modifies data.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "SIMULATION_SCENARIO",
    name:               "Simulation Scenario",
    description:        "Individual simulation scenario records (optimistic/conservative/pessimistic).",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "SIMULATION_COMPARISON",
    name:               "Simulation Comparison",
    description:        "Cross-scenario comparison records for strategic decision support.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "SIMULATION_RECOMMENDATION",
    name:               "Simulation Recommendation",
    description:        "Simulation-derived recommendations — all suggestedOnly, never executable.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "SIMULATION_AUDIT",
    name:               "Simulation Audit Trail",
    description:        "Audit events for simulation runs — tenant-scoped, fail-closed.",
    classification:     "INTERNAL",
    category:           "SYSTEM",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── Strategic Planning ─────────────────────────────────────────────────────

  {
    id:                 "STRATEGIC_PLAN",
    name:               "Strategic Plan",
    description:        "Structured business plan — suggestedOnly, never executes, never assigns tasks.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "STRATEGIC_OBJECTIVE",
    name:               "Strategic Objective",
    description:        "Org-scoped strategic objective derived from memory, brain, advisor, and simulation inputs.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "STRATEGIC_INITIATIVE",
    name:               "Strategic Initiative",
    description:        "Initiative proposal — suggestedOnly, never assigns real tasks or actions.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "STRATEGIC_MILESTONE",
    name:               "Strategic Milestone",
    description:        "Milestone within a strategic initiative — suggestedOnly timeline marker.",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },
  {
    id:                 "STRATEGIC_ROADMAP",
    name:               "Strategic Roadmap",
    description:        "Planning roadmap — structured sequence of objectives, initiatives, and milestones.",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ── AGENTIK-EXECUTIVE-COUNCIL-01 ──────────────────────────────────────────

  {
    id:                 "EXECUTIVE_COUNCIL",
    name:               "Executive Council Session",
    description:        "Sesiones del Consejo Ejecutivo con opiniones, consenso y resoluciones",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "COUNCIL_OPINION",
    name:               "Council Opinion",
    description:        "Opiniones por perspectiva generadas durante sesiones del consejo",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },
  {
    id:                 "COUNCIL_CONSENSUS",
    name:               "Council Consensus",
    description:        "Resultados de consenso entre perspectivas del consejo ejecutivo",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "COUNCIL_RESOLUTION",
    name:               "Council Resolution",
    description:        "Resoluciones y recomendaciones generadas por el consejo ejecutivo",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "COUNCIL_RECOMMENDATION",
    name:               "Council Recommendation",
    description:        "Recomendaciones suggestedOnly derivadas de la deliberación del consejo",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  {
    id:                 "BOARD_SESSION",
    name:               "Board Intelligence Session",
    description:        "Sesión de análisis estratégico de junta — solo sugeridas, nunca ejecutadas",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "BOARD_REPORT",
    name:               "Board Intelligence Report",
    description:        "Informe ejecutivo de junta — evaluaciones de gobierno y estrategia",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "BOARD_RISK",
    name:               "Board Risk Assessment",
    description:        "Riesgos identificados a nivel de junta — sistémicos y críticos",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "BOARD_RESOLUTION",
    name:               "Board Resolution",
    description:        "Resolución sugerida de junta — suggestedOnly, requiere validación humana",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "BOARD_RECOMMENDATION",
    name:               "Board Recommendation",
    description:        "Recomendaciones de junta — suggestedOnly derivadas del pipeline de inteligencia",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },
  {
    id:                 "BOARD_FINDING",
    name:               "Board Finding",
    description:        "Hallazgos estratégicos identificados durante análisis de junta",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },

  // ── Strategic Forecasting
  {
    id:                 "STRATEGIC_FORECASTING",
    name:               "Strategic Forecasting",
    description:        "Sesión de proyección estratégica — probabilística, suggestedOnly, requiere validación humana",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "FORECAST",
    name:               "Forecast",
    description:        "Proyección estratégica individual — contiene escenarios, riesgos y oportunidades proyectados",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "FORECAST_SCENARIO",
    name:               "Forecast Scenario",
    description:        "Escenario proyectivo — probabilidad estimada, suggestedOnly",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },
  {
    id:                 "FORECAST_SIGNAL",
    name:               "Forecast Signal",
    description:        "Señal de proyección estratégica — indicador de tendencia identificado",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },
  {
    id:                 "FORECAST_REPORT",
    name:               "Forecast Report",
    description:        "Reporte completo de proyección estratégica — contiene narrativa, escenarios y resumen ejecutivo",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "ENTERPRISE_DIRECTION",
    name:               "Enterprise Direction",
    description:        "Dirección estratégica empresarial — estrella norte, alineamiento, prioridades — suggestedOnly, requiere validación humana",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "NORTH_STAR",
    name:               "North Star",
    description:        "Estrella norte estratégica — declaración de dirección, suggestedOnly",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "DIRECTION_OBJECTIVE",
    name:               "Direction Objective",
    description:        "Objetivo estratégico de dirección — alineado a la estrella norte",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },
  {
    id:                 "DIRECTION_PRIORITY",
    name:               "Direction Priority",
    description:        "Prioridad estratégica — urgencia × impacto, suggestedOnly",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },
  {
    id:                 "DIRECTION_REPORT",
    name:               "Direction Report",
    description:        "Reporte completo de dirección estratégica — narrativa, prioridades, desviaciones, conflictos, briefings ejecutivos",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },

  // ─── Executive Governance ─────────────────────────────────────────────────
  {
    id:                 "GOVERNANCE_REPORT",
    name:               "Reporte de Gobernanza Ejecutiva",
    description:        "Reporte completo de gobernanza — políticas, violaciones, escalaciones, evaluación, recomendaciones",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "GOVERNANCE_VIOLATION",
    name:               "Violación de Gobernanza",
    description:        "Registro de violaciones de política corporativa con severidad y evidencia",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "GOVERNANCE_ESCALATION",
    name:               "Escalación de Gobernanza",
    description:        "Escalaciones de gobernanza con autoridad objetivo y nivel de bloqueo",
    classification:     "CONFIDENTIAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "GOVERNANCE_ASSESSMENT",
    name:               "Evaluación de Gobernanza",
    description:        "Evaluación de gobernanza corporativa incluyendo hallazgos y puntuación",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      true,
  },
  {
    id:                 "GOVERNANCE_POLICY",
    name:               "Política de Gobernanza",
    description:        "Políticas activas de gobernanza corporativa con umbrales y autoridades",
    classification:     "INTERNAL",
    category:           "DATA_ACCESS",
    owner:              "copilot",
    requiresEncryption: false,
    requiresAudit:      false,
  },

] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Find a registry entry by its id. Returns undefined if not found. */
export function getRegistryEntry(id: string): SecurityRegistryEntry | undefined {
  return SECURITY_REGISTRY.find(e => e.id === id);
}

/** Find all entries with the given classification. */
export function getEntriesByClassification(
  classification: DataSensitivity,
): SecurityRegistryEntry[] {
  return SECURITY_REGISTRY.filter(e => e.classification === classification);
}

/** Find all entries with the given owner domain. */
export function getEntriesByOwner(owner: string): SecurityRegistryEntry[] {
  return SECURITY_REGISTRY.filter(e => e.owner === owner);
}

/** Find all entries that require audit. */
export function getAuditRequiredEntries(): SecurityRegistryEntry[] {
  return SECURITY_REGISTRY.filter(e => e.requiresAudit);
}

/** Find all entries that require encryption at rest. */
export function getEncryptionRequiredEntries(): SecurityRegistryEntry[] {
  return SECURITY_REGISTRY.filter(e => e.requiresEncryption);
}
