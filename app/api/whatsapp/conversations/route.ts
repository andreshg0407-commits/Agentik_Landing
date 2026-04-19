/**
 * app/api/whatsapp/conversations/route.ts
 *
 * Conversation list and detail endpoints for tenant admin UI.
 *
 * GET  ?organizationId=&status=&take=&skip=
 *   — Paginated list of conversations for the org, newest first.
 *   — Optional status filter: ACTIVE | RESOLVED | HANDED_OFF | TIMED_OUT
 *   — Defaults: take=50, skip=0
 *
 * GET  ?organizationId=&conversationId=
 *   — Returns a single conversation with its last 30 messages.
 *
 * Both endpoints require active org membership + WhatsApp module enabled.
 */

import { NextRequest, NextResponse }       from "next/server";
import { requireWhatsAppModule }           from "@/lib/whatsapp/guard";
import { listConversations, getConversationMessages } from "@/lib/whatsapp/conversation";
import { prisma }                          from "@/lib/prisma";
import type { WaConversationStatus }       from "@/lib/whatsapp/types";

export const runtime = "nodejs";

const VALID_STATUSES = new Set<WaConversationStatus>([
  "ACTIVE", "RESOLVED", "HANDED_OFF", "TIMED_OUT",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const organizationId   = searchParams.get("organizationId");
  const conversationId   = searchParams.get("conversationId");

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const auth = await requireWhatsAppModule(organizationId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // ── Single conversation + messages ─────────────────────────────────────────
  if (conversationId) {
    const conversation = await (prisma as any).whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const messages = await getConversationMessages(conversationId, 30);
    return NextResponse.json({ ok: true, data: { conversation, messages } });
  }

  // ── Paginated list ─────────────────────────────────────────────────────────
  const rawStatus = searchParams.get("status");
  const status    = rawStatus && VALID_STATUSES.has(rawStatus as WaConversationStatus)
    ? (rawStatus as WaConversationStatus)
    : undefined;

  const take = Math.min(parseInt(searchParams.get("take") ?? "50", 10), 100);
  const skip = Math.max(parseInt(searchParams.get("skip") ?? "0",  10), 0);

  try {
    const conversations = await listConversations(organizationId, { status, take, skip });
    return NextResponse.json({ ok: true, data: conversations });
  } catch (err) {
    console.error("[whatsapp/conversations] list failed:", err);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}
