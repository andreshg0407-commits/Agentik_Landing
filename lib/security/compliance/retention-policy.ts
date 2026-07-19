/**
 * lib/security/compliance/retention-policy.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Data Retention Policies
 *
 * Defines retention requirements for all data types.
 * Contracts only — no data deletion operations.
 * Without deletion triggers — this is a compliance contract layer.
 *
 * Compatible with: SOC2, ISO27001, GDPR, HIPAA.
 *
 * No server-only. No Prisma. No destructive operations.
 */

// ── RetentionCategory ─────────────────────────────────────────────────────────

export type RetentionCategory =
  | "SECURITY_AUDIT_LOG"
  | "ACCESS_LOG"
  | "FINANCIAL_RECORD"
  | "CUSTOMER_DATA"
  | "COMPLIANCE_EVIDENCE"
  | "COMPLIANCE_FINDING"
  | "SECRET_AUDIT"
  | "KMS_AUDIT"
  | "MFA_AUDIT"
  | "ANOMALY_ALERT"
  | "ANOMALY_SIGNAL"
  | "INCIDENT_RECORD"
  | "USER_CONSENT"
  | "CONTRACT_DOCUMENT";

// ── RetentionPolicy ───────────────────────────────────────────────────────────

/**
 * RetentionPolicy — contract for how long a data category must be retained.
 * No deletion logic here — this is a policy definition only.
 */
export interface RetentionPolicy {
  category:        RetentionCategory;
  description:     string;
  /** Minimum retention in days required by compliance. */
  minRetentionDays: number;
  /** Maximum retention in days (0 = no upper limit). */
  maxRetentionDays: number;
  /** Which frameworks mandate this retention. */
  requiredBy:      string[];
  /** Whether this data is subject to GDPR right-to-erasure. */
  subjectToGdprErasure: boolean;
  /** Whether this data can be anonymized instead of deleted. */
  canBeAnonymized: boolean;
  /** Legal hold override: if true, deletion requires legal approval. */
  requiresLegalApproval: boolean;
  /** Notes for compliance team. */
  notes:           string;
}

// ── Retention Policies ────────────────────────────────────────────────────────

