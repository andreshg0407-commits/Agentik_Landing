/**
 * lib/decisions/decision-fixtures.ts
 *
 * Agentik — Decision Engine Test Fixtures
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Realistic fixtures for testing and local demos.
 * All data refers to Castillitos tenant (current active tenant).
 *
 * Pure. No Prisma. No React. No Next.
 */

import type { DecisionSignal }  from "./decision-signals";
import type { DecisionContext } from "./decision-context";

// ── Signal fixtures ───────────────────────────────────────────────────────────

export const financeConciliationSignal: DecisionSignal = {
  id:          "sig_fin_conc_001",
  domain:      "FINANCE",
  source:      "RULE_ENGINE",
  type:        "conciliation_exception_detected",
  title:       "Excepción de conciliación detectada — Cuenta 4120",
  description: "Se detectó una diferencia de $142,500 entre el estado de cuenta bancario y el libro mayor para la cuenta 4120 del período Mayo 2026.",
  severity:    "HIGH",
  detectedAt:  "2026-06-03T09:00:00Z",
  entityType:  "bank_account",
  entityId:    "acc_4120_castillitos",
  metrics: {
    monetaryAmount:   142500,
    currency:         "MXN",
    count:            3,
    currentValue:     142500,
    previousValue:    0,
  },
  metadata: {
    bankAccount:   "4120",
    period:        "2026-05",
    reconciliationSessionId: "rec_session_may26",
  },
};

export const financeCashflowRiskSignal: DecisionSignal = {
  id:          "sig_fin_cash_001",
  domain:      "FINANCE",
  source:      "RULE_ENGINE",
  type:        "cashflow_risk_detected",
  title:       "Riesgo de liquidez detectado — Semana 23",
  description: "La proyección de flujo de caja para la semana 23 muestra un déficit estimado de $380,000 MXN considerando los compromisos de pago programados.",
  severity:    "HIGH",
  detectedAt:  "2026-06-03T08:30:00Z",
  entityType:  "cashflow_projection",
  entityId:    "cf_proj_w23_2026",
  metrics: {
    monetaryAmount:   380000,
    currency:         "MXN",
    percentageChange: -12.4,
    threshold:        500000,
    currentValue:     120000,
  },
  metadata: {
    week:      "W23-2026",
    riskLevel: "high",
  },
};

export const collectionsOverdueSignal: DecisionSignal = {
  id:          "sig_col_ovrd_001",
  domain:      "COLLECTIONS",
  source:      "INTEGRATION",
  type:        "overdue_customer_detected",
  title:       "Cliente vencido: Distribuidora Norte SA — $215,000",
  description: "Distribuidora Norte SA tiene una cartera vencida de $215,000 MXN con 75 días de atraso. Tres facturas sin pago: F-2026-0341, F-2026-0398, F-2026-0412.",
  severity:    "HIGH",
  detectedAt:  "2026-06-03T07:00:00Z",
  entityType:  "customer",
  entityId:    "cust_distribnorte_001",
  metrics: {
    monetaryAmount: 215000,
    currency:       "MXN",
    daysOverdue:    75,
    count:          3,
  },
  metadata: {
    customerId:   "cust_distribnorte_001",
    customerName: "Distribuidora Norte SA",
    invoiceIds:   ["F-2026-0341", "F-2026-0398", "F-2026-0412"],
  },
};

export const commercialMarginDropSignal: DecisionSignal = {
  id:          "sig_com_marg_001",
  domain:      "COMMERCIAL",
  source:      "RULE_ENGINE",
  type:        "commercial_margin_drop_detected",
  title:       "Caída de margen en línea Maletas Premium — −8.3%",
  description: "El margen bruto de la línea Maletas Premium cayó de 38.2% a 29.9% en el último mes, atribuido a incremento en costo de materiales importados.",
  severity:    "HIGH",
  detectedAt:  "2026-06-03T08:00:00Z",
  entityType:  "product_line",
  entityId:    "pl_maletas_premium_001",
  metrics: {
    percentageChange: -8.3,
    previousValue:    38.2,
    currentValue:     29.9,
    threshold:        32.0,
  },
  metadata: {
    productLine: "Maletas Premium",
    period:      "2026-05",
    cause:       "imported_materials_cost_increase",
  },
};

