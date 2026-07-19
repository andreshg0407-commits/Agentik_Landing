/**
 * rule-evidence.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Evidence collected during rule evaluation.
 *
 * Every rule result carries evidence — what data was examined,
 * what conditions matched, and what was missing.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// -- Evidence Item ------------------------------------------------------------

/** A single piece of evidence from rule evaluation. */
export interface RuleEvidenceItem {
  /** What field or condition produced this evidence. */
  source: string;
  /** The actual value found. */
  actualValue: unknown;
  /** The expected value (from the condition). */
  expectedValue: unknown;
  /** Whether this evidence item supports or contradicts the rule. */
  supports: boolean;
  /** Human-readable explanation. */
  explanation: string;
}

// -- Rule Evidence ------------------------------------------------------------

/** Complete evidence record for a rule evaluation. */
export interface RuleEvidence {
  /** Evidence items collected during evaluation. */
  items: RuleEvidenceItem[];
  /** Fields that were expected but missing from the data context. */
  missingFields: string[];
  /** Data sources that were consulted. */
  dataSources: string[];
  /** Overall confidence based on data completeness (0–100). */
  confidence: number;
  /** Human-readable confidence explanation. */
  confidenceReason: string;
}

// -- Builders -----------------------------------------------------------------

/** Build a single evidence item. */
export function buildEvidenceItem(
  source: string,
  actualValue: unknown,
  expectedValue: unknown,
  supports: boolean,
  explanation: string,
): RuleEvidenceItem {
  return { source, actualValue, expectedValue, supports, explanation };
}

/** Build rule evidence from condition evaluation results. */
export function buildRuleEvidence(opts: {
  items: RuleEvidenceItem[];
  missingFields?: string[];
  dataSources?: string[];
}): RuleEvidence {
  const totalItems = opts.items.length;
  const missingCount = opts.missingFields?.length ?? 0;
  const totalExpected = totalItems + missingCount;

  const confidence = totalExpected > 0
    ? Math.round((totalItems / totalExpected) * 100)
    : 0;

  const confidenceReason = missingCount === 0
    ? `All ${totalItems} data point(s) available`
    : `${totalItems}/${totalExpected} data point(s) available, ${missingCount} missing`;

  return {
    items: opts.items,
    missingFields: opts.missingFields ?? [],
    dataSources: opts.dataSources ?? [],
    confidence,
    confidenceReason,
  };
}

/** Build empty evidence (no data available). */
export function emptyRuleEvidence(): RuleEvidence {
  return {
    items: [],
    missingFields: [],
    dataSources: [],
    confidence: 0,
    confidenceReason: "No data evaluated",
  };
}
