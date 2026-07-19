/**
 * lib/security/vault/vault-migration-engine.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Vault Migration Layer — Migration Analysis Engine
 *
 * Analyzes the current state of secrets across all sources and
 * generates a prioritized migration plan.
 *
 * Functions:
 *   analyzeMigrationStatus()  — inspect current env + registry state
 *   generateMigrationPlan()   — produce ordered action list
 *
 * This is ANALYSIS ONLY — never executes migrations.
 * No Prisma. No server-only. Pure domain logic.
 */

import {
  SECRET_MIGRATION_REGISTRY,
  getCriticalRiskCandidates,
  getPendingCandidates,
  type SecretMigrationCandidate,
  type SecretMigrationStatus,
} from "./secret-migration-registry";

import { LEGACY_ENV_MAP } from "./legacy-secret-adapter";

// ── Analysis types ────────────────────────────────────────────────────────────

export type SecretAnalysisState =
  | "MIGRATED_TO_VAULT"       // In Vault — no legacy env present
  | "PENDING_MIGRATION"       // Not in Vault — legacy env IS present
  | "ENV_ONLY"                // Only in process.env — not registered in migration registry
  | "ORPHANED"                // No source found anywhere
  | "READY_FOR_MIGRATION";    // Registered, not migrated, legacy env present

export interface SecretAnalysisEntry {
  id:              string;
  name:            string;
  provider:        string;
  riskLevel:       string;
  migrationStatus: SecretMigrationStatus;
  analysisState:   SecretAnalysisState;
  legacyEnvFound:  boolean;
  activeLegacyEnv: string | null;
  isInVault:       boolean;  // always false until Vault lookup is wired
}

export interface MigrationAnalysisResult {
  analyzedAt:        string;  // ISO 8601
  totalCandidates:   number;
  migrated:          SecretAnalysisEntry[];
  pending:           SecretAnalysisEntry[];
  orphaned:          SecretAnalysisEntry[];
  readyForMigration: SecretAnalysisEntry[];
  criticalPending:   SecretAnalysisEntry[];
  migrationScore:    number;  // 0–100 — percent migrated
}

export interface MigrationPlanAction {
  priority:    number;
  secretId:    string;
  name:        string;
  provider:    string;
  riskLevel:   string;
  action:      "MIGRATE_NOW" | "MIGRATE_SOON" | "PLAN_MIGRATION" | "VERIFY";
  reason:      string;
  legacyEnv:   string | null;
}

export interface MigrationPlan {
  generatedAt:   string;  // ISO 8601
  totalActions:  number;
  actions:       MigrationPlanAction[];
  blockers:      string[];
  estimatedRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

// ── Analysis ──────────────────────────────────────────────────────────────────

/**
 * Analyze the current state of all registered migration candidates.
 * Inspects process.env for legacy vars. Does NOT query Vault or Prisma.
 *
 * isInVault is always false in this implementation — it requires
 * a VaultService call that is wired in the integration harness.
 */
export function analyzeMigrationStatus(): MigrationAnalysisResult {
  const now      = new Date().toISOString();
  const entries  = SECRET_MIGRATION_REGISTRY.map(buildAnalysisEntry);

  const migrated          = entries.filter(e => e.analysisState === "MIGRATED_TO_VAULT");
  const pending           = entries.filter(e => e.analysisState === "PENDING_MIGRATION");
  const orphaned          = entries.filter(e => e.analysisState === "ORPHANED");
  const readyForMigration = entries.filter(e => e.analysisState === "READY_FOR_MIGRATION");
  const criticalPending   = entries.filter(
    e => e.riskLevel === "CRITICAL" && e.analysisState !== "MIGRATED_TO_VAULT",
  );

  const migrationScore = entries.length === 0
    ? 100
    : Math.round((migrated.length / entries.length) * 100);

  return {
    analyzedAt:        now,
    totalCandidates:   entries.length,
    migrated,
    pending,
    orphaned,
    readyForMigration,
    criticalPending,
    migrationScore,
  };
}

/**
 * Generate a prioritized list of migration actions.
 * CRITICAL secrets first, then HIGH, then MEDIUM/LOW.
 */
export function generateMigrationPlan(): MigrationPlan {
  const now        = new Date().toISOString();
  const pending    = getPendingCandidates();
  const blockers: string[] = [];

  const actions: MigrationPlanAction[] = pending.map((candidate, idx) => {
    const legacyEnv = findActiveLegacyEnvForCandidate(candidate);

    const action: MigrationPlanAction["action"] =
      candidate.riskLevel === "CRITICAL" ? "MIGRATE_NOW"  :
      candidate.riskLevel === "HIGH"     ? "MIGRATE_SOON" :
      candidate.migrationStatus === "READY" ? "PLAN_MIGRATION" :
                                              "PLAN_MIGRATION";

    const priority =
      candidate.riskLevel === "CRITICAL" ? idx + 1 :
      candidate.riskLevel === "HIGH"     ? idx + 20 :
                                           idx + 50;

    return {
      priority,
      secretId:  candidate.id,
      name:      candidate.name,
      provider:  candidate.provider,
      riskLevel: candidate.riskLevel,
      action,
      reason:    legacyEnv
        ? `Found in legacy env "${legacyEnv}" — migrate to Vault`
        : `Not found in any source — provision in Vault`,
      legacyEnv: legacyEnv ?? null,
    };
  });

  // Sort by priority
  actions.sort((a, b) => a.priority - b.priority);

  // Identify blockers
  const criticalPending = getCriticalRiskCandidates().filter(
    c => c.migrationStatus !== "MIGRATED" && c.migrationStatus !== "VERIFIED",
  );
  if (criticalPending.length > 0) {
    blockers.push(
      `${criticalPending.length} CRITICAL secret(s) not migrated: ${criticalPending.map(c => c.id).join(", ")}`,
    );
  }

  const estimatedRisk: MigrationPlan["estimatedRisk"] =
    criticalPending.length > 0 ? "CRITICAL" :
    actions.some(a => a.riskLevel === "HIGH") ? "HIGH" :
    actions.some(a => a.riskLevel === "MEDIUM") ? "MEDIUM" :
    "LOW";

  return {
    generatedAt:   now,
    totalActions:  actions.length,
    actions,
    blockers,
    estimatedRisk,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAnalysisEntry(candidate: SecretMigrationCandidate): SecretAnalysisEntry {
  const legacyEnv = findActiveLegacyEnvForCandidate(candidate);
  const legacyFound = !!legacyEnv;
  const isInVault = false; // Not wired until VaultService is integrated

  let analysisState: SecretAnalysisState;
  if (isInVault) {
    analysisState = "MIGRATED_TO_VAULT";
  } else if (candidate.migrationStatus === "READY" && legacyFound) {
    analysisState = "READY_FOR_MIGRATION";
  } else if (legacyFound) {
    analysisState = "PENDING_MIGRATION";
  } else {
    analysisState = "ORPHANED";
  }

  return {
    id:              candidate.id,
    name:            candidate.name,
    provider:        candidate.provider,
    riskLevel:       candidate.riskLevel,
    migrationStatus: candidate.migrationStatus,
    analysisState,
    legacyEnvFound:  legacyFound,
    activeLegacyEnv: legacyEnv ?? null,
    isInVault,
  };
}

function findActiveLegacyEnvForCandidate(candidate: SecretMigrationCandidate): string | undefined {
  const envNames = LEGACY_ENV_MAP[candidate.id] ?? candidate.legacyEnvNames;
  return envNames.find(name => {
    const v = process.env[name];
    return !!v && v.trim().length > 0;
  });
}
