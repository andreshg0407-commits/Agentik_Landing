/**
 * lib/collections/follow-up.ts
 *
 * Follow-up automation rules — schedules the next ActionTask based on the
 * outcome of a completed collection task.
 *
 * ── Rules ────────────────────────────────────────────────────────────────────
 *
 *  PROMISE_TO_PAY   → new CREAR_ACCION_COBRANZA due on promiseDate+1d
 *                     title: "[VERIFICACIÓN] ¿Se cumplió la promesa?"
 *
 *  BROKEN_PROMISE   → new CREAR_ACCION_COBRANZA URGENT due today
 *                     title: "[PROMESA INCUMPLIDA] …"
 *
 *  NO_CONTACT (1st) → re-schedule in 24h, same priority
 *  NO_CONTACT (3+)  → escalate: ESCALAR_A_GERENCIA URGENT
 *
 *  IN_NEGOTIATION   → check-in in 48h HIGH
 *
 *  DISPUTE          → ESCALAR_A_GERENCIA URGENT immediately
 *
 *  PAID / PARTIAL_PAYMENT / ESCALATED → no automatic follow-up
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *
 *  Called from a try/catch in outcomes.ts. Never throws.
 */

import { createActionTask }        from "@/lib/actions/service";
import { getNoContactStreak }      from "./outcomes";
import type { CollectionOutcomeData, OutcomeType } from "./outcomes";
import { ActionTaskType, ActionTaskPriority } from "@prisma/client";

