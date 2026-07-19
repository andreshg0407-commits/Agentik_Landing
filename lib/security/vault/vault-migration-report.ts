/**
 * lib/security/vault/vault-migration-report.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Vault Migration Layer — Migration Report Builder
 *
 * Builds a fully serializable, human-readable migration report.
 * No network. No Prisma. No I/O beyond what the registry provides.
 *
 * Output sections:
 *   - summary:   high-level counters and percentages
 *   - migrated:  secrets already in Vault (MIGRATED / VERIFIED)
 *   - pending:   secrets not yet migrated (NOT_STARTED / READY)
 *   - orphaned:  env vars found in LEGACY_ENV_MAP but not in registry
 *   - errors:    registry or analysis problems
 *   - risks:     CRITICAL and HIGH items not yet migrated
 *   - providers: per-integration breakdown
 */

import {
  SECRET_MIGRATION_REGISTRY,
  type SecretMigrationCandidate,
  type SecretMigrationStatus,
  type SecretRiskLevel,
} from "./secret-migration-registry";

import { LEGACY_ENV_MAP, ALL_LEGACY_SECRET_KEYS } from "./legacy-secret-adapter";

// ── Report types ──────────────────────────────────────────────────────────────

export interface MigrationSummary {
  totalSecrets:       number;
  migratedCount:      number;
  pendingCount:       number;
  migrationPercent:   number;
  criticalPending:    number;
  highPending:        number;
  overallRisk:        "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readyForCutover:    boolean;
}

export interface MigrationSecretEntry {
  id:              string;
  name:            string;
  provider:        string;
  riskLevel:       SecretRiskLevel;
  migrationStatus: SecretMigrationStatus;
  legacyEnvCount:  number;
  hasSpecialHandling: boolean;
}

export interface OrphanedSecret {
  canonicalKey:   string;
  legacyEnvNames: string[];
  reason:         string;
}

export interface MigrationError {
  id:      string;
  message: string;
}

export interface MigrationRisk {
  secretId:  string;
  riskLevel: SecretRiskLevel;
  reason:    string;
  action:    string;
}

export interface ProviderBreakdown {
  provider:        string;
  total:           number;
  migrated:        number;
  pending:         number;
  hasCritical:     boolean;
  migrationStatus: "COMPLETE" | "PARTIAL" | "NOT_STARTED";
}

export interface MigrationReport {
  summary:   MigrationSummary;
  migrated:  MigrationSecretEntry[];
  pending:   MigrationSecretEntry[];
  orphaned:  OrphanedSecret[];
  errors:    MigrationError[];
  risks:     MigrationRisk[];
  providers: ProviderBreakdown[];
  generatedAt: string;
}

// ── Helper functions ──────────────────────────────────────────────────────────

function toEntry(c: SecretMigrationCandidate): MigrationSecretEntry {
  return {
    id:              c.id,
    name:            c.name,
    provider:        c.provider,
    riskLevel:       c.riskLevel,
    migrationStatus: c.migrationStatus,
    legacyEnvCount:  c.legacyEnvNames.length,
    hasSpecialHandling: !!c.specialHandling,
  };
}

function isMigrated(status: SecretMigrationStatus): boolean {
  return status === "MIGRATED" || status === "VERIFIED";
}

function isPending(status: SecretMigrationStatus): boolean {
  return status === "NOT_STARTED" || status === "READY";
}

function computeOverallRisk(
  criticalPending: number,
  highPending:     number,
): MigrationSummary["overallRisk"] {
  if (criticalPending > 0) return "CRITICAL";
  if (highPending > 0)     return "HIGH";
  return "LOW";
}

function buildProviderBreakdowns(
  registry: ReadonlyArray<SecretMigrationCandidate>,
): ProviderBreakdown[] {
  const byProvider = new Map<string, SecretMigrationCandidate[]>();
  for (const c of registry) {
    const group = byProvider.get(c.provider) ?? [];
    group.push(c);
    byProvider.set(c.provider, group);
  }

  const result: ProviderBreakdown[] = [];
  for (const [provider, candidates] of byProvider) {
    const total    = candidates.length;
    const migrated = candidates.filter(c => isMigrated(c.migrationStatus)).length;
    const pending  = candidates.filter(c => isPending(c.migrationStatus)).length;
    const hasCritical = candidates.some(c => c.riskLevel === "CRITICAL");

    let migrationStatus: ProviderBreakdown["migrationStatus"];
    if (migrated === total)   migrationStatus = "COMPLETE";
    else if (migrated > 0)    migrationStatus = "PARTIAL";
    else                      migrationStatus = "NOT_STARTED";

    result.push({ provider, total, migrated, pending, hasCritical, migrationStatus });
  }

  return result.sort((a, b) => {
    // Sort: CRITICAL providers first, then by name
    if (a.hasCritical && !b.hasCritical) return -1;
    if (!a.hasCritical && b.hasCritical) return 1;
    return a.provider.localeCompare(b.provider);
  });
}

function findOrphaned(
  registry: ReadonlyArray<SecretMigrationCandidate>,
): OrphanedSecret[] {
  const registeredIds = new Set(registry.map(c => c.id));
  const orphaned: OrphanedSecret[] = [];

  for (const canonicalKey of ALL_LEGACY_SECRET_KEYS) {
    if (!registeredIds.has(canonicalKey)) {
      orphaned.push({
        canonicalKey,
        legacyEnvNames: LEGACY_ENV_MAP[canonicalKey] ?? [],
        reason:         "Key exists in LEGACY_ENV_MAP but not in SECRET_MIGRATION_REGISTRY",
      });
    }
  }

  return orphaned;
}

