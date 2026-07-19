/**
 * lib/security/compliance/control-catalog.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Control Catalog
 *
 * Defines and registers all compliance controls for the Agentik platform.
 * Auto-registers into the global complianceRegistry on import.
 *
 * No server-only. No Prisma. Pure domain catalog.
 */

import type { ComplianceControl } from "./compliance-types";
import { complianceRegistry } from "./compliance-registry";

// ── Control Definitions ────────────────────────────────────────────────────────

export const COMPLIANCE_CONTROLS: ReadonlyArray<ComplianceControl> = [

  // ── Access Control ──────────────────────────────────────────────────────────
  {
    id:                  "CTRL_ACCESS_CONTROL",
    name:                "Role-Based Access Control",
    description:         "Access to all platform resources is governed by RBAC with least-privilege principles. Every access decision is explicit — no implicit grants.",
    frameworks:          ["SOC2", "ISO27001", "GDPR", "HIPAA"],
    category:            "ACCESS_CONTROL",
    violationSeverity:   "CRITICAL",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      true,
    objective:           "Ensure only authorized identities can access platform resources according to defined roles.",
    evidenceSources:     ["RBAC", "AUDIT_LOG"],
    enabled:             true,
  },

  // ── Audit Logging ───────────────────────────────────────────────────────────
  {
    id:                  "CTRL_AUDIT_LOGGING",
    name:                "Comprehensive Audit Logging",
    description:         "All significant security and operational events are persisted in an append-only audit log with tamper-evident design.",
    frameworks:          ["SOC2", "ISO27001", "GDPR", "HIPAA"],
    category:            "AUDIT_LOGGING",
    violationSeverity:   "CRITICAL",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      true,
    objective:           "Maintain a comprehensive, tamper-evident record of all security-relevant events for accountability and forensic investigation.",
    evidenceSources:     ["AUDIT_LOG"],
    enabled:             true,
  },

  // ── Tenant Isolation ────────────────────────────────────────────────────────
  {
    id:                  "CTRL_TENANT_ISOLATION",
    name:                "Multi-Tenant Data Isolation",
    description:         "All tenant data is strictly scoped by orgSlug. No cross-tenant data access is possible through any platform API or service.",
    frameworks:          ["SOC2", "ISO27001", "GDPR"],
    category:            "TENANT_ISOLATION",
    violationSeverity:   "CRITICAL",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      true,
    objective:           "Guarantee that no tenant can access, modify, or infer data belonging to another tenant.",
    evidenceSources:     ["AUDIT_LOG", "ANOMALY_DETECTION", "ZERO_TRUST"],
    enabled:             true,
  },

  // ── Encryption ──────────────────────────────────────────────────────────────
  {
    id:                  "CTRL_ENCRYPTION",
    name:                "Encryption at Rest and in Transit",
    description:         "All sensitive data is encrypted at rest using AES-256-GCM. All data in transit is encrypted via TLS 1.2+.",
    frameworks:          ["SOC2", "ISO27001", "GDPR", "HIPAA"],
    category:            "ENCRYPTION",
    violationSeverity:   "HIGH",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      true,
    objective:           "Protect sensitive data from unauthorized access using industry-standard encryption for all storage and transmission.",
    evidenceSources:     ["KMS", "VAULT"],
    enabled:             true,
  },

  // ── Key Management ──────────────────────────────────────────────────────────
  {
    id:                  "CTRL_KEY_MANAGEMENT",
    name:                "Cryptographic Key Management",
    description:         "Cryptographic keys are managed through a dedicated KMS. Keys are rotated on schedule and protected with access controls.",
    frameworks:          ["SOC2", "ISO27001", "HIPAA"],
    category:            "KEY_MANAGEMENT",
    violationSeverity:   "HIGH",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      false,
    objective:           "Ensure cryptographic keys are generated, stored, rotated, and retired in a controlled manner with full auditability.",
    evidenceSources:     ["KMS", "AUDIT_LOG"],
    enabled:             true,
  },

  // ── MFA ─────────────────────────────────────────────────────────────────────
  {
    id:                  "CTRL_MFA",
    name:                "Multi-Factor Authentication",
    description:         "All operator and administrative access requires multi-factor authentication. MFA failures are monitored and anomalies are detected.",
    frameworks:          ["SOC2", "ISO27001", "HIPAA"],
    category:            "MFA",
    violationSeverity:   "HIGH",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      false,
    objective:           "Prevent unauthorized access from compromised credentials by requiring a second authentication factor for all privileged access.",
    evidenceSources:     ["MFA", "AUDIT_LOG", "ANOMALY_DETECTION"],
    enabled:             true,
  },

  // ── Zero Trust ──────────────────────────────────────────────────────────────
  {
    id:                  "CTRL_ZERO_TRUST",
    name:                "Zero Trust Access Model",
    description:         "Every access request is verified regardless of network location. Trust score, device posture, and session context are evaluated per request.",
    frameworks:          ["SOC2", "ISO27001"],
    category:            "ZERO_TRUST",
    violationSeverity:   "HIGH",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      false,
    objective:           "Enforce continuous verification of every access request. Eliminate implicit trust from network location or prior session.",
    evidenceSources:     ["ZERO_TRUST", "AUDIT_LOG"],
    enabled:             true,
  },

  // ── Secret Rotation ─────────────────────────────────────────────────────────
  {
    id:                  "CTRL_SECRET_ROTATION",
    name:                "Automated Secret Rotation",
    description:         "All secrets, credentials, and API keys are rotated on a defined schedule. Rotation events are audited.",
    frameworks:          ["SOC2", "ISO27001", "HIPAA"],
    category:            "SECRET_ROTATION",
    violationSeverity:   "HIGH",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      false,
    objective:           "Limit the blast radius of credential compromise by ensuring all secrets have a defined lifetime and are regularly rotated.",
    evidenceSources:     ["VAULT", "SECRET_ROTATION", "AUDIT_LOG"],
    enabled:             true,
  },

  // ── Anomaly Detection ───────────────────────────────────────────────────────
  {
    id:                  "CTRL_ANOMALY_DETECTION",
    name:                "Security Anomaly Detection",
    description:         "Automated detection of anomalous security events using 11 specialized detectors. All alerts are persisted and triaged.",
    frameworks:          ["SOC2", "ISO27001"],
    category:            "ANOMALY_DETECTION",
    violationSeverity:   "MEDIUM",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      false,
    objective:           "Detect, record, and surface security anomalies before they escalate. Provide audit evidence of security monitoring activity.",
    evidenceSources:     ["ANOMALY_DETECTION", "AUDIT_LOG"],
    enabled:             true,
  },

  // ── Data Retention ──────────────────────────────────────────────────────────
  {
    id:                  "CTRL_DATA_RETENTION",
    name:                "Data Retention Policy",
    description:         "All data is retained according to defined policies. Security audit logs are retained for a minimum of 365 days.",
    frameworks:          ["SOC2", "ISO27001", "GDPR", "HIPAA"],
    category:            "DATA_RETENTION",
    violationSeverity:   "MEDIUM",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      true,
    objective:           "Ensure data is retained for the minimum required period to support audit, forensic, and legal obligations.",
    evidenceSources:     ["AUDIT_LOG", "SYSTEM"],
    enabled:             true,
  },

  // ── Incident Tracking ───────────────────────────────────────────────────────
  {
    id:                  "CTRL_INCIDENT_TRACKING",
    name:                "Security Incident Tracking",
    description:         "All security incidents are recorded, tracked to resolution, and post-mortemed. Incident severity and response time is monitored.",
    frameworks:          ["SOC2", "ISO27001", "HIPAA"],
    category:            "INCIDENT_TRACKING",
    violationSeverity:   "HIGH",
    isSoc2Required:      true,
    isIso27001Required:  true,
    isGdprRequired:      false,
    objective:           "Ensure every security incident is identified, contained, and resolved with evidence of response time and remediation actions.",
    evidenceSources:     ["ANOMALY_DETECTION", "AUDIT_LOG"],
    enabled:             true,
  },

];

