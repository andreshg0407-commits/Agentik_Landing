/**
 * lib/sag/articulos/normalizer.ts
 *
 * Converts raw article data (from any source) to a clean SagProductInput
 * ready for the XML builder and validator.
 *
 * Three entry points:
 *
 *   normalizeArticuloForm(form)
 *     Called by the manual form preview / enqueue API routes.
 *     Accepts ArticuloFormData (camelCase HTML form fields).
 *
 *   normalizeShopifyProduct(product)
 *     Called by the Shopify product sync adapter (future).
 *     Maps Shopify variant schema → SagProductInput.
 *
 *   buildArticuloPayload(input, opts)
 *     Final step used by ANY caller to build the exact POST body
 *     for POST /api/orgs/[orgSlug]/sag/write.
 *     Accepts an already-normalized SagProductInput.
 *
 * The separation between normalizer (input-format-specific) and
 * buildArticuloPayload (format-agnostic) makes it safe to reuse
 * this module from photo-to-product AI flows, CSV catalog imports,
 * and the Luca marketing module without duplicating payload logic.
 */

import type { SagProductInput } from "@/lib/sag/write/types";

// ── Raw form shape (camelCase, HTML inputs) ───────────────────────────────────

export interface ArticuloFormData {
  // Required
  codigo:              string;
  descripcion:         string;
  pv1:                 string;  // base price → PRECIO (numeric string)

  // Classification
  grupo:               string;
  subGrupo:            string;
  linea:               string;
  marca:               string;
  referencia:          string;

  // Logistics
  unidad:              string;
  manejaKardex:        string;  // "S" | "N"
  manejaTallaColor:    string;  // "S" | "N"
  talla:               string;
  color:               string;
  manejaLote:          string;  // "S" | "N" — safe default "N"

  // Pricing / tax
  tarifaIVA:           string;
  porcentajeIVA:       string;  // 0 | 5 | 19 as numeric string
  costo:               string;  // numeric string
  incluidoIVA:         string;  // "S" | "N" — safe default "N"

  // Commerce
  composicion:         string;  // "S" | "N"
  adquisicion:         string;
  tiendaVirtual:       string;  // "S" | "N"

  // Status
  activo:              string;  // "S" | "N" — safe default "S"
  bloqueado:           string;  // "S" | "N" — safe default "N"
}

// ── Shopify product shape (future integration) ────────────────────────────────
//
// Matches the fields available in Shopify's Product + Variant objects.
// Only the fields needed to build a SagProductInput are listed here.
// The full Shopify type lives in the Shopify adapter; this is the
// minimum contract this module needs.

