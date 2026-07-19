/**
 * lib/whatsapp/conversation.ts
 *
 * Conversation persistence layer for the Agentik WhatsApp module.
 *
 * Responsibilities:
 *   - Find or create a conversation for a contact (idempotent, unique per org+phone)
 *   - Persist incoming (USER) messages with deduplication via waMessageId
 *   - Persist outgoing (ASSISTANT/SYSTEM) messages
 *   - Update conversation state (intent, status, handoff)
 *   - List conversations for the management UI
 *
 * All DB calls use `(prisma as any)` following the pattern for recently-added
 * Prisma models not yet reflected in the generated client types.
 */

import { prisma }  from "@/lib/prisma";
import type {
  WaConversation,
  WaConversationStatus,
  WaIntent,
  WaMessage,
  WaMessageRole,
} from "./types";

// ── Conversation ──────────────────────────────────────────────────────────────

/**
 * Finds an existing ACTIVE conversation for the contact or creates a new one.
 *
 * Uniqueness is scoped to (organizationId, contactPhone).
 * If a conversation exists but is RESOLVED/TIMED_OUT, the caller may choose
 * to reopen it or create a new thread — this function returns whatever exists.
 *
 * contactName is updated if provided (WhatsApp profile names can change).
 */
export async function findOrCreateConversation(
  organizationId: string,
  configId:       string,
  contactPhone:   string,
  contactName?:   string,
): Promise<WaConversation> {
  return (prisma as any).whatsAppConversation.upsert({
    where:  { organizationId_contactPhone: { organizationId, contactPhone } },
    create: {
      organizationId,
      configId,
      contactPhone,
      contactName: contactName ?? null,
    },
    update: {
      // Update name if provided — WhatsApp profile names can change over time
      ...(contactName ? { contactName } : {}),
    },
  });
}

/**
 * Reopens a RESOLVED or TIMED_OUT conversation when the contact writes again.
 * No-op if conversation is already ACTIVE or HANDED_OFF.
 */
export async function reopenConversationIfClosed(
  conversationId: string,
): Promise<void> {
  await (prisma as any).whatsAppConversation.updateMany({
    where: {
      id:     conversationId,
      status: { in: ["RESOLVED", "TIMED_OUT"] },
    },
    data: { status: "ACTIVE" },
  });
}

/**
 * Updates the conversation's last classified intent and optionally its status.
 * Called after each incoming message is classified.
 */
export async function updateConversationState(
  conversationId: string,
  intent:         WaIntent,
  status?:        WaConversationStatus,
  handoffTo?:     string,
): Promise<void> {
  await (prisma as any).whatsAppConversation.update({
    where: { id: conversationId },
    data:  {
      lastIntent: intent,
      ...(status    ? { status, handedOff: status === "HANDED_OFF" } : {}),
      ...(handoffTo ? { handoffTo }                                  : {}),
    },
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────

/**
 * Persists an incoming USER message.
 *
 * Idempotent: if waMessageId already exists (e.g. webhook retry), the upsert
 * skips the create and returns the existing record — no duplicate stored.
 */
export async function persistUserMessage(
  conversationId: string,
  organizationId: string,
  content:        string,
  intent:         WaIntent,
  waMessageId:    string,
  rawPayload?:    unknown,
): Promise<WaMessage> {
  return (prisma as any).whatsAppMessage.upsert({
    where:  { waMessageId },
    create: {
      conversationId,
      organizationId,
      role:       "USER" satisfies WaMessageRole,
      content,
      intent,
      waMessageId,
      rawPayload: rawPayload ?? null,
    },
    update: {}, // idempotent — skip duplicates from webhook retries
  });
}

/**
 * Persists an outgoing ASSISTANT message.
 * No deduplication needed — assistant messages are always new.
 */
export async function persistAssistantMessage(
  conversationId: string,
  organizationId: string,
  content:        string,
): Promise<WaMessage> {
  return (prisma as any).whatsAppMessage.create({
    data: {
      conversationId,
      organizationId,
      role:    "ASSISTANT" satisfies WaMessageRole,
      content,
    },
  });
}

/**
 * Persists a SYSTEM event message (e.g. "Conversation handed off to Support").
 */
export async function persistSystemMessage(
  conversationId: string,
  organizationId: string,
  content:        string,
): Promise<WaMessage> {
  return (prisma as any).whatsAppMessage.create({
    data: {
      conversationId,
      organizationId,
      role:    "SYSTEM" satisfies WaMessageRole,
      content,
    },
  });
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns paginated conversations for a tenant's admin UI.
 * Ordered newest-first. Optional status filter.
 */
export async function listConversations(
  organizationId: string,
  options: {
    status?: WaConversationStatus;
    take?:   number;
    skip?:   number;
  } = {},
): Promise<WaConversation[]> {
  const { status, take = 50, skip = 0 } = options;
  return (prisma as any).whatsAppConversation.findMany({
    where:   { organizationId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take,
    skip,
  });
}

/**
 * Returns the last N messages for a conversation.
 * Used to build context for LLM calls in future iterations.
 */
export async function getConversationMessages(
  conversationId: string,
  take = 20,
): Promise<WaMessage[]> {
  return (prisma as any).whatsAppMessage.findMany({
    where:   { conversationId },
    orderBy: { createdAt: "asc" },
    take,
  });
}

/**
 * Returns HANDED_OFF conversations that have not been updated since a given
 * cutoff date. Used by the trigger engine to detect unresolved handoffs.
 *
 * A conversation that stays HANDED_OFF without an agent updating it (no new
 * messages, no status change) is considered "stale" and warrants re-escalation.
 *
 * @param organizationId  Org to scan.
 * @param olderThan       Conversations with updatedAt before this date are returned.
 * @param limit           Max records (default 50).
 */
export async function listHandedOffConversations(
  organizationId: string,
  olderThan:      Date,
  limit           = 50,
): Promise<WaConversation[]> {
  return (prisma as any).whatsAppConversation.findMany({
    where: {
      organizationId,
      status:    "HANDED_OFF",
      updatedAt: { lt: olderThan },
    },
    orderBy: { updatedAt: "asc" }, // oldest-stale first
    take:    limit,
  });
}

/**
 * Returns the total number of messages in a conversation.
 * Used in the webhook pipeline to detect first-contact (count === 0 before
 * the new message is persisted) so the welcome message is prepended once.
 */
export async function countConversationMessages(
  conversationId: string,
): Promise<number> {
  return (prisma as any).whatsAppMessage.count({
    where: { conversationId },
  });
}
