/**
 * lib/marketing-studio/commerce/shopify-actions/action-types.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Shared types and helpers for the action layer.
 *
 * SERVER ONLY — never import from client components.
 *
 * This file has no Shopify service imports. It is a pure type + utility module
 * shared by every domain action file in this directory.
 */

// ── Domain taxonomy ────────────────────────────────────────────────────────────

export type ShopifyActionCategory =
  | "catalog"
  | "promotions"
  | "collections"
  | "operations"
  | "statistics"
  | "enrichment"
  | "search";

// ── Action registry entry ──────────────────────────────────────────────────────

/**
 * Registry entry for a single Shopify action.
 * Used for introspection, capability listing, and Copilot routing.
 */
export interface ShopifyActionMeta {
  /** Stable identifier. Never renamed — used as Copilot routing key. */
  id:                 string;
  category:           ShopifyActionCategory;
  displayName:        string;
  description:        string;
  /** If true, Copilot MUST present a confirmation to the user before executing. */
  requiresApproval:   boolean;
  /**
   * If true, the action may be invoked by automation workers without a confirmation prompt.
   * Independent from requiresApproval — an action can be automatable AND require approval.
   */
  automationEligible: boolean;
  /** Whether the Copilot layer can reason about and invoke this action. */
  supportedByCopilot: boolean;
  /** Human-readable list of inputs Copilot expects from the user or context. */
  expectedInputs:     string[];
  /** Human-readable list of outputs this action produces. */
  expectedOutputs:    string[];
  /**
   * true when the action is a stub (extension point — not yet fully implemented).
   * Copilot should communicate this limitation to the user.
   */
  stub?:              boolean;
}

// ── Canonical result ───────────────────────────────────────────────────────────

/**
 * Standardised result for every Shopify action.
 *
 * All service functions return ShopifyActionResult<T> — UI, API, and Copilot
 * can consume a single contract without special-casing per domain.
 *
 * Copilot read-aloud template:
 *   "{success ? '✓' : '✗'} {summary}
 *    Ejecutados: {executed} | Omitidos: {skipped} | Fallidos: {failed}
 *    {warnings.length > 0 ? 'Advertencias: ' + warnings.join(', ') : ''}"
 */
export interface ShopifyActionResult<T = unknown> {
  success:       boolean;
  /** The domain payload (list, entity, metrics, etc.). */
  data:          T;
  /** Number of records processed successfully. */
  executed:      number;
  /** Records intentionally skipped (already in desired state, filtered out). */
  skipped:       number;
  /** Records that failed processing. */
  failed:        number;
  /** Non-blocking warnings that did not stop execution. */
  warnings:      string[];
  /** Error messages for failed records. */
  errors:        string[];
  /** Wall-clock time in milliseconds. */
  executionTime: number;
  /** Copilot-ready plain-Spanish summary of what happened. */
  summary:       string;
}

// ── Execution plan ────────────────────────────────────────────────────────────

/**
 * Pre-execution plan for bulk or destructive Shopify operations.
 * Copilot MUST build this plan and present it for user approval before executing
 * any action where requiresApproval = true.
 */
export interface ShopifyExecutionPlan {
  title:               string;
  summary:             string;
  /** Ordered list of action metadata that will be executed. */
  actions:             ShopifyActionMeta[];
  /** Human-readable count of expected state changes. */
  estimatedChanges:    string;
  /** Entities that will be modified (product IDs, promotion IDs, etc.). */
  affectedResources:   string[];
  requiresApproval:    boolean;
  /** Whether the batch can be reversed without data loss. */
  canRollback:         boolean;
  /** Risk warnings the user must acknowledge before execution. */
  warnings:            string[];
  /** Exact text Copilot must show the user when requesting confirmation. */
  confirmationMessage: string;
}

// ── Shared context ─────────────────────────────────────────────────────────────

/**
 * Shared context injected into every action.
 * accessToken is server-only and must never be exposed to client components.
 */
export interface ShopifyContext {
  organizationId: string;
  accessToken:    string;   // ⚠ server-only
  shopDomain:     string;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Records the current timestamp in ms for duration tracking. */
export const start = (): number => Date.now();

export function mkOk<T>(
  data:     T,
  summary:  string,
  opts:     Partial<Pick<ShopifyActionResult<T>, "executed" | "skipped" | "failed" | "warnings">> = {},
  t0 = 0,
): ShopifyActionResult<T> {
  return {
    success:       true,
    data,
    executed:      opts.executed  ?? (Array.isArray(data) ? (data as unknown[]).length : 1),
    skipped:       opts.skipped   ?? 0,
    failed:        opts.failed    ?? 0,
    warnings:      opts.warnings  ?? [],
    errors:        [],
    executionTime: t0 > 0 ? Date.now() - t0 : 0,
    summary,
  };
}

export function mkFail<T = never>(
  errors:  string[],
  summary: string,
  t0 = 0,
): ShopifyActionResult<T> {
  return {
    success:       false,
    data:          undefined as unknown as T,
    executed:      0,
    skipped:       0,
    failed:        errors.length,
    warnings:      [],
    errors,
    executionTime: t0 > 0 ? Date.now() - t0 : 0,
    summary,
  };
}

export function mkStub(actionId: string): ShopifyActionResult<null> {
  return {
    success:       false,
    data:          null,
    executed:      0,
    skipped:       0,
    failed:        0,
    warnings:      [`La acción "${actionId}" es un stub — no implementada todavía.`],
    errors:        [],
    executionTime: 0,
    summary:       `${actionId}: aún no disponible. Requiere implementación futura.`,
  };
}
