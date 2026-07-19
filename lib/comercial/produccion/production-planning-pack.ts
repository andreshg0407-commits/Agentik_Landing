/**
 * lib/comercial/produccion/production-planning-pack.ts
 *
 * FASE 1 — Castillitos Production Planning Policies v1.
 *
 * Registers all Production Planning policies into the Business Policy Engine.
 * Categories used: INVENTORY, REPLENISHMENT, GENERAL
 * (No new categories — uses existing engine infrastructure)
 *
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

import type { BusinessPolicy } from "@/lib/comercial/business-policy/policy-types";
import { registerPolicy } from "@/lib/comercial/business-policy/policy-engine";
import { CASTILLITOS_PRODUCTION_PLANNING_CONFIG } from "./production-planning-config";

const VERSION_INFO = {
  version: "1.0.0",
  createdAt: new Date("2026-07-14"),
  createdBy: "PRODUCTION-PLANNING-POLICY-PACK-01",
  activatedAt: new Date("2026-07-14"),
  deprecatedAt: null,
  previousVersion: null,
  changeNote: "Initial Castillitos Production Planning Policy Pack — 5 policies",
} as const;

const TENANT_ID = "castillitos";

function buildCastillitosProductionPlanningPolicies(): BusinessPolicy[] {
  const cfg = CASTILLITOS_PRODUCTION_PLANNING_CONFIG;

  return [
    // FASE 2: Textile reorder trigger
    {
      id: "prod-textile-reorder-v1",
      tenantId: TENANT_ID,
      category: "REPLENISHMENT",
      name: "Trigger de Produccion Textil",
      description: `Cuando inventario disponible de un subgrupo baje del umbral (Castillitos: ${cfg.reorder.brandThresholds.CASTILLITOS}, Latin Kids: ${cfg.reorder.brandThresholds["LATIN KIDS"]}) y NO exista OP activa, sugerir produccion.`,
      scopes: [{ scope: "SUBGROUP", scopeValue: null }],
      conditions: [
        { field: "availableInventory", operator: "LESS_THAN", value: cfg.reorder.defaultThreshold, description: "Inventario por debajo del umbral" },
        { field: "hasActiveOP", operator: "EQUALS", value: false, description: "Sin OP activa del mismo subgrupo" },
      ],
      actions: [
        { type: "NOTIFY", target: "productionSuggestion", value: true, description: "Generar sugerencia de produccion" },
      ],
      parameters: [
        { name: "castillitosThreshold", type: "NUMBER", value: cfg.reorder.brandThresholds.CASTILLITOS, description: "Umbral Castillitos", unit: "unidades" },
        { name: "latinKidsThreshold", type: "NUMBER", value: cfg.reorder.brandThresholds["LATIN KIDS"], description: "Umbral Latin Kids", unit: "unidades" },
        { name: "defaultThreshold", type: "NUMBER", value: cfg.reorder.defaultThreshold, description: "Umbral por defecto", unit: "unidades" },
      ],
      priority: 300,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["produccion", "textil", "reorder", "trigger"],
      metadata: { policyPack: "castillitos-production-v1", fase: 2 },
    },

    // FASE 3: Active OP check
    {
      id: "prod-active-op-v1",
      tenantId: TENANT_ID,
      category: "REPLENISHMENT",
      name: "Verificacion de OP Activa",
      description: "Antes de sugerir produccion, verificar si existe una OP activa del mismo subgrupo. Si existe, resultado WAIT_EXISTING_OP.",
      scopes: [{ scope: "SUBGROUP", scopeValue: null }],
      conditions: [
        { field: "hasActiveOP", operator: "EQUALS", value: true, description: "Existe OP activa del subgrupo" },
      ],
      actions: [
        { type: "RESTRICT", target: "productionSuggestion", value: true, description: "Bloquear sugerencia — OP ya existe" },
      ],
      parameters: [],
      priority: 310,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["produccion", "op", "validacion"],
      metadata: { policyPack: "castillitos-production-v1", fase: 3 },
    },

    // FASE 4: Production priority scoring
    {
      id: "prod-priority-v1",
      tenantId: TENANT_ID,
      category: "INVENTORY",
      name: "Prioridad de Produccion",
      description: "Clasificar sugerencias de produccion por prioridad: CRITICAL, HIGH, MEDIUM, LOW basado en inventario, ventas, cobertura, pedidos, maletas y tiendas.",
      scopes: [{ scope: "SUBGROUP", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "productionPriority", value: "evaluate", description: "Calcular prioridad de produccion" },
      ],
      parameters: [
        { name: "criticalThreshold", type: "NUMBER", value: cfg.priority.criticalThreshold, description: "Umbral CRITICAL", unit: null },
        { name: "highThreshold", type: "NUMBER", value: cfg.priority.highThreshold, description: "Umbral HIGH", unit: null },
        { name: "mediumThreshold", type: "NUMBER", value: cfg.priority.mediumThreshold, description: "Umbral MEDIUM", unit: null },
      ],
      priority: 280,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["produccion", "prioridad", "scoring"],
      metadata: { policyPack: "castillitos-production-v1", fase: 4 },
    },

    // FASE 5: Shortage detection
    {
      id: "prod-shortage-v1",
      tenantId: TENANT_ID,
      category: "INVENTORY",
      name: "Deteccion de Desabastecimiento",
      description: "Detectar subgrupos desabastecidos: inventario por debajo del umbral con deficit critico.",
      scopes: [{ scope: "SUBGROUP", scopeValue: null }],
      conditions: [
        { field: "availableInventory", operator: "LESS_THAN", value: cfg.reorder.defaultThreshold, description: "Inventario bajo umbral" },
      ],
      actions: [
        { type: "NOTIFY", target: "shortageAlert", value: true, description: "Generar alerta de desabastecimiento" },
      ],
      parameters: [
        { name: "criticalPct", type: "NUMBER", value: cfg.shortage.criticalPct, description: "% del umbral para critico", unit: "%" },
        { name: "shortagePct", type: "NUMBER", value: cfg.shortage.shortagePct, description: "% del umbral para shortage", unit: "%" },
      ],
      priority: 290,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["produccion", "shortage", "inventario"],
      metadata: { policyPack: "castillitos-production-v1", fase: 5 },
    },

    // FASE 6: Production health
    {
      id: "prod-health-v1",
      tenantId: TENANT_ID,
      category: "GENERAL",
      name: "Salud de Produccion",
      description: "Consolidar estado general de produccion: subgrupos saludables, en riesgo, criticos, esperando OP.",
      scopes: [{ scope: "TENANT", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "productionHealth", value: "evaluate", description: "Evaluar salud de produccion" },
      ],
      parameters: [
        { name: "criticalPct", type: "NUMBER", value: cfg.health.criticalPct, description: "% subgrupos para CRITICAL", unit: "%" },
        { name: "atRiskPct", type: "NUMBER", value: cfg.health.atRiskPct, description: "% subgrupos para AT_RISK", unit: "%" },
      ],
      priority: 100,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["produccion", "salud", "resumen"],
      metadata: { policyPack: "castillitos-production-v1", fase: 6 },
    },
  ];
}

let registered = false;

export function registerCastillitosProductionPlanningPack(): {
  success: boolean;
  registered: number;
  failed: number;
  errors: string[];
} {
  if (registered) {
    return { success: true, registered: 0, failed: 0, errors: ["Already registered"] };
  }

  const policies = buildCastillitosProductionPlanningPolicies();
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

export function getCastillitosProductionPlanningPolicies(): BusinessPolicy[] {
  return buildCastillitosProductionPlanningPolicies();
}

export const CASTILLITOS_PRODUCTION_PLANNING_PACK_VERSION = "1.0.0";
export const CASTILLITOS_PRODUCTION_PLANNING_POLICY_COUNT = 5;
