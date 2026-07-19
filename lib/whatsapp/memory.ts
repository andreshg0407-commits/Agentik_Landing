/**
 * lib/whatsapp/memory.ts
 *
 * Customer memory foundation for the Agentik WhatsApp module.
 *
 * Stores lightweight, per-contact facts that survive across conversation threads.
 * Memory is organization-scoped and contact-scoped — never crosses tenant boundaries.
 *
 * ── What is remembered ────────────────────────────────────────────────────────
 *   contactName              — most recent WhatsApp display name
 *   lastSuccessfulOutcome    — "SALES" | "APPOINTMENT" (last captured intent outcome)
 *   lastSuccessfulOutcomeAt  — when that outcome was recorded
 *   lastProductMention       — product/service keyword from last SALES conversation
 *   lastAppointmentRequest   — time hint from last APPOINTMENT request
 *   lastHandoffAt            — when the contact last requested a human agent
 *   totalConversations       — total conversation threads opened (incremented once per thread)
 *
 * ── Write safety ──────────────────────────────────────────────────────────────
 *   All writes are fire-and-forget in the webhook pipeline — wrapped in try/catch
 *   by the caller. Errors are logged but NEVER propagate to break the HTTP 200.
 *
 * ── Read usage ────────────────────────────────────────────────────────────────
 *   getContactMemory() is called before reply generation to personalize the reply.
 *   Returns null for brand-new contacts — callers must handle null gracefully.
 *
 * ── Future extensions ─────────────────────────────────────────────────────────
 *   - lastProductMention can seed remarketing campaign audiences (not yet built)
 *   - totalConversations can gate loyalty/repeat-customer messaging tiers
 *   - Outcome timestamps enable contact-inactivity detection
 */

import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WaContactMemory {
  id:                     string;
  organizationId:         string;
  contactPhone:           string;
  contactName:            string | null;
  /** "SALES" | "APPOINTMENT" — last intent that produced a tracked outcome. */
  lastSuccessfulOutcome:  string | null;
  lastSuccessfulOutcomeAt: Date | null;
  /** Product or service keyword extracted from last SALES message. */
  lastProductMention:     string | null;
  /** Time hint from last APPOINTMENT request, e.g. "Mañana por la tarde". */
  lastAppointmentRequest: string | null;
  lastHandoffAt:          Date | null;
  totalConversations:     number;
  createdAt:              Date;
  updatedAt:              Date;
}

export type WaContactMemoryPatch = Partial<Omit<
  WaContactMemory,
  "id" | "organizationId" | "contactPhone" | "createdAt" | "updatedAt"
>>;

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns the memory record for a contact, or null if they have never had a
 * tracked interaction with this org.
 */
export async function getContactMemory(
  organizationId: string,
  contactPhone:   string,
): Promise<WaContactMemory | null> {
  const row = await (prisma as any).whatsAppContactMemory.findUnique({
    where: { organizationId_contactPhone: { organizationId, contactPhone } },
  });
  return row ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Creates or updates the memory record for a contact.
 * Safe to call multiple times — upsert on (organizationId, contactPhone).
 *
 * IMPORTANT: callers must wrap this in try/catch. Memory writes must never
 * break the webhook pipeline.
 */
export async function upsertContactMemory(
  organizationId: string,
  contactPhone:   string,
  patch:          WaContactMemoryPatch,
): Promise<void> {
  await (prisma as any).whatsAppContactMemory.upsert({
    where:  { organizationId_contactPhone: { organizationId, contactPhone } },
    create: { organizationId, contactPhone, ...patch },
    update: patch,
  });
}

/**
 * Increments the totalConversations counter for a contact.
 * Should be called exactly once per new conversation thread (when existingCount === 0).
 *
 * Creates the memory record if it does not exist yet.
 */
export async function incrementConversationCount(
  organizationId: string,
  contactPhone:   string,
  contactName:    string | null,
): Promise<void> {
  await (prisma as any).whatsAppContactMemory.upsert({
    where:  { organizationId_contactPhone: { organizationId, contactPhone } },
    create: {
      organizationId,
      contactPhone,
      contactName:       contactName ?? null,
      totalConversations: 1,
    },
    update: {
      totalConversations: { increment: 1 },
      // Keep name fresh on each new thread
      ...(contactName ? { contactName } : {}),
    },
  });
}

// ── Stale outcome queries (for trigger engine) ────────────────────────────────

/**
 * Returns memory records where a specific outcome type has not been followed up
 * since the given cutoff date. Used by the trigger engine to find stale sales
 * and appointment outcomes across all contacts in an org.
 *
 * @param organizationId  Org to scan — never cross-tenant.
 * @param outcome         "SALES" | "APPOINTMENT"
 * @param olderThan       Records with lastSuccessfulOutcomeAt before this date are returned.
 * @param limit           Max records to return per call (default 100 — avoid runaway queries).
 */
export async function listStaleOutcomes(
  organizationId: string,
  outcome:        "SALES" | "APPOINTMENT",
  olderThan:      Date,
  limit           = 100,
): Promise<WaContactMemory[]> {
  return (prisma as any).whatsAppContactMemory.findMany({
    where: {
      organizationId,
      lastSuccessfulOutcome:   outcome,
      lastSuccessfulOutcomeAt: { lt: olderThan },
    },
    orderBy: { lastSuccessfulOutcomeAt: "asc" }, // oldest first → highest priority
    take:    limit,
  });
}

// ── Product mention extraction ────────────────────────────────────────────────

/**
 * Extracts a product or service keyword hint from a SALES message.
 * Used to populate lastProductMention in contact memory.
 *
 * Strategy: looks for noun-like phrases following common purchase-signal words.
 * Deliberately NOT NLP — just a keyword-proximity heuristic for the foundation.
 * Returns null if no recognizable product reference is found.
 *
 * Examples:
 *   "quiero comprar unas zapatillas blancas" → "unas zapatillas blancas"
 *   "precio del servicio de instalación"     → "servicio de instalacion"
 *   "tienen disponible el modelo XL"         → "modelo xl"
 */
export function extractProductMention(text: string): string | null {
  if (!text || text.startsWith("[")) return null;

  // Normalize: lowercase + remove diacritics
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Capture the noun phrase following a purchase-signal trigger word
  const TRIGGER_RE = /(?:precio(?:s)? de(?:l)?|costo de(?:l)?|comprar|quiero|me interesa[a-z]*|cotizar|sobre el?|del?|tienen?|busco|necesito)\s+([a-z\u00e0-\u00ff][a-z\u00e0-\u00ff0-9 ]{2,35}?)(?:\s*[,\.?!]|$)/;

  const m = t.match(TRIGGER_RE);
  if (m?.[1]) {
    const mention = m[1].trim();
    // Reject stop-word-only matches (very short or pure articles)
    if (mention.length >= 3 && !/^(un|una|unos|unas|el|la|los|las|lo|de|del)$/.test(mention)) {
      return mention.slice(0, 60); // cap length for storage
    }
  }

  return null;
}
