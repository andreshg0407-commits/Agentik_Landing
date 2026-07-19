/**
 * lib/copilot/language/language-audit.ts
 *
 * Agentik Copilot — Language System: Audit Utilities
 * Sprint: AGENTIK-COPILOT-LANGUAGE-ADOPTION-01
 *
 * Pure functions for detecting forbidden terms and auditing
 * user-facing text compliance with the Language System contract.
 *
 * No React. No runtime. No UI. No side effects.
 * Safe for use in tests, CI pipelines, and development tooling.
 */

import { FORBIDDEN_TERM_SET, FORBIDDEN_TERMS } from "./forbidden-terms";
import type { ForbiddenTerm }                  from "./forbidden-terms";
import { BASE_LANGUAGE }                       from "./base-language";

// ── Result types ──────────────────────────────────────────────────────────────

export interface AuditViolation {
  /** The forbidden term found in the text. */
  term:        string;
  /** Context excerpt where the term was found (trimmed). */
  context:     string;
  /** Suggested replacement keys from BASE_LANGUAGE. */
  suggestions: string[];
  /** Full ForbiddenTerm record for additional info. */
  rule:        ForbiddenTerm;
}

export interface ComponentAuditResult {
  /** Component or file name being audited. */
  component:   string;
  /** All text labels found in this component (for scanning). */
  labels:      string[];
  /** Violations found. */
  violations:  AuditViolation[];
  /** Whether this component passes the language contract. */
  passing:     boolean;
}

export interface LanguageAuditReport {
  /** Timestamp of the audit run. */
  auditedAt:         string;
  /** Total components audited. */
  totalComponents:   number;
  /** Number of passing components. */
  passing:           number;
  /** Number of failing components. */
  failing:           number;
  /** Total violations across all components. */
  totalViolations:   number;
  /** Forbidden terms found (deduplicated). */
  forbiddenFound:    string[];
  /** Per-component results. */
  results:           ComponentAuditResult[];
}

// ── Core audit functions ──────────────────────────────────────────────────────

/**
 * Checks a single string for forbidden terms.
 * Returns all violations found (case-insensitive substring matching).
 *
 * @example
 * auditUserFacingText("3 Insights detectados")
 * // → [{ term: "insight", context: "3 Insights detectados", suggestions: [...], rule: {...} }]
 *
 * auditUserFacingText("3 hallazgos detectados")
 * // → []
 */
export function auditUserFacingText(text: string): AuditViolation[] {
  if (!text || typeof text !== "string") return [];

  const lower      = text.toLowerCase();
  const violations: AuditViolation[] = [];

  for (const rule of FORBIDDEN_TERMS) {
    if (lower.includes(rule.term.toLowerCase())) {
      violations.push({
        term:        rule.term,
        context:     text.length > 80 ? text.slice(0, 80) + "…" : text,
        suggestions: rule.suggestKeys.map(k => `${k} → "${BASE_LANGUAGE[k] ?? k}"`),
        rule,
      });
    }
  }

  return violations;
}

/**
 * Finds all forbidden terms present in a string (returns unique term strings).
 * Re-exported from language-resolver for convenience.
 *
 * @example
 * findForbiddenTerms("Runtime error: insight not found")
 * // → ["runtime", "insight"]
 */
export function findForbiddenTerms(text: string): string[] {
  const lower   = text.toLowerCase();
  const matches: string[] = [];
  for (const forbidden of FORBIDDEN_TERM_SET) {
    if (lower.includes(forbidden)) matches.push(forbidden);
  }
  return matches;
}

/**
 * Audits a named component's set of visible labels.
 * Returns a ComponentAuditResult with all violations.
 *
 * @param component  - Name of the component being audited (e.g. "CopilotInsightsList")
 * @param labels     - Array of all user-facing strings rendered by this component
 *
 * @example
 * auditComponentLabels("CopilotInsightsList", [
 *   "Contexto e insights",
 *   "Sin insights para el contexto actual.",
 * ]);
 * // → { violations: [{ term: "insight", ... }, ...], passing: false }
 */
export function auditComponentLabels(
  component: string,
  labels:    string[],
): ComponentAuditResult {
  const allViolations: AuditViolation[] = [];

  for (const label of labels) {
    const v = auditUserFacingText(label);
    allViolations.push(...v);
  }

  return {
    component,
    labels,
    violations: allViolations,
    passing:    allViolations.length === 0,
  };
}

