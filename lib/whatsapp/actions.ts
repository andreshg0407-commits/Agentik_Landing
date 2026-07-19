/**
 * lib/whatsapp/actions.ts
 *
 * Business action engine for the Agentik WhatsApp module.
 *
 * Converts classified WhatsApp conversation intents into internal tracked
 * business actions using the existing ActionTask + Notification infrastructure.
 *
 * Action mapping:
 *   HANDOFF     → ActionTask(ESCALAR_A_GERENCIA, URGENT) + Notification to org admins
 *   APPOINTMENT → ActionTask(CREAR_TAREA_COMERCIAL, HIGH)  — manual confirmation required
 *   SALES       → ActionTask(ASIGNAR_SEGUIMIENTO_VENDEDOR, MEDIUM)
 *
 * Deduplication:
 *   HANDOFF     — always created (each request is independently actionable)
 *   APPOINTMENT — created once when intent first appears in conversation
 *   SALES       — created once when intent first appears in conversation
 *
 * sourceModule = "whatsapp_bot" for all WhatsApp-originated tasks.
 * payloadJson carries the full contact context for the human agent.
 *
 * All action creation is wrapped in try/catch inside dispatchBusinessAction —
 * failures never break the reply/persist pipeline.
 *
 * NOT YET IMPLEMENTED:
 *   - SUPPORT: no task created (pending decision on priority / routing)
 *   - Email delivery of notifications (notification service is DB-only)
 *   - Automated calendar booking (would require calendar integration)
 */

import { prisma }                from "@/lib/prisma";
import { Role, MembershipStatus } from "@prisma/client";
import {
  createActionTask,
  ActionTaskType,
  ActionTaskPriority,
}                                from "@/lib/actions/service";
import {
  createNotification,
  NotificationType,
}                                from "@/lib/notifications/service";
import { parseIntentConfig }     from "./config";
import type { WaConfig, WaConversation, WaIntent } from "./types";
import { upsertContactMemory, extractProductMention, getContactMemory } from "./memory";
import { evaluateImmediateTriggers } from "./triggers";

// ── Constants ─────────────────────────────────────────────────────────────────

/** sourceModule tag for all WhatsApp-originated action tasks */
const SOURCE_MODULE = "whatsapp_bot";

/**
 * createdBy identifier for bot-generated tasks.
 * Stored as a freeform string (not a User id) — consistent with the
 * Phase 1 design in lib/actions/service.ts.
 */
const BOT_CREATOR = "whatsapp_bot";

// ── Shared context type ───────────────────────────────────────────────────────

export interface WaActionContext {
  organizationId: string;
  config:         WaConfig;
  conversation:   WaConversation;
  contactPhone:   string;
  contactName:    string | null;
  /** Full normalized message text from the triggering incoming message. */
  messageText:    string;
}

// ── Org admin lookup ──────────────────────────────────────────────────────────

/**
 * Returns the email addresses of all active SUPER_ADMIN and ORG_ADMIN members
 * of the organization. Used to fan-out notifications on urgent events.
 */
async function getOrgAdminEmails(organizationId: string): Promise<string[]> {
  const members = await prisma.membership.findMany({
    where: {
      organizationId,
      status: MembershipStatus.ACTIVE,
      role:   { in: [Role.SUPER_ADMIN, Role.ORG_ADMIN] },
    },
    select: { user: { select: { email: true } } },
  });
  return members.flatMap(m => (m.user?.email ? [m.user.email] : []));
}

// ── Time hint extraction ──────────────────────────────────────────────────────

/**
 * Extracts a preferred time/date hint from free-form Spanish message text.
 *
 * Returns a human-readable string for the action task description so the
 * human agent knows when the contact wants to be seen/called.
 * Returns null if no recognisable time reference is found.
 *
 * Deliberately NOT a Date parser — just a readable hint for manual follow-up.
 */
