/**
 * lib/marketing-studio/library/readiness.ts
 *
 * MS-04C — Destination Readiness Rule System
 *
 * Rule-based evaluation of how ready an asset is for each destination,
 * given its current metadata snapshot.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Each destination has required + preferred fields.
 *   Missing required → "partial" or "not_ready" based on channel enablement.
 *   All required present → "ready" (if channel enabled).
 *   Channel not enabled → "not_ready" regardless of metadata.
 *
 * ── CONSUMERS ─────────────────────────────────────────────────────────────────
 *   - AssetDetailDrawer (destination readiness section)
 *   - ApprovalMetadataPanel (shows what becomes ready post-approval)
 *   - Future: scoring engine + export validators
 */

import type { AssetDestination } from "./product-attributes";

// ── Asset metadata snapshot ────────────────────────────────────────────────────

/**
 * AssetMetadataSnapshot — the metadata fields we know about an asset.
 * Built from BibliotecaAssetDisplay + approval form data.
 * PLACEHOLDER fields will be populated from real Prisma metadata in MS-05+.
 */
export interface AssetMetadataSnapshot {
  // Core
  name?:             string;
  sku?:              string;
  category?:         string;
  channels:          string[];

  // Commercial
  hasPrice?:         boolean;
  price?:            string;
  hasDescription?:   boolean;
  description?:      string;
  commercialStatus?: string;    // "active" | "draft" | "discontinued"
  usagePermission?:  string;

  // Visual variants
  hasVariant1_1?:    boolean;
  hasVariant9_16?:   boolean;
  hasVariantBanner?: boolean;

  // CRM-specific
  crmName?:          string;
  productLine?:      string;
  segment?:          string;
  salesArgument?:    string;
  availability?:     string;
  notes?:            string;

  // Dynamic attributes (from ATTRIBUTE_SCHEMAS)
  attributes?:       Record<string, unknown>;
}

// ── Readiness result types ─────────────────────────────────────────────────────

export interface FieldReadiness {
  key:     string;
  label:   string;
  present: boolean;
}

export interface DestinationReadinessResult {
  destination: AssetDestination;
  label:       string;
  /** Ready = all required fields present + channel enabled. */
  status:      "ready" | "partial" | "not_ready";
  /** Labels of missing required fields. */
  missing:     string[];
  /** Full field breakdown for detailed view. */
  fields:      FieldReadiness[];
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function present(v: string | boolean | number | undefined | null): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string")  return v.trim().length > 0;
  if (typeof v === "boolean") return v;
  return true;
}

function channelEnabled(meta: AssetMetadataSnapshot, ch: string): boolean {
  return meta.channels.includes(ch);
}

function deriveStatus(
  enabled:  boolean,
  fields:   FieldReadiness[],
): "ready" | "partial" | "not_ready" {
  if (!enabled) return "not_ready";
  const totalRequired = fields.filter(f => !f.present).length;
  if (totalRequired === 0) return "ready";
  if (totalRequired < fields.length) return "partial";
  return "partial"; // at least "partial" if channel is enabled
}

// ── Readiness rules ────────────────────────────────────────────────────────────

/**
 * computeDestinationReadiness — evaluates all 6 destinations against a metadata snapshot.
 * Returns a result for each destination with status, missing fields, and field breakdown.
 */
