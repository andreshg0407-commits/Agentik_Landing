/**
 * lib/collections/mila-memory.ts
 *
 * Mila conversation memory integration for collections.
 *
 * Mila (the WhatsApp outbound agent) needs to know collection context before
 * opening a conversation: last outcome, open promises, DPD, and tone guidance.
 *
 * ── Integration contract ──────────────────────────────────────────────────────
 *
 *   1. Before Mila sends a collection message, call buildMilaCollectionBrief()
 *      to get a context string that primes the conversation.
 *
 *   2. After the conversation ends, call recordMilaCollectionContact() to
 *      persist the contact event back to the ActionTask system.
 *
 * ── Data source ───────────────────────────────────────────────────────────────
 *
 *   All data is derived from ActionTask queries (no new DB model required).
 *   The WaContactMemory model is used for phone-level memory; this layer
 *   provides slug-level (CustomerProfile) collection history.
 *
 * ── Why not WhatsAppContactMemory ────────────────────────────────────────────
 *
 *   WhatsAppContactMemory is keyed by phone number and tracks inbound intent
 *   outcomes (SALES, APPOINTMENT). Collections are keyed by CustomerProfile.slug
 *   and represent outbound operational actions. The two systems complement each
 *   other: Mila reads both before composing a message.
 *
 * Exports:
 *   CollectionContactContext     — typed context passed to Mila
 *   getCollectionContactContext  — builds context from ActionTask history
 *   buildMilaCollectionBrief    — returns a system-prompt-ready string
 *   recordMilaCollectionContact — saves a Mila-originated contact outcome
 */

