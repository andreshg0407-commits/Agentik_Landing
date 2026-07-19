/**
 * lib/whatsapp/triggers.ts
 *
 * Remarketing trigger engine for the Agentik WhatsApp module.
 *
 * Detects missed-opportunity signals from conversation memory and creates
 * internal follow-up ActionTasks automatically. No outbound campaigns —
 * only internal visibility so human agents can act.
 *
 * ── Trigger types ─────────────────────────────────────────────────────────────
 *
 *  SALES_NO_FOLLOWUP       — SALES outcome with no agent action in 24 h.
 *                            Source: WhatsAppContactMemory (periodic scan).
 *
 *  APPOINTMENT_NO_CONFIRM  — APPOINTMENT captured with no confirmation in 48 h.
 *                            Source: WhatsAppContactMemory (periodic scan).
 *
 *  HANDOFF_UNRESOLVED      — HANDED_OFF conversation still open after 4 h.
 *                            Source: WhatsAppConversation (periodic scan).
 *
 *  RETURNING_SALES_REPEAT  — Contact with a prior SALES outcome writes again
 *                            with SALES intent (high-value repeat customer).
 *                            Source: immediate, called from actions.ts.
 *
 * ── Execution modes ───────────────────────────────────────────────────────────
 *
 *  Immediate:
 *    evaluateImmediateTriggers(orgId, contactPhone, memory, intent)
 *    Called at the end of createSalesLeadAction in actions.ts.
 *    Fires RETURNING_SALES_REPEAT when conditions are met.
 *
 *  Periodic:
 *    evaluatePendingTriggers(orgId, options?)
 *    Must be called by an external scheduler (cron / internal API).
 *    Fires SALES_NO_FOLLOWUP, APPOINTMENT_NO_CONFIRM, HANDOFF_UNRESOLVED.
 *    NOT yet wired to a scheduler — invocation is the pending item.
 *
 * ── Deduplication ─────────────────────────────────────────────────────────────
 *
 *  Before firing, isDuplicateTrigger() queries ActionTask for a recent task
 *  matching:
 *    sourceModule = "whatsapp_triggers"
 *    targetLabel  = contactPhone (or conversationId for HANDOFF_UNRESOLVED)
 *    title        starts with "[{TRIGGER_TYPE}]"
 *    createdAt    >= (now - dedupWindow)
 *
 *  If found → skip. No exception, just a logged skip.
 *
 * ── Metadata stored in payloadJson ───────────────────────────────────────────
 *
 *  Every trigger task's payloadJson includes:
 *    triggerType         — machine-readable trigger identifier
 *    contactPhone        — E.164 contact phone
 *    contactName         — display name at time of trigger (if known)
 *    triggerFiredAt      — ISO timestamp of when this trigger fired
 *    staleSince          — ISO timestamp of the outcome/event that triggered it
 *    lastProductMention  — (SALES triggers) product keyword from memory
 *    lastAppointmentRequest — (APPOINTMENT trigger) time hint from memory
 *    conversationId      — (HANDOFF trigger) the specific stuck conversation
 *
 * ── What is pending ───────────────────────────────────────────────────────────
 *
 *  1. Scheduler integration: evaluatePendingTriggers() must be called by a
 *     cron job or internal scheduled task. An API route under /api/internal/
 *     can expose it. Not built in this sprint to stay within scope.
 *  2. Per-org configurable thresholds (currently hardcoded constants).
 *  3. Trigger suppression: ability to mark a contact "do not trigger" for a period.
 *  4. Outbound transport: when sendTextMessage is live, SALES_NO_FOLLOWUP could
 *     automatically send a WhatsApp re-engagement message instead of just a task.
 */

import { prisma }                         from "@/lib/prisma";
import {
  ActionTaskType,
  ActionTaskPriority,
}                                         from "@prisma/client";
import { createActionTask }               from "@/lib/actions/service";
import type { WaContactMemory }           from "./memory";
import { listStaleOutcomes }              from "./memory";
import { listHandedOffConversations }     from "./conversation";