export const marketingCampaignReadySignal: DecisionSignal = {
  id:          "sig_mkt_camp_001",
  domain:      "MARKETING",
  source:      "AGENT",
  type:        "campaign_ready_for_approval",
  title:       "Campaña 'Verano Castillitos 2026' lista para aprobación",
  description: "La campaña de redes sociales para el lanzamiento de temporada de verano ha sido preparada por el agente. Incluye 14 piezas gráficas y 4 videos cortos. Pendiente de aprobación editorial.",
  severity:    "MEDIUM",
  detectedAt:  "2026-06-03T10:00:00Z",
  entityType:  "campaign",
  entityId:    "camp_verano_2026_001",
  metrics: {
    count: 18,
  },
  metadata: {
    campaignName:   "Verano Castillitos 2026",
    contentCount:   18,
    channels:       ["instagram", "facebook", "tiktok"],
    estimatedReach: 45000,
  },
};

export const operationsInventoryTransferSignal: DecisionSignal = {
  id:          "sig_ops_invt_001",
  domain:      "OPERATIONS",
  source:      "INTEGRATION",
  type:        "inventory_transfer_required",
  title:       "Transferencia de inventario requerida — Almacén Sur a Norte",
  description: "El almacén Norte tiene stock crítico de Maletas Ejecutivas (12 unidades disponibles vs. 45 proyectadas para la siguiente semana). Se requiere transferencia desde Almacén Sur (300 unidades disponibles).",
  severity:    "HIGH",
  detectedAt:  "2026-06-03T06:00:00Z",
  entityType:  "warehouse",
  entityId:    "wh_norte_001",
  metrics: {
    count:        12,
    threshold:    45,
    currentValue: 12,
  },
  metadata: {
    sourceWarehouse:      "wh_sur_001",
    destinationWarehouse: "wh_norte_001",
    sku:                  "MAL-EXEC-001",
    unitsRequired:        33,
    unitsAvailable:       300,
  },
};

// ── Context fixture — Castillitos / Diego / Finanzas ─────────────────────────

export const castillitosDecisionContext: DecisionContext = {
  orgSlug:          "castillitos",
  organizationId:   "org_castillitos_001",
  tenantVertical:   "retail",
  module:           "finanzas",
  agentId:          "diego",
  agentName:        "Diego",
  userId:           undefined,
  role:             "ORG_ADMIN",
  currentRoute:     "/castillitos/finanzas/conciliacion",
  businessDate:     "2026-06-03",
  signals: [
    financeConciliationSignal,
    financeCashflowRiskSignal,
    collectionsOverdueSignal,
    commercialMarginDropSignal,
    marketingCampaignReadySignal,
    operationsInventoryTransferSignal,
  ],
  activeTasks:       [],
  pendingApprovals:  [],
  recentExecutions:  [],
  workflowRuns:      [],
  metadata: {
    sessionId:  "sess_demo_001",
    triggeredBy: "scheduled_scan",
  },
};

// ── Minimal context fixture (single signal, no active tasks) ──────────────────

export const minimalDecisionContext: DecisionContext = {
  orgSlug:          "castillitos",
  module:           "finanzas",
  agentId:          "diego",
  agentName:        "Diego",
  businessDate:     "2026-06-03",
  signals:          [financeConciliationSignal],
  activeTasks:      [],
  pendingApprovals: [],
  recentExecutions: [],
  workflowRuns:     [],
  metadata:         {},
};

// ── Context with deduplication pressure ──────────────────────────────────────

export const contextWithActiveTasks: DecisionContext = {
  ...castillitosDecisionContext,
  signals:         [financeConciliationSignal],
  activeTasks: [{
    id:          "task_existing_001",
    title:       "Revisar conciliación cuenta 4120",
    status:      "OPEN",
    domain:      "FINANCE",
    entityType:  "bank_account",
    entityId:    "acc_4120_castillitos",
    createdAt:   "2026-06-02T15:00:00Z",
  }],
  pendingApprovals: [],
};