import { prisma }                                    from "@/lib/prisma";
import { ActionTaskStatus }                          from "@prisma/client";
import type { CollectionOutcomeData, OutcomeType }  from "./outcomes";
import { OUTCOME_LABELS }                            from "./outcomes";
import { buildCollectionMessage, getCollectionMessageContext } from "./whatsapp-hooks";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CollectionContactContext {
  customerSlug:       string;
  customerName:       string;
  overdueReceivable:  number;
  maxDpd:             number;
  lastOutcome:        OutcomeType | null;
  lastContactedAt:    Date | null;
  openPromiseDate:    Date | null;       // null if no active promise
  openPromiseAmount:  number | null;
  noContactCount:     number;
  totalContacts:      number;
  /** URGENT / HIGH / MEDIUM — recommended Mila tone */
  urgencyLevel:       "URGENT" | "HIGH" | "MEDIUM";
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Builds a collection context for Mila from ActionTask history.
 */
export async function getCollectionContactContext(
  orgId:        string,
  customerSlug: string,
): Promise<CollectionContactContext | null> {
  const db = prisma as any;

  // Load customer basics
  const profile = await db.customerProfile.findUnique({
    where:  { organizationId_slug: { organizationId: orgId, slug: customerSlug } },
    select: { name: true, overdueReceivable: true, maxDpd: true },
  });

  if (!profile) return null;

  const overdueReceivable = Number(profile.overdueReceivable ?? 0);
  const maxDpd            = Number(profile.maxDpd ?? 0);

  // Last 10 completed collection tasks for this customer
  const tasks = await prisma.actionTask.findMany({
    where: {
      organizationId: orgId,
      targetId:       customerSlug,
      actionType:     "CREAR_ACCION_COBRANZA",
      status:         ActionTaskStatus.COMPLETED,
    },
    orderBy: { completedAt: "desc" },
    take:    10,
    select:  { resultJson: true, completedAt: true },
  });

  const outcomes: CollectionOutcomeData[] = tasks
    .filter(t => t.resultJson && typeof t.resultJson === "object" && !Array.isArray(t.resultJson))
    .map(t => t.resultJson as unknown as CollectionOutcomeData);

  const lastOutcome     = outcomes[0] ?? null;
  const lastContactedAt = tasks[0]?.completedAt ?? null;
  const totalContacts   = tasks.length;

  // Count consecutive NO_CONTACT from the front
  let noContactCount = 0;
  for (const o of outcomes) {
    if (o.outcomeType === "NO_CONTACT") noContactCount++;
    else break;
  }

  // Find open promise (most recent PROMISE_TO_PAY where date is in the future)
  let openPromiseDate:   Date | null   = null;
  let openPromiseAmount: number | null = null;
  for (const o of outcomes) {
    if (o.outcomeType === "PROMISE_TO_PAY" && o.promiseDate) {
      const pd = new Date(o.promiseDate);
      if (pd > new Date()) {
        openPromiseDate   = pd;
        openPromiseAmount = o.promiseAmount ?? null;
        break;
      }
    }
    // Stop searching once we hit a non-promise outcome
    if (o.outcomeType !== "NO_CONTACT") break;
  }

  const urgencyLevel: CollectionContactContext["urgencyLevel"] =
    maxDpd > 90 ? "URGENT" : maxDpd > 30 ? "HIGH" : "MEDIUM";

  return {
    customerSlug,
    customerName:      profile.name,
    overdueReceivable,
    maxDpd,
    lastOutcome:       lastOutcome?.outcomeType ?? null,
    lastContactedAt,
    openPromiseDate,
    openPromiseAmount,
    noContactCount,
    totalContacts,
    urgencyLevel,
  };
}

// ── Brief builder ─────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Returns a system-prompt-ready context string for Mila.
 *
 * Example output:
 *   "CONTEXTO DE COBRANZA — Constructora ABC
 *    Cartera vencida: $12M · DPD: +120d · Urgencia: ALTA
 *    Último contacto: 2026-04-09 · Resultado: Sin contacto (×3 intentos)
 *    Sin promesa activa.
 *    Guión sugerido: Llamada gerencial urgente. Negociar plan de pago."
 */
export async function buildMilaCollectionBrief(opts: {
  orgId:        string;
  customerSlug: string;
  orgName:      string;
  sellerName?:  string | null;
}): Promise<string> {
  const { orgId, customerSlug, orgName, sellerName } = opts;

  const ctx = await getCollectionContactContext(orgId, customerSlug);
  if (!ctx) return "[Sin contexto de cobranza disponible]";

  const msgCtx = getCollectionMessageContext({
    customerName:      ctx.customerName,
    overdueReceivable: ctx.overdueReceivable,
    maxDpd:            ctx.maxDpd,
    orgName,
    sellerName,
  });

  const msg     = buildCollectionMessage(msgCtx);
  const urgency = ctx.urgencyLevel === "URGENT" ? "ALTA" : ctx.urgencyLevel === "HIGH" ? "MEDIA-ALTA" : "MEDIA";

  const lines = [
    `CONTEXTO DE COBRANZA — ${ctx.customerName}`,
    `Cartera vencida: ${fmtCOP(ctx.overdueReceivable)} · DPD: +${ctx.maxDpd}d · Urgencia: ${urgency}`,
  ];

  if (ctx.lastContactedAt) {
    const lastDate = ctx.lastContactedAt.toLocaleDateString("es-CO");
    const lastLabel = ctx.lastOutcome ? OUTCOME_LABELS[ctx.lastOutcome] : "desconocido";
    lines.push(`Último contacto: ${lastDate} · Resultado: ${lastLabel}`);
  } else {
    lines.push("Primer contacto — sin historial previo.");
  }

  if (ctx.noContactCount >= 2) {
    lines.push(`⚠ ${ctx.noContactCount} intentos sin respuesta consecutivos.`);
  }

  if (ctx.openPromiseDate) {
    const fmtDate = ctx.openPromiseDate.toLocaleDateString("es-CO");
    lines.push(
      `Promesa activa: ${ctx.openPromiseAmount ? fmtCOP(ctx.openPromiseAmount) : "monto sin especificar"} — pago comprometido para ${fmtDate}.`
    );
  }

  lines.push(`Guión sugerido (tono: ${msg.tone}): ${msg.subject}`);

  return lines.join("\n");
}

// ── Record Mila contact ───────────────────────────────────────────────────────

/**
 * Records a collection contact initiated by Mila via WhatsApp.
 *
 * Creates a completed ActionTask with the Mila contact outcome.
 * This keeps collection history consistent whether contact was manual or automated.
 */
export async function recordMilaCollectionContact(opts: {
  orgId:         string;
  customerSlug:  string;
  customerName:  string;
  outcomeType:   OutcomeType;
  notes?:        string;
  promiseDate?:  string;
  promiseAmount?: number;
  overdueAmount: number;
  currentDpd:    number;
}): Promise<void> {
  const { orgId, customerSlug, customerName, outcomeType, overdueAmount, currentDpd } = opts;

  const { recordOutcome } = await import("./outcomes");
  const { createActionTask } = await import("@/lib/actions/service");
  const { ActionTaskType, ActionTaskPriority, ActionTaskStatus } = await import("@prisma/client");

  // Create a completed task representing this Mila-originated contact
  const task = await createActionTask(orgId, "mila_whatsapp", {
    title:        `[MILA] Contacto WhatsApp — ${customerName}`,
    description:  `Contacto de cobranza iniciado por Mila vía WhatsApp.`,
    actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
    targetType:   "customer",
    targetId:     customerSlug,
    targetLabel:  customerName,
    sourceModule: "mila_collections",
    priority:     ActionTaskPriority.HIGH,
    payloadJson: {
      milaOrigin:    true,
      overdueAmount,
      currentDpd,
    },
  });

  // Record outcome immediately (Mila knows the result synchronously)
  await recordOutcome({
    orgId,
    taskId:       task.id,
    customerSlug,
    customerName,
    currentDpd,
    overdueAmount,
    userEmail:    "mila_whatsapp",
    outcome: {
      outcomeType,
      channel:     "whatsapp",
      contactedAt: new Date().toISOString(),
      notes:       opts.notes,
      promiseDate: opts.promiseDate,
      promiseAmount: opts.promiseAmount,
      contactedBy: "Mila (WhatsApp bot)",
    },
  });
}