// ── Source module tag ─────────────────────────────────────────────────────────

const SOURCE_MODULE = "whatsapp_triggers";
const BOT_CREATOR   = "whatsapp_bot";

// ── Trigger type ──────────────────────────────────────────────────────────────

export type WaTriggerType =
  | "SALES_NO_FOLLOWUP"
  | "APPOINTMENT_NO_CONFIRM"
  | "HANDOFF_UNRESOLVED"
  | "RETURNING_SALES_REPEAT";

// ── Trigger configuration ─────────────────────────────────────────────────────

interface TriggerConfig {
  /** How old (ms) an outcome must be before this trigger can fire. */
  staleThresholdMs: number;
  /** How long (ms) after firing before the same trigger can fire again for the same target. */
  dedupWindowMs:    number;
  /** ActionTask priority when trigger fires. */
  priority:         ActionTaskPriority;
  /** ActionTask type reused from existing taxonomy. */
  actionType:       ActionTaskType;
}

const TRIGGER_CONFIG: Record<WaTriggerType, TriggerConfig> = {
  SALES_NO_FOLLOWUP: {
    staleThresholdMs: 24 * 60 * 60 * 1000, // 24 h
    dedupWindowMs:    48 * 60 * 60 * 1000, // 48 h dedup (fire at most once every 48 h)
    priority:         ActionTaskPriority.HIGH,
    actionType:       ActionTaskType.ASIGNAR_SEGUIMIENTO_VENDEDOR,
  },
  APPOINTMENT_NO_CONFIRM: {
    staleThresholdMs: 48 * 60 * 60 * 1000, // 48 h
    dedupWindowMs:    72 * 60 * 60 * 1000, // 72 h dedup
    priority:         ActionTaskPriority.HIGH,
    actionType:       ActionTaskType.CREAR_TAREA_COMERCIAL,
  },
  HANDOFF_UNRESOLVED: {
    staleThresholdMs:  4 * 60 * 60 * 1000, // 4 h
    dedupWindowMs:     8 * 60 * 60 * 1000, // 8 h dedup (per conversation)
    priority:          ActionTaskPriority.URGENT,
    actionType:        ActionTaskType.ESCALAR_A_GERENCIA,
  },
  RETURNING_SALES_REPEAT: {
    staleThresholdMs: 0,                    // immediate — no staleness window
    dedupWindowMs:    24 * 60 * 60 * 1000, // 24 h dedup (one alert per day per contact)
    priority:         ActionTaskPriority.HIGH,
    actionType:       ActionTaskType.ASIGNAR_SEGUIMIENTO_VENDEDOR,
  },
};

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Returns true if a trigger of this type already fired for the given target
 * within the configured dedup window.
 *
 * targetLabel is contactPhone for contact-level triggers,
 * conversationId for HANDOFF_UNRESOLVED.
 */
async function isDuplicateTrigger(
  organizationId: string,
  targetLabel:    string,
  triggerType:    WaTriggerType,
): Promise<boolean> {
  const { dedupWindowMs } = TRIGGER_CONFIG[triggerType];
  const since             = new Date(Date.now() - dedupWindowMs);

  const existing = await prisma.actionTask.findFirst({
    where: {
      organizationId,
      sourceModule: SOURCE_MODULE,
      targetLabel,
      title:        { startsWith: `[${triggerType}]` },
      createdAt:    { gte: since },
    },
    select: { id: true },
  });

  return existing !== null;
}

// ── Trigger firing ────────────────────────────────────────────────────────────

interface TriggerFireOptions {
  organizationId:  string;
  /** E.164 contact phone — always required. */
  contactPhone:    string;
  /** Optional display name at time of fire. */
  contactName:     string | null;
  /** Human-readable trigger reason for the task title. */
  contactLabel:    string;
  /** For HANDOFF_UNRESOLVED: the specific conversation being escalated. */
  conversationId?: string;
  /** For SALES triggers: the product keyword from memory. */
  lastProductMention?: string | null;
  /** For APPOINTMENT triggers: the time hint from memory. */
  lastAppointmentRequest?: string | null;
  /** When the original outcome/event that triggered this occurred. */
  staleSince: Date;
}