// ── Auto-registration ─────────────────────────────────────────────────────────

/**
 * Auto-register all controls into the global registry on import.
 */
for (const control of COMPLIANCE_CONTROLS) {
  complianceRegistry.registerControl(control);
}

// ── Control ID constants ──────────────────────────────────────────────────────

export const CTRL_ACCESS_CONTROL    = "CTRL_ACCESS_CONTROL";
export const CTRL_AUDIT_LOGGING     = "CTRL_AUDIT_LOGGING";
export const CTRL_TENANT_ISOLATION  = "CTRL_TENANT_ISOLATION";
export const CTRL_ENCRYPTION        = "CTRL_ENCRYPTION";
export const CTRL_KEY_MANAGEMENT    = "CTRL_KEY_MANAGEMENT";
export const CTRL_MFA               = "CTRL_MFA";
export const CTRL_ZERO_TRUST        = "CTRL_ZERO_TRUST";
export const CTRL_SECRET_ROTATION   = "CTRL_SECRET_ROTATION";
export const CTRL_ANOMALY_DETECTION = "CTRL_ANOMALY_DETECTION";
export const CTRL_DATA_RETENTION    = "CTRL_DATA_RETENTION";
export const CTRL_INCIDENT_TRACKING = "CTRL_INCIDENT_TRACKING";
