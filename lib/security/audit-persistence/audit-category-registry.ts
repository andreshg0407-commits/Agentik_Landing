/**
 * lib/security/audit-persistence/audit-category-registry.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Category Registry
 *
 * Canonical catalog of all audit categories used across the platform.
 * Each entry documents the category's purpose, risk level, and
 * which system areas generate events in it.
 *
 * No Prisma. No server-only. Pure domain data.
 */

import type { PersistentAuditCategory, PersistentAuditSeverity } from "./audit-event-types";

// ── Category entry ────────────────────────────────────────────────────────────

export interface AuditCategoryEntry {
  /** Canonical category key — matches PersistentAuditCategory. */
  id:              PersistentAuditCategory;
  /** Human-readable display name. */
  name:            string;
  /** Description of what events fall under this category. */
  description:     string;
  /** Default severity for events in this category. */
  defaultSeverity: PersistentAuditSeverity;
  /** Systems or modules that generate events in this category. */
  sources:         string[];
  /** Whether this category requires CRITICAL event alerting. */
  alertOnCritical: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const AUDIT_CATEGORY_REGISTRY: ReadonlyArray<AuditCategoryEntry> = [
  {
    id:              "AUTHENTICATION",
    name:            "Authentication",
    description:     "Identity verification events — login attempts, token validation, session management.",
    defaultSeverity: "MEDIUM",
    sources:         ["auth", "middleware", "api-routes"],
    alertOnCritical: true,
  },
  {
    id:              "AUTHORIZATION",
    name:            "Authorization",
    description:     "Access control decisions — grants, denials, role checks, permission enforcement.",
    defaultSeverity: "MEDIUM",
    sources:         ["access-context", "security-policy-engine", "middleware"],
    alertOnCritical: true,
  },
  {
    id:              "DATA_ACCESS",
    name:            "Data Access",
    description:     "Reads and queries on sensitive operational data — memory, playbooks, financial records.",
    defaultSeverity: "LOW",
    sources:         ["copilot", "executive-brain", "finance", "operational-map"],
    alertOnCritical: false,
  },
  {
    id:              "DATA_EXPORT",
    name:            "Data Export",
    description:     "Data leaving the system boundary — exports, downloads, integrations sending data out.",
    defaultSeverity: "HIGH",
    sources:         ["integrations", "export-api", "reports"],
    alertOnCritical: true,
  },
  {
    id:              "SECRET_ACCESS",
    name:            "Secret Access",
    description:     "Access to secrets, tokens, certificates, and credentials via the Vault or legacy providers.",
    defaultSeverity: "HIGH",
    sources:         ["vault", "secret-providers", "integration-runtime"],
    alertOnCritical: true,
  },
  {
    id:              "TENANT_BOUNDARY",
    name:            "Tenant Boundary",
    description:     "Cross-tenant boundary events — attempted or actual violations of tenant isolation.",
    defaultSeverity: "CRITICAL",
    sources:         ["tenant-boundary", "security-evaluator", "middleware"],
    alertOnCritical: true,
  },
  {
    id:              "POLICY_VIOLATION",
    name:            "Policy Violation",
    description:     "Events where a security policy was violated — rate limits, data classification breaches, prohibited patterns.",
    defaultSeverity: "HIGH",
    sources:         ["security-policy-engine", "security-evaluator"],
    alertOnCritical: true,
  },
  {
    id:              "INTEGRATION",
    name:            "Integration",
    description:     "External service interactions — API calls to Shopify, Meta, DIAN, ERP, WhatsApp, TikTok.",
    defaultSeverity: "LOW",
    sources:         ["integration-runtime", "integration-gateway", "webhook-dispatcher"],
    alertOnCritical: false,
  },
  {
    id:              "SYSTEM",
    name:            "System",
    description:     "Internal platform security events — startup, shutdown, health checks, infrastructure events.",
    defaultSeverity: "LOW",
    sources:         ["runtime", "cron", "system"],
    alertOnCritical: false,
  },
  {
    id:              "VAULT",
    name:            "Vault",
    description:     "Vault secret lifecycle events — create, read, update, disable, revoke, delete, migrate.",
    defaultSeverity: "HIGH",
    sources:         ["vault-service", "vault-first-resolver", "prisma-vault-repository"],
    alertOnCritical: true,
  },
  {
    id:              "MEMORY",
    name:            "Memory",
    description:     "Copilot memory operations — reads, writes, searches, pruning.",
    defaultSeverity: "LOW",
    sources:         ["copilot-memory", "memory-audit"],
    alertOnCritical: false,
  },
  {
    id:              "PLAYBOOK",
    name:            "Playbook",
    description:     "Operational playbook access — reads, updates, executions.",
    defaultSeverity: "LOW",
    sources:         ["playbook-audit", "copilot"],
    alertOnCritical: false,
  },
  {
    id:              "EXECUTIVE_BRAIN",
    name:            "Executive Brain",
    description:     "Executive intelligence operations — signal collection, ranking, insight generation, context building.",
    defaultSeverity: "LOW",
    sources:         ["executive-brain", "executive-audit"],
    alertOnCritical: false,
  },
  {
    id:              "COPILOT",
    name:            "Copilot",
    description:     "Copilot AI operations — intent resolution, agent selection, plan creation, response generation.",
    defaultSeverity: "LOW",
    sources:         ["copilot-runtime", "copilot-audit"],
    alertOnCritical: false,
  },
  {
    id:              "AUTONOMOUS_OPERATIONS",
    name:            "Autonomous Operations",
    description:     "Agent-initiated autonomous actions — tasks created, approvals triggered, workflows started.",
    defaultSeverity: "HIGH",
    sources:         ["agent-runtime", "autonomous-operations", "agent-action-dispatcher"],
    alertOnCritical: true,
  },
] as const;

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getCategoryEntry(id: PersistentAuditCategory): AuditCategoryEntry | undefined {
  return AUDIT_CATEGORY_REGISTRY.find(c => c.id === id);
}

export function getCriticalAlertCategories(): AuditCategoryEntry[] {
  return AUDIT_CATEGORY_REGISTRY.filter(c => c.alertOnCritical);
}

export function getCategoriesBySeverity(severity: PersistentAuditSeverity): AuditCategoryEntry[] {
  return AUDIT_CATEGORY_REGISTRY.filter(c => c.defaultSeverity === severity);
}

export function getAllCategoryIds(): PersistentAuditCategory[] {
  return AUDIT_CATEGORY_REGISTRY.map(c => c.id);
}
