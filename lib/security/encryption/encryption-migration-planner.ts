/**
 * lib/security/encryption/encryption-migration-planner.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Migration Planner
 *
 * Inventories all candidate assets for encryption migration.
 * Does NOT execute migrations.
 * Does NOT read or write data.
 * Defines migration state for planning and reporting purposes.
 *
 * States:
 *   NOT_STARTED — No adapter built, migration not planned.
 *   READY       — Adapter built, migration can begin.
 *   MIGRATED    — Data has been encrypted in production.
 *   VERIFIED    — Migration verified with health checks and round-trip tests.
 *
 * No Prisma. No server-only. Pure domain data.
 */

// ── Migration State ───────────────────────────────────────────────────────────

export type MigrationState = "NOT_STARTED" | "READY" | "MIGRATED" | "VERIFIED";

// ── Migration Candidate ───────────────────────────────────────────────────────

/**
 * EncryptionMigrationCandidate — tracks the encryption migration state
 * for one asset type.
 */
export interface EncryptionMigrationCandidate {
  /** Stable asset type identifier (matches ENCRYPTION_REGISTRY ids). */
  id:              string;
  /** Human-readable name. */
  name:            string;
  /** Brief description of what data will be migrated. */
  scope:           string;
  /** Current migration state. */
  state:           MigrationState;
  /** The adapter path (null if adapter not yet built). */
  adapterPath:     string | null;
  /** Estimated number of records to migrate (null if unknown). */
  estimatedRecords: number | null;
  /**
   * Target sprint for migration execution.
   * null = no sprint assigned yet.
   */
  targetSprint:    string | null;
  /** Notes on blockers, dependencies, or migration strategy. */
  notes:           string;
}

// ── Migration Plan ────────────────────────────────────────────────────────────

/**
 * ENCRYPTION_MIGRATION_PLAN — the canonical plan for all asset migrations.
 * Updated as migration progresses.
 */
export const ENCRYPTION_MIGRATION_PLAN: ReadonlyArray<EncryptionMigrationCandidate> = [
  {
    id:               "COPILOT_MEMORY",
    name:             "Copilot Memory",
    scope:            "MemoryEntry.content and MemoryEntry.summary fields for STRATEGIC and LEARNING types.",
    state:            "READY",
    adapterPath:      "lib/copilot/memory/security/memory-encryption-adapter.ts",
    estimatedRecords: null,
    targetSprint:     "AGENTIK-SECURITY-ENCRYPTION-02",
    notes:            "Adapter built. EncryptionService integrated. Awaiting data migration sprint.",
  },
  {
    id:               "PLAYBOOK",
    name:             "Playbooks",
    scope:            "PlaybookEntry.content, .steps, .notes for FINANCE, EXECUTIVE, OPERATIONS, COLLECTIONS categories.",
    state:            "READY",
    adapterPath:      "lib/copilot/playbooks/security/playbook-encryption-adapter.ts",
    estimatedRecords: null,
    targetSprint:     "AGENTIK-SECURITY-ENCRYPTION-02",
    notes:            "Adapter built. EncryptionService integrated. Awaiting data migration sprint.",
  },
  {
    id:               "EXECUTIVE_CONTEXT",
    name:             "Executive Context",
    scope:            "ExecutiveContextSnapshot fields: contextSnapshot, financialSummary, prioritySummary, signalContext.",
    state:            "READY",
    adapterPath:      "lib/copilot/executive-brain/security/executive-encryption-adapter.ts",
    estimatedRecords: null,
    targetSprint:     "AGENTIK-SECURITY-ENCRYPTION-02",
    notes:            "Adapter built. EncryptionService integrated. Awaiting data migration sprint.",
  },
  {
    id:               "FINANCIAL_RECORD",
    name:             "Financial Records",
    scope:            "Transaction amounts, reconciliation results, cash positions, payment records.",
    state:            "NOT_STARTED",
    adapterPath:      null,
    estimatedRecords: null,
    targetSprint:     "AGENTIK-SECURITY-FINANCE-ENCRYPTION-01",
    notes:            "No adapter yet. Requires finance domain analysis before migration planning.",
  },
  {
    id:               "CUSTOMER_RECORD",
    name:             "Customer Records",
    scope:            "Customer PII: name, contact info, purchase history, communication preferences.",
    state:            "NOT_STARTED",
    adapterPath:      null,
    estimatedRecords: null,
    targetSprint:     "AGENTIK-SECURITY-CUSTOMER-ENCRYPTION-01",
    notes:            "No adapter yet. Requires GDPR/compliance analysis before migration.",
  },
  {
    id:               "EMPLOYEE_RECORD",
    name:             "Employee Records",
    scope:            "Employee personal data, salary, roles, employment history.",
    state:            "NOT_STARTED",
    adapterPath:      null,
    estimatedRecords: null,
    targetSprint:     "AGENTIK-SECURITY-HR-ENCRYPTION-01",
    notes:            "RESTRICTED classification. Highest priority after COPILOT_MEMORY and PLAYBOOK. Requires legal review.",
  },
  {
    id:               "AGENT_CONFIGURATION",
    name:             "Agent Configurations",
    scope:            "Agent behavioral settings, capability overrides, tenant policy configurations.",
    state:            "NOT_STARTED",
    adapterPath:      null,
    estimatedRecords: null,
    targetSprint:     "AGENTIK-SECURITY-AGENT-ENCRYPTION-01",
    notes:            "No adapter yet. Requires agent configuration schema stabilization first.",
  },
] as const;

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Find a migration candidate by asset type id. */
export function getMigrationCandidate(id: string): EncryptionMigrationCandidate | undefined {
  return ENCRYPTION_MIGRATION_PLAN.find(c => c.id === id);
}

/** Get all candidates in a given state. */
export function getMigrationCandidatesByState(state: MigrationState): EncryptionMigrationCandidate[] {
  return ENCRYPTION_MIGRATION_PLAN.filter(c => c.state === state);
}

/** Get all candidates that are READY for migration (adapter built). */
export function getReadyCandidates(): EncryptionMigrationCandidate[] {
  return getMigrationCandidatesByState("READY");
}

/** Get all candidates NOT_STARTED. */
export function getPendingCandidates(): EncryptionMigrationCandidate[] {
  return getMigrationCandidatesByState("NOT_STARTED");
}

/** Get all candidates that have been MIGRATED or VERIFIED. */
export function getMigratedCandidates(): EncryptionMigrationCandidate[] {
  return ENCRYPTION_MIGRATION_PLAN.filter(
    c => c.state === "MIGRATED" || c.state === "VERIFIED",
  );
}

/** Summary of migration plan state. */
export function getMigrationPlanSummary(): {
  total:       number;
  notStarted:  number;
  ready:       number;
  migrated:    number;
  verified:    number;
} {
  return {
    total:      ENCRYPTION_MIGRATION_PLAN.length,
    notStarted: getMigrationCandidatesByState("NOT_STARTED").length,
    ready:      getMigrationCandidatesByState("READY").length,
    migrated:   getMigrationCandidatesByState("MIGRATED").length,
    verified:   getMigrationCandidatesByState("VERIFIED").length,
  };
}
