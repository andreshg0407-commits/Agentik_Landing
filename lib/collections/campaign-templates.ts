/**
 * lib/collections/campaign-templates.ts
 *
 * Mila campaign message templates by DPD bucket.
 *
 * Each template defines:
 *   - A tone and channel recommendation
 *   - A Mila system prompt (injected as context for AI conversations)
 *   - A WhatsApp message template (human-readable, interpolated at send time)
 *   - A human agent script hint
 *
 * Design:
 *   - Templates are stateless constants — no DB storage.
 *   - Placeholders use {{variable}} notation for interpolation.
 *   - Tone escalates with DPD: courtesy → formal → urgent → pre-legal → legal.
 *
 * Exports:
 *   TemplateKey         — union of template identifiers
 *   CampaignTemplate    — full template shape
 *   CAMPAIGN_TEMPLATES  — all templates as array
 *   getTemplateForBucket(bucket) → CampaignTemplate
 *   interpolateTemplate(template, vars) → { waMessage, scriptHint }
 */

import type { DpdBucket } from "@/lib/collections/campaigns";
import type { ContactChannel } from "@/lib/collections/outcomes";

// ── Types ──────────────────────────────────────────────────────────────────────

export type TemplateKey =
  | "courtesy_reminder"
  | "payment_arrangement"
  | "formal_demand"
  | "pre_legal"
  | "legal_notice";

export type TemplateTone =
  | "cortés"
  | "formal"
  | "urgente"
  | "pre-legal"
  | "legal";

export interface CampaignTemplate {
  key:         TemplateKey;
  name:        string;
  bucket:      DpdBucket;
  tone:        TemplateTone;
  channel:     ContactChannel;
  /**
   * Mila system prompt injected as collections context.
   * Placeholders: {{customerName}}, {{overdueAmount}}, {{dpd}}, {{orgName}}, {{promiseDate?}}
   */
  milaPrompt:  string;
  /**
   * WhatsApp message template. Same placeholders.
   */
  waTemplate:  string;
  /**
   * Script hint shown to human agents in the collections queue.
   */
  scriptHint:  string;
}

export interface TemplateVars {
  customerName:  string;
  overdueAmount: string;   // formatted, e.g. "$2.5M"
  dpd:           number;
  orgName:       string;
  promiseDate?:  string;   // optional, e.g. "15 de abril"
  sellerName?:   string;
}

