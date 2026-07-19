/**
 * lib/comercial/pedidos/order-policy-pack.ts
 *
 * FASE 1 — Castillitos Order Policies v1.
 *
 * Registers all order policies into the Business Policy Engine.
 * Scope: Pedidos exclusively.
 *
 * Sprint: CASTILLITOS-ORDER-POLICY-PACK-01
 */

import type { BusinessPolicy } from "@/lib/comercial/business-policy/policy-types";
import { registerPolicy } from "@/lib/comercial/business-policy/policy-engine";
import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "./order-policy-pack-config";

const VERSION_INFO = {
  version: "1.0.0",
  createdAt: new Date("2026-07-14"),
  createdBy: "CASTILLITOS-ORDER-POLICY-PACK-01",
  activatedAt: new Date("2026-07-14"),
  deprecatedAt: null,
  previousVersion: null,
  changeNote: "Initial Castillitos Order Policy Pack — 6 policies",
} as const;

const TENANT_ID = "castillitos";

function buildCastillitosOrderPolicies(): BusinessPolicy[] {
  const cfg = CASTILLITOS_ORDER_POLICY_PACK_CONFIG;

  return [
    // FASE 2: Customer Branch
    {
      id: "cop-customer-branch-v1",
      tenantId: TENANT_ID,
      category: "ORDER",
      name: "Seleccion de Sucursal del Cliente",
      description: "Al iniciar un pedido, buscar todas las sucursales del cliente. Si hay una, seleccionar automaticamente. Si hay varias, exigir seleccion. Nunca asumir.",
      scopes: [{ scope: "CUSTOMER", scopeValue: null }],
      conditions: [
        { field: "orderInitiated", operator: "EQUALS", value: true, description: "Al iniciar pedido" },
      ],
      actions: [
        { type: "SET_VALUE", target: "branchSelection", value: "required", description: "Exigir seleccion de sucursal" },
      ],
      parameters: [],
      priority: 200,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["pedidos", "sucursal", "cliente"],
      metadata: { policyPack: "castillitos-order-v1", fase: 2 },
    },

    // FASE 3: Customer Credit
    {
      id: "cop-customer-credit-v1",
      tenantId: TENANT_ID,
      category: "ORDER",
      name: "Validacion Cartera del Cliente",
      description: `Evaluar cartera vencida antes de confirmar. Alerta a ${cfg.customerCredit.warningDaysPastDue} dias, critico a ${cfg.customerCredit.criticalDaysPastDue} dias.`,
      scopes: [{ scope: "CUSTOMER", scopeValue: null }],
      conditions: [
        { field: "maxDaysPastDue", operator: "GREATER_OR_EQUAL", value: cfg.customerCredit.warningDaysPastDue, description: `Cartera >= ${cfg.customerCredit.warningDaysPastDue} dias` },
      ],
      actions: [
        { type: "NOTIFY", target: "creditAlert", value: true, description: "Generar alerta de cartera (no bloquear automaticamente)" },
      ],
      parameters: [
        { name: "warningDaysPastDue", type: "NUMBER", value: cfg.customerCredit.warningDaysPastDue, description: "Dias para alerta", unit: "dias" },
        { name: "criticalDaysPastDue", type: "NUMBER", value: cfg.customerCredit.criticalDaysPastDue, description: "Dias para nivel critico", unit: "dias" },
      ],
      priority: 190,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["pedidos", "cartera", "credito"],
      metadata: { policyPack: "castillitos-order-v1", fase: 3 },
    },

    // FASE 4: Auto Size Distribution
    {
      id: "cop-auto-size-distribution-v1",
      tenantId: TENANT_ID,
      category: "ORDER",
      name: "Distribucion Automatica por Tallas",
      description: "Cuando el vendedor pide N unidades surtidas, distribuir automaticamente por tallas segun inventario disponible, nivelando la distribucion.",
      scopes: [{ scope: "ORDER", scopeValue: null }],
      conditions: [
        { field: "requestedSurtido", operator: "GREATER_THAN", value: 0, description: "Pedido con surtido solicitado" },
      ],
      actions: [
        { type: "SET_VALUE", target: "sizeDistribution", value: "balanced", description: "Distribucion equilibrada por tallas" },
      ],
      parameters: [
        { name: "maxUnitsPerSize", type: "NUMBER", value: cfg.autoSizeDistribution.maxUnitsPerSize, description: "Maximo por talla", unit: "und" },
        { name: "minSizesForBalance", type: "NUMBER", value: cfg.autoSizeDistribution.minSizesForBalance, description: "Minimo tallas para balance", unit: null },
      ],
      priority: 150,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["pedidos", "tallas", "surtido"],
      metadata: { policyPack: "castillitos-order-v1", fase: 4 },
    },

    // FASE 5: Partial Delivery
    {
      id: "cop-partial-delivery-v1",
      tenantId: TENANT_ID,
      category: "ORDER",
      name: "Despacho Parcial",
      description: "Evaluar si el pedido puede despacharse completo, parcial, o debe ir a backorder.",
      scopes: [{ scope: "ORDER", scopeValue: null }],
      conditions: [],
      actions: [
        { type: "SET_VALUE", target: "deliveryMode", value: "evaluate", description: "Evaluar estado de despacho" },
      ],
      parameters: [
        { name: "minFulfillmentPct", type: "NUMBER", value: cfg.partialDelivery.minFulfillmentPct, description: "Minimo cumplimiento", unit: "%" },
        { name: "partialDeliveryEnabled", type: "BOOLEAN", value: cfg.partialDelivery.partialDeliveryEnabled, description: "Despacho parcial habilitado", unit: null },
        { name: "backorderEnabled", type: "BOOLEAN", value: cfg.partialDelivery.backorderEnabled, description: "Backorder habilitado", unit: null },
      ],
      priority: 140,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["pedidos", "despacho", "parcial"],
      metadata: { policyPack: "castillitos-order-v1", fase: 5 },
    },

    // FASE 6: Discount Override
    {
      id: "cop-discount-override-v1",
      tenantId: TENANT_ID,
      category: "ORDER",
      name: "Omision de Descuento",
      description: "Permitir omitir descuento con registro completo de trazabilidad: usuario, fecha, motivo.",
      scopes: [{ scope: "ORDER", scopeValue: null }],
      conditions: [
        { field: "discountOverride", operator: "IS_NOT_NULL", value: null, description: "Cuando se solicita omision de descuento" },
      ],
      actions: [
        { type: "SET_FLAG", target: "discountOverridden", value: true, description: "Marcar descuento como omitido" },
      ],
      parameters: [
        { name: "overrideAllowed", type: "BOOLEAN", value: cfg.discountOverride.overrideAllowed, description: "Omision permitida", unit: null },
        { name: "requireReason", type: "BOOLEAN", value: cfg.discountOverride.requireReason, description: "Motivo obligatorio", unit: null },
      ],
      priority: 100,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["pedidos", "descuento", "trazabilidad"],
      metadata: { policyPack: "castillitos-order-v1", fase: 6 },
    },

    // FASE 7: Order Readiness
    {
      id: "cop-order-readiness-v1",
      tenantId: TENANT_ID,
      category: "ORDER",
      name: "Evaluacion de Preparacion del Pedido",
      description: "Antes de confirmar, evaluar: sucursal, cliente, inventario, cartera, referencias, tallas. Resultado: READY / WARNING / BLOCKED.",
      scopes: [{ scope: "ORDER", scopeValue: null }],
      conditions: [
        { field: "orderSubmission", operator: "EQUALS", value: true, description: "Al intentar confirmar pedido" },
      ],
      actions: [
        { type: "SET_VALUE", target: "readinessCheck", value: "full", description: "Evaluacion completa de preparacion" },
      ],
      parameters: [
        { name: "minOrderValue", type: "NUMBER", value: cfg.orderReadiness.minOrderValue, description: "Valor minimo", unit: "COP" },
        { name: "minOrderUnits", type: "NUMBER", value: cfg.orderReadiness.minOrderUnits, description: "Unidades minimas", unit: "und" },
      ],
      priority: 250,
      status: "ACTIVE",
      versionInfo: VERSION_INFO,
      tags: ["pedidos", "readiness", "validacion"],
      metadata: { policyPack: "castillitos-order-v1", fase: 7 },
    },
  ];
}

let registered = false;

export function registerCastillitosOrderPolicyPack(): {
  success: boolean;
  registered: number;
  failed: number;
  errors: string[];
} {
  if (registered) {
    return { success: true, registered: 0, failed: 0, errors: ["Already registered"] };
  }

  const policies = buildCastillitosOrderPolicies();
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

export function getCastillitosOrderPolicies(): BusinessPolicy[] {
  return buildCastillitosOrderPolicies();
}

export const CASTILLITOS_ORDER_POLICY_PACK_VERSION = "1.0.0";
export const CASTILLITOS_ORDER_POLICY_COUNT = 6;
