/**
 * lib/security/vault/vault-migration-planner.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Migration Planner
 *
 * Documents the migration strategy from the legacy vault (AGENTIK-SECURE-VAULT-01,
 * Integration.secretsJson-based) to the new standalone VaultSecret model.
 *
 * This file is documentation and domain types only — no executable migration logic.
 * Actual migration scripts will be part of AGENTIK-SECURITY-MIGRATION-01.
 *
 * No server-only, no Prisma, no React.
 */

// ── Migration phases ──────────────────────────────────────────────────────────

export type MigrationPhase =
  | "PHASE_1_SCHEMA"
  | "PHASE_2_BACKFILL"
  | "PHASE_3_DUAL_WRITE"
  | "PHASE_4_CUTOVER"
  | "PHASE_5_CLEANUP";

export type MigrationStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED";

export interface MigrationPlanItem {
  phase:       MigrationPhase;
  name:        string;
  description: string;
  blockers:    string[];
  status:      MigrationStatus;
  sprint:      string;
}

// ── Plan ──────────────────────────────────────────────────────────────────────

export const VAULT_MIGRATION_PLAN: ReadonlyArray<MigrationPlanItem> = [
  {
    phase:       "PHASE_1_SCHEMA",
    name:        "VaultSecret Model",
    description: "Add VaultSecret Prisma model. Apply migration. No data movement yet.",
    blockers:    [],
    status:      "COMPLETE",  // completed in AGENTIK-SECURITY-VAULT-01
    sprint:      "AGENTIK-SECURITY-VAULT-01",
  },
  {
    phase:       "PHASE_2_BACKFILL",
    name:        "Backfill Existing Secrets",
    description:
      "Read IntegrationSecret rows, re-encrypt with VAULT_MASTER_KEY, write to VaultSecret. " +
      "Run as one-time script with dry-run mode. Verify parity before proceeding.",
    blockers:    ["AGENTIK-SECURITY-VAULT-01 complete"],
    status:      "NOT_STARTED",
    sprint:      "AGENTIK-SECURITY-MIGRATION-01",
  },
  {
    phase:       "PHASE_3_DUAL_WRITE",
    name:        "Dual-Write Period",
    description:
      "All secret writes go to both IntegrationSecret and VaultSecret. " +
      "Reads from VaultSecret with IntegrationSecret as fallback. " +
      "Monitor for divergence for minimum 7 days.",
    blockers:    ["PHASE_2_BACKFILL complete"],
    status:      "NOT_STARTED",
    sprint:      "AGENTIK-SECURITY-MIGRATION-01",
  },
  {
    phase:       "PHASE_4_CUTOVER",
    name:        "Cutover to VaultSecret",
    description:
      "Remove IntegrationSecret fallback. All reads/writes exclusively from VaultSecret. " +
      "Integration adapters updated to use VaultService. Remove dual-write code.",
    blockers:    ["PHASE_3_DUAL_WRITE stable for 7 days"],
    status:      "NOT_STARTED",
    sprint:      "AGENTIK-SECURITY-MIGRATION-02",
  },
  {
    phase:       "PHASE_5_CLEANUP",
    name:        "Remove Legacy Vault",
    description:
      "Remove Integration.secretsJson field. Remove IntegrationSecret model (after data verified). " +
      "Archive AGENTIK-SECURE-VAULT-01 files. Update security debt registry.",
    blockers:    ["PHASE_4_CUTOVER complete and stable"],
    status:      "NOT_STARTED",
    sprint:      "AGENTIK-SECURITY-MIGRATION-02",
  },
] as const;

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getMigrationPhase(phase: MigrationPhase): MigrationPlanItem | undefined {
  return VAULT_MIGRATION_PLAN.find(p => p.phase === phase);
}

export function getPendingMigrationPhases(): MigrationPlanItem[] {
  return VAULT_MIGRATION_PLAN.filter(
    p => p.status === "NOT_STARTED" || p.status === "IN_PROGRESS",
  );
}