export function computeDestinationReadiness(
  meta: AssetMetadataSnapshot,
): DestinationReadinessResult[] {

  // ── Shopify ──
  const shopifyEnabled = channelEnabled(meta, "shopify");
  const shopifyFields: FieldReadiness[] = [
    { key: "name",           label: "Nombre comercial",    present: present(meta.name) },
    { key: "sku",            label: "SKU o código",        present: present(meta.sku) },
    { key: "category",       label: "Categoría",           present: present(meta.category) },
    { key: "hasPrice",       label: "Precio base",         present: present(meta.hasPrice || meta.price) },
    { key: "hasDescription", label: "Descripción corta",   present: present(meta.hasDescription || meta.description) },
  ];
  const shopifyMissing = shopifyFields.filter(f => !f.present).map(f => f.label);

  // ── WhatsApp ──
  const waEnabled = channelEnabled(meta, "whatsapp");
  const waFields: FieldReadiness[] = [
    { key: "name",         label: "Nombre corto",          present: present(meta.name) },
    { key: "availability", label: "Disponibilidad",        present: present(meta.availability) },
    { key: "has1_1",       label: "Imagen 1:1",            present: present(meta.hasVariant1_1) || waEnabled },
  ];
  const waMissing = waFields.filter(f => !f.present).map(f => f.label);

  // ── Catalog ──
  const catEnabled = channelEnabled(meta, "catalog");
  const catFields: FieldReadiness[] = [
    { key: "name",     label: "Nombre",               present: present(meta.name) },
    { key: "category", label: "Categoría de catálogo", present: present(meta.category) },
  ];
  const catMissing = catFields.filter(f => !f.present).map(f => f.label);

  // ── Redes Sociales ──
  const socialEnabled = channelEnabled(meta, "instagram") || channelEnabled(meta, "facebook");
  const socialFields: FieldReadiness[] = [
    { key: "has9_16", label: "Variante 9:16",  present: present(meta.hasVariant9_16) },
    { key: "name",    label: "Nombre / copy",   present: present(meta.name) },
  ];
  const socialMissing = socialFields.filter(f => !f.present).map(f => f.label);

  // ── Ads ──
  const adsEnabled = channelEnabled(meta, "ads");
  const adsFields: FieldReadiness[] = [
    { key: "has9_16",   label: "Variante 9:16",     present: present(meta.hasVariant9_16) },
    { key: "hasBanner", label: "Banner (4:1)",       present: present(meta.hasVariantBanner) },
    { key: "name",      label: "Nombre para Ads",    present: present(meta.name) },
  ];
  const adsMissing = adsFields.filter(f => !f.present).map(f => f.label);

  // ── CRM ──
  const crmEnabled = channelEnabled(meta, "crm");
  const crmFields: FieldReadiness[] = [
    { key: "crmName",       label: "Nombre CRM",          present: present(meta.crmName || meta.name) },
    { key: "productLine",   label: "Familia / línea",      present: present(meta.productLine) },
    { key: "salesArgument", label: "Argumento de venta",   present: present(meta.salesArgument) },
    { key: "availability",  label: "Disponibilidad",       present: present(meta.availability) },
  ];
  const crmMissing = crmFields.filter(f => !f.present).map(f => f.label);

  return [
    {
      destination: "shopify",
      label:       "Shopify",
      status:      shopifyEnabled
        ? (shopifyMissing.length === 0 ? "ready" : "partial")
        : "not_ready",
      missing:     shopifyMissing,
      fields:      shopifyFields,
    },
    {
      destination: "whatsapp",
      label:       "WhatsApp",
      status:      deriveStatus(waEnabled, waFields),
      missing:     waMissing,
      fields:      waFields,
    },
    {
      destination: "catalog",
      label:       "Catálogo",
      status:      catEnabled
        ? (catMissing.length === 0 ? "ready" : "partial")
        : "not_ready",
      missing:     catMissing,
      fields:      catFields,
    },
    {
      destination: "social",
      label:       "Redes Sociales",
      status:      deriveStatus(socialEnabled, socialFields),
      missing:     socialMissing,
      fields:      socialFields,
    },
    {
      destination: "ads",
      label:       "Ads",
      status:      deriveStatus(adsEnabled, adsFields),
      missing:     adsMissing,
      fields:      adsFields,
    },
    {
      destination: "crm",
      label:       "CRM",
      status:      deriveStatus(crmEnabled, crmFields),
      missing:     crmMissing,
      fields:      crmFields,
    },
  ];
}

/**
 * buildMetadataSnapshot — derives a snapshot from BibliotecaAssetDisplay.
 * Only channels and variant counts are real. All other fields are PLACEHOLDER.
 * MS-05+ will pull these from the AssetMetadata Prisma table.
 */
export function buildMetadataSnapshot(asset: {
  name:         string;
  sku:          string | null;
  channels:     string[];
  variantCount: number;
}): AssetMetadataSnapshot {
  return {
    // PLACEHOLDER — name is a display label (SKU-based), not a commercial name
    name:          asset.name.startsWith("SKU ") ? undefined : asset.name,
    sku:           asset.sku ?? undefined,
    channels:      asset.channels,
    // Infer variant presence from count — PLACEHOLDER
    hasVariant1_1:    asset.variantCount >= 1,
    hasVariant9_16:   asset.variantCount >= 3,
    hasVariantBanner: asset.variantCount >= 4,
    // All commercial metadata missing — PLACEHOLDER until MetadataTable exists
    hasPrice:       false,
    hasDescription: false,
  };
}

/**
 * computeReadinessSummary — returns a one-line status summary for an asset.
 */
export function computeReadinessSummary(results: DestinationReadinessResult[]): string {
  const ready   = results.filter(r => r.status === "ready").length;
  const partial = results.filter(r => r.status === "partial").length;
  const total   = results.length;
  if (ready === total) return "Listo para todos los destinos";
  if (ready === 0 && partial === 0) return "Sin destinos habilitados";
  return `${ready} listo · ${partial} parcial · ${total - ready - partial} no listo`;
}
