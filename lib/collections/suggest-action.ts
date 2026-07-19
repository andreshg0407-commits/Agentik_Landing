/**
 * lib/collections/suggest-action.ts
 *
 * Pure collection action suggestion logic.
 * No server-side imports — safe to use in client components.
 *
 * Queue DB operations live in lib/collections/queue.ts (server-only).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CollectionChannel  = "whatsapp" | "call" | "email" | "legal";
export type CollectionPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type RiskTier           = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface SuggestedCollectionAction {
  label:      string;
  priority:   CollectionPriority;
  channel:    CollectionChannel;
  /** Short rationale shown in the queue UI */
  rationale:  string;
  /** Suggested WhatsApp/call script headline */
  scriptHint: string;
}

// ── Action suggestion rules (pure) ────────────────────────────────────────────

/**
 * Determines the recommended collection action based on aging signals.
 * Pure function — safe to call from UI, copilot, or server actions.
 *
 * Rules (checked in priority order):
 *   maxDpd > 180  → legal notice / external collections agency
 *   maxDpd > 90   → urgent call + escalate to management
 *   maxDpd > 60   → direct call + WhatsApp reminder
 *   maxDpd > 30   → WhatsApp reminder + email
 *   maxDpd > 0    → WhatsApp courtesy reminder
 */
export function suggestAction(
  maxDpd:       number,
  overdueRatio: number,
): SuggestedCollectionAction {
  if (maxDpd > 180) {
    return {
      label:      "Proceso legal / cobro externo",
      priority:   "URGENT",
      channel:    "legal",
      rationale:  `+${maxDpd}d — mora crónica. Requiere escalamiento jurídico.`,
      scriptHint: "Notificación de pre-cobro jurídico. Plazo final de pago.",
    };
  }
  if (maxDpd > 90) {
    return {
      label:      "Llamada urgente + escalación",
      priority:   "URGENT",
      channel:    "call",
      rationale:  `+${maxDpd}d — mora crítica. Llamada directa y escalación a gerencia.`,
      scriptHint: "Llamada gerencial urgente. Negociar plan de pago o garantías.",
    };
  }
  if (maxDpd > 60) {
    return {
      label:      "Llamada directa + WhatsApp",
      priority:   "HIGH",
      channel:    "call",
      rationale:  `+${maxDpd}d — cartera en riesgo alto. Llamada + mensaje de seguimiento.`,
      scriptHint: "Recordatorio de saldo vencido. Ofrecer plan de pago.",
    };
  }
  if (maxDpd > 30) {
    return {
      label:      "WhatsApp + email",
      priority:   "HIGH",
      channel:    "whatsapp",
      rationale:  `+${maxDpd}d — factura vencida. Recordatorio multicanal.`,
      scriptHint: "Aviso amable de factura vencida. Adjuntar estado de cuenta.",
    };
  }
  if (maxDpd > 0) {
    return {
      label:      "WhatsApp — recordatorio de cortesía",
      priority:   overdueRatio > 50 ? "MEDIUM" : "LOW",
      channel:    "whatsapp",
      rationale:  `+${maxDpd}d — mora reciente. Recordatorio preventivo.`,
      scriptHint: "Recordatorio de cortesía. Solicitar confirmación de pago.",
    };
  }
  return {
    label:      "Sin mora activa",
    priority:   "LOW",
    channel:    "email",
    rationale:  "Sin cartera vencida. Monitoreo preventivo.",
    scriptHint: "No se requiere acción inmediata.",
  };
}
