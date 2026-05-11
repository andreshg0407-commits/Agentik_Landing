/**
 * business-structure/types.ts
 *
 * Core type definitions for the Castillitos Business Structure Engine.
 *
 * Three orthogonal dimensions:
 *
 *   BusinessLine     — commercial brand / product line (WHAT we sell)
 *   SalesChannelKey  — go-to-market channel           (HOW we sell)
 *   OperatingUnitKey — physical / virtual location    (WHERE we sell from)
 *
 * These are intentionally separate from:
 *   - sagSourceType  (OFICIAL / REMISION) — financial source truth
 *   - businessOwner  (CASTILLITOS / ARKETOPS) — accounting entity
 *   - SaleChannel    (Prisma enum) — raw DB storage value
 *
 * None of these values are stored in the DB yet — they are computed at
 * runtime from SaleRecord fields via the inference layer (inference.ts).
 */

// ── Business Line ─────────────────────────────────────────────────────────────

/**
 * Commercial brand / product line.
 *
 * CASTILLITOS  — core Castillitos brand (default)
 * LATIN_KIDS   — internal kids brand operated by Castillitos
 * IMPORTACION  — imported goods line (pending accounting confirmation)
 * PETS         — pet supplies line
 * OTHER        — "OTROS" in business parlance: FINANCIAL_ONLY line used exclusively
 *                to invoice packaging bags (bolsas de empaque) as required by Colombian
 *                tax law. Carries NO product, NO campaign, NO creative content.
 *                Visible in: finance reports, invoicing, audits.
 *                Invisible in: Marketing Studio, copilot, presets, prompts.
 */
export type BusinessLine =
  | "CASTILLITOS"
  | "LATIN_KIDS"
  | "IMPORTACION"
  | "PETS"
  | "OTHER";

// ── Sales Channel ─────────────────────────────────────────────────────────────

/**
 * Go-to-market channel — how the sale reached the customer.
 *
 * EMPRESA      — B2B direct sales (empresas, institucional)
 * MAYORISTAS   — wholesale distributors (bulk, resale)
 * TIENDAS      — physical retail stores (almacén / punto de venta)
 * WEB          — e-commerce / online
 * TELEFONO     — phone / call-center orders
 * REMISIONES   — dispatch flow / F2 (remisión, no factura yet)
 * OTHER        — unclassified or legacy
 */
export type SalesChannelKey =
  | "EMPRESA"
  | "MAYORISTAS"
  | "TIENDAS"
  | "WEB"
  | "TELEFONO"
  | "REMISIONES"
  | "OTHER";

// ── Operating Unit ────────────────────────────────────────────────────────────

/**
 * Physical or virtual operating location.
 *
 * SAN_DIEGO  — bodega / punto principal San Diego
 * GRAN_PLAZA — punto Gran Plaza
 * CENTRO     — punto Centro
 * CALDAS     — punto Caldas
 * WEB        — web / virtual unit (no physical location)
 * OTHER      — unclassified or consolidation
 */
export type OperatingUnitKey =
  | "SAN_DIEGO"
  | "GRAN_PLAZA"
  | "CENTRO"
  | "CALDAS"
  | "WEB"
  | "OTHER";

// ── Composite snapshot ────────────────────────────────────────────────────────

/**
 * All three dimensions inferred for a single SaleRecord.
 * Produced by inferBusinessDimensions() in inference.ts.
 */
export interface BusinessDimensions {
  businessLine:    BusinessLine;
  salesChannel:    SalesChannelKey;
  operatingUnit:   OperatingUnitKey;
  /** True when any dimension fell back to OTHER due to missing mapping. */
  hasUnknownDimension: boolean;
}