/**
 * Creates an ActionTask for a fired trigger.
 * All callers must check isDuplicateTrigger() first.
 */
async function fireTrigger(
  triggerType: WaTriggerType,
  opts:        TriggerFireOptions,
): Promise<void> {
  const cfg        = TRIGGER_CONFIG[triggerType];
  // For HANDOFF_UNRESOLVED, dedup is per-conversation; for others, per-contact.
  const targetLabel = triggerType === "HANDOFF_UNRESOLVED"
    ? (opts.conversationId ?? opts.contactPhone)
    : opts.contactPhone;

  const titles: Record<WaTriggerType, string> = {
    SALES_NO_FOLLOWUP:      `[SALES_NO_FOLLOWUP] Seguimiento pendiente: ${opts.contactLabel}`,
    APPOINTMENT_NO_CONFIRM: `[APPOINTMENT_NO_CONFIRM] Cita sin confirmar: ${opts.contactLabel}`,
    HANDOFF_UNRESOLVED:     `[HANDOFF_UNRESOLVED] Transferencia sin resolver: ${opts.contactLabel}`,
    RETURNING_SALES_REPEAT: `[RETURNING_SALES_REPEAT] Cliente recurrente activo: ${opts.contactLabel}`,
  };

  const descriptions: Record<WaTriggerType, string> = {
    SALES_NO_FOLLOWUP: [
      `Este contacto realizó una consulta de ventas hace más de 24 horas y no ha recibido respuesta del equipo.`,
      ``,
      opts.lastProductMention
        ? `Producto de interés: *${opts.lastProductMention}*`
        : `Detalle del producto no disponible.`,
      ``,
      `Acción requerida: contactar al cliente para continuar el proceso de venta.`,
    ].join("\n"),

    APPOINTMENT_NO_CONFIRM: [
      `Este contacto solicitó una cita hace más de 48 horas y no ha recibido confirmación.`,
      ``,
      opts.lastAppointmentRequest
        ? `Horario sugerido por el cliente: *${opts.lastAppointmentRequest}*`
        : `Sin preferencia de horario registrada.`,
      ``,
      `Acción requerida: confirmar o reasignar la cita.`,
    ].join("\n"),

    HANDOFF_UNRESOLVED: [
      `Esta conversación fue transferida a un asesor humano hace más de 4 horas y continúa sin resolverse.`,
      ``,
      `Acción requerida: revisar y atender al cliente o actualizar el estado de la conversación.`,
    ].join("\n"),

    RETURNING_SALES_REPEAT: [
      `Cliente recurrente con historial de compras activo volvió a mostrar interés de venta.`,
      ``,
      opts.lastProductMention
        ? `Último producto consultado: *${opts.lastProductMention}*`
        : `Historial de producto no disponible.`,
      ``,
      `Acción requerida: priorizar contacto — alta probabilidad de conversión.`,
    ].join("\n"),
  };

  await createActionTask(opts.organizationId, BOT_CREATOR, {
    title:        titles[triggerType],
    description:  descriptions[triggerType],
    actionType:   cfg.actionType,
    targetType:   "whatsapp_contact",
    targetLabel,
    sourceModule: SOURCE_MODULE,
    priority:     cfg.priority,
    payloadJson:  {
      triggerType,
      contactPhone:            opts.contactPhone,
      contactName:             opts.contactName,
      triggerFiredAt:          new Date().toISOString(),
      staleSince:              opts.staleSince.toISOString(),
      conversationId:          opts.conversationId     ?? null,
      lastProductMention:      opts.lastProductMention  ?? null,
      lastAppointmentRequest:  opts.lastAppointmentRequest ?? null,
    },
  });

  console.info(
    `[whatsapp/triggers] fired ${triggerType} for ${opts.contactPhone} in org ${opts.organizationId}`,
  );
}

// ── Immediate trigger evaluation ──────────────────────────────────────────────

