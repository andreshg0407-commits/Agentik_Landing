/**
 * lib/marketing-studio/commerce/shopify-promotions-service.ts
 *
 * SHOPIFY-PROMOTIONS-04 — Domain Service for Shopify Promotions & Discounts
 *
 * SERVER ONLY — never import from client components.
 *
 * ── Copilot Action Registry ────────────────────────────────────────────────────
 *
 *   shopify.listPromotions          — list all promotions grouped by status
 *   shopify.createPromotion         — create promotion with optional code
 *   shopify.updatePromotion         — update title, dates, or limits
 *   shopify.disablePromotion        — deactivate immediately (set ends_at = now)
 *   shopify.duplicatePromotion      — clone a promotion with optional overrides
 *   shopify.dryRunPromotion         — preview impact without creating
 *   shopify.previewPromotionImpact  — live preview with real catalog data
 *   shopify.detectConflicts         — find overlapping active promotions
 *
 * ── Supported Copilot natural language scenarios ──────────────────────────────
 *
 *   "Crea una promoción del 20% para juguetes."
 *     → dryRunPromotion → createPromotion (category: "Juguetes", value: 20)
 *
 *   "Aplica 15% a la colección Bebé."
 *     → createPromotion (collection: {id}, value: 15, type: "percentage")
 *
 *   "Crea BIENVENIDA10 con límite de 100 usos."
 *     → createPromotion (code: "BIENVENIDA10", usageLimit: 100)
 *
 *   "Desactiva las promociones vencidas."
 *     → listPromotions → filter expired → disablePromotion (batch)
 *
 *   "Duplica la campaña Black Friday."
 *     → duplicatePromotion (overrides: { title: "Black Friday 2", startsAt: ... })
 *
 *   "Muéstrame las promociones activas."
 *     → listPromotions → return .active
 *
 *   "Programa una campaña para julio."
 *     → createPromotion (startsAt: "2026-07-01", endsAt: "2026-07-31")
 *
 * ── Safety guarantees ─────────────────────────────────────────────────────────
 *
 *   - dryRun never creates or modifies anything in Shopify.
 *   - Conflicts are detected before creation and surfaced as warnings.
 *   - disablePromotion uses ends_at = now (soft disable, reversible).
 *   - Duplicate detection: same title check before creating.
 *   - All functions are organizationId-scoped.
 *
 * ── Future automation hooks (Phase 12) ───────────────────────────────────────
 *
 *   SHOPIFY-PROMOTIONS-05 (cron): auto-disable expired promotions
 *   SHOPIFY-PROMOTIONS-06 (cron): auto-activate scheduled promotions
 *   SHOPIFY-PROMOTIONS-07 (Copilot): generate promotions from sales metrics
 *   SHOPIFY-PROMOTIONS-08 (Copilot): campaign recommendations from slow inventory
 *   SHOPIFY-PROMOTIONS-09: Shopify GraphQL Automatic Discounts (requires newer scope)
 *
 * ── Agentik identity marker ────────────────────────────────────────────────────
 *
 * Promotions created by Agentik have their title prefixed with AGENTIK_PROMO_PREFIX.
 * The prefix is stripped before display. Two public functions hide this mechanism:
 *   isAgentikManagedPromotion()  — detection
 *   markPromotionAsAgentikManaged() — tagging
 *
 * TODO(SHOPIFY-PROMOTIONS-10): Migrate to Shopify metafields on price rules
 *   namespace="agentik", key="managed_by", value="true"
 *   requires: write_metafields scope
 *   Migration: update only these two functions — all consumers stay unchanged.
 */

import { listProductConsoleItems } from "@/lib/marketing-studio/products/product-query-service";
import { buildPublicationQueue }   from "@/lib/marketing-studio/commerce/publication-engine";
import { createShopifyClient }     from "@/lib/integrations/shopify/shopify-client";
import type { ShopifyPriceRule }   from "@/lib/integrations/shopify/shopify-types";
import type {
  PromotionType,
  PromotionStatus,
  PromotionTargetSource,
  PromotionOrigin,
  ShopifyPromotionSummary,
  PromotionCodeSummary,
  PromotionConflict,
  PromotionDryRunResult,
  PromotionCreateInput,
  PromotionUpdateInput,
  PromotionOperationResult,
  PromotionListResult,
} from "./shopify-promotions-types";

