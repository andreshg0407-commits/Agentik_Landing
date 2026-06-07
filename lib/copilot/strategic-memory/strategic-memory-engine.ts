// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory Engine — main fail-closed orchestrator
// Pipeline: Input → Classification → Validation → Storage → Relationship Creation → Audit → Output

import type { StrategicMemoryEntry, StrategicMemoryRelation } from "./strategic-memory-types";
import type { StrategicMemoryInput } from "./strategic-memory-builder";
import { buildStrategicMemory } from "./strategic-memory-builder";
import { classifyStrategicImportance, isStrategicCandidate } from "./strategic-classification-engine";
import { validateStrategicMemoryInput, validateCrossTenantIsolation, filterTenantEntries } from "./strategic-guardrails";
import { generateStrategicResultId } from "./strategic-memory-identity";

// ── Engine Run Result (internal — not the shared StrategicMemoryResult from types.ts) ──

export interface StrategicEngineRunResult {
  readonly id: string;
  readonly orgSlug: string;
  readonly status: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly savedEntryId: string | null;
  readonly strategicScore: number;
  readonly violations: string[];
  readonly warnings: string[];
  readonly executedAt: string;
}

// ── Engine Input/Output ───────────────────────────────────────────────────────

export interface StrategicMemoryEngineInput {
  readonly orgSlug: string;
  readonly entry: StrategicMemoryInput;
  readonly existingEntries?: StrategicMemoryEntry[];
  readonly existingRelations?: StrategicMemoryRelation[];
}

export type StrategicMemoryEngineStatus =
  | "SAVED"
  | "SKIPPED_LOW_STRATEGIC_SCORE"
  | "FAILED_VALIDATION"
  | "FAILED_CLASSIFICATION"
  | "FAILED";

