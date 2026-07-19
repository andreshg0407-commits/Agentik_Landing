/**
 * lib/collections/whatsapp-hooks.ts
 *
 * WhatsApp collection message templates for Mila (outbound agent).
 *
 * Provides ready-to-send message payloads that the WhatsApp outbound layer
 * can dispatch via lib/whatsapp/outbound.ts.
 *
 * ── Integration contract ──────────────────────────────────────────────────────
 *
 * These functions are PURE — no DB queries, no side effects.
 * Mila / the outbound layer owns the decision to actually send.
 *
 * Usage pattern:
 *   1. outbound layer receives a CREAR_ACCION_COBRANZA ActionTask
 *   2. Extracts payloadJson (customer data, channel hint)
 *   3. Calls buildCollectionMessage(ctx) to get the formatted message
 *   4. Calls shouldSendWhatsApp(maxDpd) to confirm channel is appropriate
 *   5. Sends via sendTextMessage(orgId, phone, message)
 *
 * ── Message tone by bucket ────────────────────────────────────────────────────
 *
 *  0–30d  → Recordatorio de cortesía (friendly, non-alarming)
 *  31–60d → Aviso formal (professional, referencing invoice ref)
 *  61–90d → Notificación urgente (serious, requests immediate response)
 *  90+d   → Escalation notice (from management, firm language)
 *
 * Exports:
 *   buildCollectionMessage(ctx)          → formatted WhatsApp string
 *   shouldSendWhatsApp(maxDpd)           → boolean (false for legal-stage)
 *   getCollectionMessageContext(debtor)  → CollectionMessageContext adapter
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CollectionMessageContext {
  customerName:      string;
  overdueAmount:     number;
  maxDpd:            number;
  invoiceRef?:       string | null;
  orgName:           string;
  sellerName?:       string | null;
  contactFirstName?: string | null;
}

export interface CollectionMessagePayload {
  body:    string;
  subject: string;   // for email channel fallback
  tone:    "courtesy" | "formal" | "urgent" | "escalation";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

// ── Message builder ───────────────────────────────────────────────────────────

/**
 * Builds a WhatsApp-ready collection message based on aging bucket.
 * All messages are in Spanish (Colombian business register).
 */
export function buildCollectionMessage(
  ctx: CollectionMessageContext,
): CollectionMessagePayload {
  const name    = ctx.contactFirstName ?? firstName(ctx.customerName);
  const amount  = fmtCOP(ctx.overdueAmount);
  const ref     = ctx.invoiceRef ? ` (ref. ${ctx.invoiceRef})` : "";
  const org     = ctx.orgName;

  // ── 90+ DPD: escalation notice ────────────────────────────────────────────
  if (ctx.maxDpd > 90) {
    return {
      tone:    "escalation",
      subject: `Aviso de cobro prioritario — ${ctx.customerName}`,
      body: [
        `Estimado(a) ${name},`,
        ``,
        `Le informamos que su cuenta con *${org}* presenta un saldo vencido de *${amount}* con más de ${ctx.maxDpd} días de mora${ref}.`,
        ``,
        `Esta situación requiere atención inmediata. Por favor, comuníquese con nosotros hoy para coordinar la regularización de su cartera y evitar el inicio de procesos de cobro jurídico.`,
        ``,
        `📞 Puede contactarnos respondiendo este mensaje.`,
        ``,
        `— Equipo de Cartera, ${org}`,
      ].join("\n"),
    };
  }

  // ── 61–90 DPD: urgent notice ──────────────────────────────────────────────
  if (ctx.maxDpd > 60) {
    return {
      tone:    "urgent",
      subject: `Saldo vencido pendiente — ${ctx.customerName}`,
      body: [
        `Hola ${name},`,
        ``,
        `Le recordamos que tiene un saldo vencido de *${amount}* con *${org}*${ref} con ${ctx.maxDpd} días de mora.`,
        ``,
        `Le pedimos amablemente ponerse en contacto con nosotros a la brevedad para acordar la forma de pago.`,
        ``,
        `Responda este mensaje o llámenos para coordinar. Estamos disponibles para encontrar una solución.`,
        ``,
        `— ${ctx.sellerName ? ctx.sellerName + ", " : ""}${org}`,
      ].join("\n"),
    };
  }

  // ── 31–60 DPD: formal reminder ────────────────────────────────────────────
  if (ctx.maxDpd > 30) {
    return {
      tone:    "formal",
      subject: `Recordatorio de pago — ${ctx.customerName}`,
      body: [
        `Hola ${name},`,
        ``,
        `Queremos informarle que tiene una factura vencida por *${amount}* con *${org}*${ref}.`,
        ``,
        `Si ya realizó el pago, por favor ignoe este mensaje. De lo contrario, le agradecemos gestionar el pago a la brevedad posible.`,
        ``,
        `¿Tiene alguna inquietud? Escríbanos y con gusto le ayudamos.`,
        ``,
        `— ${ctx.sellerName ? ctx.sellerName + ", " : ""}${org}`,
      ].join("\n"),
    };
  }

  // ── 0–30 DPD: courtesy reminder ───────────────────────────────────────────
  return {
    tone:    "courtesy",
    subject: `Aviso de vencimiento próximo — ${ctx.customerName}`,
    body: [
      `Hola ${name} 👋`,
      ``,
      `Solo un recordatorio de que tiene una factura de *${amount}* próxima a vencer con *${org}*${ref}.`,
      ``,
      `Si tiene alguna pregunta sobre su estado de cuenta, con gusto le ayudamos.`,
      ``,
      `— ${ctx.sellerName ? ctx.sellerName + ", " : ""}${org}`,
    ].join("\n"),
  };
}

// ── Channel gate ──────────────────────────────────────────────────────────────

/**
 * Returns true when WhatsApp is the appropriate channel for this DPD level.
 * Legal-stage cases (>180d) should NOT send automated WhatsApp messages.
 */
export function shouldSendWhatsApp(maxDpd: number): boolean {
  return maxDpd <= 180;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Adapts a CollectionsQueueRow (or payloadJson from ActionTask) into a
 * CollectionMessageContext. Caller provides orgName from the Organization record.
 */
export function getCollectionMessageContext(opts: {
  customerName:      string;
  overdueReceivable: number;
  maxDpd:            number;
  orgName:           string;
  sellerName?:       string | null;
  invoiceRef?:       string | null;
}): CollectionMessageContext {
  return {
    customerName:  opts.customerName,
    overdueAmount: opts.overdueReceivable,
    maxDpd:        opts.maxDpd,
    orgName:       opts.orgName,
    sellerName:    opts.sellerName ?? null,
    invoiceRef:    opts.invoiceRef ?? null,
  };
}