function buildRisks(
  registry: ReadonlyArray<SecretMigrationCandidate>,
): MigrationRisk[] {
  const risks: MigrationRisk[] = [];

  for (const c of registry) {
    if (!isPending(c.migrationStatus)) continue;

    if (c.riskLevel === "CRITICAL") {
      risks.push({
        secretId:  c.id,
        riskLevel: "CRITICAL",
        reason:    `CRITICAL secret "${c.name}" is not yet in Vault. Exposure is a regulatory or billing incident.`,
        action:    `Migrate ${c.id} to Vault immediately. Set migrationStatus to MIGRATED after verification.`,
      });
    } else if (c.riskLevel === "HIGH") {
      risks.push({
        secretId:  c.id,
        riskLevel: "HIGH",
        reason:    `HIGH risk secret "${c.name}" remains in environment / legacy storage.`,
        action:    `Schedule migration of ${c.id} to Vault. Use VAULT_SHADOW_MODE=true to validate before cutover.`,
      });
    }
  }

  return risks;
}

function validateRegistry(
  registry: ReadonlyArray<SecretMigrationCandidate>,
): MigrationError[] {
  const errors: MigrationError[] = [];
  const seenIds = new Set<string>();

  for (const c of registry) {
    if (seenIds.has(c.id)) {
      errors.push({ id: c.id, message: `Duplicate registry entry for "${c.id}"` });
    }
    seenIds.add(c.id);

    if (!c.id || !c.name || !c.provider) {
      errors.push({ id: c.id ?? "unknown", message: "Entry missing required fields" });
    }

    if (!Array.isArray(c.legacyEnvNames) || c.legacyEnvNames.length === 0) {
      errors.push({ id: c.id, message: `"${c.id}" has no legacyEnvNames` });
    }
  }

  return errors;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a complete, serializable migration report.
 * Never throws. Uses only in-memory registry data.
 */
export function buildMigrationReport(): MigrationReport {
  const registry = SECRET_MIGRATION_REGISTRY as ReadonlyArray<SecretMigrationCandidate>;

  const migratedEntries = registry.filter(c => isMigrated(c.migrationStatus)).map(toEntry);
  const pendingEntries  = registry.filter(c => isPending(c.migrationStatus)).map(toEntry);

  const criticalPending = pendingEntries.filter(e => e.riskLevel === "CRITICAL").length;
  const highPending     = pendingEntries.filter(e => e.riskLevel === "HIGH").length;

  const total   = registry.length;
  const migCnt  = migratedEntries.length;
  const migPct  = total > 0 ? Math.round((migCnt / total) * 100) : 0;

  const summary: MigrationSummary = {
    totalSecrets:     total,
    migratedCount:    migCnt,
    pendingCount:     pendingEntries.length,
    migrationPercent: migPct,
    criticalPending,
    highPending,
    overallRisk:      computeOverallRisk(criticalPending, highPending),
    readyForCutover:  criticalPending === 0 && highPending === 0,
  };

  return {
    summary,
    migrated:  migratedEntries,
    pending:   pendingEntries,
    orphaned:  findOrphaned(registry),
    errors:    validateRegistry(registry),
    risks:     buildRisks(registry),
    providers: buildProviderBreakdowns(registry),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Render a human-readable text summary of the migration report.
 * Safe to print to logs (never includes secret values).
 */
export function formatMigrationReport(report: MigrationReport): string {
  const { summary, risks, providers, errors } = report;
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("  AGENTIK VAULT MIGRATION REPORT");
  lines.push(`  Generated: ${report.generatedAt}`);
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");

  lines.push("── SUMMARY ─────────────────────────────────────────────────");
  lines.push(`  Total secrets tracked : ${summary.totalSecrets}`);
  lines.push(`  Migrated to Vault     : ${summary.migratedCount} (${summary.migrationPercent}%)`);
  lines.push(`  Pending migration     : ${summary.pendingCount}`);
  lines.push(`  CRITICAL pending      : ${summary.criticalPending}`);
  lines.push(`  HIGH pending          : ${summary.highPending}`);
  lines.push(`  Overall risk level    : ${summary.overallRisk}`);
  lines.push(`  Ready for cutover     : ${summary.readyForCutover ? "YES" : "NO — resolve risks first"}`);
  lines.push("");

  if (errors.length > 0) {
    lines.push("── REGISTRY ERRORS ─────────────────────────────────────────");
    for (const e of errors) {
      lines.push(`  [ERROR] ${e.id}: ${e.message}`);
    }
    lines.push("");
  }

  lines.push("── PER-PROVIDER STATUS ─────────────────────────────────────");
  for (const p of providers) {
    const flag = p.hasCritical ? " [CRITICAL]" : "";
    lines.push(`  ${p.provider.padEnd(12)} ${p.migrationStatus.padEnd(12)} ${p.migrated}/${p.total} migrated${flag}`);
  }
  lines.push("");

  if (risks.length > 0) {
    lines.push("── RISKS ───────────────────────────────────────────────────");
    for (const r of risks) {
      lines.push(`  [${r.riskLevel}] ${r.secretId}`);
      lines.push(`    Reason: ${r.reason}`);
      lines.push(`    Action: ${r.action}`);
    }
    lines.push("");
  }

  if (report.orphaned.length > 0) {
    lines.push("── ORPHANED (in LEGACY_ENV_MAP but not in registry) ────────");
    for (const o of report.orphaned) {
      lines.push(`  ${o.canonicalKey}: ${o.reason}`);
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════");
  return lines.join("\n");
}
