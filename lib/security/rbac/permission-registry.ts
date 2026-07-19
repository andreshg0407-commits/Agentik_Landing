/**
 * lib/security/rbac/permission-registry.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Foundation — Permission Registry
 *
 * Central catalog of all permissions in the Agentik platform.
 * Every action that requires authorization must be registered here.
 *
 * Permission naming convention: RESOURCE_ACTION
 * Actions: VIEW, CREATE, UPDATE, DELETE, EXPORT, APPROVE, EXECUTE, MANAGE, ADMIN
 *
 * No Prisma. No server-only. Pure domain data.
 */

import type { PermissionId, ResourceId } from "./rbac-types";

// ── Risk Level ────────────────────────────────────────────────────────────────

export type PermissionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Permission Action ─────────────────────────────────────────────────────────

export type PermissionAction =
  | "VIEW"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "APPROVE"
  | "EXECUTE"
  | "MANAGE"
  | "ADMIN"
  | "READ"
  | "WRITE";

// ── Permission Entry ──────────────────────────────────────────────────────────

export interface PermissionEntry {
  /** Stable, unique permission identifier. Format: RESOURCE_ACTION. */
  id:            PermissionId;
  /** Human-readable name. */
  name:          string;
  /** Description of what this permission grants. */
  description:   string;
  /** The protected resource this permission applies to. */
  resource:      ResourceId;
  /** The action this permission grants. */
  action:        PermissionAction;
  /** Risk level of granting this permission. */
  riskLevel:     PermissionRiskLevel;
  /** Whether every use of this permission must produce an audit event. */
  requiresAudit: boolean;
}

// ── Permission Registry ───────────────────────────────────────────────────────