/**
 * Evaluates triggers that fire synchronously during message processing.
 * Currently only RETURNING_SALES_REPEAT.
 *
 * Called from createSalesLeadAction in actions.ts after the regular SALES task
 * is created. Errors are caught and logged — never propagated.
 *
 * @param organizationId   Tenant.
 * @param contactPhone     E.164 contact phone.
 * @param memory           Contact memory at time of this message.
 * @param currentIntent    Intent just classified for the incoming message.
 */
export async function evaluateImmediateTriggers(
  organizationId: string,
  contactPhone:   string,
  memory:         WaContactMemory,
  currentIntent:  string,
): Promise<void> {
  if (currentIntent !== "SALES") return;

  // RETURNING_SALES_REPEAT: contact with prior SALES outcome writes again
  const isReturningSales =
    memory.lastSuccessfulOutcome === "SALES" &&
    memory.totalConversations >= 1; // >= 1 because increment is fire-and-forget AFTER this runs

  if (!isReturningSales) return;

  try {
    const isDupe = await isDuplicateTrigger(organizationId, contactPhone, "RETURNING_SALES_REPEAT");
    if (isDupe) {
      console.info(`[whatsapp/triggers] RETURNING_SALES_REPEAT deduped for ${contactPhone}`);
      return;
    }

    await fireTrigger("RETURNING_SALES_REPEAT", {
      organizationId,
      contactPhone,
      contactName:         memory.contactName,
      contactLabel:        memory.contactName ?? contactPhone,
      lastProductMention:  memory.lastProductMention,
      staleSince:          memory.lastSuccessfulOutcomeAt ?? memory.updatedAt,
    });
  } catch (err) {
    console.error("[whatsapp/triggers] immediate trigger error:", err);
  }
}

// ── Periodic trigger evaluation ───────────────────────────────────────────────

export interface EvaluateOptions {
  /** Limit to specific trigger types. Defaults to all periodic triggers. */
  triggers?:     Array<Exclude<WaTriggerType, "RETURNING_SALES_REPEAT">>;
  /** Limit to a single contact. Defaults to full org scan. */
  contactPhone?: string;
}

export interface EvaluateResult {
  /** Number of trigger tasks successfully created. */
  triggered: number;
  /** Number of eligible events skipped due to deduplication. */
  skipped:   number;
  /** Number of errors during individual trigger evaluations. */
  errors:    number;
}

/**
 * Scans the org for stale outcomes and unresolved handoffs, firing trigger
 * actions for any that qualify and have not been triggered recently.
 *
 * ── Pending ──────────────────────────────────────────────────────────────────
 * This function must be called periodically by an external scheduler.
 * Suggested invocation cadence: every 30–60 minutes.
 *
 * Recommended wiring (not yet built):
 *   - Internal API route: POST /api/internal/whatsapp/triggers/evaluate
 *     Protected by an INTERNAL_CRON_SECRET header.
 *   - Or: a scheduled job in the app's worker process.
 *   - Or: an external cron (Vercel Cron / GitHub Actions) calling the API route.
 *
 * @param organizationId   Tenant to evaluate. Never cross-tenant.
 * @param options          Optional filters (trigger types, single contact).
 */
