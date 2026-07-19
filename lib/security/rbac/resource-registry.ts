/**
 * lib/security/rbac/resource-registry.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Foundation — Resource Registry
 *
 * Registers all protected resource domains in the Agentik OS.
 * Each resource entry defines:
 *   - id: ResourceId key
 *   - name: human-readable display name
 *   - description: what the resource controls
 *   - sensitivityLevel: how sensitive the resource domain is
 *   - requiresAudit: whether all access must be audit-logged
 *   - encryptionRequired: whether stored data must be encrypted
 *
 * No Prisma. No server-only. No crypto. Pure domain registry.
 */

import type { ResourceId } from "./rbac-types";

// ── Sensitivity Levels ────────────────────────────────────────────────────────

export type ResourceSensitivity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Resource Entry ────────────────────────────────────────────────────────────

export interface ResourceEntry {
  /** The ResourceId identifier. */
  id:                  ResourceId;
  /** Human-readable name for the resource domain. */
  name:                string;
  /** What data or operations this resource domain controls. */
  description:         string;
  /** Sensitivity level of the resource domain. */
  sensitivityLevel:    ResourceSensitivity;
  /** Whether all access decisions must be audit-logged. */
  requiresAudit:       boolean;
  /** Whether stored data in this domain must be encrypted. */
  encryptionRequired:  boolean;
  /** Module path(s) this resource maps to. */
  modulePaths?:        string[];
}

// ── Resource Registry ─────────────────────────────────────────────────────────

