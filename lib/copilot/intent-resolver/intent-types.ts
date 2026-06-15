/**
 * lib/copilot/intent-resolver/intent-types.ts
 *
 * AGENTIK-INTENT-RESOLVER-01 — Canonical type contracts.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * These types define the contract between the Agentik Copilot surface
 * and any downstream action domain (Shopify, Finance, Commercial, etc.).
 *
 * The Intent Resolver is a pure orchestration layer:
 *   - Parses user utterance deterministically
 *   - Identifies domain + action
 *   - Extracts structured parameters
 *   - Validates and generates an execution plan
 *   - NEVER executes business logic itself
 */
import "server-only";

// ── Domain taxonomy ────────────────────────────────────────────────────────────

/**
 * Canonical domain identifiers for Agentik modules.
 * Each domain maps to a set of IntentCandidates registered in INTENT_REGISTRY.
 *
 * To add a new domain: add its string literal here (optional — string is accepted)
 * and register domain intent entries in the appropriate *_INTENT_REGISTRY file.
 */
export type AgentikDomain =
  | "shopify"
  | "finance"
  | "commercial"
  | "marketing"
  | "collections"
  | "inventory"
  | "cobranza"
  | (string & {}); // allow future domains without breaking existing types

// ── Intent Candidate (registry entry) ─────────────────────────────────────────

/**
 * A single intent registered in the INTENT_REGISTRY.
 *
 * An IntentCandidate represents ONE user intent mapped to ONE Agentik action.
 * It is purely declarative — no logic, no external calls.
 *
 * `actionId` format:  "{domain-namespace}.{functionName}"
 *   e.g. "catalog.publishPendingProducts"
 *        "operations.findFailedPayments"
 *        "promotions.createPromotion"
 */
export interface IntentCandidate {
  /** Unique stable identifier for this intent, e.g. "publish_pending_products" */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description of what this intent does */
  description: string;
  /** Natural language examples that would trigger this intent (for docs / future LLM assist) */
  examples: string[];
  /**
   * Keywords used for deterministic matching.
   * Longer, more specific keywords carry more weight in the scoring algorithm.
   * Include Spanish and English variants where relevant.
   */
  keywords: string[];
  /** Agentik domain that owns this intent */
  domain: AgentikDomain;
  /**
   * Fully-qualified action reference: "{namespace}.{functionName}"
   * The resolver uses this to look up metadata (requiresApproval, automationEligible)
   * from the domain's action registry — no duplication.
   */
  actionId: string;
}

// ── Resolution output ──────────────────────────────────────────────────────────

/**
 * A fully-resolved, validated intent ready for planning or execution routing.
 *
 * NOTE: requiresApproval and automationEligible are copied from the domain
 * action registry — they are NOT stored redundantly in the IntentCandidate.
 */
export interface ResolvedIntent {
  /** Agentik domain, e.g. "shopify" */
  domain: AgentikDomain;
  /** Fully-qualified action id, e.g. "catalog.publishPendingProducts" */
  actionId: string;
  /** The matched IntentCandidate id, e.g. "publish_pending_products" */
  candidateId: string;
  /** Resolved display name from the domain action registry */
  displayName: string;
  /** Resolved description from the domain action registry */
  description: string;
  /** Confidence score [0–1]. ≥0.5 is considered a strong match. */
  confidence: number;
  /** Parameters extracted from the raw input via deterministic regex rules */
  parameters: Record<string, unknown>;
  /** Sourced from domain action registry — must check before routing to execution */
  requiresApproval: boolean;
  /** Sourced from domain action registry — safe for automation pipelines if true */
  automationEligible: boolean;
}

/**
 * Complete result of a single intent resolution attempt.
 */
export interface IntentResolutionResult {
  /** True if resolution completed without fatal errors */
  success: boolean;
  /** True if a matching intent was found with sufficient confidence */
  matched: boolean;
  /** Confidence of the best match, 0 if no match */
  confidence: number;
  /** Present only when matched=true */
  resolvedIntent?: ResolvedIntent;
  /** Non-blocking advisory messages */
  warnings: string[];
  /** Blocking error messages */
  errors: string[];
  /** The original user input as provided */
  rawInput: string;
  /** Normalized tokens used during matching */
  parsedTokens: string[];
}

// ── Parser internals ──────────────────────────────────────────────────────────

/**
 * Internal result from the keyword-based parser.
 * Not exported in the public facade — internal to intent-resolver.ts.
 */
export interface IntentParseResult {
  normalizedInput: string;
  tokens: string[];
  /** Best matching candidate id, or null if no candidate crossed the minimum threshold */
  candidateId: string | null;
  /** Score of the best candidate [0–1] */
  confidence: number;
  /** All candidate scores for debugging / observability */
  allScores: Record<string, number>;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface IntentValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ── Execution Plan ────────────────────────────────────────────────────────────

/**
 * A structured plan describing what would happen if this intent is executed.
 * The resolver generates this — it does NOT execute the plan.
 * Execution is delegated to the appropriate domain action.
 */
export interface IntentExecutionPlan {
  /** User-facing title, e.g. "Publicar productos pendientes" */
  title: string;
  /** One-sentence summary of the planned operation */
  summary: string;
  /** Whether a human approval step is required before execution */
  requiresApproval: boolean;
  /** Whether this can be run in autonomous / scheduled pipelines */
  automationEligible: boolean;
  /** Domain name for routing, e.g. "shopify" */
  domain: string;
  /** Fully-qualified action id for execution routing */
  actionId: string;
  /** Extracted parameters, ready to be passed to the action function */
  parameters: Record<string, unknown>;
  /** Resolver confidence [0–1] */
  confidence: number;
  /** Human-readable confirmation prompt for approval-gated actions */
  confirmationMessage: string;
}
