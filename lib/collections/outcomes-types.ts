/**
 * lib/collections/outcomes-types.ts
 *
 * Pure types and UI constants for collection outcomes.
 * No server-side imports — safe to use in client components.
 *
 * DB operations live in lib/collections/outcomes.ts (server-only).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutcomeType =
  | "PAID"
  | "PARTIAL_PAYMENT"
  | "PROMISE_TO_PAY"
  | "IN_NEGOTIATION"
  | "NO_CONTACT"
  | "BROKEN_PROMISE"
  | "DISPUTE"
  | "ESCALATED";

export type ContactChannel = "call" | "whatsapp" | "email" | "in_person";

export interface CollectionOutcomeData {
  outcomeType:    OutcomeType;
  channel:        ContactChannel;
  contactedAt:    string;          // ISO timestamp
  notes?:         string;
  promiseDate?:   string;          // ISO date — required for PROMISE_TO_PAY
  promiseAmount?: number;          // COP — amount customer promised
  partialAmount?: number;          // COP — for PARTIAL_PAYMENT
  contactedBy?:   string;          // user email or name
}

export interface OutcomeHistoryRow {
  taskId:      string;
  outcome:     CollectionOutcomeData;
  completedAt: Date | null;
  title:       string;
}

// ── UI labels and icons (pure constants) ─────────────────────────────────────

export const OUTCOME_LABELS: Record<OutcomeType, string> = {
  PAID:             "Pago confirmado",
  PARTIAL_PAYMENT:  "Pago parcial",
  PROMISE_TO_PAY:   "Promesa de pago",
  IN_NEGOTIATION:   "En negociación",
  NO_CONTACT:       "Sin contacto",
  BROKEN_PROMISE:   "Promesa incumplida",
  DISPUTE:          "Disputa / reclamo",
  ESCALATED:        "Escalado a gerencia",
};

export const OUTCOME_ICONS: Record<OutcomeType, string> = {
  PAID:             "✅",
  PARTIAL_PAYMENT:  "💰",
  PROMISE_TO_PAY:   "🤝",
  IN_NEGOTIATION:   "💬",
  NO_CONTACT:       "📵",
  BROKEN_PROMISE:   "⚠️",
  DISPUTE:          "⚖️",
  ESCALATED:        "⬆️",
};
