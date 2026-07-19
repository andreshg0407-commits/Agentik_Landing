/**
 * lib/operational-map/multisource/operational-source-classifier.ts
 *
 * Central operational source classifier for Agentik multi-source governance.
 *
 * RULE: Classification is derived from the SAG CSV operational catalog.
 * Claude does NOT invent new categories.
 *
 *   OFICIAL     → FUENTE_1  (empresa principal / facturación oficial / contabilidad)
 *   NO OFICIAL  → FUENTE_2  (remisiones / shadow operation / flujo no consolidado)
 *
 * Within OFICIAL, sub-classification:
 *   Store-specific codes → TIENDAS  (FD, FC, FG, FA, RS, RC, RG, RA, NS, NT, NG, NA)
 *   Web codes            → WEB      (FW, NW)
 *   All others OFICIAL   → FUENTE_1 (empresa / contable / auditoría)
 *
 * Sprint: AGENTIK-OPS-MULTISOURCE-GOVERNANCE-01
 */

import type { SagClasificacion } from "@/lib/operational-map/source-catalog/sag-real-source-catalog";

// ─── View type ────────────────────────────────────────────────────────────────

/**
 * The 5 operational consolidation views.
 *
 *   consolidated — Agentik-computed executive view (sum of all views)
 *   fuente_1     — OFICIAL/empresa: facturación oficial, contabilidad, source of truth corporativo
 *   fuente_2     — NO OFICIAL: remisiones, F2, pedidos sin facturar, shadow operation
 *   tiendas      — Store-specific OFICIAL: POS, retail físico, sucursales
 *   web          — Web/ecommerce: Shopify, canal digital, marketplaces
 */
export type OperationalViewType =
  | "consolidated"
  | "fuente_1"
  | "fuente_2"
  | "tiendas"
  | "web";

// ─── Classification result ────────────────────────────────────────────────────

export interface OperationalSourceClassification {
  /** Maps to FUENTE_1 / FUENTE_2 / INVENTARIO / PRODUCCION / EXCLUIR */
  sourceCategory:            string;
  /** Which view this source feeds */
  viewType:                  OperationalViewType;
  /** Human label for the view */
  viewLabel:                 string;
  /** One-line description of this view's role */
  viewDescription:           string;
  /** Short group label for clustering in UI */
  operationalGroup:          string;
  /** Whether this source comes from OFICIAL classification */
  isOfficial:                boolean;
  /** Whether this source feeds the executive consolidated KPI value */
  contributesToConsolidated: boolean;
}

// ─── Store-specific codes (OFICIAL → TIENDAS) ────────────────────────────────

/**
 * These are OFICIAL SAG document codes that belong to specific physical stores.
 * They are part of FUENTE_1 scope but shown under TIENDAS view.
 */
const TIENDAS_CODES = new Set([
  "FD",  // Factura San Diego
  "FC",  // Factura Centro
  "FG",  // Factura Gran Plaza
  "FA",  // Factura Caldas
  "RS",  // Recibo San Diego
  "RC",  // Recibo Centro
  "RG",  // Recibo Gran Plaza
  "RA",  // Recibo Caldas
  "NS",  // Nota crédito San Diego
  "NT",  // Nota crédito Centro
  "NG",  // Nota crédito Gran Plaza
  "NA",  // Nota crédito Caldas
]);

// ─── Web-specific codes (OFICIAL → WEB) ──────────────────────────────────────

/**
 * OFICIAL SAG document codes from the web/ecommerce channel.
 */
const WEB_CODES = new Set([
  "FW",  // Factura Electrónica Web
  "NW",  // Nota crédito Web
]);

// ─── View display metadata ────────────────────────────────────────────────────

export const VIEW_TYPE_META: Record<OperationalViewType, {
  label:       string;
  description: string;
  color:       string;
  bg:          string;
  border:      string;
  tag:         string;
}> = {
  consolidated: {
    label:       "Consolidado",
    description: "Vista ejecutiva Agentik — combina todas las fuentes operacionales",
    color:       "#166534",
    bg:          "#f0fdf4",
    border:      "#bbf7d0",
    tag:         "CONS",
  },
  fuente_1: {
    label:       "Fuente 1 — Empresa",
    description: "Operación principal: facturación oficial, contabilidad, source of truth corporativo",
    color:       "#1e40af",
    bg:          "#eff6ff",
    border:      "#bfdbfe",
    tag:         "F1",
  },
  fuente_2: {
    label:       "Fuente 2 — Remisiones",
    description: "Flujo comercial expandido: remisiones, F2, pedidos sin facturar, shadow operation",
    color:       "#92400e",
    bg:          "#fffbeb",
    border:      "#fde68a",
    tag:         "F2",
  },
  tiendas: {
    label:       "Tiendas",
    description: "POS y retail físico: sucursales San Diego, Centro, Gran Plaza, Caldas",
    color:       "#6b21a8",
    bg:          "#faf5ff",
    border:      "#d8b4fe",
    tag:         "TIENDAS",
  },
  web: {
    label:       "Web / Ecommerce",
    description: "Canal digital: facturación electrónica web, Shopify, marketplaces",
    color:       "#0e7490",
    bg:          "#ecfeff",
    border:      "#a5f3fc",
    tag:         "WEB",
  },
};

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Classify a SAG source into its operational view type.
 *
 * @param codigoFuente  - k_sc_codigo_fuente from SAG catalog (e.g. "FE", "F2", "FD")
 * @param clasificacion - SAG classification: "OFICIAL" | "NO OFICIAL" | "INVENTARIO" | ...
 * @param provider      - Optional: "sag" | "shopify" | "bank" | "agentik" | ...
 */
