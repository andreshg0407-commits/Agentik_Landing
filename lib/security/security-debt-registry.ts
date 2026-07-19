/**
 * lib/security/security-debt-registry.ts
 *
 * Agentik — Security Foundation — Security Debt Registry
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Explicit documentation of known security gaps and planned future sprints.
 * This is NOT a TODO list — it is a formal debt register that tracks
 * what is NOT yet implemented and why that is an accepted risk.
 *
 * Every debt item must:
 *   1. Have a unique sprint ID
 *   2. Describe the gap
 *   3. Describe the impact if not addressed
 *   4. Have an estimated priority
 *
 * No implementation here — only documentation and domain types.
 */

// ── Debt Item ─────────────────────────────────────────────────────────────────

export type DebtPriority = "P0_CRITICAL" | "P1_HIGH" | "P2_MEDIUM" | "P3_LOW";

export type DebtStatus = "PLANNED" | "IN_PROGRESS" | "BLOCKED" | "DEFERRED";

/**
 * SecurityDebtItem — a formally acknowledged security gap.
 */
export interface SecurityDebtItem {
  /** Unique sprint/initiative ID. */
  id:          string;
  /** Human-readable name for this initiative. */
  name:        string;
  /** What security capability this sprint will deliver. */
  description: string;
  /** Business impact if this debt is not addressed. */
  impact:      string;
  /** Which platform components are affected. */
  affects:     string[];
  /** Planning priority. */
  priority:    DebtPriority;
  /** Current status. */
  status:      DebtStatus;
  /** Known prerequisites that must be completed first. */
  dependsOn:   string[];
}

// ── Debt Registry ─────────────────────────────────────────────────────────────

/**
 * SECURITY_DEBT_REGISTRY — the canonical catalog of planned security initiatives.
 *
 * Ordered by priority (P0 first).
 */
