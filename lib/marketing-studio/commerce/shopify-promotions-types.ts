/**
 * lib/marketing-studio/commerce/shopify-promotions-types.ts
 *
 * SHOPIFY-PROMOTIONS-04 — Canonical domain types for Shopify Promotions.
 *
 * No Shopify REST or GraphQL internals exposed.
 * All language is commercial (business-level).
 *
 * ── Supported promotion types ─────────────────────────────────────────────────
 *
 *   percentage    — % off applied per product or entire order
 *   fixed_amount  — fixed currency amount off
 *   free_shipping — shipping line discount
 *   code          — code-based redemption (price rule + DiscountCode)
 *   automatic     — (stub) applied without a code; future: Shopify GraphQL Automatic Discounts
 *
 * ── Supported target sources ──────────────────────────────────────────────────
 *
 *   manual        — explicit product IDs or variant IDs
 *   category      — all products in an Agentik catalog category
 *   collection    — all products in a Shopify collection
 *   all_products  — entire catalog (price rule target_selection = "all")
 *
 * ── Future automation hooks (Phase 12) ───────────────────────────────────────
 *
 *   - Auto-disable expired promotions (cron: compare endsAt to now)
 *   - Auto-activate scheduled promotions (cron: compare startsAt to now)
 *   - Recommend promotions based on inventory velocity (Copilot signal)
 *   - Duplicate seasonal campaigns (Copilot: "Duplica Black Friday para diciembre")
 *   - Generate code batches for influencer campaigns
 *
 * ── Copilot-first contract ────────────────────────────────────────────────────
 *
 * All types are designed to be fully callable from shopify-promotions-service.ts
 * without any React dependency. Copilot agents and automation workers share
 * the same input/output contracts as the UI.
 */

// ── Enumerations ───────────────────────────────────────────────────────────────

/**
 * Commercial discount mechanics type.
 * Maps to Shopify price rule constructs without exposing API names.
 */
export type PromotionType =
  | "percentage"    // value_type = "percentage", target_type = "line_item"
  | "fixed_amount"  // value_type = "fixed_amount", target_type = "line_item"
  | "free_shipping" // target_type = "shipping_line"
  | "code"          // percentage or fixed_amount with a redemption code
  | "automatic";    // (stub) no code required; future: Shopify GraphQL Discount Automatic

/**
 * Full lifecycle status of a promotion.
 *
 * Shopify-derived (from starts_at / ends_at):
 *   scheduled — startsAt is in the future
 *   active    — now is between startsAt and endsAt (or no endsAt)
 *   expired   — endsAt is in the past
 *   disabled  — manually deactivated (ends_at set to past by Agentik)
 *
 * Agentik-internal (not stored in Shopify — for approval and planning flows):
 *   draft            — created in Agentik, not yet sent to Shopify
 *   pending_approval — waiting for human or Copilot sign-off before publication
 */
export type PromotionStatus =
  | "draft"            // Agentik-internal: not yet published to Shopify
  | "pending_approval" // Agentik-internal: awaiting approval
  | "scheduled"        // Shopify: startsAt in the future
  | "active"           // Shopify: currently running
  | "expired"          // Shopify: endsAt has passed
  | "disabled";        // Shopify: manually disabled

/**
 * Value type for the discount amount.
 */
export type PromotionValueType = "percentage" | "fixed_amount";

/**
 * Strategy for resolving which products a promotion applies to.
 * Extensible: add new sources without breaking existing consumers.
 *
 * Phase 6 extensibility:
 *   manual        — explicit product IDs
 *   category      — Agentik catalog category
 *   collection    — Shopify custom collection ID
 *   all_products  — entire store catalog
 *   (future) tags — products matching a tag set
 *   (future) search — products matching a search query
 */
export type PromotionTargetSource =
  | "manual"
  | "category"
  | "collection"
  | "all_products";

/**
 * Origin of a promotion — who or what created it.
 * Stored in the Agentik identity marker; not visible in commercial UI.
 *
 * Future use: "Esta campaña fue creada automáticamente por Copilot."
 */
export type PromotionOrigin =
  | "manual"     // created by a user through the UI
  | "copilot"    // created by Copilot agent on natural language instruction
  | "automation" // created by a scheduled automation or workflow
  | "imported";  // imported from an external system or Shopify directly

// ── Discount code ─────────────────────────────────────────────────────────────

/**
 * A single discount code belonging to a promotion.
 * A promotion may have zero, one, or many codes.
 *
 * Separation principle: a promotion is the campaign mechanics;
 * a code is just one redemption mechanism for it.
 */
export interface PromotionCodeSummary {
  /** Agentik composite ID: "discount_code:{shopify_id}" */
  id:          string;
  /** The redemption code string (e.g. "BIENVENIDA10"). */
  code:        string;
  /** Total number of times this code has been used. */
  usageCount:  number;
  /** Whether this code is currently active (not deleted, promotion not expired). */
  active:      boolean;
  /** ISO8601 creation timestamp. */
  createdAt:   string;
}

// ── Canonical collection model ─────────────────────────────────────────────────

/**
 * Canonical domain model for a Shopify promotion/discount surfaced through Agentik.
 * Used by UI screens, Copilot reasoning, and automation workers.
 * No REST fields, no GraphQL IDs exposed.
 */