// ── Templates ──────────────────────────────────────────────────────────────────

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  // ── 0–30 DPD: Cortesía ─────────────────────────────────────────────────────
  {
    key:     "courtesy_reminder",
    name:    "Recordatorio de Cortesía",
    bucket:  "0_30",
    tone:    "cortés",
    channel: "whatsapp",

    milaPrompt: `Eres Mila, asistente de cobranza de {{orgName}}. Tu misión es recordar amablemente a {{customerName}} sobre su saldo vencido de {{overdueAmount}} ({{dpd}} días). Usa un tono cordial y servicial. Ofrece facilidades de pago si el cliente muestra interés. No menciones consecuencias legales aún. Si el cliente dice que ya pagó, registra el dato y escala al equipo de conciliación.`,

    waTemplate: `Hola {{customerName}} 👋

Le recordamos que tiene un saldo pendiente de *{{overdueAmount}}* con {{orgName}}.

Si ya realizó el pago, por favor ignora este mensaje. De lo contrario, puedes contactarnos respondiendo este mensaje para coordinar su pago.

¡Gracias por su confianza! 🙏`,

    scriptHint: `Saludo amable. Confirmar identidad. Recordar saldo {{overdueAmount}} vencido {{dpd}}d. Preguntar si hay algún inconveniente. Ofrecer fecha de pago flexible. Registrar promesa si la hay.`,
  },

  // ── 31–60 DPD: Acuerdo de Pago ─────────────────────────────────────────────
  {
    key:     "payment_arrangement",
    name:    "Propuesta de Acuerdo de Pago",
    bucket:  "31_60",
    tone:    "formal",
    channel: "whatsapp",

    milaPrompt: `Eres Mila, agente de cobranza de {{orgName}}. {{customerName}} tiene {{dpd}} días de mora y un saldo vencido de {{overdueAmount}}. Tu objetivo es negociar un acuerdo de pago concreto: fecha y monto. Usa tono formal pero empático. Puedes ofrecer cuotas o abonos parciales. Si el cliente acepta, captura la fecha prometida y el monto. Si rechaza, escala al supervisor.`,

    waTemplate: `Estimado/a {{customerName}},

Le contactamos de {{orgName}} respecto a su cartera vencida por *{{overdueAmount}}* ({{dpd}} días de mora).

Entendemos que pueden surgir dificultades. Por ello, queremos ofrecerle *alternativas de pago* que se ajusten a su situación.

¿Podría indicarnos cuándo podría realizar un abono? Estamos disponibles para acordar un plan. 📋`,

    scriptHint: `Presentar el saldo {{overdueAmount}} y días {{dpd}} de mora. Proponer acuerdo de pago en cuotas. Solicitar fecha comprometida y monto. Si hay dificultad real, ofrecer plazo extendido. Documentar acuerdo.`,
  },

  // ── 61–90 DPD: Requerimiento Formal ────────────────────────────────────────
  {
    key:     "formal_demand",
    name:    "Requerimiento Formal de Pago",
    bucket:  "61_90",
    tone:    "urgente",
    channel: "call",

    milaPrompt: `Eres Mila, representante de cobranza formal de {{orgName}}. {{customerName}} lleva {{dpd}} días en mora con {{overdueAmount}} vencido. Esto es un contacto urgente. Tu tono debe ser formal y directo, sin ser agresivo. Exige una fecha de pago concreta. Informa que la cartera puede ser reportada a centrales de riesgo si no hay acuerdo hoy. Si hay promesa, registra fecha y monto exactos. Si no responde positivamente, escala a supervisor inmediatamente.`,

    waTemplate: `⚠️ *Requerimiento de Pago — {{orgName}}*

Estimado/a {{customerName}}:

Su cartera presenta *{{overdueAmount}} vencidos hace {{dpd}} días*. Esta situación requiere atención urgente.

Le informamos que de no recibir respuesta en las próximas 24 horas, procederemos con las acciones administrativas correspondientes.

Por favor contáctenos hoy al responder este mensaje. 📞`,

    scriptHint: `Identificarse como área de cobranza de {{orgName}}. Citar saldo {{overdueAmount}} y {{dpd}} días vencidos. Informar riesgo de reporte a centrales. Exigir fecha de pago hoy. Documentar respuesta. Escalar si no hay compromiso.`,
  },

  // ── 91–180 DPD: Pre-Legal ───────────────────────────────────────────────────
  {
    key:     "pre_legal",
    name:    "Gestión Pre-Legal",
    bucket:  "91_180",
    tone:    "pre-legal",
    channel: "call",

    milaPrompt: `Eres Mila, representante del área jurídica de cobranza de {{orgName}}. {{customerName}} tiene {{dpd}} días de mora y una deuda de {{overdueAmount}}. Esta es una gestión PRE-LEGAL. Debes informar que el caso está siendo evaluado para proceso jurídico. Ofrece una última oportunidad de acuerdo antes del escalamiento legal. Cualquier promesa de pago debe incluir fecha exacta y monto total. Sin acuerdo hoy, el caso pasa a abogados.`,

    waTemplate: `🔴 *AVISO PRE-LEGAL — {{orgName}}*

Señor/Señora {{customerName}}:

Su obligación de *{{overdueAmount}}* lleva *{{dpd}} días* en mora. Su cuenta ha sido clasificada para *proceso jurídico*.

Antes de iniciar acciones legales, le ofrecemos una última oportunidad de acuerdo extrajudicial.

Comuníquese con nosotros en las próximas *48 horas* para evitar costos adicionales por proceso legal.

Este es un aviso oficial de {{orgName}}.`,

    scriptHint: `Identificarse como área jurídica. Informar clasificación pre-legal. Citar {{overdueAmount}} y {{dpd}} días. Ofrecer acuerdo en 48h como última oportunidad. Documentar respuesta literal. Si acepta: registrar compromiso notariado. Si no: confirmar escalamiento.`,
  },

  // ── 181+ DPD: Aviso Legal ───────────────────────────────────────────────────
  {
    key:     "legal_notice",
    name:    "Aviso Legal / Ejecutivo",
    bucket:  "181_plus",
    tone:    "legal",
    channel: "email",

    milaPrompt: `Eres Mila, asistente del área legal de {{orgName}}. {{customerName}} tiene {{dpd}} días de mora y {{overdueAmount}} en deuda vencida. El caso ha sido escalado al equipo jurídico. Tu rol es SOLO informar del estado legal, NO negociar. Informa que el proceso de cobro ejecutivo está en curso. Si el cliente quiere negociar, transfiere INMEDIATAMENTE a un supervisor humano. No ofrezcas descuentos ni acuerdos sin autorización.`,

    waTemplate: `⚖️ *NOTIFICACIÓN LEGAL — {{orgName}}*

Señor/Señora {{customerName}}:

Le notificamos que su obligación de *{{overdueAmount}}* ({{dpd}} días en mora) ha sido trasladada a nuestro *departamento jurídico* para inicio del proceso de cobro ejecutivo.

Para detener el proceso legal, comuníquese con nuestra área jurídica en las próximas 24 horas.

Este mensaje constituye notificación formal.

*{{orgName}} — Departamento Jurídico*`,

    scriptHint: `NO negociar condiciones. Informar que el caso está en proceso legal activo. Citar {{overdueAmount}} y {{dpd}} días. Si el cliente quiere acuerdo: transferir a abogado de planta. Documentar contacto para expediente.`,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns the appropriate template for a DPD bucket.
 * Falls back to courtesy_reminder for unknown buckets.
 */
export function getTemplateForBucket(bucket: DpdBucket): CampaignTemplate {
  return CAMPAIGN_TEMPLATES.find(t => t.bucket === bucket)
    ?? CAMPAIGN_TEMPLATES[0]!;
}

/**
 * Interpolates {{variable}} placeholders in a template string.
 */
function interpolate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{customerName\}\}/g, vars.customerName)
    .replace(/\{\{overdueAmount\}\}/g, vars.overdueAmount)
    .replace(/\{\{dpd\}\}/g, String(vars.dpd))
    .replace(/\{\{orgName\}\}/g, vars.orgName)
    .replace(/\{\{promiseDate\}\}/g, vars.promiseDate ?? "—")
    .replace(/\{\{sellerName\}\}/g, vars.sellerName ?? "");
}

/**
 * Produces ready-to-send text from a template + variable set.
 */
export function interpolateTemplate(
  template: CampaignTemplate,
  vars:     TemplateVars,
): { milaPrompt: string; waMessage: string; scriptHint: string } {
  return {
    milaPrompt: interpolate(template.milaPrompt, vars),
    waMessage:  interpolate(template.waTemplate, vars),
    scriptHint: interpolate(template.scriptHint, vars),
  };
}