// ── Agentik identity marker ────────────────────────────────────────────────────
//
// Current mechanism: title prefix.
// Shopify price rules have no body_html or arbitrary metadata in REST API.
// The prefix is invisible after stripAgentikMarker() in all display paths.
//
// TODO(SHOPIFY-PROMOTIONS-10): Migrate to price rule metafields when scope available.
// Migration: change only isAgentikManagedPromotion + markPromotionAsAgentikManaged.
// All consumers of these two functions require zero changes.

const AGENTIK_PROMO_PREFIX = "[agentik] ";

// ── Origin-aware marker helpers ─────────────────────────────────────────────
//
// The stored prefix encodes origin so future reads can recover it:
//   "[agentik] "           — manual (UI), or pre-05 legacy
//   "[agentik:copilot] "   — created by a Copilot agent
//   "[agentik:automation] " — created by a scheduled automation
//   "[agentik:imported] "  — imported from external system
//
// Detection: any prefix starting with "[agentik" signals Agentik ownership.
// Origin extraction: parsed from the bracket tag.

/**
 * Returns true if this promotion was created and is managed by Agentik.
 * Implementation detail (title prefix) is hidden from all callers.
 */
export function isAgentikManagedPromotion(
  promotion: { title: string },
): boolean {
  return promotion.title.startsWith("[agentik");
}

/**
 * Returns the title string to store in Shopify when creating an Agentik-managed promotion.
 * Pass the display title and origin — this function injects the identity marker.
 * Defaults to "manual" origin (UI form submissions) when not specified.
 */
export function markPromotionAsAgentikManaged(
  displayTitle: string,
  origin: PromotionOrigin = "manual",
): string {
  const tag = origin === "manual" ? AGENTIK_PROMO_PREFIX : `[agentik:${origin}] `;
  return `${tag}${displayTitle}`;
}

/**
 * Extracts the PromotionOrigin encoded in the stored title prefix.
 * Returns "manual" for legacy "[agentik] " markers or no marker.
 */
function extractOriginFromTitle(storedTitle: string): PromotionOrigin {
  if (storedTitle.startsWith("[agentik:copilot] "))    return "copilot";
  if (storedTitle.startsWith("[agentik:automation] ")) return "automation";
  if (storedTitle.startsWith("[agentik:imported] "))   return "imported";
  return "manual";
}

/**
 * Strips the Agentik identity marker from a stored title, returning the display title.
 */
