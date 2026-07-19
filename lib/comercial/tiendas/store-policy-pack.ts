/**
 * lib/comercial/tiendas/store-policy-pack.ts
 *
 * FASE 1 — Castillitos Store Policies v1.
 *
 * Registers all store policies into the Business Policy Engine.
 * Contains ONLY store policies. Scope: Tiendas exclusively.
 *
 * This file bridges the StorePolicyPackConfig (declarative configuration)
 * with the BusinessPolicy format expected by the policy-engine.
 *
 * Sprint: CASTILLITOS-STORE-POLICY-PACK-01
 */

import type { BusinessPolicy } from "@/lib/comercial/business-policy/policy-types";
import { registerPolicy } from "@/lib/comercial/business-policy/policy-engine";
import { CASTILLITOS_STORE_POLICY_PACK_CONFIG } from "./store-policy-pack-config";

// ── Version info ────────────────────────────────────────────────────────────

const VERSION_INFO = {
  version: "1.0.0",
  createdAt: new Date("2026-07-14"),
  createdBy: "CASTILLITOS-STORE-POLICY-PACK-01",
  activatedAt: new Date("2026-07-14"),
  deprecatedAt: null,
  previousVersion: null,
  changeNote: "Initial Castillitos Store Policy Pack — 8 policies",
} as const;

const TENANT_ID = "castillitos";

// ── Policy definitions ──────────────────────────────────────────────────────

