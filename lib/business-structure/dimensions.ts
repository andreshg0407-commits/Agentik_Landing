/**
 * business-structure/dimensions.ts
 *
 * Dimension registries — metadata for every value in each dimension.
 *
 * Each registry entry is a plain object with:
 *   key         — the canonical type value (matches types.ts)
 *   label       — human-readable Spanish label (UI tables, filters)
 *   shortLabel  — compact label for chips/badges
 *   description — what this value means in business context
 *   colorToken  — UI badge color hint
 *   isActive    — false = archived / pending confirmation
 */

import type {
  BusinessLine,
  SalesChannelKey,
  OperatingUnitKey,
} from "./types";

// ── BusinessLine registry ─────────────────────────────────────────────────────

/**
 * How a business line is used across the platform.
 *
 * OPERATIONAL    — has product, campaigns, and creative content.
 * FINANCIAL_ONLY — exists only for invoicing / tax compliance.
 *                  Must NOT appear in Marketing Studio, copilot, or any creative surface.
 */
export type BusinessLinePurpose = "OPERATIONAL" | "FINANCIAL_ONLY";

export interface BusinessLineMeta {
  key:                    BusinessLine;
  label:                  string;
  shortLabel:             string;
  description:            string;
  colorToken:             "blue" | "purple" | "orange" | "teal" | "gray";
  isActive:               boolean;
  purpose:                BusinessLinePurpose;
  /** Allowed to appear in Marketing Studio wizard, copilot, presets, prompts. */
  visibleInMarketingStudio: boolean;
  /** Appears in executive finance reports and financial audits. */
  visibleInExecutiveFinance: boolean;
}

export const BUSINESS_LINE_REGISTRY: Record<BusinessLine, BusinessLineMeta> = {
  CASTILLITOS: {
    key:                      "CASTILLITOS",
    label:                    "Castillitos",
    shortLabel:               "Castillitos",
    description:              "Línea principal de la marca Castillitos.",
    colorToken:               "blue",
    isActive:                 true,
    purpose:                  "OPERATIONAL",
    visibleInMarketingStudio: true,
    visibleInExecutiveFinance: true,
  },
  LATIN_KIDS: {
    key:                      "LATIN_KIDS",
    label:                    "Latin Kids",
    shortLabel:               "LK",
    description:              "Marca interna infantil operada por Castillitos. Requiere revisión contable.",
    colorToken:               "purple",
    isActive:                 true,
    purpose:                  "OPERATIONAL",
    visibleInMarketingStudio: true,
    visibleInExecutiveFinance: true,
  },
  IMPORTACION: {
    key:                      "IMPORTACION",
    label:                    "Importación",
    shortLabel:               "Import.",
    description:              "Línea de productos importados. Clasificación pendiente de confirmación contable.",
    colorToken:               "orange",
    isActive:                 false, // activate after accounting confirms codes
    purpose:                  "OPERATIONAL",
    visibleInMarketingStudio: true,
    visibleInExecutiveFinance: true,
  },
  PETS: {
    key:                      "PETS",
    label:                    "Mascotas",
    shortLabel:               "Pets",
    description:              "Línea de productos para mascotas.",
    colorToken:               "teal",
    isActive:                 true,
    purpose:                  "OPERATIONAL",
    visibleInMarketingStudio: false, // no creative campaigns yet
    visibleInExecutiveFinance: true,
  },
  OTHER: {
    key:                      "OTHER",
    label:                    "OTROS",
    shortLabel:               "OTROS",
    description:              "Línea financiera exclusiva para facturar bolsas de empaque (obligación fiscal Colombia). Sin producto, sin campaña, sin contenido creativo.",
    colorToken:               "gray",
    isActive:                 true,
    purpose:                  "FINANCIAL_ONLY",
    visibleInMarketingStudio:  false,
    visibleInExecutiveFinance: true,
  },
};

// ── SalesChannel registry ─────────────────────────────────────────────────────

export interface SalesChannelMeta {
  key:         SalesChannelKey;
  label:       string;
  shortLabel:  string;
  description: string;
  colorToken:  "blue" | "indigo" | "green" | "cyan" | "violet" | "amber" | "gray";
  isActive:    boolean;
  /** True if this channel is B2B wholesale (affects margin analysis). */
  isWholesale: boolean;
}