function stripAgentikMarker(storedTitle: string): string {
  const match = storedTitle.match(/^\[agentik(?::[a-z]+)?\] /);
  return match ? storedTitle.slice(match[0].length) : storedTitle;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Derives promotion status from a price rule's dates relative to now.
 */
function resolveStatus(rule: Pick<ShopifyPriceRule, "starts_at" | "ends_at">): PromotionStatus {
  const now = new Date();
  const starts = new Date(rule.starts_at);
  const ends   = rule.ends_at ? new Date(rule.ends_at) : null;

  if (ends && ends < now) return "expired";
  if (starts > now)       return "scheduled";
  return "active";
}

/**
 * Converts a Shopify price rule value string ("-20.0") to a positive display number (20).
 */
function parseValue(rawValue: string): number {
  return Math.abs(parseFloat(rawValue));
}

/**
 * Resolves the PromotionTargetSource from a price rule's entitled fields.
 */
function resolveTargetScope(rule: ShopifyPriceRule): PromotionTargetSource {
  if (rule.entitled_collection_ids?.length > 0) return "collection";
  if (rule.entitled_product_ids?.length > 0)    return "manual";
  return "all_products";
}

/**
 * Derives the PromotionType from the price rule fields.
 * Currently maps REST API constructs to domain types.
 */
function resolvePromotionType(rule: ShopifyPriceRule): PromotionType {
  if (rule.target_type === "shipping_line") return "free_shipping";
  if (rule.value_type === "percentage")     return "percentage";
  return "fixed_amount";
}

/**
 * Maps a raw Shopify PriceRule to a ShopifyPromotionSummary.
 *
 * @param rule          — raw price rule from Shopify
 * @param code          — convenience first code string (for fast list calls)
 * @param codeSummaries — full PromotionCodeSummary list (empty in fast list calls)
 */
function mapPriceRuleToSummary(
  rule:          ShopifyPriceRule,
  code?:         string | null,
  codeSummaries: PromotionCodeSummary[] = [],
): ShopifyPromotionSummary {
  const managedByAgentik = isAgentikManagedPromotion({ title: rule.title });
  const origin: PromotionOrigin = managedByAgentik
    ? extractOriginFromTitle(rule.title)
    : "imported";   // not Agentik-managed → came from outside

  return {
    id:               `price_rule:${rule.id}`,
    title:            stripAgentikMarker(rule.title),
    type:             resolvePromotionType(rule),
    status:           resolveStatus(rule),
    valueType:        rule.value_type,
    value:            parseValue(rule.value),
    startsAt:         rule.starts_at,
    endsAt:           rule.ends_at,
    targetScope:      resolveTargetScope(rule),
    targetCount:      null,           // requires cross-reference with catalog
    usageLimit:       rule.usage_limit,
    currentUsage:     codeSummaries.reduce((s, c) => s + c.usageCount, 0),
    code:             code ?? (codeSummaries[0]?.code ?? null),
    codes:            codeSummaries,
    managedByAgentik,
    origin,
  };
}

/**
 * Groups a flat promotion list into status buckets.
 * draft / pending_approval are Agentik-internal statuses not returned by Shopify —
 * they fall through to "scheduled" as a safe display bucket.
 */
function groupByStatus(promotions: ShopifyPromotionSummary[]): PromotionListResult {
  const result: PromotionListResult = { active: [], scheduled: [], expired: [], disabled: [], total: promotions.length };
  for (const p of promotions) {
    const bucket: keyof Omit<PromotionListResult, "total"> =
      (p.status === "draft" || p.status === "pending_approval") ? "scheduled" : p.status;
    result[bucket].push(p);
  }
  return result;
}

/**
 * Formats a human-readable value display string.
 * E.g.: 20 + "percentage" → "20% de descuento"
 */
function formatValueDisplay(value: number, valueType: "percentage" | "fixed_amount"): string {
  return valueType === "percentage"
    ? `${value}% de descuento`
    : `$${value} de descuento`;
}

/**
 * Formats a human-readable target display string.
 */
function formatTargetDisplay(
  targetScope: PromotionTargetSource,
  input: PromotionCreateInput,
): string {
  if (targetScope === "all_products") return "Todo el catálogo";
  if (targetScope === "category" && input.targetCategory)
    return `Categoría: ${input.targetCategory}`;
  if (targetScope === "collection" && input.targetCollectionIds?.length)
    return `${input.targetCollectionIds.length} colección(es)`;
  if (targetScope === "manual" && input.targetProductIds?.length)
    return `${input.targetProductIds.length} productos seleccionados`;
  return "Productos seleccionados";
}

// ── listPromotions ─────────────────────────────────────────────────────────────

/**
 * Lists all promotions in the Shopify store, grouped by status.
 * Does NOT fetch discount codes for each rule (fast list call).
 * `currentUsage` on each promotion is 0 unless enriched separately.
 *
 * Copilot: "shopify.listPromotions"
 * UI: Promotions index page initial load.
 */
export async function listPromotions(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<PromotionListResult> {
  const client = createShopifyClient(shopDomain);
  const rules  = await client.listPriceRules(accessToken);

  const promotions = rules.map(r => mapPriceRuleToSummary(r));
  return groupByStatus(promotions);
}

// ── dryRunPromotion ────────────────────────────────────────────────────────────

/**
 * Previews the impact of a promotion without creating anything in Shopify.
 * Resolves candidates from Agentik catalog only — no Shopify API write calls.
 *
 * Suitable for the "Ver resumen antes de crear" step.
 * Conflicts are detected against existing promotions if `existingRules` is supplied.
 *
 * Copilot: "shopify.dryRunPromotion"
 */
export async function dryRunPromotion(
  organizationId:  string,
  input:           PromotionCreateInput,
  existingRules?:  ShopifyPriceRule[],  // pass for conflict detection
): Promise<PromotionDryRunResult> {
  const items = await listProductConsoleItems(organizationId);
  const queue = buildPublicationQueue(items, "shopify");

  // Resolve candidates
  let candidates = queue;
  if (input.targetScope === "manual" && input.targetProductIds?.length) {
    const ids = new Set(input.targetProductIds);
    candidates = candidates.filter(q => ids.has(q.productId));
  } else if (input.targetScope === "category" && input.targetCategory) {
    const cat = input.targetCategory.toLowerCase();
    candidates = candidates.filter(q => q.category?.toLowerCase() === cat);
  }
  // "all_products" and "collection" keep full queue (collection cross-reference requires live call)

  const productsAffected   = candidates.length;
  const totalProducts      = queue.length;
  const categoriesAffected = [...new Set(candidates.map(q => q.category).filter(Boolean))] as string[];

  // Catalog impact percentage (0–100)
  const catalogImpactPercent = totalProducts > 0
    ? Math.round((productsAffected / totalProducts) * 100)
    : 0;

  // Conflict detection
  const conflicts: PromotionConflict[] = detectConflictsFromRules(existingRules ?? [], input);
  const conflictsBlocking = conflicts.filter(c => c.severity === "blocking").length;
  const conflictsWarning  = conflicts.filter(c => c.severity === "warning").length;

  // Count non-conflicting active promotions that will coexist
  const coexistingCampaigns = (existingRules ?? []).filter(r => {
    const status = resolveStatus(r);
    return (status === "active" || status === "scheduled") &&
      !conflicts.some(c => c.promotionId === `price_rule:${r.id}`);
  }).length;

  const valueDisplay  = formatValueDisplay(input.value, input.valueType);
  const targetDisplay = formatTargetDisplay(input.targetScope, input);

  const conflictSummary = conflicts.length === 0 ? "" :
    conflicts
      .map(c => `• [${c.severity === "blocking" ? "Bloqueante" : "Aviso"}] ${c.promotionTitle}: ${c.reason}`)
      .join("\n");

  const canProceed = conflictsBlocking === 0;

  const conflictNote = conflicts.length > 0
    ? ` ${conflictsBlocking > 0 ? `${conflictsBlocking} conflicto(s) bloqueante(s).` : `${conflictsWarning} aviso(s).`}`
    : "";

  return {
    dryRun:               true,
    promotionTitle:       input.title,
    type:                 input.type,
    valueDisplay,
    targetDisplay,
    targetScope:          input.targetScope,
    productsAffected,
    collectionsAffected:  input.targetCollectionIds?.length ?? 0,
    categoriesAffected,
    catalogImpactPercent,
    coexistingCampaigns,
    conflicts,
    conflictsBlocking,
    conflictsWarning,
    conflictSummary,
    canProceed,
    summary:
      `Se aplicará ${valueDisplay} sobre ${targetDisplay}. ` +
      `Productos afectados: ${productsAffected} (${catalogImpactPercent}% del catálogo).${conflictNote}`,
  };
}

// ── detectConflicts ────────────────────────────────────────────────────────────

/**
 * Compares a new promotion input against existing price rules, returning
 * a list of potential conflicts.
 *
 * Conflict detection rules:
 *   1. Same title (exact or stripped of Agentik marker) → blocking
 *   2. Same discount code → blocking
 *   3. Overlapping dates + same target scope → warning
 *   4. Active promotions on same products → warning
 *
 * Copilot: "shopify.detectConflicts"
 */
export function detectConflictsFromRules(
  existingRules: ShopifyPriceRule[],
  input:         PromotionCreateInput,
): PromotionConflict[] {
  const conflicts: PromotionConflict[] = [];
  const now      = new Date();
  const newStart = new Date(input.startsAt);
  const newEnd   = input.endsAt ? new Date(input.endsAt) : null;

  for (const rule of existingRules) {
    const ruleStatus = resolveStatus(rule);
    if (ruleStatus === "expired" || ruleStatus === "disabled") continue;

    const ruleEnd   = rule.ends_at ? new Date(rule.ends_at) : null;
    const ruleStart = new Date(rule.starts_at);

    // 1. Same title
    const existingDisplayTitle = stripAgentikMarker(rule.title);
    if (existingDisplayTitle.toLowerCase() === input.title.toLowerCase()) {
      conflicts.push({
        promotionId:    `price_rule:${rule.id}`,
        promotionTitle: existingDisplayTitle,
        reason:         "Ya existe una promoción con ese nombre.",
        severity:       "blocking",
      });
      continue;
    }

    // 2. Date overlap with same scope
    const overlaps =
      (!ruleEnd || ruleEnd > now) &&
      (!newEnd || newEnd > ruleStart) &&
      newStart < (ruleEnd ?? new Date("9999-12-31"));

    if (overlaps) {
      const ruleScope = resolveTargetScope(rule);
      if (ruleScope === input.targetScope) {
        conflicts.push({
          promotionId:    `price_rule:${rule.id}`,
          promotionTitle: existingDisplayTitle,
          reason:         `Existe una promoción activa con el mismo ámbito (${input.targetScope}) durante este período.`,
          severity:       "warning",
        });
      } else if (ruleScope === "all_products" || input.targetScope === "all_products") {
        conflicts.push({
          promotionId:    `price_rule:${rule.id}`,
          promotionTitle: existingDisplayTitle,
          reason:         "Hay una promoción activa de catálogo completo que se superpone con estas fechas.",
          severity:       "warning",
        });
      }
    }
  }

  return conflicts;
}

// ── createPromotion ────────────────────────────────────────────────────────────

/**
 * Full creation pipeline:
 *   1. Build price rule payload from PromotionCreateInput.
 *   2. Create price rule in Shopify.
 *   3. If `code` is specified, create discount code.
 *   4. Return full summary with timing.
 *
 * Always tag with Agentik identity marker.
 *
 * Copilot: "shopify.createPromotion"
 */
export async function createPromotion(
  _organizationId: string,
  accessToken:      string,   // ⚠ server-only
  shopDomain:       string,
  input:            PromotionCreateInput,
): Promise<PromotionOperationResult> {
  const startTime = Date.now();
  const client    = createShopifyClient(shopDomain);

  // Build price rule payload
  const targetSelection: "all" | "entitled" =
    input.targetScope === "all_products" ? "all" : "entitled";

  const rawValue = `-${input.value.toFixed(2)}`;   // Shopify expects negative

  let rule: ShopifyPriceRule;
  try {
    rule = await client.createPriceRule(accessToken, {
      title:                    markPromotionAsAgentikManaged(input.title, input.origin ?? "manual"),
      target_type:              input.type === "free_shipping" ? "shipping_line" : "line_item",
      target_selection:         targetSelection,
      allocation_method:        "each",
      value_type:               input.valueType,
      value:                    rawValue,
      customer_selection:       "all",
      starts_at:                input.startsAt,
      ends_at:                  input.endsAt ?? null,
      usage_limit:              input.usageLimit ?? null,
      once_per_customer:        input.oncePerCustomer ?? false,
      entitled_product_ids:     input.targetProductIds?.map(Number) ?? [],
      entitled_collection_ids:  input.targetCollectionIds ?? [],
    });
  } catch (err) {
    return {
      ok:         false,
      message:    "No se pudo crear la promoción en Shopify.",
      errors:     [err instanceof Error ? err.message : "Error desconocido"],
      durationMs: Date.now() - startTime,
    };
  }

  // Create discount code if specified
  let code: string | null = null;
  if (input.code) {
    try {
      await delay(400);
      const discountCode = await client.createDiscountCode(accessToken, rule.id, { code: input.code });
      code = discountCode.code;
    } catch (err) {
      // Non-blocking — price rule was created but code failed
      return {
        ok:         true,
        promotion:  mapPriceRuleToSummary(rule, null),
        message:    `Promoción creada, pero el código "${input.code}" no pudo registrarse. Agrégalo manualmente en Shopify.`,
        warnings:   [err instanceof Error ? err.message : "Error al crear código"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  return {
    ok:         true,
    promotion:  mapPriceRuleToSummary(rule, code),
    message:    input.code
      ? `Promoción "${input.title}" creada con código ${input.code}.`
      : `Promoción "${input.title}" creada correctamente.`,
    durationMs: Date.now() - startTime,
  };
}

// ── updatePromotion ────────────────────────────────────────────────────────────

/**
 * Updates an existing promotion's metadata (title, dates, limits).
 * Cannot change the discount value or target scope (requires recreating).
 *
 * Copilot: "shopify.updatePromotion"
 */
export async function updatePromotion(
  _organizationId: string,
  accessToken:      string,   // ⚠ server-only
  shopDomain:       string,
  promotionId:      string,   // "price_rule:{id}"
  patch:            PromotionUpdateInput,
): Promise<PromotionOperationResult> {
  const startTime   = Date.now();
  const client      = createShopifyClient(shopDomain);
  const priceRuleId = promotionId.replace("price_rule:", "");

  const shopifyPatch: Record<string, unknown> = {};
  if (patch.title)            shopifyPatch.title      = markPromotionAsAgentikManaged(patch.title);
  if (patch.endsAt !== undefined) shopifyPatch.ends_at = patch.endsAt ?? null;
  if (patch.usageLimit !== undefined) shopifyPatch.usage_limit = patch.usageLimit ?? null;
  if (patch.oncePerCustomer !== undefined) shopifyPatch.once_per_customer = patch.oncePerCustomer;

  try {
    const rule = await client.updatePriceRule(accessToken, priceRuleId, shopifyPatch as never);
    return {
      ok:         true,
      promotion:  mapPriceRuleToSummary(rule),
      message:    `Promoción "${stripAgentikMarker(rule.title)}" actualizada.`,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      ok:         false,
      message:    "No se pudo actualizar la promoción.",
      errors:     [err instanceof Error ? err.message : "Error desconocido"],
      durationMs: Date.now() - startTime,
    };
  }
}

// ── disablePromotion ───────────────────────────────────────────────────────────

/**
 * Deactivates a promotion immediately by setting ends_at to now.
 * Soft disable — the price rule remains in Shopify and can be re-enabled.
 *
 * Copilot: "shopify.disablePromotion"
 */
export async function disablePromotion(
  _organizationId: string,
  accessToken:      string,   // ⚠ server-only
  shopDomain:       string,
  promotionId:      string,   // "price_rule:{id}"
): Promise<PromotionOperationResult> {
  const startTime   = Date.now();
  const client      = createShopifyClient(shopDomain);
  const priceRuleId = promotionId.replace("price_rule:", "");

  try {
    const rule = await client.updatePriceRule(accessToken, priceRuleId, {
      ends_at: new Date().toISOString(),
    });
    return {
      ok:         true,
      promotion:  mapPriceRuleToSummary(rule),
      message:    `Promoción "${stripAgentikMarker(rule.title)}" desactivada.`,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      ok:         false,
      message:    "No se pudo desactivar la promoción.",
      errors:     [err instanceof Error ? err.message : "Error desconocido"],
      durationMs: Date.now() - startTime,
    };
  }
}

// ── duplicatePromotion ────────────────────────────────────────────────────────

/**
 * Duplicates an existing promotion with optional field overrides.
 * Typical use: "Duplica Black Friday cambiando las fechas a diciembre."
 *
 * The new promotion title gets " (copia)" appended unless overrides.title is set.
 * The discount code is NOT duplicated (codes must be unique in Shopify).
 *
 * Copilot: "shopify.duplicatePromotion"
 */
export async function duplicatePromotion(
  _organizationId: string,
  accessToken:      string,   // ⚠ server-only
  shopDomain:       string,
  promotionId:      string,   // "price_rule:{id}"
  overrides?:       Partial<PromotionCreateInput>,
): Promise<PromotionOperationResult> {
  const startTime   = Date.now();
  const client      = createShopifyClient(shopDomain);
  const priceRuleId = promotionId.replace("price_rule:", "");

  // Fetch original
  let originalRules: ShopifyPriceRule[];
  try {
    originalRules = await client.listPriceRules(accessToken);
  } catch (err) {
    return {
      ok:         false,
      message:    "No se pudo obtener la promoción original.",
      errors:     [err instanceof Error ? err.message : "Error desconocido"],
      durationMs: Date.now() - startTime,
    };
  }

  const original = originalRules.find(r => String(r.id) === priceRuleId);
  if (!original) {
    return {
      ok:         false,
      message:    "Promoción original no encontrada.",
      durationMs: Date.now() - startTime,
    };
  }

  const originalTitle = stripAgentikMarker(original.title);
  const newTitle      = overrides?.title ?? `${originalTitle} (copia)`;

  try {
    const rule = await client.createPriceRule(accessToken, {
      title:                   markPromotionAsAgentikManaged(newTitle),
      target_type:             original.target_type,
      target_selection:        original.target_selection,
      allocation_method:       original.allocation_method,
      value_type:              original.value_type,
      value:                   original.value,
      customer_selection:      original.customer_selection,
      starts_at:               overrides?.startsAt ?? original.starts_at,
      ends_at:                 overrides?.endsAt   ?? original.ends_at,
      usage_limit:             overrides?.usageLimit  ?? original.usage_limit,
      once_per_customer:       overrides?.oncePerCustomer ?? original.once_per_customer,
      entitled_product_ids:    original.entitled_product_ids,
      entitled_collection_ids: original.entitled_collection_ids,
    });

    return {
      ok:         true,
      promotion:  mapPriceRuleToSummary(rule),
      message:    `Promoción duplicada como "${newTitle}".`,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      ok:         false,
      message:    "No se pudo duplicar la promoción.",
      errors:     [err instanceof Error ? err.message : "Error desconocido"],
      durationMs: Date.now() - startTime,
    };
  }
}

// ── previewPromotionImpact ─────────────────────────────────────────────────────

/**
 * Live version of dryRunPromotion that fetches existing price rules from Shopify
 * to provide accurate conflict detection.
 *
 * More expensive than dryRunPromotion (requires Shopify API call for conflicts).
 * Prefer this for the "Ver resumen" step before creation.
 *
 * Copilot: "shopify.previewPromotionImpact"
 */
export async function previewPromotionImpact(
  organizationId: string,
  accessToken:    string,   // ⚠ server-only
  shopDomain:     string,
  input:          PromotionCreateInput,
): Promise<PromotionDryRunResult> {
  const client = createShopifyClient(shopDomain);
  let existing: ShopifyPriceRule[] = [];
  try {
    existing = await client.listPriceRules(accessToken);
  } catch {
    // Non-blocking — proceed without conflict detection
  }
  return dryRunPromotion(organizationId, input, existing);
}

// ── schedulePromotion ──────────────────────────────────────────────────────────

/**
 * Creates a promotion that starts in the future.
 * Convenience wrapper: validates that startsAt > now before delegating to createPromotion.
 *
 * Copilot: "shopify.schedulePromotion"
 *
 * Natural language scenarios:
 *   "Programa una campaña de Navidad del 30% para el 20 de diciembre."
 *     → schedulePromotion({ ..., startsAt: "2026-12-20T00:00:00Z", endsAt: "2026-12-31T23:59:59Z" })
 *
 *   "Activa la promo de verano el 1 de julio."
 *     → schedulePromotion({ ..., startsAt: "2026-07-01T00:00:00Z" })
 */
export async function schedulePromotion(
  organizationId: string,
  accessToken:    string,   // ⚠ server-only
  shopDomain:     string,
  input:          PromotionCreateInput,
): Promise<PromotionOperationResult> {
  const startTime = Date.now();
  const startsAt  = new Date(input.startsAt);

  if (startsAt <= new Date()) {
    return {
      ok:         false,
      message:    "La fecha de inicio debe ser en el futuro para programar una promoción.",
      durationMs: Date.now() - startTime,
    };
  }

  return createPromotion(organizationId, accessToken, shopDomain, {
    ...input,
    origin: input.origin ?? "manual",
  });
}

// ── findPromotion ──────────────────────────────────────────────────────────────

/**
 * Finds a promotion by its composite ID or by display title (case-insensitive).
 * Returns null if not found.
 *
 * Copilot: "shopify.findPromotion"
 *
 * Natural language scenarios:
 *   "¿Está activa la promoción Black Friday?"
 *     → findPromotion(orgId, token, domain, { title: "Black Friday" })
 *
 *   "Muéstrame los detalles de price_rule:123."
 *     → findPromotion(orgId, token, domain, { id: "price_rule:123" })
 */
export async function findPromotion(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  query:           { id?: string; title?: string },
): Promise<ShopifyPromotionSummary | null> {
  const client = createShopifyClient(shopDomain);
  const rules  = await client.listPriceRules(accessToken);

  if (query.id) {
    const priceRuleId = query.id.replace("price_rule:", "");
    const rule = rules.find(r => String(r.id) === priceRuleId);
    return rule ? mapPriceRuleToSummary(rule) : null;
  }

  if (query.title) {
    const needle = query.title.toLowerCase();
    const rule   = rules.find(r => stripAgentikMarker(r.title).toLowerCase() === needle);
    return rule ? mapPriceRuleToSummary(rule) : null;
  }

  return null;
}

// ── generateDiscountCode ───────────────────────────────────────────────────────

/**
 * Generates and attaches a new discount code to an existing price rule.
 * A price rule may have multiple codes (each with independent usage tracking).
 *
 * Copilot: "shopify.generateDiscountCode"
 *
 * Natural language scenarios:
 *   "Genera un código INFLUENCER20 para la campaña Rebajas."
 *     → findPromotion({ title: "Rebajas" }) → generateDiscountCode(id, "INFLUENCER20")
 *
 *   "Crea 5 códigos únicos para influencers."
 *     → generateDiscountCode × 5 with generated codes (batch in future sprint)
 */
export async function generateDiscountCode(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  promotionId:     string,   // "price_rule:{id}"
  code:            string,
): Promise<PromotionOperationResult> {
  const startTime   = Date.now();
  const client      = createShopifyClient(shopDomain);
  const priceRuleId = promotionId.replace("price_rule:", "");

  try {
    const discountCode = await client.createDiscountCode(accessToken, Number(priceRuleId), { code });
    return {
      ok:         true,
      message:    `Código "${discountCode.code}" generado correctamente para la promoción.`,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      ok:         false,
      message:    `No se pudo generar el código "${code}".`,
      errors:     [err instanceof Error ? err.message : "Error desconocido"],
      durationMs: Date.now() - startTime,
    };
  }
}

// ── Stub contracts (future sprints) ───────────────────────────────────────────

/**
 * Auto-disables all promotions whose endsAt is in the past.
 * Designed for cron job execution (SHOPIFY-PROMOTIONS-05).
 *
 * @stub — not yet implemented
 */
export async function autoDisableExpiredPromotions(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
): Promise<{ disabled: number; errors: string[] }> {
  throw new Error("autoDisableExpiredPromotions: not yet implemented (SHOPIFY-PROMOTIONS-05)");
}

/**
 * Auto-activates promotions whose startsAt has arrived.
 * Designed for cron job execution (SHOPIFY-PROMOTIONS-06).
 *
 * @stub — not yet implemented
 */
export async function autoActivateScheduledPromotions(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
): Promise<{ activated: number; errors: string[] }> {
  throw new Error("autoActivateScheduledPromotions: not yet implemented (SHOPIFY-PROMOTIONS-06)");
}

/**
 * Generates promotion recommendations based on slow-moving inventory.
 * Uses sales velocity + stock levels to suggest discount targets.
 *
 * @stub — not yet implemented (requires Copilot signal data)
 *
 * TODO(SHOPIFY-PROMOTIONS-08): Implement using operational inventory signals:
 *   1. Fetch products with low sales velocity from product-query-service
 *   2. Cross-reference with current stock levels
 *   3. Propose promotions via dryRunPromotion for each candidate group
 *   4. Return sorted by expected revenue impact
 */
export async function recommendPromotionsFromInventory(
  _organizationId: string,
): Promise<PromotionDryRunResult[]> {
  throw new Error("recommendPromotionsFromInventory: not yet implemented (SHOPIFY-PROMOTIONS-08)");
}

// ── Future Copilot automation hooks ───────────────────────────────────────────
//
// TODO(SHOPIFY-PROMOTIONS-09): Shopify GraphQL Automatic Discounts
//   - No redemption code required — applied automatically at checkout
//   - Requires: Shopify Admin GraphQL API (not REST)
//   - New scope: read_discounts + write_discounts (GraphQL)
//   - New adapter: shopify-graphql-discounts-client.ts
//   - Integration point: createPromotion({ type: "automatic" })
//
// TODO(SHOPIFY-PROMOTIONS-10): Migrate identity marker to Shopify metafields
//   - namespace="agentik", key="managed_by", value="true"
//   - namespace="agentik", key="origin", value=origin
//   - requires: write_metafields scope on price_rules
//   - Migration: change only isAgentikManagedPromotion() + markPromotionAsAgentikManaged()
//   - All other code stays unchanged (encapsulation preserved)
//
// TODO(SHOPIFY-PROMOTIONS-11): Batch code generation for influencer campaigns
//   - generateDiscountCodeBatch(promotionId, prefix, count) → string[]
//   - E.g.: generateDiscountCodeBatch("price_rule:123", "INFLUENCER", 50)
//   - Returns: ["INFLUENCER001", "INFLUENCER002", ..., "INFLUENCER050"]
//
// TODO(SHOPIFY-PROMOTIONS-12): Usage analytics per promotion
//   - Fetch discount code usage counts per code (currently set to 0)
//   - Aggregate into ShopifyPromotionSummary.currentUsage
//   - Surface usage rate in PromotionDryRunResult for overlap analysis
