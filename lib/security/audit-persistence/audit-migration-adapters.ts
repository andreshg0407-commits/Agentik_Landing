/**
 * lib/security/audit-persistence/audit-migration-adapters.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Migration Adapters
 *
 * Adapts existing in-memory audit logs to the persistent audit layer.
 * Zero breaking changes — existing log classes continue to work unchanged.
 * This module provides the bridge path from each audit source to persistence.
 *
 * Sources adapted:
 *   SecurityAuditLog     → persistent via PersistentSecurityAuditAdapter
 *   VaultServiceAuditLog → persistent via PersistentVaultAuditAdapter
 *   ExecutiveAuditLog    → persistent via PersistentExecutiveAuditAdapter
 *   CopilotAuditLog      → persistent via PersistentCopilotAuditAdapter
 *
 * No Prisma. No server-only (adapters themselves are pure).
 * Actual persistence calls happen inside each adapter's _persist() method
 * via lazy import of persistent-audit-service.
 */

// Re-export all adapters for convenience
export {
  PersistentSecurityAuditAdapter,
  persistentSecurityAuditAdapter,
} from "@/lib/security/security-audit";

export {
  PersistentVaultAuditAdapter,
  persistentVaultAuditAdapter,
} from "@/lib/security/vault/vault-service-audit";

export {
  PersistentExecutiveAuditAdapter,
  persistentExecutiveAuditAdapter,
} from "@/lib/copilot/executive-brain/executive-audit";

export {
  PersistentCopilotAuditAdapter,
  persistentCopilotAuditAdapter,
  globalCopilotAuditLog,
} from "@/lib/copilot/copilot-audit";

// ── Migration status ──────────────────────────────────────────────────────────

export type AuditSourceStatus = "MEMORY_ONLY" | "MEMORY_AND_PERSISTENT" | "PERSISTENT_ONLY";

export interface AuditSourceMigrationEntry {
  id:          string;
  name:        string;
  source:      string;
  status:      AuditSourceStatus;
  adapterClass: string;
  notes:       string;
}

/**
 * AUDIT_SOURCE_MIGRATION_STATUS — tracks the migration state of each audit source.
 * Update entries here as migration progresses.
 */
export const AUDIT_SOURCE_MIGRATION_STATUS: ReadonlyArray<AuditSourceMigrationEntry> = [
  {
    id:           "security_audit_log",
    name:         "Security Foundation Audit",
    source:       "lib/security/security-audit.ts",
    status:       "MEMORY_AND_PERSISTENT",
    adapterClass: "PersistentSecurityAuditAdapter",
    notes:        "persistentSecurityAuditAdapter wraps globalSecurityAuditLog. Fire-and-forget persistence.",
  },
  {
    id:           "vault_service_audit_log",
    name:         "Vault Service Audit",
    source:       "lib/security/vault/vault-service-audit.ts",
    status:       "MEMORY_AND_PERSISTENT",
    adapterClass: "PersistentVaultAuditAdapter",
    notes:        "persistentVaultAuditAdapter wraps globalVaultServiceAuditLog. Persists all 10 vault event types.",
  },
  {
    id:           "executive_audit_log",
    name:         "Executive Brain Audit",
    source:       "lib/copilot/executive-brain/executive-audit.ts",
    status:       "MEMORY_AND_PERSISTENT",
    adapterClass: "PersistentExecutiveAuditAdapter",
    notes:        "persistentExecutiveAuditAdapter wraps globalExecutiveAuditLog. Persists 4 signal/insight event types.",
  },
  {
    id:           "copilot_audit_log",
    name:         "Copilot Audit",
    source:       "lib/copilot/copilot-audit.ts",
    status:       "MEMORY_AND_PERSISTENT",
    adapterClass: "PersistentCopilotAuditAdapter",
    notes:        "persistentCopilotAuditAdapter wraps globalCopilotAuditLog. pushWithOrg() required for orgSlug.",
  },
  {
    id:           "vault_audit_log",
    name:         "Legacy Vault Audit (AGENTIK-SECURE-VAULT-01)",
    source:       "lib/security/vault/vault-audit.ts",
    status:       "MEMORY_ONLY",
    adapterClass: "none",
    notes:        "Legacy vault audit (logVaultAccess) writes to stderr only. Migration deferred to AGENTIK-SECURITY-MIGRATION-02.",
  },
] as const;

/**
 * Get migration status for a specific audit source.
 */
export function getAuditSourceStatus(id: string): AuditSourceMigrationEntry | undefined {
  return AUDIT_SOURCE_MIGRATION_STATUS.find(s => s.id === id);
}

/**
 * Get all sources that are fully migrated to persistent.
 */
export function getMigratedAuditSources(): AuditSourceMigrationEntry[] {
  return AUDIT_SOURCE_MIGRATION_STATUS.filter(
    s => s.status === "MEMORY_AND_PERSISTENT" || s.status === "PERSISTENT_ONLY",
  );
}

/**
 * Get all sources that are still memory-only.
 */
export function getMemoryOnlyAuditSources(): AuditSourceMigrationEntry[] {
  return AUDIT_SOURCE_MIGRATION_STATUS.filter(s => s.status === "MEMORY_ONLY");
}
