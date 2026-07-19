/**
 * lib/marketing-studio/products/product-readiness.ts
 *
 * MS-05A / MS-05C — Product Readiness Engine
 *
 * Computes destination readiness from a ProductEntity's actual persisted
 * attributes — NOT from visual/display data.
 *
 * This is the authoritative readiness computation used by:
 *   - Server actions (after approval)
 *   - Propagation engine (to determine what needs re-sync)
 *   - Reactive intelligence (Luca/Mila recommendations)
 *
 * ── CHANNEL RULES ─────────────────────────────────────────────────────────────
 *   Shopify  → name + category + price + description (enabled if in channels)
 *   WhatsApp → name + availability (enabled if in channels)
 *   Catalog  → name + category (enabled if in channels)
 *   CRM      → crmName + productLine + salesArgument + availability
 *   Ads      → name + 9:16 variant (inferred from attributes)
 *   Social   → name + 9:16 variant
 */

import type {
  ProductEntity,
  ProductReadinessState,
  ChannelReadiness,
  SyncChannel,
  ReadinessLevel,
} from "./product-types";

// ── Rule definitions ───────────────────────────────────────────────────────────

interface ReadinessRule {
  channel:   SyncChannel;
  label:     string;
  required:  Array<(p: ProductEntity) => { present: boolean; fieldLabel: string }>;
}

const READINESS_RULES: ReadinessRule[] = [
  {
    channel: "shopify",
    label:   "Shopify",
    required: [
      p => ({ present: !!p.name?.trim(),        fieldLabel: "Nombre comercial" }),
      p => ({ present: !!p.category?.trim(),    fieldLabel: "Categoría" }),
      p => ({ present: p.price !== null,         fieldLabel: "Precio base" }),
      p => ({ present: !!p.description?.trim(), fieldLabel: "Descripción" }),
    ],
  },
  {
    channel: "whatsapp",
    label:   "WhatsApp",
    required: [
      p => ({ present: !!p.name?.trim(),          fieldLabel: "Nombre corto" }),
      p => ({ present: !!p.availability?.trim(),  fieldLabel: "Disponibilidad" }),
    ],
  },
  {
    channel: "catalog",
    label:   "Catálogo",
    required: [
      p => ({ present: !!p.name?.trim(),       fieldLabel: "Nombre" }),
      p => ({ present: !!p.category?.trim(),   fieldLabel: "Categoría" }),
    ],
  },
  {
    channel: "crm",
    label:   "CRM",
    required: [
      p => ({ present: !!(p.crmName ?? p.name)?.trim(), fieldLabel: "Nombre CRM" }),
      p => ({ present: !!p.productLine?.trim(),          fieldLabel: "Familia / línea" }),
      p => ({ present: !!p.salesArgument?.trim(),        fieldLabel: "Argumento de venta" }),
      p => ({ present: !!p.availability?.trim(),         fieldLabel: "Disponibilidad" }),
    ],
  },
  {
    channel: "ads",
    label:   "Ads",
    required: [
      p => ({ present: !!p.name?.trim(),         fieldLabel: "Nombre para Ads" }),
      // Infer 9:16 from attributes
      p => ({
        present: p.attributes.some(a => a.key === "has_9_16" && a.valueBoolean === true),
        fieldLabel: "Variante 9:16",
      }),
    ],
  },
  {
    channel: "landing",
    label:   "Landing",
    required: [
      p => ({ present: !!p.name?.trim(),         fieldLabel: "Nombre" }),
      p => ({ present: !!p.description?.trim(),  fieldLabel: "Descripción" }),
    ],
  },
];

const CHANNEL_LABEL: Record<SyncChannel, string> = {
  shopify:  "Shopify",
  whatsapp: "WhatsApp",
  catalog:  "Catálogo",
  crm:      "CRM",
  ads:      "Ads",
  landing:  "Landing",
};

// ── Computation ────────────────────────────────────────────────────────────────

function deriveStatus(
  channelEnabled: boolean,
  missingCount:   number,
  totalRequired:  number,
): ReadinessLevel {
  if (!channelEnabled) return "not_ready";
  if (missingCount === 0) return "ready";
  // Partial: at least some required fields are present
  return missingCount < totalRequired ? "partial" : "partial";
}