export interface ShopifyPromotionSummary {
  /** Composite ID: "price_rule:{shopify_id}" */
  id:               string;
  /** Display title — Agentik identity marker already stripped. */
  title:            string;
  type:             PromotionType;
  status:           PromotionStatus;
  valueType:        PromotionValueType;
  /** Positive number: 20 = 20% off, or 20 = $20 off. */
  value:            number;
  startsAt:         string;      // ISO8601
  endsAt:           string | null;
  targetScope:      PromotionTargetSource;
  /** Estimated number of products affected. Null if not computed. */
  targetCount:      number | null;
  usageLimit:       number | null;
  /** Sum of usage_count across all discount codes for this rule. */
  currentUsage:     number;
  /**
   * Convenience: first discount code, or null for automatic promotions.
   * For the full list, use `codes`.
   */
  code:             string | null;
  /**
   * All discount codes associated with this promotion.
   * Empty in fast list calls; populated after enrichment or explicit fetch.
   */
  codes:            PromotionCodeSummary[];
  /** True if this promotion was created and is managed by Agentik. */
  managedByAgentik: boolean;
  /**
   * Origin of the promotion — for audit and future Copilot explanations.
   * Not shown in the commercial UI; available for agent reasoning.
   */
  origin:           PromotionOrigin;
}

// ── Conflict detection ─────────────────────────────────────────────────────────

/**
 * A detected conflict between a new promotion and an existing one.
 * Conflicts are informational — they do not automatically block creation.
 * Copilot and UI must decide whether to proceed.
 */
export interface PromotionConflict {
  promotionId:    string;
  promotionTitle: string;
  /** Human-readable reason for the conflict. */
  reason:         string;
  /** warning: informational. blocking: strongly recommended to fix first. */
  severity:       "warning" | "blocking";
}

// ── Dry-run result ─────────────────────────────────────────────────────────────

/**
 * Result of a dryRunPromotion / previewPromotionImpact call.
 * Shows exactly what would happen if the promotion were created.
 * No Shopify writes occur during dryRun.
 *
 * Copilot read-aloud format:
 *   "Se aplicará: {valueDisplay}
 *    sobre: {targetDisplay}
 *    Productos afectados: {productsAffected} ({catalogImpactPercent}% del catálogo)
 *    Campañas que coexistirán: {coexistingCampaigns}
 *    Conflictos bloqueantes: {conflictsBlocking}
 *    {conflictSummary}"
 */
export interface PromotionDryRunResult {
  dryRun:               true;
  promotionTitle:       string;
  type:                 PromotionType;
  /** Human-readable value description: "20% de descuento" / "$15 de descuento" */
  valueDisplay:         string;
  /** Human-readable target: "Colección: Juguetes" / "Categoría: Bebé" */
  targetDisplay:        string;
  targetScope:          PromotionTargetSource;
  /** Number of Agentik catalog products that would be affected. */
  productsAffected:     number;
  /** Number of Shopify collections in scope (0 if not collection-based). */
  collectionsAffected:  number;
  /** Agentik category names in scope. */
  categoriesAffected:   string[];
  /** Percentage of total catalog that would receive this promotion. */
  catalogImpactPercent: number;
  /** Active promotions that will coexist without conflict. */
  coexistingCampaigns:  number;
  /** All conflicts (blocking + warning). */
  conflicts:            PromotionConflict[];
  /** Number of blocking conflicts (must resolve before proceeding). */
  conflictsBlocking:    number;
  /** Number of warning conflicts (informational, can proceed). */
  conflictsWarning:     number;
  /** Human-readable conflict narrative. Empty if no conflicts. */
  conflictSummary:      string;
  /** True if there are no blocking conflicts — safe to proceed. */
  canProceed:           boolean;
  /** Full narrative summary for Copilot and UI display. */
  summary:              string;
}

// ── Create / update inputs ─────────────────────────────────────────────────────

/**
 * Input for creating a new promotion.
 * Shared between UI form submissions and Copilot instructions.
 */
export interface PromotionCreateInput {
  title:               string;
  type:                PromotionType;
  valueType:           PromotionValueType;
  /** Positive: 20 = 20% or $20 */
  value:               number;
  startsAt:            string;   // ISO8601
  endsAt?:             string;   // ISO8601, optional
  usageLimit?:         number;
  oncePerCustomer?:    boolean;
  targetScope:         PromotionTargetSource;
  /** For targetScope = "manual" */
  targetProductIds?:   string[];
  /** For targetScope = "collection" */
  targetCollectionIds?: number[];
  /** For targetScope = "category" */
  targetCategory?:     string;
  /** If set, creates a discount code for code-based redemption. */
  code?:               string;
  /**
   * Origin of this creation request.
   * Defaults to "manual" if not supplied (UI form submissions).
   * Copilot passes "copilot"; automation workers pass "automation".
   */
  origin?:             PromotionOrigin;
}

/**
 * Partial update for an existing promotion.
 * Only fields provided are updated.
 */
export type PromotionUpdateInput = Partial<
  Pick<PromotionCreateInput, "title" | "endsAt" | "usageLimit" | "oncePerCustomer">
>;

// ── Operation result ───────────────────────────────────────────────────────────

/**
 * Unified result for create / update / disable / duplicate operations.
 * Designed for Copilot consumption — includes a human-readable message.
 */
export interface PromotionOperationResult {
  ok:          boolean;
  promotion?:  ShopifyPromotionSummary;
  /** Human-readable outcome message. */
  message:     string;
  /** Any non-fatal warnings (e.g. conflict notifications). */
  warnings?:   string[];
  errors?:     string[];
  durationMs:  number;
}

// ── List result ───────────────────────────────────────────────────────────────

export interface PromotionListResult {
  active:    ShopifyPromotionSummary[];
  scheduled: ShopifyPromotionSummary[];
  expired:   ShopifyPromotionSummary[];
  disabled:  ShopifyPromotionSummary[];
  total:     number;
}