export const SALES_CHANNEL_REGISTRY: Record<SalesChannelKey, SalesChannelMeta> = {
  EMPRESA: {
    key:         "EMPRESA",
    label:       "Empresa / Institucional",
    shortLabel:  "Empresa",
    description: "Venta directa B2B a empresas e instituciones.",
    colorToken:  "blue",
    isActive:    true,
    isWholesale: false,
  },
  MAYORISTAS: {
    key:         "MAYORISTAS",
    label:       "Mayoristas",
    shortLabel:  "Mayor.",
    description: "Venta al por mayor a distribuidores y revendedores.",
    colorToken:  "indigo",
    isActive:    true,
    isWholesale: true,
  },
  TIENDAS: {
    key:         "TIENDAS",
    label:       "Tiendas / Almacenes",
    shortLabel:  "Tiendas",
    description: "Venta al detal en puntos físicos.",
    colorToken:  "green",
    isActive:    true,
    isWholesale: false,
  },
  WEB: {
    key:         "WEB",
    label:       "Web / E-commerce",
    shortLabel:  "Web",
    description: "Venta en línea.",
    colorToken:  "cyan",
    isActive:    true,
    isWholesale: false,
  },
  TELEFONO: {
    key:         "TELEFONO",
    label:       "Teléfono / Call center",
    shortLabel:  "Tel.",
    description: "Pedidos por teléfono o canal virtual no-web.",
    colorToken:  "violet",
    isActive:    true,
    isWholesale: false,
  },
  REMISIONES: {
    key:         "REMISIONES",
    label:       "Remisiones / Despacho",
    shortLabel:  "F2",
    description: "Flujo de despacho (FUENTE_2). Sin factura fiscal aún.",
    colorToken:  "amber",
    isActive:    true,
    isWholesale: false,
  },
  OTHER: {
    key:         "OTHER",
    label:       "Canal no identificado",
    shortLabel:  "Otro",
    description: "Sin clasificar — requiere mapeo.",
    colorToken:  "gray",
    isActive:    true,
    isWholesale: false,
  },
};

// ── OperatingUnit registry ────────────────────────────────────────────────────

export interface OperatingUnitMeta {
  key:          OperatingUnitKey;
  label:        string;
  shortLabel:   string;
  description:  string;
  colorToken:   "blue" | "green" | "orange" | "red" | "cyan" | "gray";
  isActive:     boolean;
  isPhysical:   boolean;
  /** Known storeSlug patterns that map to this unit (lowercase, trimmed). */
  storeSlugs:   readonly string[];
}

export const OPERATING_UNIT_REGISTRY: Record<OperatingUnitKey, OperatingUnitMeta> = {
  SAN_DIEGO: {
    key:         "SAN_DIEGO",
    label:       "San Diego",
    shortLabel:  "SanDiego",
    description: "Bodega / punto principal San Diego.",
    colorToken:  "blue",
    isActive:    true,
    isPhysical:  true,
    storeSlugs:  ["san-diego", "sandiego", "san_diego", "bodega", "bodega-sd"],
  },
  GRAN_PLAZA: {
    key:         "GRAN_PLAZA",
    label:       "Gran Plaza",
    shortLabel:  "GranPlaza",
    description: "Punto de venta Gran Plaza.",
    colorToken:  "green",
    isActive:    true,
    isPhysical:  true,
    storeSlugs:  ["gran-plaza", "granplaza", "gran_plaza", "grn-plaza"],
  },
  CENTRO: {
    key:         "CENTRO",
    label:       "Centro",
    shortLabel:  "Centro",
    description: "Punto de venta Centro.",
    colorToken:  "orange",
    isActive:    true,
    isPhysical:  true,
    storeSlugs:  ["centro", "pto-centro", "punto-centro"],
  },
  CALDAS: {
    key:         "CALDAS",
    label:       "Caldas",
    shortLabel:  "Caldas",
    description: "Punto de venta Caldas.",
    colorToken:  "red",
    isActive:    true,
    isPhysical:  true,
    storeSlugs:  ["caldas", "pto-caldas", "punto-caldas"],
  },
  WEB: {
    key:         "WEB",
    label:       "Web / Virtual",
    shortLabel:  "Web",
    description: "Unidad operativa virtual (e-commerce, no físico).",
    colorToken:  "cyan",
    isActive:    true,
    isPhysical:  false,
    storeSlugs:  ["web", "online", "ecommerce", "e-commerce", "virtual"],
  },
  OTHER: {
    key:         "OTHER",
    label:       "Unidad no identificada",
    shortLabel:  "Otra",
    description: "Sin clasificar — requiere mapeo de storeSlug.",
    colorToken:  "gray",
    isActive:    true,
    isPhysical:  false,
    storeSlugs:  [],
  },
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getBusinessLineMeta(key: BusinessLine): BusinessLineMeta {
  return BUSINESS_LINE_REGISTRY[key];
}

export function getSalesChannelMeta(key: SalesChannelKey): SalesChannelMeta {
  return SALES_CHANNEL_REGISTRY[key];
}

export function getOperatingUnitMeta(key: OperatingUnitKey): OperatingUnitMeta {
  return OPERATING_UNIT_REGISTRY[key];
}

/** All active business lines (for filter UI — includes FINANCIAL_ONLY). */
export function activeBusinessLines(): BusinessLineMeta[] {
  return Object.values(BUSINESS_LINE_REGISTRY).filter(m => m.isActive);
}

/**
 * Business lines allowed in Marketing Studio: active + OPERATIONAL + visibleInMarketingStudio.
 * FINANCIAL_ONLY lines (OTROS) are always excluded.
 */
export function marketingBusinessLines(): BusinessLineMeta[] {
  return Object.values(BUSINESS_LINE_REGISTRY).filter(
    m => m.isActive && m.purpose === "OPERATIONAL" && m.visibleInMarketingStudio,
  );
}

/** All active sales channels (for filter UI). */
export function activeSalesChannels(): SalesChannelMeta[] {
  return Object.values(SALES_CHANNEL_REGISTRY).filter(m => m.isActive);
}

/** All active operating units (for filter UI). */
export function activeOperatingUnits(): OperatingUnitMeta[] {
  return Object.values(OPERATING_UNIT_REGISTRY).filter(m => m.isActive);
}
