/**
 * lib/operational-data/agent-context.ts
 *
 * Agent Context — what Agentik's intelligent agents receive and consume.
 *
 * ─── RULE ────────────────────────────────────────────────────────────────────
 * Agents NEVER read:
 *   - SAG database tables
 *   - CRM API objects
 *   - Shopify webhooks directly
 *   - MaletasOperationalContext (legacy SAG view)
 *
 * Agents ALWAYS consume:
 *   - CommercialOperationalContext (this layer)
 *   - Domain-specific views derived from it (DavidContext, DiegoContext, etc.)
 *
 * This ensures agents reason about "the operation" — not about ERP internals.
 *
 * ─── AGENTS ──────────────────────────────────────────────────────────────────
 *   David    — Agente Comercial: coverage, vendors, transfers, portfolio pressure
 *   Diego    — Agente de Producción: demand queue, lead time, capacity
 *   Finanzas — Agente Financiero: rotation, working capital, dead stock
 *   Copilot  — Coordinación transversal: synthesis, prioritization, escalation
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { CommercialOperationalContext } from "./operational-context";
import type {
  OperationalDemandSignal,
  OperationalCommercialEvent,
  OperationalCustomer,
  OperationalOrder,
  OperationalSalesRep,
} from "./operational-entities";
import type { OperationalInventoryItem }    from "@/lib/operational-inventory/operational-inventory-types";
import type { ReservationPressureSignal }   from "@/lib/operational-inventory/operational-reservation-types";

// ─── David — Agente Comercial ─────────────────────────────────────────────────

/**
 * The view of CommercialOperationalContext that David reasons about.
 * Focused on: vendor coverage, portfolio pressure, transfer opportunities.
 */
export interface DavidAgentContext {
  organizationId:     string;
  /** Inventory items where David's attention is needed */
  pressuredItems:     OperationalInventoryItem[];
  /** Items fully depleted across at least one active portfolio */
  depletedItems:      OperationalInventoryItem[];
  /** Active demand signals — David escalates to Diego when needed */
  demandSignals:      OperationalDemandSignal[];
  /** Reservation pressure signals to process */
  reservationAlerts:  ReservationPressureSignal[];
  /** Sales reps with coverage pressure */
  pressuredReps:      OperationalSalesRep[];
  /** High-value customers at risk (no recent order, active opportunity) */
  atRiskCustomers:    OperationalCustomer[];
  /** Recent events for context */
  recentEvents:       OperationalCommercialEvent[];
  computedAt:         string;
}

/**
 * Derives David's context from the full CommercialOperationalContext.
 * David receives only what's relevant to his domain.
 */
export function buildDavidContext(ctx: CommercialOperationalContext): DavidAgentContext {
  return {
    organizationId:    ctx.organizationId,
    pressuredItems:    ctx.inventory.filter(i => i.portfoliosUnderPressure > 0),
    depletedItems:     ctx.inventory.filter(i => i.operationalAvailableQty === 0),
    demandSignals:     ctx.demandSignals.filter(s => s.urgency !== "ninguna"),
    reservationAlerts: [],  // V2: from reservation pressure signals
    pressuredReps:     ctx.salesReps.filter(r => r.activityScore < 40),
    atRiskCustomers:   ctx.customers.filter(c => c.segment === "inactivo" || c.engagementScore < 30),
    recentEvents:      ctx.recentEvents.filter(e =>
      ["coverage.drop", "coverage.critical", "reference.depleted",
       "production.signal_fired", "order.cancelled"].includes(e.eventType),
    ),
    computedAt: new Date().toISOString(),
  };
}

// ─── Diego — Agente de Producción ────────────────────────────────────────────

/**
 * The view Diego uses to reason about production demand.
 */
export interface DiegoAgentContext {
  organizationId:        string;
  /** Demand signals that require production (inventory_pressure type, alta urgency) */
  productionQueue:       OperationalDemandSignal[];
  /** Items with critically low stock + high velocity */
  urgentRefs:            OperationalInventoryItem[];
  /** Current order backlog from all sources (confirmed, not yet fulfilled) */
  orderBacklog:          OperationalOrder[];
  recentEvents:          OperationalCommercialEvent[];
  computedAt:            string;
}