/**
 * Generates a full language audit report for a set of component label maps.
 *
 * @param componentLabelMap  - Record mapping component name → array of visible labels
 *
 * @example
 * generateLanguageAudit({
 *   "CopilotInsightsList": ["Contexto e insights", "Sin insights"],
 *   "CopilotActiveWork":   ["Trabajando en esto ahora"],
 * });
 */
export function generateLanguageAudit(
  componentLabelMap: Record<string, string[]>,
): LanguageAuditReport {
  const results: ComponentAuditResult[] = Object.entries(componentLabelMap).map(
    ([component, labels]) => auditComponentLabels(component, labels),
  );

  const forbiddenFoundSet = new Set<string>();
  let totalViolations = 0;

  for (const result of results) {
    for (const v of result.violations) {
      forbiddenFoundSet.add(v.term);
      totalViolations++;
    }
  }

  const passing = results.filter(r => r.passing).length;
  const failing = results.filter(r => !r.passing).length;

  return {
    auditedAt:       new Date().toISOString(),
    totalComponents: results.length,
    passing,
    failing,
    totalViolations,
    forbiddenFound:  Array.from(forbiddenFoundSet),
    results,
  };
}

/**
 * Formats an audit report as a human-readable summary string.
 * Useful for logging in development or CI output.
 */
export function formatAuditReport(report: LanguageAuditReport): string {
  const lines: string[] = [
    `Language Audit — ${report.auditedAt}`,
    `Components: ${report.totalComponents} | Pass: ${report.passing} | Fail: ${report.failing}`,
    `Total violations: ${report.totalViolations}`,
  ];

  if (report.forbiddenFound.length > 0) {
    lines.push(`Forbidden terms found: ${report.forbiddenFound.join(", ")}`);
  }

  for (const result of report.results) {
    if (!result.passing) {
      lines.push(`\n[FAIL] ${result.component}`);
      for (const v of result.violations) {
        lines.push(`  ✗ "${v.term}" in: "${v.context}"`);
        if (v.suggestions.length > 0) {
          lines.push(`    → Use: ${v.suggestions.join(", ")}`);
        }
      }
    }
  }

  if (report.failing === 0) {
    lines.push("\n✓ All components pass the language contract.");
  }

  return lines.join("\n");
}

/**
 * Snapshot of the current Copilot component label set for automated auditing.
 * Update this map whenever new user-facing strings are added to Copilot components.
 *
 * Labels marked [LANGUAGE_SYSTEM] are already resolved — they pass automatically.
 * Labels marked [REVIEW] need manual verification.
 */
export const COPILOT_COMPONENT_LABELS: Record<string, string[]> = {
  CopilotActiveWork:       ["[LANGUAGE_SYSTEM] section_active_work"],
  CopilotPendingApprovals: ["[LANGUAGE_SYSTEM] section_pending_approvals"],
  CopilotCompletedWork:    ["[LANGUAGE_SYSTEM] section_completed_work"],
  CopilotFollowups:        ["[LANGUAGE_SYSTEM] section_followups"],
  CopilotRequestInbox:     ["[LANGUAGE_SYSTEM] section_request_inbox"],
  CopilotSuggestionsList:  ["[LANGUAGE_SYSTEM] section_suggestions", "[LANGUAGE_SYSTEM] suggestions_empty"],
  CopilotInsightsList:     ["[LANGUAGE_SYSTEM] section_insights",    "[LANGUAGE_SYSTEM] insights_empty"],
  CopilotWorkBoard:        ["[LANGUAGE_SYSTEM] board_label", "[LANGUAGE_SYSTEM] board columns"],
  CopilotAgentStatus:      ["[LANGUAGE_SYSTEM] agent_working", "[LANGUAGE_SYSTEM] last_update_label"],
  CopilotMemoryTimeline:   ["[LANGUAGE_SYSTEM] timeline_header", "[LANGUAGE_SYSTEM] timeline_subtitle"],
  CopilotNextAction:       ["[LANGUAGE_SYSTEM] next_action_header", "[LANGUAGE_SYSTEM] priority_label_prefix"],
  CopilotAgentChat:        ["[LANGUAGE_SYSTEM] chat_header", "[LANGUAGE_SYSTEM] chat_capabilities_label"],
  CopilotAgentHeader:      ["Activo", "Soporte:"],
};