export interface StrategicMemoryEngineOutput {
  readonly status: StrategicMemoryEngineStatus;
  readonly entry: StrategicMemoryEntry | null;
  readonly runResult: StrategicEngineRunResult;
  readonly violations: string[];
  readonly warnings: string[];
  readonly classificationLabel: string | null;
  readonly strategicScore: number | null;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function runStrategicMemoryEngine(
  input: StrategicMemoryEngineInput
): StrategicMemoryEngineOutput {
  const resultId = generateStrategicResultId();
  const now = new Date().toISOString();

  // Fail-closed: wrap entire pipeline in try-catch
  try {
    const { orgSlug, entry: entryInput, existingEntries = [] } = input;

    // Step 1: Tenant isolation check on existing entries
    const isolationResult = validateCrossTenantIsolation(existingEntries, orgSlug);
    if (!isolationResult.passed) {
      return failedOutput(resultId, now, orgSlug, "FAILED_VALIDATION", isolationResult.violations, isolationResult.warnings);
    }

    // Step 2: Guardrails — validate input
    const guardrailResult = validateStrategicMemoryInput(entryInput, orgSlug);
    if (!guardrailResult.passed) {
      return failedOutput(resultId, now, orgSlug, "FAILED_VALIDATION", guardrailResult.violations, guardrailResult.warnings);
    }

    // Step 3: Build entry domain object
    const builtEntry = buildStrategicMemory(entryInput);

    // Step 4: Classification — compute strategic score (tenant context passed separately)
    const _tenantEntries = filterTenantEntries(existingEntries, orgSlug);
    const classification = classifyStrategicImportance(builtEntry);

    if (!isStrategicCandidate(builtEntry)) {
      const runResult = buildRunResult(resultId, now, orgSlug, "SKIPPED", null, 0, guardrailResult.warnings, []);
      return {
        status: "SKIPPED_LOW_STRATEGIC_SCORE",
        entry: null,
        runResult,
        violations: [],
        warnings: [...guardrailResult.warnings, `Strategic score ${classification.strategicScore.toFixed(2)} below threshold`],
        classificationLabel: classification.importanceLevel,
        strategicScore: classification.strategicScore,
      };
    }

    // Step 5: Merge classification score into entry
    const scoredEntry: StrategicMemoryEntry = {
      ...builtEntry,
      strategicScore: classification.strategicScore,
    };

    // Step 6: Build run result
    const runResult = buildRunResult(resultId, now, orgSlug, "COMPLETED", scoredEntry.id, classification.strategicScore, guardrailResult.warnings, []);

    return {
      status: "SAVED",
      entry: scoredEntry,
      runResult,
      violations: [],
      warnings: guardrailResult.warnings,
      classificationLabel: classification.importanceLevel,
      strategicScore: classification.strategicScore,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown engine error";
    return failedOutput(resultId, now, input.orgSlug, "FAILED", [msg], []);
  }
}

// ── Batch Engine ──────────────────────────────────────────────────────────────

export interface StrategicMemoryBatchInput {
  readonly orgSlug: string;
  readonly entries: StrategicMemoryInput[];
  readonly existingEntries?: StrategicMemoryEntry[];
}

export interface StrategicMemoryBatchOutput {
  readonly orgSlug: string;
  readonly totalProcessed: number;
  readonly saved: number;
  readonly skipped: number;
  readonly failed: number;
  readonly outputs: StrategicMemoryEngineOutput[];
  readonly savedEntries: StrategicMemoryEntry[];
  readonly generatedAt: string;
}

export function runStrategicMemoryBatch(
  input: StrategicMemoryBatchInput
): StrategicMemoryBatchOutput {
  const outputs: StrategicMemoryEngineOutput[] = [];
  const savedEntries: StrategicMemoryEntry[] = [];
  const existing = [...(input.existingEntries ?? [])];

  for (const entryInput of input.entries) {
    const out = runStrategicMemoryEngine({
      orgSlug: input.orgSlug,
      entry: entryInput,
      existingEntries: existing,
    });
    outputs.push(out);
    if (out.status === "SAVED" && out.entry) {
      savedEntries.push(out.entry);
      existing.push(out.entry);
    }
  }

  return {
    orgSlug: input.orgSlug,
    totalProcessed: input.entries.length,
    saved: outputs.filter((o) => o.status === "SAVED").length,
    skipped: outputs.filter((o) => o.status === "SKIPPED_LOW_STRATEGIC_SCORE").length,
    failed: outputs.filter((o) => ["FAILED", "FAILED_VALIDATION", "FAILED_CLASSIFICATION"].includes(o.status)).length,
    outputs,
    savedEntries,
    generatedAt: new Date().toISOString(),
  };
}

// ── Engine Audit ──────────────────────────────────────────────────────────────

export interface StrategicEngineAuditEvent {
  readonly id: string;
  readonly orgSlug: string;
  readonly eventType: "ENGINE_SAVED" | "ENGINE_SKIPPED" | "ENGINE_FAILED" | "ENGINE_BATCH_COMPLETE";
  readonly entryId: string | null;
  readonly status: StrategicMemoryEngineStatus;
  readonly strategicScore: number | null;
  readonly violations: string[];
  readonly warnings: string[];
  readonly occurredAt: string;
}

export function buildEngineAuditEvent(
  output: StrategicMemoryEngineOutput,
  orgSlug: string
): StrategicEngineAuditEvent {
  const eventType =
    output.status === "SAVED" ? "ENGINE_SAVED" :
    output.status === "SKIPPED_LOW_STRATEGIC_SCORE" ? "ENGINE_SKIPPED" :
    "ENGINE_FAILED";

  return {
    id: `seng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    orgSlug,
    eventType,
    entryId: output.entry?.id ?? null,
    status: output.status,
    strategicScore: output.strategicScore,
    violations: output.violations,
    warnings: output.warnings,
    occurredAt: new Date().toISOString(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function failedOutput(
  resultId: string,
  now: string,
  orgSlug: string,
  status: StrategicMemoryEngineStatus,
  violations: string[],
  warnings: string[]
): StrategicMemoryEngineOutput {
  const runResult = buildRunResult(resultId, now, orgSlug, "FAILED", null, 0, warnings, violations);
  return { status, entry: null, runResult, violations, warnings, classificationLabel: null, strategicScore: null };
}

function buildRunResult(
  id: string,
  now: string,
  orgSlug: string,
  status: StrategicEngineRunResult["status"],
  savedEntryId: string | null,
  strategicScore: number,
  warnings: string[],
  violations: string[]
): StrategicEngineRunResult {
  return { id, orgSlug, status, savedEntryId, strategicScore, violations, warnings, executedAt: now };
}