export function buildDiegoContext(ctx: CommercialOperationalContext): DiegoAgentContext {
  return {
    organizationId:   ctx.organizationId,
    productionQueue:  ctx.demandSignals.filter(s =>
      s.signalType === "inventory_pressure" && (s.urgency === "alta" || s.urgency === "media"),
    ),
    urgentRefs:       ctx.inventory.filter(i =>
      i.operationalAvailableQty === 0 || i.portfoliosDepleted > 0,
    ),
    orderBacklog:     ctx.orders.filter(o =>
      ["confirmed", "sent_to_erp", "processing"].includes(o.status),
    ),
    recentEvents:     ctx.recentEvents.filter(e =>
      ["production.signal_fired", "production.urgente", "reference.depleted",
       "demand.signal_fired"].includes(e.eventType),
    ),
    computedAt: new Date().toISOString(),
  };
}

// ─── Finanzas — Agente Financiero ─────────────────────────────────────────────

export interface FinanzasAgentContext {
  organizationId:     string;
  /** Items with high physical stock but near-zero velocity = capital at risk */
  deadStockRisk:      OperationalInventoryItem[];
  /** Demand signals indicating dead_stock_risk */
  deadStockSignals:   OperationalDemandSignal[];
  /** Orders in a terminal state (fulfilled/cancelled) for revenue tracking */
  closedOrders:       OperationalOrder[];
  recentEvents:       OperationalCommercialEvent[];
  computedAt:         string;
}

export function buildFinanzasContext(ctx: CommercialOperationalContext): FinanzasAgentContext {
  return {
    organizationId:  ctx.organizationId,
    deadStockRisk:   ctx.inventory.filter(i =>
      i.physicalQty > 0 && i.operationalAvailableQty === i.physicalQty && i.portfoliosUnderPressure === 0,
    ),
    deadStockSignals: ctx.demandSignals.filter(s => s.signalType === "dead_stock_risk"),
    closedOrders:    ctx.orders.filter(o => o.status === "fulfilled" || o.status === "cancelled"),
    recentEvents:    ctx.recentEvents.filter(e =>
      ["dead_stock.detected", "order.fulfilled", "order.cancelled", "coverage.recovered"].includes(e.eventType),
    ),
    computedAt: new Date().toISOString(),
  };
}

// ─── Copilot — Coordinación transversal ──────────────────────────────────────

/**
 * Copilot receives the full context enriched with cross-domain synthesis.
 */
export interface CopilotAgentContext {
  organizationId:      string;
  /** Aggregated priority-ranked action items from all agents */
  priorityActions:     CopilotPriorityAction[];
  /** Critical signals requiring immediate coordinator attention */
  escalations:         CopilotEscalation[];
  /** Coverage health summary */
  coverageSummary:     CommercialOperationalContext["coverage"];
  /** Recent events from ALL domains */
  recentEvents:        OperationalCommercialEvent[];
  computedAt:          string;
}

export interface CopilotPriorityAction {
  priority:     1 | 2 | 3;  // 1 = highest
  domain:       "comercial" | "produccion" | "finanzas" | "logistica";
  title:        string;
  description:  string;
  entityType?:  string;
  entityId?:    string;
  urgency:      "critica" | "alta" | "media" | "info";
}

export interface CopilotEscalation {
  from:         "david" | "diego" | "finanzas";
  to:           "coordinator" | "manager" | "production" | "logistics";
  reason:       string;
  entityRef?:   string;
  escalatedAt:  string;
}

export function buildCopilotContext(
  ctx:    CommercialOperationalContext,
  david:  DavidAgentContext,
  diego:  DiegoAgentContext,
): CopilotAgentContext {
  const escalations: CopilotEscalation[] = [];
  const actions:     CopilotPriorityAction[] = [];
  const now = new Date().toISOString();

  // Escalate depleted items to coordinator
  for (const item of david.depletedItems.slice(0, 5)) {
    actions.push({
      priority:    1,
      domain:      "comercial",
      title:       `Referencia agotada: ${item.reference}`,
      description: `${item.description} sin disponibilidad operacional en ${item.portfoliosDepleted} maleta(s).`,
      entityType:  "reference",
      entityId:    item.reference,
      urgency:     "critica",
    });
  }

  // Escalate production queue to Diego
  for (const signal of diego.productionQueue.slice(0, 3)) {
    if (signal.urgency === "alta") {
      escalations.push({
        from:        "david",
        to:          "production",
        reason:      `Señal de demanda alta: ${signal.reference} — ${signal.qtyNeeded} uds requeridas`,
        entityRef:   signal.reference,
        escalatedAt: now,
      });
    }
  }

  return {
    organizationId:  ctx.organizationId,
    priorityActions: actions,
    escalations,
    coverageSummary: ctx.coverage,
    recentEvents:    ctx.recentEvents,
    computedAt:      now,
  };
}
