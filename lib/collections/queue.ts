/**
 * lib/collections/queue.ts
 *
 * Collections work queue — sorted by combined risk signal.
 *
 * Produces a prioritised list of customers that need collection action today.
 * Reads exclusively from the denormalized CustomerProfile fields so no JOIN
 * against CustomerReceivable is needed (fast for large orgs).
 *
 * Sort key: riskScore DESC → maxDpd DESC → overdueReceivable DESC
 *
 * ── Fiscal window + carry-over rule ──────────────────────────────────────────
 *
 * The carry-over rule mandates that customers with overdue balances ALWAYS appear
 * in the collections queue, regardless of fiscal window. The window filter only
 * adds context: each row is annotated with isCarryOver = true when the customer's
 * last purchase falls before the window start (they are an old commercial
 * relationship whose debt carries into the current period).
 *
 * No rows are excluded due to window filtering — all overdue balances show up.
 *
 * Exports:
 *   getCollectionsQueue(orgId, limit?, window?)   → CollectionsQueueRow[]
 *   suggestAction(maxDpd, overdueRatio)           → SuggestedCollectionAction (pure)
 *   getWhoToCallToday(orgId, limit?, window?)     → top-N work queue (copilot-ready)
 */

import { prisma }                       from "@/lib/prisma";
import type { FiscalWindow }            from "@/lib/finance/fiscal-window";
import { isCarryOver as checkCarryOver } from "@/lib/finance/fiscal-window";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CollectionChannel = "whatsapp" | "call" | "email" | "legal";
export type CollectionPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type RiskTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface SuggestedCollectionAction {
  label:       string;
  priority:    CollectionPriority;
  channel:     CollectionChannel;
  /** Short rationale shown in the queue UI */
  rationale:   string;
  /** Suggested WhatsApp/call script headline */
  scriptHint:  string;
}

export interface CollectionsQueueRow {
  slug:              string;
  name:              string;
  nit:               string | null;
  city:              string | null;
  sellerName:        string | null;
  overdueReceivable: number;
  totalReceivable:   number;
  maxDpd:            number;
  riskScore:         number | null;
  riskTier:          RiskTier;
  overdueRatio:      number;    // 0–100
  suggestedAction:   SuggestedCollectionAction;
  /**
   * True when the customer's last purchase predates the active fiscal window.
   * Indicates a carry-over balance from a prior fiscal year.
   * Always false when no fiscal window is active (full history mode).
   */
  isCarryOver:       boolean;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

function riskTier(maxDpd: number, overdueRatio: number): RiskTier {
  if (maxDpd > 180 || overdueRatio > 90) return "CRITICAL";
  if (maxDpd > 90  || overdueRatio > 60) return "HIGH";
  if (maxDpd > 30  || overdueRatio > 30) return "MEDIUM";
  return "LOW";
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
    rationale:  "Sin saldo vencido actual.",
    scriptHint: "Sin acción de cobranza requerida.",
  };
}

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Returns the collections work queue for an org, sorted by risk.
 * Only customers with overdueReceivable > 0 are included.
 *
 * Carry-over rule: ALL overdue customers are returned regardless of fiscal
 * window — the window only annotates rows with isCarryOver for UI display.
 *
 * @param organizationId  Org to query.
 * @param limit           Max rows (default 50).
 * @param window          Optional fiscal window for carry-over annotation.
 */
export async function getCollectionsQueue(
  organizationId: string,
  limit  = 50,
  window?: FiscalWindow,
): Promise<CollectionsQueueRow[]> {
  const db = prisma as any;

  const rows = await db.customerProfile.findMany({
    where: {
      organizationId,
      overdueReceivable: { gt: 0 },
    },
    orderBy: [
      { riskScore:         "desc" },
      { maxDpd:            "desc" },
      { overdueReceivable: "desc" },
    ],
    take: limit,
    select: {
      slug:              true,
      name:              true,
      nit:               true,
      city:              true,
      sellerName:        true,
      overdueReceivable: true,
      totalReceivable:   true,
      maxDpd:            true,
      riskScore:         true,
      lastPurchaseAt:    true,
    },
  });

  return rows.map((r: any) => {
    const ov  = toNum(r.overdueReceivable);
    const tot = toNum(r.totalReceivable);
    const dpd = r.maxDpd ?? 0;
    const ovRatio = tot > 0 ? (ov / tot) * 100 : 0;

    return {
      slug:              r.slug,
      name:              r.name,
      nit:               r.nit ?? null,
      city:              r.city ?? null,
      sellerName:        r.sellerName ?? null,
      overdueReceivable: ov,
      totalReceivable:   tot,
      maxDpd:            dpd,
      riskScore:         r.riskScore != null ? Number(r.riskScore) : null,
      riskTier:          riskTier(dpd, ovRatio),
      overdueRatio:      ovRatio,
      suggestedAction:   suggestAction(dpd, ovRatio),
      isCarryOver:       window ? checkCarryOver(r.lastPurchaseAt, window) : false,
    };
  });
}

/**
 * Copilot-ready selector: top-N customers to contact today.
 *
 * Filters to URGENT + HIGH priority actions only.
 * Used by the copilot to answer "¿a quién debo llamar hoy?"
 */
export async function getWhoToCallToday(
  organizationId: string,
  limit  = 10,
  window?: FiscalWindow,
): Promise<CollectionsQueueRow[]> {
  const queue = await getCollectionsQueue(organizationId, 100, window);
  return queue
    .filter(r => r.suggestedAction.priority === "URGENT" || r.suggestedAction.priority === "HIGH")
    .slice(0, limit);
}
