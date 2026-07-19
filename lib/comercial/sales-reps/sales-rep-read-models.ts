/**
 * lib/comercial/sales-reps/sales-rep-read-models.ts
 *
 * FASE 15 — Mobile contract builder with capability placeholders.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

import type {
  SalesRepMobileContract,
  SalesRepMobileCapability,
  SalesRepDailyState,
  MobileCapabilityStatus,
} from "./sales-rep-decision-types";

// ── Capability definitions ─────────────────────────────────────────────────

interface CapabilityDefinition {
  id: string;
  label: string;
  evaluate: (state: SalesRepDailyState) => { status: MobileCapabilityStatus; reason: string | null };
}

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    id: "mallet_overview",
    label: "Vista de Maleta",
    evaluate: (state) => {
      if (!state.malletState) return { status: "NOT_CONFIGURED", reason: "Maleta no configurada para este vendedor" };
      if (state.malletState.status === "NO_DATA") return { status: "NOT_CONFIGURED", reason: "Sin datos de maleta" };
      return { status: "AVAILABLE", reason: null };
    },
  },
  {
    id: "customer_alerts",
    label: "Alertas de Clientes",
    evaluate: () => {
      // Always available — even if no alerts exist, the capability is ready
      return { status: "AVAILABLE", reason: null };
    },
  },
  {
    id: "order_tracking",
    label: "Seguimiento de Pedidos",
    evaluate: () => {
      return { status: "AVAILABLE", reason: null };
    },
  },
  {
    id: "replacement_suggestions",
    label: "Sugerencias de Reemplazo",
    evaluate: (state) => {
      if (!state.malletState) return { status: "NOT_CONFIGURED", reason: "Maleta no configurada" };
      return { status: "AVAILABLE", reason: null };
    },
  },
  {
    id: "order_creation",
    label: "Creacion de Pedidos",
    evaluate: () => {
      // Phase 1: not yet available on mobile
      return { status: "UNAVAILABLE", reason: "Disponible en version futura de la app movil" };
    },
  },
  {
    id: "customer_priority",
    label: "Prioridad de Clientes",
    evaluate: () => {
      return { status: "AVAILABLE", reason: null };
    },
  },
];

// ── Builder ────────────────────────────────────────────────────────────────

export function buildMobileContract(
  dailyState: SalesRepDailyState,
): SalesRepMobileContract {
  const capabilities: SalesRepMobileCapability[] = CAPABILITY_DEFINITIONS.map(def => {
    const { status, reason } = def.evaluate(dailyState);
    return {
      id: def.id,
      label: def.label,
      status,
      reason,
    };
  });

  return {
    salesRepId: dailyState.salesRep.salesRepId,
    tenantId: dailyState.tenantId,
    capabilities,
    dailyState,
    generatedAt: new Date().toISOString(),
  };
}

export function getMobileCapabilityCount(): number {
  return CAPABILITY_DEFINITIONS.length;
}