export interface ShopifyProductSnap {
  sku:          string;          // → CODIGO
  title:        string;          // → DESCRIPCION
  vendor?:      string;          // → MARCA
  productType?: string;          // → LINEA
  price:        string;          // decimal string → PRECIO
  compareAtPrice?: string;       // → COSTO (if present)
  taxable:      boolean;         // if true → IVA = 19, else IVA = 0
  barcode?:     string;          // → REFERENCIA
  tags?:        string[];        // first tag → GRUPO, second → SUB_GRUPO (convention)
  publishedAt?: string | null;   // null → ACTIVO = "N"
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function trimStr(s: string): string | undefined {
  const v = s?.trim();
  return v || undefined;
}

function trimUpper(s: string): string | undefined {
  const v = s?.trim().toUpperCase();
  return v || undefined;
}

function positiveNum(s: string): number | undefined {
  if (!s?.trim()) return undefined;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return isFinite(n) && n >= 0 ? n : undefined;
}

function snFlag(s: string): "S" | "N" | undefined {
  if (s === "S" || s === "N") return s;
  return undefined;
}

// ── Form normalizer ────────────────────────────────────────────────────────────

/**
 * Convert raw HTML form data to SagProductInput.
 * All safe defaults are applied here so the validator receives clean data.
 */
export function normalizeArticuloForm(form: ArticuloFormData): SagProductInput {
  return {
    // Required
    CODIGO:              form.codigo.trim().toUpperCase(),
    DESCRIPCION:         form.descripcion.trim().toUpperCase(),
    PRECIO:              positiveNum(form.pv1) ?? 0,

    // Classification
    GRUPO:               trimUpper(form.grupo),
    SUB_GRUPO:           trimUpper(form.subGrupo),
    LINEA:               trimUpper(form.linea),
    MARCA:               trimUpper(form.marca),
    REFERENCIA:          trimStr(form.referencia),

    // Logistics
    UNIDAD:              trimUpper(form.unidad) ?? "UND",
    MANEJA_KARDEX:       snFlag(form.manejaKardex) ?? "S",
    MANEJA_TALLA_COLOR:  snFlag(form.manejaTallaColor) ?? "N",
    TALLA:               trimStr(form.talla),
    COLOR:               trimStr(form.color),
    MANEJA_LOTE:         snFlag(form.manejaLote) ?? "N",

    // Pricing / tax
    TARIFA_IVA:          trimStr(form.tarifaIVA),
    IVA:                 positiveNum(form.porcentajeIVA),
    INCLUIDO_IVA:        snFlag(form.incluidoIVA) ?? "N",
    COSTO:               positiveNum(form.costo),

    // Commerce
    COMPOSICION:         snFlag(form.composicion) ?? "N",
    ADQUISICION:         trimStr(form.adquisicion),
    TIENDA_VIRTUAL:      snFlag(form.tiendaVirtual) ?? "N",

    // Status — safe defaults
    ACTIVO:              snFlag(form.activo) ?? "S",
    BLOQUEADO:           snFlag(form.bloqueado) ?? "N",
  };
}

// ── Shopify normalizer (future) ───────────────────────────────────────────────

/**
 * Convert a Shopify Product snapshot to SagProductInput.
 *
 * Called from:
 *   lib/connectors/adapters/shopify/sag-sync.ts  (future module)
 *
 * After normalization, callers should call buildArticuloPayload() and
 * then POST to /api/orgs/[orgSlug]/sag/write — exactly the same pipeline
 * as the manual form, with the same audit trail and mandatory approval.
 */
export function normalizeShopifyProduct(product: ShopifyProductSnap): SagProductInput {
  const tags  = product.tags ?? [];
  const price = Number(product.price) || 0;
  const costo = product.compareAtPrice ? Number(product.compareAtPrice) : undefined;

  return {
    CODIGO:          product.sku.trim().toUpperCase(),
    DESCRIPCION:     product.title.trim().toUpperCase(),
    PRECIO:          price,
    MARCA:           product.vendor?.trim().toUpperCase() || undefined,
    LINEA:           product.productType?.trim().toUpperCase() || undefined,
    REFERENCIA:      product.barcode?.trim() || undefined,
    GRUPO:           tags[0]?.trim().toUpperCase() || undefined,
    SUB_GRUPO:       tags[1]?.trim().toUpperCase() || undefined,
    UNIDAD:          "UND",
    IVA:             product.taxable ? 19 : 0,
    COSTO:           costo && costo > price ? costo : undefined,
    TIENDA_VIRTUAL:  "S",    // Shopify products are online by default
    MANEJA_KARDEX:   "S",
    MANEJA_TALLA_COLOR: "N",
    MANEJA_LOTE:     "N",
    COMPOSICION:     "N",
    INCLUIDO_IVA:    "N",
    ACTIVO:          product.publishedAt !== null ? "S" : "N",
    BLOQUEADO:       "N",
  };
}

// ── Payload builder (format-agnostic) ─────────────────────────────────────────

export interface ArticuloEnqueueOpts {
  /** Free-text description for the approval UI */
  description:  string;
  /** External reference: sourceRef stored in the operation for traceability */
  sourceRef?:   string;
}

/**
 * Build the exact POST body for POST /api/orgs/[orgSlug]/sag/write.
 *
 * Accepts any already-normalized SagProductInput — from the form,
 * from Shopify, from a CSV import, or from a photo-to-product AI flow.
 *
 * This is the single assembly point so every caller produces identical
 * queue entries regardless of input origin.
 */
export function buildArticuloPayload(
  input:   SagProductInput,
  opts:    ArticuloEnqueueOpts,
): { input: { type: 5; payload: SagProductInput }; description: string; sourceRef?: string } {
  return {
    input: { type: 5, payload: input },
    description: opts.description,
    sourceRef:   opts.sourceRef,
  };
}