/**
 * computeProductReadiness — derives readiness for all 6 channels
 * from a fully-loaded ProductEntity.
 */
export function computeProductReadiness(product: ProductEntity): ProductReadinessState {
  const enabledChannels = new Set(
    product.assetLinks
      .flatMap(() => [] as SyncChannel[]) // placeholder — channels come from a separate field
  );

  // Derive enabled channels from syncStates (channels that are not "not_configured")
  const activeChannels = new Set<SyncChannel>(
    product.syncStates
      .filter(s => s.status !== "not_configured")
      .map(s => s.channel)
  );

  const destinations: ChannelReadiness[] = READINESS_RULES.map(rule => {
    const isEnabled = activeChannels.has(rule.channel);
    const evaluations = rule.required.map(fn => fn(product));
    const missing = evaluations.filter(e => !e.present).map(e => e.fieldLabel);
    return {
      channel: rule.channel,
      label:   rule.label,
      status:  deriveStatus(isEnabled, missing.length, rule.required.length),
      missing,
    };
  });

  const readyCount   = destinations.filter(d => d.status === "ready").length;
  const partialCount = destinations.filter(d => d.status === "partial").length;
  const totalEnabled = destinations.filter(d => d.status !== "not_ready").length;

  return {
    productId:    product.id,
    destinations,
    readyCount,
    partialCount,
    totalEnabled,
    score:        0, // populated by computeReadinessScore() after construction
    computedAt:   new Date(),
  };
}

/**
 * computeReadinessFromSnapshot — lightweight version for use in server actions
 * before a full ProductEntity is loaded. Takes a minimal snapshot.
 */
export function computeReadinessFromSnapshot(snapshot: {
  name:          string | null;
  sku:           string | null;
  category:      string | null;
  description:   string | null;
  price:         number | null;
  crmName:       string | null;
  productLine:   string | null;
  salesArgument: string | null;
  availability:  string | null;
  channels:      SyncChannel[];
}): ChannelReadiness[] {
  const enabled = new Set(snapshot.channels);

  return READINESS_RULES.map(rule => {
    const isEnabled = enabled.has(rule.channel);
    const missing: string[] = [];

    for (const fn of rule.required) {
      // Build a minimal ProductEntity-like object for the evaluator
      const fakeProduct = {
        name:          snapshot.name ?? "",
        category:      snapshot.category ?? "",
        description:   snapshot.description ?? "",
        price:         snapshot.price,
        crmName:       snapshot.crmName,
        productLine:   snapshot.productLine,
        salesArgument: snapshot.salesArgument,
        availability:  snapshot.availability,
        attributes:    [] as ProductEntity["attributes"],
        // unused but required by type
      } as unknown as ProductEntity;

      const { present, fieldLabel } = fn(fakeProduct);
      if (!present) missing.push(fieldLabel);
    }

    return {
      channel: rule.channel,
      label:   CHANNEL_LABEL[rule.channel],
      status:  deriveStatus(isEnabled, missing.length, rule.required.length),
      missing,
    };
  });
}

/**
 * computeReadinessScore — normalizes readiness to a 0–100 integer score.
 * ready channel = 10pts, partial = 4pts, capped at 100.
 */
export function computeReadinessScore(state: ProductReadinessState): number {
  const total = state.destinations.length;
  if (total === 0) return 0;
  const raw = state.readyCount * 10 + state.partialCount * 4;
  return Math.min(100, Math.round((raw / (total * 10)) * 100));
}

/**
 * summarizeReadiness — one-line summary of a readiness state.
 */
export function summarizeReadiness(state: ProductReadinessState): string {
  const { readyCount, partialCount, totalEnabled, destinations } = state;
  const notReady = destinations.length - totalEnabled;
  if (readyCount === destinations.length) return "Listo para todos los destinos";
  if (totalEnabled === 0) return "Sin destinos habilitados";
  return `${readyCount} listo · ${partialCount} parcial · ${notReady} no habilitado`;
}
