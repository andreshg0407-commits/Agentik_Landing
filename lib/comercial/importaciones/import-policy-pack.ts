/**
 * lib/comercial/importaciones/import-policy-pack.ts
 *
 * FASE 1 — Castillitos Import Policies v1.
 *
 * Registers all Import policies into the Business Policy Engine.
 * Categories: IMPORT, INVENTORY
 *
 * Importacion es un mundo independiente del Textil.
 *
 * Sprint: IMPORT-POLICY-PACK-01
 */

import type { BusinessPolicy } from "@/lib/comercial/business-policy/policy-types";
import { registerPolicy } from "@/lib/comercial/business-policy/policy-engine";
import { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG } from "./import-policy-pack-config";

const VERSION_INFO = {
  version: "1.0.0",
  createdAt: new Date("2026-07-14"),
  createdBy: "IMPORT-POLICY-PACK-01",
  activatedAt: new Date("2026-07-14"),
  deprecatedAt: null,
  previousVersion: null,
  changeNote: "Initial Castillitos Import Policy Pack — 5 policies",
} as const;

const TENANT_ID = "castillitos";

function buildCastillitosImportPolicies(): BusinessPolicy[] {
  const cfg = CASTILLITOS_IMPORT_POLICY_PACK_CONFIG;

  return [
    // Low rotation
    {
      id: "imp-low-rotation-v1",
      tenantId: TENANT_ID,
      category: "IMPORT",
      name: "Baja Rotacion de Importacion",
      description: `Referencia con mas de ${cfg.lowRotation.monthsThreshold} meses sin ingreso y con inventario disponible.`,
      scopes: [{ scope: "PRODUCT", scopeValue: null }],
      conditions: [
        { field: "daysSinceLastEntry", operator: "GREATER_THAN", value: cfg.lowRotation.daysThreshold, description: `Mas de ${cfg.lowRotation.monthsThreshold} meses sin ingreso` },
        { field: "currentInventory", operator: "GREATER_THAN", value: 0, description: "Con inventario disponible" },
      ],
      actions: [
        { type: "NOTIFY", target: "lowRotationAlert", value: true, description: "Generar alerta de baja rotacion" },
      ],
      parameters: [
        { name: "monthsThreshold", type: "NUMBER", value: cfg.lowRotation.monthsThreshold, description: "Meses sin ingreso para baja rotacion", unit: "meses" },
        { name: "daysThreshold", type: "NUMBER", value: cfg.lowRotation.daysThreshold, description: "Dias equivalentes", unit: "dias" },
      ],
      priority: 200,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["importacion", "rotacion", "inventario"],
      metadata: { policyPack: "castillitos-import-v1", fase: 2 },
    },

    // Repurchase
    {
      id: "imp-repurchase-v1",
      tenantId: TENANT_ID,
      category: "IMPORT",
      name: "Decision de Recompra",
      description: "Evaluar si una referencia importada debe volver a comprarse basado en ventas, inventario, rotacion y tendencia.",
      scopes: [{ scope: "PRODUCT", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "repurchaseDecision", value: "evaluate", description: "Calcular decision de recompra" },
      ],
      parameters: [
        { name: "rebuyThreshold", type: "NUMBER", value: cfg.repurchase.rebuyThreshold, description: "Umbral para REBUY", unit: null },
        { name: "watchThreshold", type: "NUMBER", value: cfg.repurchase.watchThreshold, description: "Umbral para WATCH", unit: null },
      ],
      priority: 190,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["importacion", "recompra", "decision"],
      metadata: { policyPack: "castillitos-import-v1", fase: 3 },
    },

    // Next container
    {
      id: "imp-next-container-v1",
      tenantId: TENANT_ID,
      category: "IMPORT",
      name: "Proximo Contenedor",
      description: "Agrupar referencias sugeridas para el siguiente pedido a China. Solo recomendaciones, no ordenes de compra.",
      scopes: [{ scope: "TENANT", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "nextContainerRecommendation", value: "evaluate", description: "Generar recomendacion de contenedor" },
      ],
      parameters: [
        { name: "maxItems", type: "NUMBER", value: cfg.nextContainer.maxItems, description: "Maximo items en recomendacion", unit: null },
      ],
      priority: 180,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["importacion", "contenedor", "compras"],
      metadata: { policyPack: "castillitos-import-v1", fase: 4 },
    },

    // Inventory aging
    {
      id: "imp-inventory-aging-v1",
      tenantId: TENANT_ID,
      category: "INVENTORY",
      name: "Antiguedad de Inventario Importado",
      description: "Evaluar la antiguedad del inventario importado: NEW, NORMAL, AGING, LOW_ROTATION, OBSOLETE_CANDIDATE.",
      scopes: [{ scope: "PRODUCT", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "agingStatus", value: "evaluate", description: "Evaluar estado de antiguedad" },
      ],
      parameters: [
        { name: "newDaysMax", type: "NUMBER", value: cfg.inventoryAging.newDaysMax, description: "Dias maximo para NEW", unit: "dias" },
        { name: "normalDaysMax", type: "NUMBER", value: cfg.inventoryAging.normalDaysMax, description: "Dias maximo para NORMAL", unit: "dias" },
        { name: "agingDaysMax", type: "NUMBER", value: cfg.inventoryAging.agingDaysMax, description: "Dias maximo para AGING", unit: "dias" },
        { name: "lowRotationDaysMax", type: "NUMBER", value: cfg.inventoryAging.lowRotationDaysMax, description: "Dias maximo para LOW_ROTATION", unit: "dias" },
      ],
      priority: 170,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["importacion", "inventario", "antiguedad"],
      metadata: { policyPack: "castillitos-import-v1", fase: 5 },
    },

    // Import health
    {
      id: "imp-health-v1",
      tenantId: TENANT_ID,
      category: "IMPORT",
      name: "Salud General de Importacion",
      description: "Consolidar estado general del mundo Importacion: referencias sanas, en riesgo, baja rotacion, recompra.",
      scopes: [{ scope: "TENANT", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "importHealth", value: "evaluate", description: "Evaluar salud de importacion" },
      ],
      parameters: [],
      priority: 100,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["importacion", "salud", "resumen"],
      metadata: { policyPack: "castillitos-import-v1", fase: 6 },
    },
  ];
}

let registered = false;

export function registerCastillitosImportPolicyPack(): {
  success: boolean;
  registered: number;
  failed: number;
  errors: string[];
} {
  if (registered) {
    return { success: true, registered: 0, failed: 0, errors: ["Already registered"] };
  }

  const policies = buildCastillitosImportPolicies();
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

  if (failCount === 0) registered = true;

  return { success: failCount === 0, registered: successCount, failed: failCount, errors };
}

export function getCastillitosImportPolicies(): BusinessPolicy[] {
  return buildCastillitosImportPolicies();
}

export const CASTILLITOS_IMPORT_POLICY_PACK_VERSION = "1.0.0";
export const CASTILLITOS_IMPORT_POLICY_COUNT = 5;