export const SECURITY_DEBT_REGISTRY: ReadonlyArray<SecurityDebtItem> = [
  // ── P0 Critical ────────────────────────────────────────────────────────────

  {
    id:          "AGENTIK-SECURITY-VAULT-01",
    name:        "Agentik Secrets Vault",
    description: "Implement a production-grade secrets management system. Encrypt all secrets at rest using envelope encryption. Replace plaintext DB storage of tokens and certificates. Provide SecretRef abstraction so application code never handles raw secrets.",
    impact:      "Without this, API tokens, OAuth tokens, DIAN certificates, and banking credentials are stored unencrypted in the database. A single DB breach exposes all tenant secrets.",
    affects:     ["AI_LAYER", "WHATSAPP", "DIAN", "ERP_INTEGRATIONS", "AGENT_RUNTIME"],
    priority:    "P0_CRITICAL",
    status:      "PLANNED",
    dependsOn:   ["AGENTIK-SECURITY-FOUNDATION-01"],
  },

  {
    id:          "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01",
    name:        "Security Audit Log Persistence",
    description: "Persist SecurityEvents to a durable store (DB or dedicated audit sink). The current in-memory SecurityAuditLog loses data on process restart. Implement append-only audit tables with tenant isolation.",
    impact:      "Without persistent audit logs, security incidents cannot be investigated retroactively. Compliance requirements (SOC2, ISO 27001) cannot be met.",
    affects:     ["MEMORY_ENGINE", "AI_BILLING", "AI_LAYER", "WHATSAPP", "DIAN"],
    priority:    "P0_CRITICAL",
    status:      "PLANNED",
    dependsOn:   ["AGENTIK-SECURITY-FOUNDATION-01"],
  },

  // ── P1 High ────────────────────────────────────────────────────────────────

  {
    id:          "AGENTIK-SECURITY-RBAC-01",
    name:        "Role-Based Access Control",
    description: "Implement fine-grained RBAC across all Agentik modules. Define roles (ORG_ADMIN, MODULE_USER, AGENT_OPERATOR, FINANCE_READER, etc.) and enforce them at the API layer. Integrate with the SecurityEvaluator.",
    impact:      "Without RBAC, any authenticated user within a tenant can access all data. Finance data, executive insights, and operational memory are accessible to all users equally.",
    affects:     ["MEMORY_ENGINE", "PLAYBOOKS", "EXECUTIVE_BRAIN", "AGENT_RUNTIME", "AUTONOMOUS_OPERATIONS"],
    priority:    "P1_HIGH",
    status:      "PLANNED",
    dependsOn:   ["AGENTIK-SECURITY-FOUNDATION-01", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"],
  },

  {
    id:          "AGENTIK-SECURITY-ENCRYPTION-01",
    name:        "Encryption at Rest",
    description: "Encrypt CONFIDENTIAL and RESTRICTED data at rest. Implement field-level encryption for financial records, customer PII, memory entries, and playbooks. Use per-tenant encryption keys.",
    impact:      "Without encryption at rest, a DB breach exposes all tenant data in plaintext. Financial records, customer data, and business intelligence are fully readable.",
    affects:     ["MEMORY_ENGINE", "PLAYBOOKS", "ERP_INTEGRATIONS", "CUSTOMER_RECORD", "EMPLOYEE_RECORD"],
    priority:    "P1_HIGH",
    status:      "PLANNED",
    dependsOn:   ["AGENTIK-SECURITY-VAULT-01"],
  },

  // ── P2 Medium ──────────────────────────────────────────────────────────────

  {
    id:          "AGENTIK-SECURITY-ZERO-TRUST-01",
    name:        "Zero Trust Architecture",
    description: "Implement Zero Trust principles across the platform. Every request is verified regardless of network origin. Service-to-service authentication. Mutual TLS for internal services. Least-privilege API tokens.",
    impact:      "Without Zero Trust, internal services trust each other implicitly. A compromised internal service has unlimited lateral access.",
    affects:     ["AGENT_RUNTIME", "AUTONOMOUS_OPERATIONS", "ERP_INTEGRATIONS", "AI_LAYER"],
    priority:    "P2_MEDIUM",
    status:      "PLANNED",
    dependsOn:   ["AGENTIK-SECURITY-RBAC-01", "AGENTIK-SECURITY-VAULT-01"],
  },

  {
    id:          "AGENTIK-SECURITY-SECRET-ROTATION-01",
    name:        "Secret Rotation Automation",
    description: "Implement automatic rotation for API tokens, OAuth tokens, and certificates. Alert on expiring secrets. Provide rotation workflows without downtime.",
    impact:      "Without rotation, compromised secrets remain valid indefinitely. Expired DIAN certificates block electronic invoicing with no automated recovery.",
    affects:     ["DIAN", "WHATSAPP", "AI_LAYER", "ERP_INTEGRATIONS"],
    priority:    "P2_MEDIUM",
    status:      "PLANNED",
    dependsOn:   ["AGENTIK-SECURITY-VAULT-01"],
  },

  // ── P3 Low ─────────────────────────────────────────────────────────────────

  {
    id:          "AGENTIK-SECURITY-COMPLIANCE-01",
    name:        "Compliance Framework",
    description: "Build compliance reporting for SOC2 Type II, ISO 27001, and Colombian data protection regulations (Ley 1581). Map security controls to compliance requirements. Generate compliance evidence packages.",
    impact:      "Without formal compliance, Agentik cannot serve regulated industries (finance, healthcare) or pass enterprise security audits.",
    affects:     ["ALL"],
    priority:    "P3_LOW",
    status:      "PLANNED",
    dependsOn:   [
      "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01",
      "AGENTIK-SECURITY-RBAC-01",
      "AGENTIK-SECURITY-ENCRYPTION-01",
    ],
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Find a debt item by its sprint ID. */
export function getDebtItem(id: string): SecurityDebtItem | undefined {
  return SECURITY_DEBT_REGISTRY.find(d => d.id === id);
}

/** Find all debt items with the given priority. */
export function getDebtByPriority(priority: DebtPriority): SecurityDebtItem[] {
  return SECURITY_DEBT_REGISTRY.filter(d => d.priority === priority);
}

/** Find all debt items that affect a given surface. */
export function getDebtBySurface(surfaceId: string): SecurityDebtItem[] {
  return SECURITY_DEBT_REGISTRY.filter(d =>
    d.affects.includes(surfaceId) || d.affects.includes("ALL"),
  );
}