export async function evaluatePendingTriggers(
  organizationId: string,
  options:        EvaluateOptions = {},
): Promise<EvaluateResult> {
  const result: EvaluateResult = { triggered: 0, skipped: 0, errors: 0 };

  const activeTriggers = options.triggers ?? [
    "SALES_NO_FOLLOWUP",
    "APPOINTMENT_NO_CONFIRM",
    "HANDOFF_UNRESOLVED",
  ];

  // ── SALES_NO_FOLLOWUP ────────────────────────────────────────────────────────
  if (activeTriggers.includes("SALES_NO_FOLLOWUP")) {
    try {
      const threshold = new Date(
        Date.now() - TRIGGER_CONFIG.SALES_NO_FOLLOWUP.staleThresholdMs,
      );
      const staleContacts = await listStaleOutcomes(organizationId, "SALES", threshold);

      for (const mem of staleContacts) {
        if (options.contactPhone && mem.contactPhone !== options.contactPhone) continue;

        try {
          const isDupe = await isDuplicateTrigger(
            organizationId, mem.contactPhone, "SALES_NO_FOLLOWUP",
          );
          if (isDupe) { result.skipped++; continue; }

          await fireTrigger("SALES_NO_FOLLOWUP", {
            organizationId,
            contactPhone:       mem.contactPhone,
            contactName:        mem.contactName,
            contactLabel:       mem.contactName ?? mem.contactPhone,
            lastProductMention: mem.lastProductMention,
            staleSince:         mem.lastSuccessfulOutcomeAt ?? mem.updatedAt,
          });
          result.triggered++;
        } catch (err) {
          console.error("[whatsapp/triggers] SALES_NO_FOLLOWUP fire error:", err);
          result.errors++;
        }
      }
    } catch (err) {
      console.error("[whatsapp/triggers] SALES_NO_FOLLOWUP scan error:", err);
      result.errors++;
    }
  }

  // ── APPOINTMENT_NO_CONFIRM ───────────────────────────────────────────────────
  if (activeTriggers.includes("APPOINTMENT_NO_CONFIRM")) {
    try {
      const threshold = new Date(
        Date.now() - TRIGGER_CONFIG.APPOINTMENT_NO_CONFIRM.staleThresholdMs,
      );
      const staleContacts = await listStaleOutcomes(organizationId, "APPOINTMENT", threshold);

      for (const mem of staleContacts) {
        if (options.contactPhone && mem.contactPhone !== options.contactPhone) continue;

        try {
          const isDupe = await isDuplicateTrigger(
            organizationId, mem.contactPhone, "APPOINTMENT_NO_CONFIRM",
          );
          if (isDupe) { result.skipped++; continue; }

          await fireTrigger("APPOINTMENT_NO_CONFIRM", {
            organizationId,
            contactPhone:            mem.contactPhone,
            contactName:             mem.contactName,
            contactLabel:            mem.contactName ?? mem.contactPhone,
            lastAppointmentRequest:  mem.lastAppointmentRequest,
            staleSince:              mem.lastSuccessfulOutcomeAt ?? mem.updatedAt,
          });
          result.triggered++;
        } catch (err) {
          console.error("[whatsapp/triggers] APPOINTMENT_NO_CONFIRM fire error:", err);
          result.errors++;
        }
      }
    } catch (err) {
      console.error("[whatsapp/triggers] APPOINTMENT_NO_CONFIRM scan error:", err);
      result.errors++;
    }
  }

  // ── HANDOFF_UNRESOLVED ───────────────────────────────────────────────────────
  if (activeTriggers.includes("HANDOFF_UNRESOLVED")) {
    try {
      const threshold = new Date(
        Date.now() - TRIGGER_CONFIG.HANDOFF_UNRESOLVED.staleThresholdMs,
      );
      const staleConvs = await listHandedOffConversations(organizationId, threshold);

      for (const conv of staleConvs) {
        if (options.contactPhone && conv.contactPhone !== options.contactPhone) continue;

        try {
          // Dedup is per-conversation (conversationId as targetLabel)
          const isDupe = await isDuplicateTrigger(
            organizationId, conv.id, "HANDOFF_UNRESOLVED",
          );
          if (isDupe) { result.skipped++; continue; }

          await fireTrigger("HANDOFF_UNRESOLVED", {
            organizationId,
            contactPhone:   conv.contactPhone,
            contactName:    conv.contactName,
            contactLabel:   conv.contactName ?? conv.contactPhone,
            conversationId: conv.id,
            staleSince:     conv.updatedAt,
          });
          result.triggered++;
        } catch (err) {
          console.error("[whatsapp/triggers] HANDOFF_UNRESOLVED fire error:", err);
          result.errors++;
        }
      }
    } catch (err) {
      console.error("[whatsapp/triggers] HANDOFF_UNRESOLVED scan error:", err);
      result.errors++;
    }
  }

  return result;
}
