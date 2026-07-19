/**
 * quality/commercial-quality-evaluator.ts
 *
 * Functional quality evaluator for the Commercial Data Layer.
 * Evaluates real data records and produces QualityAssessment results.
 */

// ── Quality Status ──────────────────────────────────────────────────────────

export type CommercialQualityStatus =
  | "CONFIRMED"
  | "PARTIAL"
  | "ESTIMATED"
  | "UNAVAILABLE"
  | "CONFLICTED"
  | "STALE";

// ── Field Quality ───────────────────────────────────────────────────────────

export interface FieldQualityEntry {
  readonly status: CommercialQualityStatus;
  readonly score: number;
}

// ── Evaluation Input ────────────────────────────────────────────────────────

export interface FieldRule {
  readonly field: string;
  readonly type: "string" | "number" | "date" | "boolean" | "object";
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: RegExp;
}

export interface CommercialQualityEvaluationInput {
  /** The record to evaluate (any object) */
  readonly record: Record<string, unknown>;
  /** Fields that must be present and valid */
  readonly requiredFields: string[];
  /** Fields that are nice-to-have */
  readonly optionalFields: string[];
  /** Validation rules per field */
  readonly fieldRules?: FieldRule[];
  /** Source system identifier */
  readonly source: string;
  /** Freshness info: when was this data captured */
  readonly freshness?: { observedAt: Date; slaSeconds: number; now: Date };
  /** Conflicting values from other sources */
  readonly conflicts?: Array<{ field: string; values: unknown[] }>;
  /** Version of the evaluator */
  readonly evaluatorVersion: string;
}

// ── Evaluation Result ───────────────────────────────────────────────────────

export interface CommercialQualityResult {
  readonly status: CommercialQualityStatus;
  readonly score: number;
  readonly completeness: number;
  readonly validity: number;
  readonly consistency: number;
  readonly freshnessContribution: number;
  readonly missingFields: string[];
  readonly invalidFields: string[];
  readonly conflictingFields: string[];
  readonly reasons: string[];
  readonly fieldQuality: Record<string, FieldQualityEntry>;
  readonly evaluatedAt: Date;
  readonly evaluatorVersion: string;
}

// ── Evaluator ───────────────────────────────────────────────────────────────

export function evaluateCommercialQuality(input: CommercialQualityEvaluationInput): CommercialQualityResult {
  const now = input.freshness?.now ?? new Date();
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const conflictingFields: string[] = [];
  const reasons: string[] = [];
  const fieldQuality: Record<string, FieldQualityEntry> = {};

  const record = input.record;

  // ── Completeness ──────────────────────────────────────────────────────

  const allFields = [...input.requiredFields, ...input.optionalFields];
  let presentCount = 0;

  for (const field of input.requiredFields) {
    const value = record[field];
    if (value == null || value === "") {
      missingFields.push(field);
      fieldQuality[field] = { status: "UNAVAILABLE", score: 0 };
    } else {
      presentCount++;
      fieldQuality[field] = { status: "CONFIRMED", score: 1 };
    }
  }

  for (const field of input.optionalFields) {
    const value = record[field];
    if (value == null || value === "") {
      fieldQuality[field] = { status: "UNAVAILABLE", score: 0 };
    } else {
      presentCount++;
      fieldQuality[field] = { status: "CONFIRMED", score: 1 };
    }
  }

  const completeness = allFields.length > 0 ? presentCount / allFields.length : 0;

  // ── Validity ──────────────────────────────────────────────────────────

  let validCount = 0;
  let checkedCount = 0;

  if (input.fieldRules) {
    for (const rule of input.fieldRules) {
      const value = record[rule.field];
      if (value == null) continue;
      checkedCount++;

      let valid = true;

      if (rule.type === "string" && typeof value === "string") {
        if (rule.minLength && value.length < rule.minLength) valid = false;
        if (rule.maxLength && value.length > rule.maxLength) valid = false;
        if (rule.pattern && !rule.pattern.test(value)) valid = false;
      } else if (rule.type === "number" && typeof value === "number") {
        if (rule.min !== undefined && value < rule.min) valid = false;
        if (rule.max !== undefined && value > rule.max) valid = false;
      }

      if (valid) {
        validCount++;
      } else {
        invalidFields.push(rule.field);
        fieldQuality[rule.field] = { status: "PARTIAL", score: 0.3 };
      }
    }
  }

  const validity = checkedCount > 0 ? validCount / checkedCount : 1;

  // ── Consistency (conflicts) ───────────────────────────────────────────

  let consistency = 1;
  if (input.conflicts && input.conflicts.length > 0) {
    for (const conflict of input.conflicts) {
      conflictingFields.push(conflict.field);
      fieldQuality[conflict.field] = { status: "CONFLICTED", score: 0.2 };
      reasons.push(`Conflict on field "${conflict.field}": ${conflict.values.length} different values`);
    }
    consistency = Math.max(0, 1 - (input.conflicts.length / Math.max(allFields.length, 1)));
  }

  // ── Freshness ─────────────────────────────────────────────────────────

  let freshnessContribution = 1;
  let isStale = false;

  if (input.freshness) {
    const ageMs = input.freshness.now.getTime() - input.freshness.observedAt.getTime();
    const slaMs = input.freshness.slaSeconds * 1000;
    const ratio = ageMs / slaMs;

    if (ratio > 1) {
      freshnessContribution = Math.max(0, 1 - (ratio - 1) * 0.5);
      isStale = true;
      reasons.push(`Data is stale: ${Math.round(ageMs / 1000)}s old, SLA is ${input.freshness.slaSeconds}s`);
    } else {
      freshnessContribution = 1 - ratio * 0.2;
    }
  }

  // ── Estimated fields ──────────────────────────────────────────────────

  let hasEstimated = false;
  for (const [field, entry] of Object.entries(fieldQuality)) {
    if (entry.status === "CONFIRMED" && record[field] !== undefined) {
      // Check if value looks derived/estimated (heuristic: if field contains "estimated" or "derived")
      const rawValue = record[`${field}_source`];
      if (rawValue === "ESTIMATED" || rawValue === "DERIVED") {
        fieldQuality[field] = { status: "ESTIMATED", score: 0.6 };
        hasEstimated = true;
      }
    }
  }

  // ── Overall Score ─────────────────────────────────────────────────────

  const score = Math.min(1, Math.max(0,
    completeness * 0.35 +
    validity * 0.25 +
    consistency * 0.25 +
    freshnessContribution * 0.15
  ));

  // ── Determine Status ──────────────────────────────────────────────────

  let status: CommercialQualityStatus;

  const allRequiredMissing = missingFields.length === input.requiredFields.length && input.requiredFields.length > 0;

  if (allRequiredMissing) {
    status = "UNAVAILABLE";
    reasons.push("All required fields are missing");
  } else if (conflictingFields.length > 0) {
    status = "CONFLICTED";
  } else if (isStale) {
    status = "STALE";
  } else if (hasEstimated) {
    status = "ESTIMATED";
  } else if (missingFields.length > 0 || invalidFields.length > 0) {
    status = "PARTIAL";
    if (missingFields.length > 0) reasons.push(`Missing: ${missingFields.join(", ")}`);
    if (invalidFields.length > 0) reasons.push(`Invalid: ${invalidFields.join(", ")}`);
  } else {
    status = "CONFIRMED";
  }

  return {
    status,
    score,
    completeness,
    validity,
    consistency,
    freshnessContribution,
    missingFields,
    invalidFields,
    conflictingFields,
    reasons,
    fieldQuality,
    evaluatedAt: now,
    evaluatorVersion: input.evaluatorVersion,
  };
}
