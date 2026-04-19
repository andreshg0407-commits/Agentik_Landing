/**
 * lib/collections/outcomes.ts
 *
 * Collection task outcome state machine.
 *
 * Outcome types capture what happened when a collector contacted a debtor.
 * Outcomes are stored in ActionTask.resultJson when the task is completed,
 * and trigger the follow-up / score-feedback / Mila-memory pipeline.
 *
 * ── State flow ────────────────────────────────────────────────────────────────
 *
 *  Task PENDING → contact attempt → record outcome → Task COMPLETED
 *                                                     │
 *                    ┌──────────────────────────────────┤
 *                    │  PAID           → resolve Alert, lower riskScore
 *                    │  PARTIAL_PAYMENT → schedule follow-up, lower riskScore
 *                    │  PROMISE_TO_PAY  → schedule verification follow-up
 *                    │  IN_NEGOTIATION  → schedule check-in follow-up
 *                    │  NO_CONTACT      → reschedule + raise riskScore
 *                    │  BROKEN_PROMISE  → URGENT follow-up, escalate score
 *                    │  DISPUTE         → escalate to management
 *                    └  ESCALATED       → alert ops team
 *
 * ── Storage ───────────────────────────────────────────────────────────────────
 *
 *  ActionTask.resultJson schema (CollectionOutcomeData):
 *    outcomeType, channel, contactedAt, notes?,
 *    promiseDate?, promiseAmount?, partialAmount?, contactedBy?
 *
 * ── Export overview ───────────────────────────────────────────────────────────
 *
 *   OutcomeType             — string union
 *   CollectionOutcomeData   — result payload shape
 *   recordOutcome()         — orchestrator: saves + triggers pipeline
 *   getOutcomeHistory()     — last N outcomes for a customer
 *   getNoContactStreak()    — consecutive NO_CONTACT count
 */

import { prisma }                 from "@/lib/prisma";
import { Prisma, ActionTaskStatus } from "@prisma/client";
import { applyOutcomeFeedback }   from "./score-feedback";
import { scheduleFollowUp }       from "./follow-up";

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
  taskId:     string;
  outcome:    CollectionOutcomeData;
  completedAt: Date | null;
  title:       string;
}

// ── Outcome labels (for UI) ────────────────────────────────────────────────────

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

// ── Record outcome ─────────────────────────────────────────────────────────────

/**
 * Records an outcome for a CREAR_ACCION_COBRANZA ActionTask.
 *
 * Steps:
 *   1. Marks the ActionTask as COMPLETED with resultJson.
 *   2. Applies riskScore feedback to the customer's profile.
 *   3. Schedules follow-up tasks based on outcome rules.
 *
 * @param orgId       Tenant.
 * @param taskId      ActionTask.id being resolved.
 * @param outcome     What happened.
 * @param userEmail   Who is recording the outcome.
 * @param customerSlug  CustomerProfile.slug for score feedback.
 * @param customerName  Human-readable name.
 * @param currentDpd  Max DPD at time of contact.
 * @param overdueAmount Total overdue COP at time of contact.
 */
export async function recordOutcome(opts: {
  orgId:          string;
  taskId:         string;
  outcome:        CollectionOutcomeData;
  userEmail:      string;
  customerSlug:   string;
  customerName:   string;
  currentDpd:     number;
  overdueAmount:  number;
}): Promise<void> {
  const { orgId, taskId, outcome, userEmail, customerSlug, customerName, currentDpd, overdueAmount } = opts;

  // 1. Mark task COMPLETED with outcome in resultJson
  await prisma.actionTask.update({
    where: { id: taskId },
    data: {
      status:      ActionTaskStatus.COMPLETED,
      completedAt: new Date(),
      resultJson:  outcome as unknown as Prisma.InputJsonValue,
    },
  });

  // 2. Score feedback — never throw
  try {
    await applyOutcomeFeedback({ orgId, customerSlug, outcomeType: outcome.outcomeType });
  } catch (err) {
    console.error("[collections/outcomes] score feedback error:", err);
  }

  // 3. Follow-up automation — never throw
  try {
    await scheduleFollowUp({
      orgId,
      parentTaskId:  taskId,
      outcome,
      customerSlug,
      customerName,
      currentDpd,
      overdueAmount,
      createdBy: userEmail,
    });
  } catch (err) {
    console.error("[collections/outcomes] follow-up scheduling error:", err);
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Last N completed collection tasks for a customer (most recent first).
 */
export async function getOutcomeHistory(
  orgId:        string,
  customerSlug: string,
  limit = 10,
): Promise<OutcomeHistoryRow[]> {
  const rows = await prisma.actionTask.findMany({
    where: {
      organizationId: orgId,
      targetId:       customerSlug,
      actionType:     "CREAR_ACCION_COBRANZA",
      status:         ActionTaskStatus.COMPLETED,
      resultJson:     { not: Prisma.DbNull },
    },
    orderBy: { completedAt: "desc" },
    take:    limit,
    select:  { id: true, title: true, resultJson: true, completedAt: true },
  });

  return rows
    .filter(r => r.resultJson && typeof r.resultJson === "object" && !Array.isArray(r.resultJson))
    .map(r => ({
      taskId:      r.id,
      title:       r.title,
      completedAt: r.completedAt,
      outcome:     r.resultJson as unknown as CollectionOutcomeData,
    }));
}

/**
 * Returns consecutive NO_CONTACT count for a customer (from most recent backwards).
 * Resets to 0 on the first non-NO_CONTACT outcome.
 */
export async function getNoContactStreak(
  orgId:        string,
  customerSlug: string,
): Promise<number> {
  const history = await getOutcomeHistory(orgId, customerSlug, 10);
  let streak = 0;
  for (const row of history) {
    if (row.outcome.outcomeType === "NO_CONTACT") streak++;
    else break;
  }
  return streak;
}