function extractTimeHint(text: string): string | null {
  // Normalize: lowercase + strip diacritics for pattern matching
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Ordered most-specific first to avoid partial matches
  const patterns: Array<[RegExp, string]> = [
    [/pasado manana/,                      "Pasado mañana"],
    [/manana/,                             "Mañana"],
    [/hoy/,                                "Hoy"],
    [/proximo lunes|el lunes que viene/,   "Próximo lunes"],
    [/proximo martes|el martes que viene/, "Próximo martes"],
    [/proximo miercoles/,                  "Próximo miércoles"],
    [/proximo jueves/,                     "Próximo jueves"],
    [/proximo viernes/,                    "Próximo viernes"],
    [/proximo sabado/,                     "Próximo sábado"],
    [/el lunes/,                           "El lunes"],
    [/el martes/,                          "El martes"],
    [/el miercoles/,                       "El miércoles"],
    [/el jueves/,                          "El jueves"],
    [/el viernes/,                         "El viernes"],
    [/el sabado/,                          "El sábado"],
    [/lunes/,                              "Lunes"],
    [/martes/,                             "Martes"],
    [/miercoles/,                          "Miércoles"],
    [/jueves/,                             "Jueves"],
    [/viernes/,                            "Viernes"],
    [/sabado/,                             "Sábado"],
    [/domingo/,                            "Domingo"],
    [/proxima semana/,                     "Próxima semana"],
    [/esta semana/,                        "Esta semana"],
    [/en la manana/,                       "En la mañana"],
    [/en la tarde/,                        "En la tarde"],
    [/en la noche/,                        "En la noche"],
    [/temprano/,                           "Temprano"],
  ];

  for (const [re, label] of patterns) {
    if (re.test(t)) return label;
  }

  // Capture a clock-time expression: "3pm", "3:30 pm", "a las 3", "las 3"
  const clockMatch =
    text.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i) ??
    text.match(/\ba las \d{1,2}(?::\d{2})?\b/i)        ??
    text.match(/\blas \d{1,2}(?::\d{2})?\b/i);

  return clockMatch ? clockMatch[0].trim() : null;
}

// ── HANDOFF action ────────────────────────────────────────────────────────────

/**
 * Creates an URGENT escalation task and notifies all org admins.
 *
 * Always created — each handoff request is independently actionable.
 * If the tenant has configured escalation.contact, the task is assigned to them.
 */
export async function createHandoffAction(ctx: WaActionContext): Promise<void> {
  const {
    organizationId, config, conversation,
    contactPhone, contactName, messageText,
  } = ctx;
  const ic           = parseIntentConfig(config.intentConfig);
  const contactLabel = contactName ?? contactPhone;

  const task = await createActionTask(organizationId, BOT_CREATOR, {
    title:       `WhatsApp — Asesor solicitado: ${contactLabel}`,
    description: [
      `Contacto solicita hablar con un asesor humano vía WhatsApp.`,
      ``,
      `Mensaje recibido:`,
      `"${messageText.slice(0, 400)}"`,
    ].join("\n"),
    actionType:   ActionTaskType.ESCALAR_A_GERENCIA,
    targetType:   "whatsapp_contact",
    targetLabel:  contactLabel,
    sourceModule: SOURCE_MODULE,
    priority:     ActionTaskPriority.URGENT,
    assignedTo:   ic.escalation?.contact ?? undefined,
    payloadJson:  {
      contactPhone,
      contactName,
      conversationId: conversation.id,
      businessName:   config.displayName,
      messageText:    messageText.slice(0, 500),
      requestType:    "handoff",
      triggeredAt:    new Date().toISOString(),
    },
  });

  // Write memory signal — fire-and-forget, never breaks the action pipeline
  upsertContactMemory(organizationId, contactPhone, {
    lastHandoffAt: new Date(),
    ...(contactName ? { contactName } : {}),
  }).catch(e => console.error("[whatsapp/actions] memory write (handoff) failed:", e));

  // Fan-out in-app notification to all org admins
  const adminEmails = await getOrgAdminEmails(organizationId);
  if (adminEmails.length > 0) {
    await Promise.all(
      adminEmails.map(email =>
        createNotification({
          organizationId,
          recipientEmail: email,
          type:           NotificationType.SYSTEM,
          title:          `WhatsApp: ${contactLabel} solicitó un asesor`,
          body: [
            `${contactLabel} (${contactPhone}) solicitó hablar con un asesor vía WhatsApp.`,
            `Mensaje: "${messageText.slice(0, 150)}"`,
          ].join("\n"),
          actionTaskId: task.id,
        }),
      ),
    );
  }
}

// ── APPOINTMENT action ────────────────────────────────────────────────────────

/**
 * Captures an appointment request as a HIGH-priority commercial task.
 *
 * Extracts a time hint from the message if present.
 * Does NOT create a calendar event — the business owner must confirm manually.
 * Created once when APPOINTMENT intent first appears in the conversation.
 */
