/**
 * lib/comercial/sales-reps/sales-rep-policy-pack.ts
 *
 * FASE 1 — Castillitos SalesRep Policies v1.
 *
 * Registers all SalesRep policies into the Business Policy Engine.
 * Scope: Sales Representatives exclusively.
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

import type { BusinessPolicy } from "@/lib/comercial/business-policy/policy-types";
import { registerPolicy } from "@/lib/comercial/business-policy/policy-engine";
import { CASTILLITOS_SALESREP_POLICY_PACK_CONFIG } from "./sales-rep-policy-pack-config";

const VERSION_INFO = {
  version: "1.0.0",
  createdAt: new Date("2026-07-14"),
  createdBy: "SALES-REP-POLICY-PACK-01",
  activatedAt: new Date("2026-07-14"),
  deprecatedAt: null,
  previousVersion: null,
  changeNote: "Initial Castillitos SalesRep Policy Pack — 7 policies",
} as const;

const TENANT_ID = "castillitos";

function buildCastillitosRepPolicies(): BusinessPolicy[] {
  const cfg = CASTILLITOS_SALESREP_POLICY_PACK_CONFIG;

  return [
    // FASE 2: Mallet out-of-stock
    {
      id: "srp-mallet-out-of-stock-v1",
      tenantId: TENANT_ID,
      category: "ALERT",
      name: "Referencia Agotada en Maleta",
      description: `Cuando una referencia en la maleta quede con inventario <= ${cfg.outOfStock.outOfStockThreshold}, recomendar retiro.`,
      scopes: [{ scope: "VENDOR", scopeValue: null }],
      conditions: [
        { field: "availableInventory", operator: "LESS_OR_EQUAL", value: cfg.outOfStock.outOfStockThreshold, description: `Inventario <= ${cfg.outOfStock.outOfStockThreshold}` },
      ],
      actions: [
        { type: "NOTIFY", target: "outOfStockAlert", value: true, description: "Generar alerta de referencia agotada" },
      ],
      parameters: [
        { name: "outOfStockThreshold", type: "NUMBER", value: cfg.outOfStock.outOfStockThreshold, description: "Umbral de agotamiento", unit: "und" },
      ],
      priority: 200,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["vendedor", "maleta", "agotado"],
      metadata: { policyPack: "castillitos-salesrep-v1", fase: 2 },
    },

    // FASE 3: Replacement suggestion
    {
      id: "srp-mallet-replacement-v1",
      tenantId: TENANT_ID,
      category: "ALERT",
      name: "Sugerencia de Reemplazo en Maleta",
      description: "Cuando una referencia sale de maleta, sugerir reemplazo del mismo grupo/subgrupo con inventario disponible.",
      scopes: [{ scope: "VENDOR", scopeValue: null }],
      conditions: [
        { field: "outOfStockDetected", operator: "EQUALS", value: true, description: "Referencia marcada como agotada" },
      ],
      actions: [
        { type: "NOTIFY", target: "replacementSuggestion", value: true, description: "Generar sugerencia de reemplazo" },
      ],
      parameters: [
        { name: "maxReplacementSuggestions", type: "NUMBER", value: cfg.outOfStock.maxReplacementSuggestions, description: "Maximo sugerencias", unit: null },
      ],
      priority: 190,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["vendedor", "maleta", "reemplazo"],
      metadata: { policyPack: "castillitos-salesrep-v1", fase: 3 },
    },

    // FASE 4: Overdue receivable
    {
      id: "srp-overdue-receivable-v1",
      tenantId: TENANT_ID,
      category: "CUSTOMER",
      name: "Alerta Cartera Vencida del Cliente",
      description: `Alertar cuando un cliente tenga cartera vencida mas de ${cfg.overdueReceivable.overdueDaysThreshold} dias.`,
      scopes: [{ scope: "CUSTOMER", scopeValue: null }],
      conditions: [
        { field: "maxDaysPastDue", operator: "GREATER_THAN", value: cfg.overdueReceivable.overdueDaysThreshold, description: `Cartera > ${cfg.overdueReceivable.overdueDaysThreshold} dias` },
      ],
      actions: [
        { type: "NOTIFY", target: "overdueAlert", value: true, description: "Generar alerta de cartera vencida" },
      ],
      parameters: [
        { name: "overdueDaysThreshold", type: "NUMBER", value: cfg.overdueReceivable.overdueDaysThreshold, description: "Dias vencidos para alerta", unit: "dias" },
        { name: "severity", type: "STRING", value: cfg.overdueReceivable.severity, description: "Severidad de la alerta", unit: null },
      ],
      priority: 180,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["vendedor", "cartera", "cliente"],
      metadata: { policyPack: "castillitos-salesrep-v1", fase: 4 },
    },

    // FASE 5: Inactive customer
    {
      id: "srp-inactive-customer-v1",
      tenantId: TENANT_ID,
      category: "CUSTOMER",
      name: "Cliente Inactivo",
      description: `Identificar clientes con mas de ${cfg.inactiveCustomer.inactivityThresholdDays} dias sin comprar.`,
      scopes: [{ scope: "CUSTOMER", scopeValue: null }],
      conditions: [
        { field: "inactiveDays", operator: "GREATER_THAN", value: cfg.inactiveCustomer.inactivityThresholdDays, description: `Inactivo > ${cfg.inactiveCustomer.inactivityThresholdDays} dias` },
      ],
      actions: [
        { type: "NOTIFY", target: "inactiveCustomerAlert", value: true, description: "Generar alerta de cliente inactivo" },
      ],
      parameters: [
        { name: "inactivityThresholdDays", type: "NUMBER", value: cfg.inactiveCustomer.inactivityThresholdDays, description: "Dias para inactividad", unit: "dias" },
        { name: "atRiskThresholdDays", type: "NUMBER", value: cfg.inactiveCustomer.atRiskThresholdDays, description: "Dias para riesgo", unit: "dias" },
      ],
      priority: 150,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["vendedor", "cliente", "inactivo"],
      metadata: { policyPack: "castillitos-salesrep-v1", fase: 5 },
    },

    // FASE 6: Customer priority
    {
      id: "srp-customer-priority-v1",
      tenantId: TENANT_ID,
      category: "CUSTOMER",
      name: "Prioridad Comercial del Cliente",
      description: "Evaluar prioridad del cliente basado en inactividad, ventas, cartera, frecuencia y calidad de datos.",
      scopes: [{ scope: "CUSTOMER", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "customerPriority", value: "evaluate", description: "Calcular prioridad comercial" },
      ],
      parameters: [],
      priority: 100,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["vendedor", "cliente", "prioridad"],
      metadata: { policyPack: "castillitos-salesrep-v1", fase: 6 },
    },

    // FASE 7: Mallet status
    {
      id: "srp-mallet-status-v1",
      tenantId: TENANT_ID,
      category: "VENDOR",
      name: "Estado Operativo de Maleta",
      description: "Consolidar estado de la maleta del vendedor: completitud, faltantes, excesos, agotados.",
      scopes: [{ scope: "VENDOR", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "malletStatus", value: "evaluate", description: "Evaluar estado de maleta" },
      ],
      parameters: [],
      priority: 160,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["vendedor", "maleta", "estado"],
      metadata: { policyPack: "castillitos-salesrep-v1", fase: 7 },
    },

    // FASE 8: Order fulfillment
    {
      id: "srp-order-fulfillment-v1",
      tenantId: TENANT_ID,
      category: "VENDOR",
      name: "Seguimiento de Pedidos",
      description: "Consolidar estado de cumplimiento de pedidos del vendedor.",
      scopes: [{ scope: "VENDOR", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "orderFollowUp", value: "evaluate", description: "Evaluar cumplimiento de pedidos" },
      ],
      parameters: [],
      priority: 140,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["vendedor", "pedidos", "seguimiento"],
      metadata: { policyPack: "castillitos-salesrep-v1", fase: 8 },
    },
  ];
}

let registered = false;

export function registerCastillitosRepPolicyPack(): {
  success: boolean;
  registered: number;
  failed: number;
  errors: string[];
} {
  if (registered) {
    return { success: true, registered: 0, failed: 0, errors: ["Already registered"] };
  }

  const policies = buildCastillitosRepPolicies();
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

export function getCastillitosRepPolicies(): BusinessPolicy[] {
  return buildCastillitosRepPolicies();
}

export const CASTILLITOS_SALESREP_POLICY_PACK_VERSION = "1.0.0";
export const CASTILLITOS_SALESREP_POLICY_COUNT = 7;