export const RETENTION_POLICIES: ReadonlyArray<RetentionPolicy> = [
  {
    category:            "SECURITY_AUDIT_LOG",
    description:         "Security audit events: access grants, denials, policy violations, boundary events.",
    minRetentionDays:    365,
    maxRetentionDays:    2555,  // 7 years
    requiredBy:          ["SOC2", "ISO27001", "HIPAA"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: false,
    notes:               "Security audit logs are non-negotiable for SOC2 Type II. Retain for 1–7 years.",
  },
  {
    category:            "ACCESS_LOG",
    description:         "Authentication and authorization decisions: login events, RBAC decisions, session events.",
    minRetentionDays:    365,
    maxRetentionDays:    1825,  // 5 years
    requiredBy:          ["SOC2", "ISO27001", "GDPR"],
    subjectToGdprErasure: true,
    canBeAnonymized:     true,
    requiresLegalApproval: false,
    notes:               "Under GDPR, access logs with personal data may be subject to erasure. Anonymization is the preferred approach.",
  },
  {
    category:            "FINANCIAL_RECORD",
    description:         "Financial transactions, invoices, payment records, and reconciliation data.",
    minRetentionDays:    2555,  // 7 years
    maxRetentionDays:    3650,  // 10 years
    requiredBy:          ["SOC2", "ISO27001", "GDPR"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: true,
    notes:               "Financial records have statutory retention requirements. Legal approval required before any purge.",
  },
  {
    category:            "CUSTOMER_DATA",
    description:         "Customer PII, contact information, and CRM records.",
    minRetentionDays:    0,
    maxRetentionDays:    1095,  // 3 years after contract end
    requiredBy:          ["GDPR"],
    subjectToGdprErasure: true,
    canBeAnonymized:     true,
    requiresLegalApproval: false,
    notes:               "Customer data is subject to GDPR right-to-erasure. No minimum retention; must delete within 30 days of erasure request.",
  },
  {
    category:            "COMPLIANCE_EVIDENCE",
    description:         "Compliance evidence collected for control evaluations.",
    minRetentionDays:    365,
    maxRetentionDays:    2555,  // 7 years
    requiredBy:          ["SOC2", "ISO27001"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: false,
    notes:               "Compliance evidence must be retained for at least the audit period plus 1 year.",
  },
  {
    category:            "COMPLIANCE_FINDING",
    description:         "Compliance evaluation findings and violation records.",
    minRetentionDays:    365,
    maxRetentionDays:    2555,
    requiredBy:          ["SOC2", "ISO27001"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: false,
    notes:               "Findings are part of the audit trail — retain for at minimum 1 year.",
  },
  {
    category:            "SECRET_AUDIT",
    description:         "Secret access, creation, rotation, and revocation audit events.",
    minRetentionDays:    365,
    maxRetentionDays:    2555,
    requiredBy:          ["SOC2", "ISO27001", "HIPAA"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: false,
    notes:               "Secret audit logs never contain secret values — safe to retain without erasure concerns.",
  },
  {
    category:            "KMS_AUDIT",
    description:         "KMS key generation, usage, rotation, and retirement audit events.",
    minRetentionDays:    365,
    maxRetentionDays:    2555,
    requiredBy:          ["SOC2", "ISO27001"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: false,
    notes:               "KMS audit events never contain key material — safe to retain without erasure concerns.",
  },
  {
    category:            "MFA_AUDIT",
    description:         "MFA enrollment, verification attempts, and recovery code usage.",
    minRetentionDays:    365,
    maxRetentionDays:    1825,
    requiredBy:          ["SOC2", "ISO27001"],
    subjectToGdprErasure: true,
    canBeAnonymized:     true,
    requiresLegalApproval: false,
    notes:               "MFA audit events may contain userId — subject to GDPR. Anonymization supported.",
  },
  {
    category:            "ANOMALY_ALERT",
    description:         "Security anomaly alerts from the anomaly detection layer.",
    minRetentionDays:    365,
    maxRetentionDays:    1825,
    requiredBy:          ["SOC2", "ISO27001"],
    subjectToGdprErasure: false,
    canBeAnonymized:     true,
    requiresLegalApproval: false,
    notes:               "Anomaly alerts are part of the security incident record. Retain for minimum 1 year.",
  },
  {
    category:            "ANOMALY_SIGNAL",
    description:         "Individual detection signals from anomaly detectors.",
    minRetentionDays:    90,
    maxRetentionDays:    365,
    requiredBy:          ["SOC2"],
    subjectToGdprErasure: false,
    canBeAnonymized:     true,
    requiresLegalApproval: false,
    notes:               "Signals are high-volume. Retain for 90–365 days.",
  },
  {
    category:            "INCIDENT_RECORD",
    description:         "Security incident records, post-mortems, and remediation notes.",
    minRetentionDays:    1825,  // 5 years
    maxRetentionDays:    3650,  // 10 years
    requiredBy:          ["SOC2", "ISO27001", "HIPAA"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: true,
    notes:               "Incident records may be required as evidence in legal proceedings. Legal approval required before purge.",
  },
  {
    category:            "USER_CONSENT",
    description:         "GDPR consent records, cookie consents, and data processing agreements.",
    minRetentionDays:    1095,  // 3 years after consent withdrawal
    maxRetentionDays:    0,     // no upper limit for active consents
    requiredBy:          ["GDPR"],
    subjectToGdprErasure: false,  // consent records themselves cannot be erased (proof of compliance)
    canBeAnonymized:     false,
    requiresLegalApproval: false,
    notes:               "GDPR consent records must be retained to demonstrate lawful processing basis. Cannot be erased.",
  },
  {
    category:            "CONTRACT_DOCUMENT",
    description:         "Customer contracts, SLAs, and DPA (Data Processing Agreements).",
    minRetentionDays:    2555,  // 7 years
    maxRetentionDays:    3650,  // 10 years
    requiredBy:          ["SOC2", "GDPR"],
    subjectToGdprErasure: false,
    canBeAnonymized:     false,
    requiresLegalApproval: true,
    notes:               "Contract documents have statutory retention. Legal approval required before any purge.",
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getRetentionPolicy(category: RetentionCategory): RetentionPolicy | undefined {
  return RETENTION_POLICIES.find(p => p.category === category);
}

export function isRetentionCompliant(
  category:    RetentionCategory,
  ageInDays:   number,
): boolean {
  const policy = getRetentionPolicy(category);
  if (!policy) return false;
  if (ageInDays < policy.minRetentionDays) return false;
  if (policy.maxRetentionDays > 0 && ageInDays > policy.maxRetentionDays) return false;
  return true;
}

export function isGdprErasurePermitted(category: RetentionCategory): boolean {
  return getRetentionPolicy(category)?.subjectToGdprErasure ?? false;
}