export async function createAppointmentAction(ctx: WaActionContext): Promise<void> {
  const {
    organizationId, config, conversation,
    contactPhone, contactName, messageText,
  } = ctx;
  const contactLabel = contactName ?? contactPhone;
  const timeHint     = extractTimeHint(messageText);

  const descLines = [
    `Solicitud de cita recibida vía WhatsApp.`,
    timeHint ? `Preferencia de horario detectada: *${timeHint}*` : null,
    ``,
    `Mensaje original:`,
    `"${messageText.slice(0, 400)}"`,
  ].filter(Boolean).join("\n");

  await createActionTask(organizationId, BOT_CREATOR, {
    title:       `WhatsApp — Cita solicitada: ${contactLabel}`,
    description: descLines,
    actionType:   ActionTaskType.CREAR_TAREA_COMERCIAL,
    targetType:   "whatsapp_contact",
    targetLabel:  contactLabel,
    sourceModule: SOURCE_MODULE,
    priority:     ActionTaskPriority.HIGH,
    payloadJson:  {
      contactPhone,
      contactName,
      conversationId: conversation.id,
      businessName:   config.displayName,
      requestedTime:  timeHint,
      messageText:    messageText.slice(0, 500),
      requestType:    "appointment",
      triggeredAt:    new Date().toISOString(),
    },
  });

  // Write memory signal: APPOINTMENT outcome captured
  upsertContactMemory(organizationId, contactPhone, {
    lastSuccessfulOutcome:   "APPOINTMENT",
    lastSuccessfulOutcomeAt: new Date(),
    lastAppointmentRequest:  timeHint ?? undefined,
    ...(contactName ? { contactName } : {}),
  }).catch(e => console.error("[whatsapp/actions] memory write (appointment) failed:", e));
}

// ── SALES LEAD action ─────────────────────────────────────────────────────────

/**
 * Captures a sales inquiry as a MEDIUM-priority seller follow-up task.
 * Created once when SALES intent first appears in the conversation.
 */
export async function createSalesLeadAction(ctx: WaActionContext): Promise<void> {
  const {
    organizationId, config, conversation,
    contactPhone, contactName, messageText,
  } = ctx;
  const contactLabel = contactName ?? contactPhone;

  await createActionTask(organizationId, BOT_CREATOR, {
    title:       `WhatsApp — Consulta comercial: ${contactLabel}`,
    description: [
      `Consulta de ventas recibida vía WhatsApp.`,
      ``,
      `Mensaje:`,
      `"${messageText.slice(0, 400)}"`,
    ].join("\n"),
    actionType:   ActionTaskType.ASIGNAR_SEGUIMIENTO_VENDEDOR,
    targetType:   "whatsapp_contact",
    targetLabel:  contactLabel,
    sourceModule: SOURCE_MODULE,
    priority:     ActionTaskPriority.MEDIUM,
    payloadJson:  {
      contactPhone,
      contactName,
      conversationId: conversation.id,
      businessName:   config.displayName,
      messageText:    messageText.slice(0, 500),
      requestType:    "sales_lead",
      triggeredAt:    new Date().toISOString(),
    },
  });

  // Write memory signal: SALES outcome captured + extract product mention
  const productMention = extractProductMention(messageText);
  upsertContactMemory(organizationId, contactPhone, {
    lastSuccessfulOutcome:   "SALES",
    lastSuccessfulOutcomeAt: new Date(),
    ...(productMention ? { lastProductMention: productMention } : {}),
    ...(contactName    ? { contactName }                        : {}),
  }).catch(e => console.error("[whatsapp/actions] memory write (sales) failed:", e));

  // Evaluate immediate trigger: RETURNING_SALES_REPEAT
  // Reads memory as it was BEFORE this event — correctly detects prior SALES history.
  getContactMemory(organizationId, contactPhone)
    .then(memory => {
      if (memory) {
        return evaluateImmediateTriggers(organizationId, contactPhone, memory, "SALES");
      }
    })
    .catch(e => console.error("[whatsapp/actions] immediate trigger eval failed:", e));
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Dispatches the right business action based on the classified intent.
 *
 * Deduplication:
 *   prevIntent — the conversation's lastIntent BEFORE this message was processed.
 *   APPOINTMENT and SALES actions are only created when the intent is NEW to the
 *   conversation (prevIntent !== currentIntent), preventing duplicate tasks if the
 *   user sends multiple SALES messages in a row.
 *   HANDOFF is always created — every explicit handoff request matters.
 *
 * Error isolation:
 *   All creation calls are wrapped in try/catch here. Failures are logged but
 *   never propagated — the reply pipeline must not break because of action errors.
 */
export async function dispatchBusinessAction(
  ctx:           WaActionContext,
  currentIntent: WaIntent,
  prevIntent:    WaIntent | null,
): Promise<void> {
  try {
    switch (currentIntent) {
      case "HANDOFF":
        await createHandoffAction(ctx);
        break;

      case "APPOINTMENT":
        if (prevIntent !== "APPOINTMENT") {
          await createAppointmentAction(ctx);
        }
        break;

      case "SALES":
        if (prevIntent !== "SALES") {
          await createSalesLeadAction(ctx);
        }
        break;

      // FAQ, SUPPORT, UNKNOWN: no task created in this sprint
      default:
        break;
    }
  } catch (err) {
    console.error("[whatsapp/actions] dispatch failed:", { currentIntent, prevIntent }, err);
  }
}