export const RESOURCE_REGISTRY: ReadonlyArray<ResourceEntry> = [
  {
    id:                 "FINANCE",
    name:               "Finance",
    description:        "Financial records, reconciliation, treasury, closings, and planning data.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: true,
    modulePaths:        ["/finanzas"],
  },
  {
    id:                 "COMMERCIAL",
    name:               "Commercial",
    description:        "Commercial pipeline, customer interactions, and sales data.",
    sensitivityLevel:   "HIGH",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        ["/comercial", "/pipeline"],
  },
  {
    id:                 "COLLECTIONS",
    name:               "Collections",
    description:        "Accounts receivable, collection queues, and payment tracking.",
    sensitivityLevel:   "HIGH",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        ["/finanzas/torre-control/cobros-hoy"],
  },
  {
    id:                 "MARKETING",
    name:               "Marketing Studio",
    description:        "Marketing campaigns, photo studio, social publishing, and creative assets.",
    sensitivityLevel:   "MEDIUM",
    requiresAudit:      false,
    encryptionRequired: false,
    modulePaths:        ["/agentik/marketing-studio"],
  },
  {
    id:                 "COPILOT",
    name:               "Copilot",
    description:        "AI copilot execution, task suggestions, and agent-assisted operations.",
    sensitivityLevel:   "HIGH",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        ["/copilot"],
  },
  {
    id:                 "MEMORY",
    name:               "Agent Memory",
    description:        "Persistent agent memory, strategic context, and learning records.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: true,
    modulePaths:        [],
  },
  {
    id:                 "PLAYBOOKS",
    name:               "Playbooks",
    description:        "Operational playbooks, standard operating procedures, and automation scripts.",
    sensitivityLevel:   "HIGH",
    requiresAudit:      true,
    encryptionRequired: true,
    modulePaths:        [],
  },
  {
    id:                 "EXECUTIVE_BRAIN",
    name:               "Executive Brain",
    description:        "Executive intelligence context, financial summaries, and strategic signals.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: true,
    modulePaths:        ["/executive"],
  },
  {
    id:                 "AUTONOMOUS",
    name:               "Autonomous Operations",
    description:        "Autonomous agent execution, supervised dispatch, and approval workflows.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        ["/aprobaciones", "/ejecuciones"],
  },
  {
    id:                 "VAULT",
    name:               "Credential Vault",
    description:        "Encrypted integration credentials, API keys, and OAuth tokens.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: true,
    modulePaths:        [],
  },
  {
    id:                 "AUDIT",
    name:               "Audit Log",
    description:        "Security audit trail, access logs, and compliance records.",
    sensitivityLevel:   "HIGH",
    requiresAudit:      false, // auditing the audit log creates infinite loops
    encryptionRequired: false,
    modulePaths:        [],
  },
  {
    id:                 "SECURITY",
    name:               "Security Administration",
    description:        "Security policies, RBAC configuration, encryption settings, and threat management.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        [],
  },
  {
    id:                 "ENCRYPTION",
    name:               "Encryption Layer",
    description:        "Encryption key references, classification policies, and cryptographic operations.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        [],
  },
  {
    id:                 "SETTINGS",
    name:               "Settings",
    description:        "Organization settings, preferences, and configuration.",
    sensitivityLevel:   "MEDIUM",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        ["/ajustes"],
  },
  {
    id:                 "INTEGRATIONS",
    name:               "Integrations",
    description:        "Third-party connector configuration, OAuth flows, and webhook management.",
    sensitivityLevel:   "HIGH",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        ["/integrations"],
  },
  {
    id:                 "TENANT_ADMIN",
    name:               "Tenant Administration",
    description:        "Tenant lifecycle management, billing, member provisioning, and org-level policies.",
    sensitivityLevel:   "CRITICAL",
    requiresAudit:      true,
    encryptionRequired: false,
    modulePaths:        [],
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Get a resource entry by its ResourceId. Returns undefined if not found. */
export function getResourceEntry(id: ResourceId): ResourceEntry | undefined {
  return RESOURCE_REGISTRY.find(r => r.id === id);
}

/** Get all resources at or above a given sensitivity level. */
export function getResourcesBySensitivity(
  level: ResourceSensitivity,
): ResourceEntry[] {
  const rank: Record<ResourceSensitivity, number> = {
    LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
  };
  return RESOURCE_REGISTRY.filter(r => rank[r.sensitivityLevel] >= rank[level]);
}

/** Get all resources that require encryption. */
export function getEncryptionRequiredResources(): ResourceEntry[] {
  return RESOURCE_REGISTRY.filter(r => r.encryptionRequired);
}

/** Get all resources that require audit logging. */
export function getAuditRequiredResources(): ResourceEntry[] {
  return RESOURCE_REGISTRY.filter(r => r.requiresAudit);
}

/** Get all resources whose sensitivityLevel is CRITICAL. */
export function getCriticalResources(): ResourceEntry[] {
  return RESOURCE_REGISTRY.filter(r => r.sensitivityLevel === "CRITICAL");
}

/** Check whether a ResourceId is registered. */
export function isRegisteredResource(id: string): boolean {
  return RESOURCE_REGISTRY.some(r => r.id === id);
}

/** Get all registered ResourceIds. */
export function getAllResourceIds(): ResourceId[] {
  return RESOURCE_REGISTRY.map(r => r.id);
}

/** Get a summary of the resource registry. */
export function getResourceSummary(): {
  total:              number;
  critical:           number;
  high:               number;
  medium:             number;
  low:                number;
  requiresAudit:      number;
  requiresEncryption: number;
} {
  return {
    total:              RESOURCE_REGISTRY.length,
    critical:           RESOURCE_REGISTRY.filter(r => r.sensitivityLevel === "CRITICAL").length,
    high:               RESOURCE_REGISTRY.filter(r => r.sensitivityLevel === "HIGH").length,
    medium:             RESOURCE_REGISTRY.filter(r => r.sensitivityLevel === "MEDIUM").length,
    low:                RESOURCE_REGISTRY.filter(r => r.sensitivityLevel === "LOW").length,
    requiresAudit:      RESOURCE_REGISTRY.filter(r => r.requiresAudit).length,
    requiresEncryption: RESOURCE_REGISTRY.filter(r => r.encryptionRequired).length,
  };
}