function buildCastillitosStorePolicies(): BusinessPolicy[] {
  const cfg = CASTILLITOS_STORE_POLICY_PACK_CONFIG;

  return [
    // FASE 2: Textile Coverage
    {
      id: "csp-textile-coverage-v1",
      tenantId: TENANT_ID,
      category: "COVERAGE",
      name: "Cobertura Textil por Referencia",
      description: `Cada referencia textil debe tener entre ${cfg.textileCoverage.minimumUnits} y ${cfg.textileCoverage.maximumUnits} und por tienda (ideal: ${cfg.textileCoverage.idealUnits}).`,
      scopes: [
        { scope: "PRODUCT_CLASS", scopeValue: "textile" },
        { scope: "STORE", scopeValue: null },
      ],
      conditions: [
        {
          field: "productClass",
          operator: "EQUALS",
          value: "textile",
          description: "Aplica solo a productos textiles",
        },
      ],
      actions: [
        {
          type: "SET_THRESHOLD",
          target: "coverage",
          value: {
            minimumUnits: cfg.textileCoverage.minimumUnits,
            idealUnits: cfg.textileCoverage.idealUnits,
            maximumUnits: cfg.textileCoverage.maximumUnits,
          },
          description: "Umbrales de cobertura textil",
        },
      ],
      parameters: [
        { name: "minQty", type: "NUMBER", value: cfg.textileCoverage.minimumUnits, description: "Minimo por referencia", unit: "und" },
        { name: "idealQty", type: "NUMBER", value: cfg.textileCoverage.idealUnits, description: "Ideal por referencia", unit: "und" },
        { name: "maxQty", type: "NUMBER", value: cfg.textileCoverage.maximumUnits, description: "Maximo por referencia", unit: "und" },
      ],
      priority: 100,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "cobertura", "textil"],
      metadata: { policyPack: "castillitos-store-v1", fase: 2 },
    },

    // FASE 3: Global Low Stock (Rule 36)
    {
      id: "csp-global-low-stock-v1",
      tenantId: TENANT_ID,
      category: "STORE",
      name: "Regla 36 — Stock Global Bajo",
      description: `Cuando una referencia textil tiene ${cfg.globalLowStock.threshold} und o menos sumando TODAS las bodegas, solo puede permanecer en ${cfg.globalLowStock.allowedStoreNames.join(" y ")}.`,
      scopes: [
        { scope: "GLOBAL", scopeValue: null },
      ],
      conditions: [
        {
          field: "totalUnitsAllWarehouses",
          operator: "LESS_OR_EQUAL",
          value: cfg.globalLowStock.threshold,
          description: `Stock global <= ${cfg.globalLowStock.threshold} und`,
        },
      ],
      actions: [
        {
          type: "RESTRICT",
          target: "storePresence",
          value: cfg.globalLowStock.allowedStoreIds,
          description: `Solo permitir en: ${cfg.globalLowStock.allowedStoreNames.join(", ")}`,
        },
        {
          type: "NOTIFY",
          target: "transferSuggestion",
          value: true,
          description: "Generar sugerencia de transferencia (no ejecutar automaticamente)",
        },
      ],
      parameters: [
        { name: "threshold", type: "NUMBER", value: cfg.globalLowStock.threshold, description: "Umbral de stock global", unit: "und" },
        { name: "allowedStores", type: "JSON", value: cfg.globalLowStock.allowedStoreIds, description: "Tiendas autorizadas", unit: null },
      ],
      priority: 200,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "stock-global", "transferencia"],
      metadata: { policyPack: "castillitos-store-v1", fase: 3, businessName: "Regla 36" },
    },

    // FASE 4: Accessory Coverage
    {
      id: "csp-accessory-coverage-v1",
      tenantId: TENANT_ID,
      category: "COVERAGE",
      name: "Cobertura Accesorios por Tamano",
      description: `Cobertura de accesorios en tiendas: pequeno=${cfg.accessoryCoverage.idealBySize.small}, mediano=${cfg.accessoryCoverage.idealBySize.medium}, grande=${cfg.accessoryCoverage.idealBySize.large}.`,
      scopes: [
        { scope: "PRODUCT_CLASS", scopeValue: "accessory" },
        { scope: "STORE", scopeValue: null },
      ],
      conditions: [
        {
          field: "productClass",
          operator: "IN",
          value: ["accessory", "bulky"],
          description: "Aplica a accesorios y voluminosos",
        },
      ],
      actions: [
        {
          type: "SET_THRESHOLD",
          target: "accessoryCoverage",
          value: cfg.accessoryCoverage.idealBySize,
          description: "Ideal por tamano comercial",
        },
      ],
      parameters: [
        { name: "minQty", type: "NUMBER", value: 1, description: "Minimo general accesorios", unit: "und" },
        { name: "idealQty", type: "NUMBER", value: cfg.accessoryCoverage.idealBySize.medium, description: "Ideal mediano (referencia)", unit: "und" },
        { name: "maxQty", type: "NUMBER", value: cfg.accessoryCoverage.idealBySize.small, description: "Maximo (igual a ideal pequeno)", unit: "und" },
        { name: "idealSmall", type: "NUMBER", value: cfg.accessoryCoverage.idealBySize.small, description: "Ideal pequeno", unit: "und" },
        { name: "idealMedium", type: "NUMBER", value: cfg.accessoryCoverage.idealBySize.medium, description: "Ideal mediano", unit: "und" },
        { name: "idealLarge", type: "NUMBER", value: cfg.accessoryCoverage.idealBySize.large, description: "Ideal grande", unit: "und" },
      ],
      priority: 90,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "cobertura", "accesorios"],
      metadata: { policyPack: "castillitos-store-v1", fase: 4 },
    },

    // FASE 5: Special Products
    {
      id: "csp-special-products-v1",
      tenantId: TENANT_ID,
      category: "STORE",
      name: "Productos Especiales — Estado Ideal",
      description: `Productos especiales (${cfg.specialProducts.referencePatterns.join(", ")}) con distribucion controlada por tienda.`,
      scopes: [
        { scope: "STORE", scopeValue: null },
      ],
      conditions: [
        {
          field: "referenceCode",
          operator: "IN",
          value: cfg.specialProducts.referencePatterns,
          description: "Aplica a productos especiales",
        },
      ],
      actions: [
        {
          type: "SET_VALUE",
          target: "idealByStore",
          value: cfg.specialProducts.idealByStore,
          description: "Estado ideal por tienda",
        },
        {
          type: "NOTIFY",
          target: "alert",
          value: true,
          description: "Generar alerta cuando cambie",
        },
      ],
      parameters: [
        { name: "referencePatterns", type: "JSON", value: cfg.specialProducts.referencePatterns, description: "Patrones de referencia", unit: null },
        { name: "idealByStore", type: "JSON", value: cfg.specialProducts.idealByStore, description: "Ideal por tienda", unit: "und" },
        { name: "defaultIdeal", type: "NUMBER", value: cfg.specialProducts.defaultIdeal, description: "Default para tiendas no listadas", unit: "und" },
      ],
      priority: 150,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "productos-especiales"],
      metadata: { policyPack: "castillitos-store-v1", fase: 5 },
    },

    // FASE 6: Automatic Markdowns
    {
      id: "csp-automatic-markdown-v1",
      tenantId: TENANT_ID,
      category: "MARKDOWN",
      name: "Descuentos Automaticos por Antiguedad",
      description: `Descuentos sugeridos para ${cfg.automaticMarkdown.applicableStoreIds.join(" y ")}: ${cfg.automaticMarkdown.tiers.map(t => `${t.monthsThreshold}m=${t.discountPct}%`).join(", ")}.`,
      scopes: [
        { scope: "STORE", scopeValue: null },
      ],
      conditions: [
        {
          field: "storeId",
          operator: "IN",
          value: cfg.automaticMarkdown.applicableStoreIds,
          description: "Solo aplica en tiendas autorizadas",
        },
        {
          field: "daysInStore",
          operator: "GREATER_OR_EQUAL",
          value: cfg.automaticMarkdown.tiers[0]?.monthsThreshold ? cfg.automaticMarkdown.tiers[0].monthsThreshold * 30 : 90,
          description: "Producto con antiguedad minima",
        },
      ],
      actions: [
        {
          type: "NOTIFY",
          target: "markdownSuggestion",
          value: true,
          description: "Generar Suggested Markdown con evidencia (no aplicar automaticamente)",
        },
      ],
      parameters: cfg.automaticMarkdown.tiers.map((t, i) => ({
        name: `tier_${i + 1}_months`,
        type: "NUMBER" as const,
        value: t.monthsThreshold,
        description: `Tier ${i + 1}: meses`,
        unit: "meses",
      })).concat(cfg.automaticMarkdown.tiers.map((t, i) => ({
        name: `tier_${i + 1}_discount`,
        type: "NUMBER" as const,
        value: t.discountPct,
        description: `Tier ${i + 1}: descuento`,
        unit: "%",
      }))),
      priority: 80,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "descuento", "antiguedad"],
      metadata: { policyPack: "castillitos-store-v1", fase: 6 },
    },

    // FASE 7: Slow Rotation
    {
      id: "csp-slow-rotation-v1",
      tenantId: TENANT_ID,
      category: "ALERT",
      name: "Alerta de Baja Rotacion",
      description: `Genera alerta cuando un producto lleva ${cfg.slowRotation.minimumDaysThreshold} dias o mas en tienda con inventario.`,
      scopes: [
        { scope: "STORE", scopeValue: null },
      ],
      conditions: [
        {
          field: "daysInStore",
          operator: "GREATER_OR_EQUAL",
          value: cfg.slowRotation.minimumDaysThreshold,
          description: `Producto con ${cfg.slowRotation.minimumDaysThreshold}+ dias en tienda`,
        },
        {
          field: "currentUnits",
          operator: "GREATER_THAN",
          value: 0,
          description: "Con inventario existente",
        },
      ],
      actions: [
        {
          type: "NOTIFY",
          target: "slowRotationAlert",
          value: true,
          description: "Generar alerta con dias, meses, inventario, descuento sugerido",
        },
      ],
      parameters: [
        { name: "minimumDaysThreshold", type: "NUMBER", value: cfg.slowRotation.minimumDaysThreshold, description: "Dias minimos para alerta", unit: "dias" },
      ],
      priority: 70,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "rotacion", "alerta"],
      metadata: { policyPack: "castillitos-store-v1", fase: 7 },
    },

    // FASE 8: Assortment Suggestion
    {
      id: "csp-assortment-suggestion-v1",
      tenantId: TENANT_ID,
      category: "REPLENISHMENT",
      name: "Sugerencia de Surtido por Historial",
      description: "Cuando una tienda necesita surtido, prioriza referencias por historial de ventas de ESA tienda (no global).",
      scopes: [
        { scope: "STORE", scopeValue: null },
      ],
      conditions: [
        {
          field: "currentUnits",
          operator: "LESS_THAN",
          value: cfg.textileCoverage.minimumUnits,
          description: "Stock por debajo del minimo",
        },
      ],
      actions: [
        {
          type: "SET_VALUE",
          target: "assortmentPriority",
          value: "store_sales_history",
          description: "Priorizar por ventas de la tienda (no global)",
        },
      ],
      parameters: [
        { name: "prioritySource", type: "STRING", value: "store_sales_history", description: "Fuente de priorizacion", unit: null },
      ],
      priority: 60,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "surtido", "historial"],
      metadata: { policyPack: "castillitos-store-v1", fase: 8 },
    },

    // FASE 9: Comparative Report
    {
      id: "csp-comparative-report-v1",
      tenantId: TENANT_ID,
      category: "REPORT",
      name: "Informe Comparativo de Tiendas",
      description: "Responde: tienda con mas ventas, mejor rotacion, mayor utilidad, referencias cruzadas entre tiendas.",
      scopes: [
        { scope: "GLOBAL", scopeValue: null },
      ],
      conditions: [],
      actions: [
        {
          type: "SET_VALUE",
          target: "comparativeMetrics",
          value: ["topSelling", "topRotation", "topMargin", "crossStoreOpportunities"],
          description: "Metricas del informe comparativo",
        },
      ],
      parameters: [],
      priority: 50,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["tiendas", "informe", "comparativo"],
      metadata: { policyPack: "castillitos-store-v1", fase: 9 },
    },
  ];
}

// ── Registration ────────────────────────────────────────────────────────────

let registered = false;

export function registerCastillitosStorePolicyPack(): {
  success: boolean;
  registered: number;
  failed: number;
  errors: string[];
} {
  if (registered) {
    return { success: true, registered: 0, failed: 0, errors: ["Already registered"] };
  }

  const policies = buildCastillitosStorePolicies();
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const policy of policies) {
    const result = registerPolicy(policy);
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      const issues = result.validation.issues.map(i => `${i.field}: ${i.message}`);
      errors.push(`${policy.id}: ${issues.join("; ")}`);
    }
  }

  if (failCount === 0) {
    registered = true;
  }

  return {
    success: failCount === 0,
    registered: successCount,
    failed: failCount,
    errors,
  };
}

export function getCastillitosStorePolicies(): BusinessPolicy[] {
  return buildCastillitosStorePolicies();
}

export const CASTILLITOS_STORE_POLICY_PACK_VERSION = "1.0.0";
export const CASTILLITOS_STORE_POLICY_COUNT = 8;