export function classifyOperationalSource(
  codigoFuente:  string,
  clasificacion: SagClasificacion | string,
  provider?:     string,
): OperationalSourceClassification {
  const code = codigoFuente.toUpperCase().trim();

  // External / non-SAG providers
  if (provider === "shopify" || provider === "ecommerce") {
    return {
      sourceCategory:            "EXTERNAL",
      viewType:                  "web",
      viewLabel:                 VIEW_TYPE_META.web.label,
      viewDescription:           VIEW_TYPE_META.web.description,
      operationalGroup:          "Shopify / Ecommerce",
      isOfficial:                false,
      contributesToConsolidated: true,
    };
  }
  if (provider === "bank" || provider === "external") {
    return {
      sourceCategory:            "EXTERNAL",
      viewType:                  "fuente_1",
      viewLabel:                 VIEW_TYPE_META.fuente_1.label,
      viewDescription:           VIEW_TYPE_META.fuente_1.description,
      operationalGroup:          "Fuente Externa Oficial",
      isOfficial:                true,
      contributesToConsolidated: true,
    };
  }

  // SAG NO OFICIAL → FUENTE_2
  if (clasificacion === "NO OFICIAL") {
    return {
      sourceCategory:            "FUENTE_2",
      viewType:                  "fuente_2",
      viewLabel:                 VIEW_TYPE_META.fuente_2.label,
      viewDescription:           VIEW_TYPE_META.fuente_2.description,
      operationalGroup:          "Remisiones / F2",
      isOfficial:                false,
      contributesToConsolidated: true,
    };
  }

  // SAG OFICIAL → sub-classify
  if (clasificacion === "OFICIAL") {
    if (WEB_CODES.has(code)) {
      return {
        sourceCategory:            "FUENTE_1",
        viewType:                  "web",
        viewLabel:                 VIEW_TYPE_META.web.label,
        viewDescription:           VIEW_TYPE_META.web.description,
        operationalGroup:          "Facturación Web",
        isOfficial:                true,
        contributesToConsolidated: true,
      };
    }

    if (TIENDAS_CODES.has(code)) {
      return {
        sourceCategory:            "FUENTE_1",
        viewType:                  "tiendas",
        viewLabel:                 VIEW_TYPE_META.tiendas.label,
        viewDescription:           VIEW_TYPE_META.tiendas.description,
        operationalGroup:          "Retail Físico",
        isOfficial:                true,
        contributesToConsolidated: true,
      };
    }

    // All other OFICIAL → FUENTE_1 empresa
    return {
      sourceCategory:            "FUENTE_1",
      viewType:                  "fuente_1",
      viewLabel:                 VIEW_TYPE_META.fuente_1.label,
      viewDescription:           VIEW_TYPE_META.fuente_1.description,
      operationalGroup:          "Empresa / Contable",
      isOfficial:                true,
      contributesToConsolidated: true,
    };
  }

  // INVENTARIO, PRODUCCION — internal flows, do not contribute to revenue
  if (clasificacion === "INVENTARIO") {
    return {
      sourceCategory:            "INVENTARIO",
      viewType:                  "fuente_1",
      viewLabel:                 "Inventario",
      viewDescription:           "Movimientos internos de inventario — no afectan ingresos",
      operationalGroup:          "Inventario / Logística",
      isOfficial:                true,
      contributesToConsolidated: false,
    };
  }

  if (clasificacion === "PRODUCCION") {
    return {
      sourceCategory:            "PRODUCCION",
      viewType:                  "fuente_1",
      viewLabel:                 "Producción",
      viewDescription:           "Órdenes y movimientos de producción",
      operationalGroup:          "Producción",
      isOfficial:                true,
      contributesToConsolidated: false,
    };
  }

  // EXCLUIR, HISTORICO, or unknown → excluded
  return {
    sourceCategory:            "EXCLUIR",
    viewType:                  "consolidated",
    viewLabel:                 "Excluido",
    viewDescription:           "Fuente excluida de consolidación operacional",
    operationalGroup:          "Excluido",
    isOfficial:                false,
    contributesToConsolidated: false,
  };
}

// ─── View ordering for display ────────────────────────────────────────────────

export const VIEW_TYPE_ORDER: OperationalViewType[] = [
  "consolidated",
  "fuente_1",
  "fuente_2",
  "tiendas",
  "web",
];
