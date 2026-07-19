/**
 * lib/marketing-studio/catalogs/whatsapp-cta.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01 — WhatsApp CTA Builder
 *
 * Builds wa.me deep links for catalog product CTAs.
 * Pure domain logic — no Prisma, no I/O, no side effects.
 *
 * ── FORMAT ─────────────────────────────────────────────────────────────────────
 *   https://wa.me/{phone}?text={encoded_message}
 *   phone: E.164 digits only (strip leading +)
 *   message: pre-filled order request text
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WhatsAppCtaContext {
  /** Customer-facing WhatsApp phone (E.164, e.g. "+573001234567" or "573001234567") */
  phone:       string;
  productName: string;
  sku?:        string | null;
  catalogName: string;
  /** Override the default message template */
  messageOverride?: string;
}

export interface WhatsAppCtaResult {
  url:     string;
  message: string;
  phone:   string;
}

// ── Phone normalizer ──────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  // Strip leading + and all non-digits
  return phone.replace(/^\+/, "").replace(/\D/g, "");
}

// ── Message builder ───────────────────────────────────────────────────────────

function buildOrderMessage(ctx: Omit<WhatsAppCtaContext, "messageOverride">): string {
  const skuPart = ctx.sku ? ` (Ref: ${ctx.sku})` : "";
  return (
    `Hola! Me interesa el producto: ${ctx.productName}${skuPart}` +
    ` del catálogo "${ctx.catalogName}". ¿Está disponible?`
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildWhatsAppCta
 *
 * Builds a wa.me URL for a catalog product order CTA.
 * Returns null if phone is missing or malformed.
 */
export function buildWhatsAppCta(
  ctx: WhatsAppCtaContext,
): WhatsAppCtaResult | null {
  const normalized = normalizePhone(ctx.phone);
  if (!normalized || normalized.length < 7) return null;

  const message = ctx.messageOverride ?? buildOrderMessage(ctx);
  const url     = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;

  return { url, message, phone: normalized };
}

/**
 * buildCatalogWhatsAppCta
 *
 * Convenience wrapper: resolves the effective phone from catalog-level
 * whatsAppPhone with a fallback to an org-level default.
 */
export function buildCatalogWhatsAppCta(params: {
  catalogWhatsAppPhone: string | null;
  orgDefaultPhone:      string | null;
  productName:          string;
  sku?:                 string | null;
  catalogName:          string;
}): WhatsAppCtaResult | null {
  const phone = params.catalogWhatsAppPhone ?? params.orgDefaultPhone;
  if (!phone) return null;

  return buildWhatsAppCta({
    phone,
    productName: params.productName,
    sku:         params.sku,
    catalogName: params.catalogName,
  });
}