// ── Helper ────────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scheduleFollowUp(opts: {
  orgId:         string;
  parentTaskId:  string;
  outcome:       CollectionOutcomeData;
  customerSlug:  string;
  customerName:  string;
  currentDpd:    number;
  overdueAmount: number;
  createdBy:     string;
}): Promise<void> {
  const {
    orgId, outcome, customerSlug, customerName,
    currentDpd, overdueAmount, createdBy,
  } = opts;

  const { outcomeType } = outcome;

  // ── PROMISE_TO_PAY: verification on promise date ──────────────────────────
  if (outcomeType === "PROMISE_TO_PAY" && outcome.promiseDate) {
    const promiseDate = new Date(outcome.promiseDate);
    const verifyDate  = new Date(promiseDate.getTime() + 24 * 60 * 60 * 1000);
    const amtStr = outcome.promiseAmount ? fmtCOP(outcome.promiseAmount) : fmtCOP(overdueAmount);

    await createActionTask(orgId, createdBy, {
      title:        `[VERIFICACIÓN PROMESA] ${customerName} — comprometido ${amtStr}`,
      description:  [
        `Verificar si ${customerName} cumplió su promesa de pago de ${amtStr}.`,
        `Fecha comprometida: ${new Date(outcome.promiseDate).toLocaleDateString("es-CO")}.`,
        `Si no ha pagado → registrar como PROMESA INCUMPLIDA y escalar.`,
      ].join("\n"),
      actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
      targetType:   "customer",
      targetId:     customerSlug,
      targetLabel:  customerName,
      sourceModule: "collections_followup",
      priority:     ActionTaskPriority.HIGH,
      dueAt:        verifyDate,
      payloadJson: {
        followUpType:   "promise_verification",
        promiseDate:    outcome.promiseDate,
        promiseAmount:  outcome.promiseAmount ?? overdueAmount,
        channel:        outcome.channel,
        currentDpd,
      },
    });
    return;
  }

  // ── BROKEN_PROMISE: immediate URGENT escalation ───────────────────────────
  if (outcomeType === "BROKEN_PROMISE") {
    await createActionTask(orgId, createdBy, {
      title:        `[PROMESA INCUMPLIDA] ${customerName} — ${fmtCOP(overdueAmount)} · +${currentDpd}d`,
      description:  [
        `${customerName} no cumplió su promesa de pago.`,
        `Cartera vencida: ${fmtCOP(overdueAmount)} · DPD: +${currentDpd}d.`,
        `Acción: llamada directa de gerencia + evaluar inicio de proceso jurídico.`,
      ].join("\n"),
      actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
      targetType:   "customer",
      targetId:     customerSlug,
      targetLabel:  customerName,
      sourceModule: "collections_followup",
      priority:     ActionTaskPriority.URGENT,
      dueAt:        daysFromNow(0),
      payloadJson: {
        followUpType:   "broken_promise",
        overdueAmount,
        currentDpd,
        suggestedChannel: "call",
      },
    });
    return;
  }

  // ── DISPUTE: escalate to management immediately ───────────────────────────
  if (outcomeType === "DISPUTE") {
    await createActionTask(orgId, createdBy, {
      title:        `[DISPUTA] ${customerName} — reclamo sobre ${fmtCOP(overdueAmount)}`,
      description:  [
        `${customerName} disputa la deuda de ${fmtCOP(overdueAmount)} (DPD: +${currentDpd}d).`,
        `Notas del colector: ${outcome.notes ?? "Sin notas."}`,
        `Acción: revisar facturas originales, escalar a gerencia comercial y legal.`,
      ].join("\n"),
      actionType:   ActionTaskType.ESCALAR_A_GERENCIA,
      targetType:   "customer",
      targetId:     customerSlug,
      targetLabel:  customerName,
      sourceModule: "collections_followup",
      priority:     ActionTaskPriority.URGENT,
      dueAt:        daysFromNow(0),
      payloadJson: {
        followUpType:   "dispute_escalation",
        overdueAmount,
        currentDpd,
        notes:          outcome.notes,
      },
    });
    return;
  }

  // ── NO_CONTACT: reschedule (escalate after 3rd attempt) ──────────────────
  if (outcomeType === "NO_CONTACT") {
    const streak = await getNoContactStreak(orgId, customerSlug);

    if (streak >= 3) {
      // 3+ consecutive no-contacts → escalate to management
      await createActionTask(orgId, createdBy, {
        title:        `[SIN CONTACTO ×${streak}] ${customerName} — ${fmtCOP(overdueAmount)}`,
        description:  [
          `${customerName} no ha podido ser contactado en ${streak} intentos consecutivos.`,
          `Cartera vencida: ${fmtCOP(overdueAmount)} · DPD: +${currentDpd}d.`,
          `Acción: escalar a gerencia. Considerar proceso de cobro jurídico.`,
        ].join("\n"),
        actionType:   ActionTaskType.ESCALAR_A_GERENCIA,
        targetType:   "customer",
        targetId:     customerSlug,
        targetLabel:  customerName,
        sourceModule: "collections_followup",
        priority:     ActionTaskPriority.URGENT,
        dueAt:        daysFromNow(0),
        payloadJson: {
          followUpType:   "no_contact_escalation",
          noContactCount: streak,
          overdueAmount,
          currentDpd,
        },
      });
    } else {
      // Reschedule in 24h
      await createActionTask(orgId, createdBy, {
        title:        `[REINTENTO] ${customerName} — intento ${streak + 1}`,
        description:  [
          `Intento ${streak + 1} de contacto con ${customerName}.`,
          `Cartera vencida: ${fmtCOP(overdueAmount)} · DPD: +${currentDpd}d.`,
          `Sugerencia: probar canal alternativo (${outcome.channel === "call" ? "WhatsApp" : "llamada"}).`,
        ].join("\n"),
        actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
        targetType:   "customer",
        targetId:     customerSlug,
        targetLabel:  customerName,
        sourceModule: "collections_followup",
        priority:     currentDpd > 90 ? ActionTaskPriority.URGENT : ActionTaskPriority.HIGH,
        dueAt:        daysFromNow(1),
        payloadJson: {
          followUpType:   "no_contact_retry",
          noContactCount: streak,
          overdueAmount,
          currentDpd,
          suggestedChannel: outcome.channel === "call" ? "whatsapp" : "call",
        },
      });
    }
    return;
  }

  // ── IN_NEGOTIATION: check-in in 48h ──────────────────────────────────────
  if (outcomeType === "IN_NEGOTIATION") {
    await createActionTask(orgId, createdBy, {
      title:        `[SEGUIMIENTO NEGOCIACIÓN] ${customerName}`,
      description:  [
        `${customerName} está en proceso de negociación.`,
        `Saldo en disputa: ${fmtCOP(overdueAmount)} · DPD: +${currentDpd}d.`,
        `Notas: ${outcome.notes ?? "Sin notas."}`,
        `Acción: confirmar avance de acuerdo de pago.`,
      ].join("\n"),
      actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
      targetType:   "customer",
      targetId:     customerSlug,
      targetLabel:  customerName,
      sourceModule: "collections_followup",
      priority:     ActionTaskPriority.HIGH,
      dueAt:        daysFromNow(2),
      payloadJson: {
        followUpType:   "negotiation_checkin",
        overdueAmount,
        currentDpd,
        notes:          outcome.notes,
      },
    });
  }

  // PAID / PARTIAL_PAYMENT / ESCALATED → no follow-up created
}