export const PERMISSION_REGISTRY: ReadonlyArray<PermissionEntry> = [
  // ── Finance ────────────────────────────────────────────────────────────────
  {
    id:            "FINANCE_VIEW",
    name:          "Finance View",
    description:   "View financial data: transactions, reconciliation, cash flow, reports.",
    resource:      "FINANCE",
    action:        "VIEW",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "FINANCE_CREATE",
    name:          "Finance Create",
    description:   "Create financial records: manual entries, reconciliation sessions.",
    resource:      "FINANCE",
    action:        "CREATE",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "FINANCE_UPDATE",
    name:          "Finance Update",
    description:   "Update financial records: adjust entries, resolve reconciliation items.",
    resource:      "FINANCE",
    action:        "UPDATE",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "FINANCE_DELETE",
    name:          "Finance Delete",
    description:   "Delete or void financial records.",
    resource:      "FINANCE",
    action:        "DELETE",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },
  {
    id:            "FINANCE_EXPORT",
    name:          "Finance Export",
    description:   "Export financial data, reports, and reconciliation results.",
    resource:      "FINANCE",
    action:        "EXPORT",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "FINANCE_ADMIN",
    name:          "Finance Admin",
    description:   "Full administrative access to the finance module.",
    resource:      "FINANCE",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Commercial ─────────────────────────────────────────────────────────────
  {
    id:            "COMMERCIAL_VIEW",
    name:          "Commercial View",
    description:   "View commercial data: orders, customers, pipeline.",
    resource:      "COMMERCIAL",
    action:        "VIEW",
    riskLevel:     "LOW",
    requiresAudit: false,
  },
  {
    id:            "COMMERCIAL_CREATE",
    name:          "Commercial Create",
    description:   "Create commercial records: orders, customer entries.",
    resource:      "COMMERCIAL",
    action:        "CREATE",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "COMMERCIAL_UPDATE",
    name:          "Commercial Update",
    description:   "Update commercial records: edit orders, customer data.",
    resource:      "COMMERCIAL",
    action:        "UPDATE",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "COMMERCIAL_DELETE",
    name:          "Commercial Delete",
    description:   "Delete commercial records.",
    resource:      "COMMERCIAL",
    action:        "DELETE",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "COMMERCIAL_EXPORT",
    name:          "Commercial Export",
    description:   "Export commercial data and customer records.",
    resource:      "COMMERCIAL",
    action:        "EXPORT",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "COMMERCIAL_ADMIN",
    name:          "Commercial Admin",
    description:   "Full administrative access to the commercial module.",
    resource:      "COMMERCIAL",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Collections ────────────────────────────────────────────────────────────
  {
    id:            "COLLECTIONS_VIEW",
    name:          "Collections View",
    description:   "View collections portfolio: overdue accounts, payment status.",
    resource:      "COLLECTIONS",
    action:        "VIEW",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "COLLECTIONS_UPDATE",
    name:          "Collections Update",
    description:   "Update collections records: notes, status, actions.",
    resource:      "COLLECTIONS",
    action:        "UPDATE",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "COLLECTIONS_APPROVE",
    name:          "Collections Approve",
    description:   "Approve collections actions: payment plans, write-offs, escalations.",
    resource:      "COLLECTIONS",
    action:        "APPROVE",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "COLLECTIONS_ADMIN",
    name:          "Collections Admin",
    description:   "Full administrative access to the collections module.",
    resource:      "COLLECTIONS",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Marketing ──────────────────────────────────────────────────────────────
  {
    id:            "MARKETING_VIEW",
    name:          "Marketing View",
    description:   "View marketing studio: campaigns, content, analytics.",
    resource:      "MARKETING",
    action:        "VIEW",
    riskLevel:     "LOW",
    requiresAudit: false,
  },
  {
    id:            "MARKETING_CREATE",
    name:          "Marketing Create",
    description:   "Create marketing content: campaigns, assets, posts.",
    resource:      "MARKETING",
    action:        "CREATE",
    riskLevel:     "MEDIUM",
    requiresAudit: false,
  },
  {
    id:            "MARKETING_UPDATE",
    name:          "Marketing Update",
    description:   "Update marketing content and campaigns.",
    resource:      "MARKETING",
    action:        "UPDATE",
    riskLevel:     "MEDIUM",
    requiresAudit: false,
  },
  {
    id:            "MARKETING_ADMIN",
    name:          "Marketing Admin",
    description:   "Full administrative access to the marketing studio.",
    resource:      "MARKETING",
    action:        "ADMIN",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },

  // ── Copilot ────────────────────────────────────────────────────────────────
  {
    id:            "COPILOT_EXECUTE",
    name:          "Copilot Execute",
    description:   "Use the Copilot AI assistant: send messages, receive plans, trigger actions.",
    resource:      "COPILOT",
    action:        "EXECUTE",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "COPILOT_ADMIN",
    name:          "Copilot Admin",
    description:   "Administer Copilot: manage agents, configure behaviors.",
    resource:      "COPILOT",
    action:        "ADMIN",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  {
    id:            "MEMORY_READ",
    name:          "Memory Read",
    description:   "Read Copilot Memory: access strategic and operational business memory.",
    resource:      "MEMORY",
    action:        "READ",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "MEMORY_WRITE",
    name:          "Memory Write",
    description:   "Write to Copilot Memory: create and update business memory entries.",
    resource:      "MEMORY",
    action:        "WRITE",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "MEMORY_ADMIN",
    name:          "Memory Admin",
    description:   "Full administrative access to Copilot Memory.",
    resource:      "MEMORY",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Playbooks ──────────────────────────────────────────────────────────────
  {
    id:            "PLAYBOOK_VIEW",
    name:          "Playbook View",
    description:   "View playbooks: read operational procedures and business knowledge.",
    resource:      "PLAYBOOKS",
    action:        "VIEW",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "PLAYBOOK_MANAGE",
    name:          "Playbook Manage",
    description:   "Manage playbooks: create, update, and organize operational procedures.",
    resource:      "PLAYBOOKS",
    action:        "MANAGE",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "PLAYBOOK_ADMIN",
    name:          "Playbook Admin",
    description:   "Full administrative access to playbooks.",
    resource:      "PLAYBOOKS",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Executive Brain ────────────────────────────────────────────────────────
  {
    id:            "EXECUTIVE_VIEW",
    name:          "Executive View",
    description:   "View Executive Brain: access operational summaries, signals, and priorities.",
    resource:      "EXECUTIVE_BRAIN",
    action:        "VIEW",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "EXECUTIVE_ADMIN",
    name:          "Executive Admin",
    description:   "Administer Executive Brain: configure signals, priorities, and context.",
    resource:      "EXECUTIVE_BRAIN",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Autonomous Operations ──────────────────────────────────────────────────
  {
    id:            "AUTONOMOUS_EXECUTE",
    name:          "Autonomous Execute",
    description:   "Execute autonomous agent operations.",
    resource:      "AUTONOMOUS",
    action:        "EXECUTE",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },
  {
    id:            "AUTONOMOUS_APPROVE",
    name:          "Autonomous Approve",
    description:   "Approve autonomous agent actions that require human confirmation.",
    resource:      "AUTONOMOUS",
    action:        "APPROVE",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },
  {
    id:            "AUTONOMOUS_ADMIN",
    name:          "Autonomous Admin",
    description:   "Administer autonomous operations: agents, capabilities, approval policies.",
    resource:      "AUTONOMOUS",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Vault ──────────────────────────────────────────────────────────────────
  {
    id:            "VAULT_READ",
    name:          "Vault Read",
    description:   "Read vault secrets: resolve integration credentials.",
    resource:      "VAULT",
    action:        "READ",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },
  {
    id:            "VAULT_WRITE",
    name:          "Vault Write",
    description:   "Write vault secrets: create and update integration credentials.",
    resource:      "VAULT",
    action:        "WRITE",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },
  {
    id:            "VAULT_ADMIN",
    name:          "Vault Admin",
    description:   "Full vault administration: manage secrets, key rotation, lifecycle.",
    resource:      "VAULT",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Audit ──────────────────────────────────────────────────────────────────
  {
    id:            "AUDIT_VIEW",
    name:          "Audit View",
    description:   "View audit logs: access security and operational audit events.",
    resource:      "AUDIT",
    action:        "VIEW",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "AUDIT_EXPORT",
    name:          "Audit Export",
    description:   "Export audit logs for compliance and reporting.",
    resource:      "AUDIT",
    action:        "EXPORT",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },
  {
    id:            "AUDIT_ADMIN",
    name:          "Audit Admin",
    description:   "Administer audit configuration and retention policies.",
    resource:      "AUDIT",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Security ───────────────────────────────────────────────────────────────
  {
    id:            "SECURITY_VIEW",
    name:          "Security View",
    description:   "View security configuration: policies, inventory, registry.",
    resource:      "SECURITY",
    action:        "VIEW",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "SECURITY_ADMIN",
    name:          "Security Admin",
    description:   "Full security administration: policies, threat models, inventory.",
    resource:      "SECURITY",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Encryption ─────────────────────────────────────────────────────────────
  {
    id:            "ENCRYPTION_VIEW",
    name:          "Encryption View",
    description:   "View encryption configuration: key registry, policies, health.",
    resource:      "ENCRYPTION",
    action:        "VIEW",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "ENCRYPTION_ADMIN",
    name:          "Encryption Admin",
    description:   "Administer encryption layer: key management, rotation, policies.",
    resource:      "ENCRYPTION",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  {
    id:            "SETTINGS_VIEW",
    name:          "Settings View",
    description:   "View tenant settings and configuration.",
    resource:      "SETTINGS",
    action:        "VIEW",
    riskLevel:     "LOW",
    requiresAudit: false,
  },
  {
    id:            "SETTINGS_UPDATE",
    name:          "Settings Update",
    description:   "Update tenant settings: preferences, branding, notifications.",
    resource:      "SETTINGS",
    action:        "UPDATE",
    riskLevel:     "MEDIUM",
    requiresAudit: true,
  },
  {
    id:            "SETTINGS_ADMIN",
    name:          "Settings Admin",
    description:   "Full settings administration including billing and plan management.",
    resource:      "SETTINGS",
    action:        "ADMIN",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },

  // ── Integrations ───────────────────────────────────────────────────────────
  {
    id:            "INTEGRATIONS_VIEW",
    name:          "Integrations View",
    description:   "View integration status and configuration.",
    resource:      "INTEGRATIONS",
    action:        "VIEW",
    riskLevel:     "MEDIUM",
    requiresAudit: false,
  },
  {
    id:            "INTEGRATIONS_MANAGE",
    name:          "Integrations Manage",
    description:   "Manage integrations: connect, disconnect, configure.",
    resource:      "INTEGRATIONS",
    action:        "MANAGE",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "INTEGRATIONS_ADMIN",
    name:          "Integrations Admin",
    description:   "Full integrations administration.",
    resource:      "INTEGRATIONS",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── Tenant Admin ───────────────────────────────────────────────────────────
  {
    id:            "TENANT_ADMIN",
    name:          "Tenant Admin",
    description:   "Full tenant administration: user management, billing, org settings.",
    resource:      "TENANT_ADMIN",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },

  // ── RBAC ───────────────────────────────────────────────────────────────────
  {
    id:            "RBAC_VIEW",
    name:          "RBAC View",
    description:   "View RBAC configuration: roles, permissions, assignments.",
    resource:      "SECURITY",
    action:        "VIEW",
    riskLevel:     "HIGH",
    requiresAudit: true,
  },
  {
    id:            "RBAC_ADMIN",
    name:          "RBAC Admin",
    description:   "Full RBAC administration: manage roles, permissions, assignments.",
    resource:      "SECURITY",
    action:        "ADMIN",
    riskLevel:     "CRITICAL",
    requiresAudit: true,
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Find a permission entry by its id. Returns undefined if not found. */
export function getPermissionEntry(id: PermissionId): PermissionEntry | undefined {
  return PERMISSION_REGISTRY.find(p => p.id === id);
}

/** Get all permissions for a given resource. */
export function getPermissionsByResource(resource: ResourceId): PermissionEntry[] {
  return PERMISSION_REGISTRY.filter(p => p.resource === resource);
}

/** Get all permissions by risk level. */
export function getPermissionsByRisk(riskLevel: PermissionRiskLevel): PermissionEntry[] {
  return PERMISSION_REGISTRY.filter(p => p.riskLevel === riskLevel);
}

/** Get all permissions that require audit. */
export function getAuditRequiredPermissions(): PermissionEntry[] {
  return PERMISSION_REGISTRY.filter(p => p.requiresAudit);
}

/** Get all permission IDs. */
export function getAllPermissionIds(): PermissionId[] {
  return PERMISSION_REGISTRY.map(p => p.id);
}

/** Check if a permission ID is registered. */
export function isRegisteredPermission(id: PermissionId): boolean {
  return PERMISSION_REGISTRY.some(p => p.id === id);
}

/** Get permission count summary. */
export function getPermissionSummary(): {
  total:    number;
  critical: number;
  high:     number;
  medium:   number;
  low:      number;
  requiresAudit: number;
} {
  return {
    total:         PERMISSION_REGISTRY.length,
    critical:      PERMISSION_REGISTRY.filter(p => p.riskLevel === "CRITICAL").length,
    high:          PERMISSION_REGISTRY.filter(p => p.riskLevel === "HIGH").length,
    medium:        PERMISSION_REGISTRY.filter(p => p.riskLevel === "MEDIUM").length,
    low:           PERMISSION_REGISTRY.filter(p => p.riskLevel === "LOW").length,
    requiresAudit: PERMISSION_REGISTRY.filter(p => p.requiresAudit).length,
  };
}
