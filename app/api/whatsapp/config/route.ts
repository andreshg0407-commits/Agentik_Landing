/**
 * app/api/whatsapp/config/route.ts
 *
 * Per-tenant WhatsApp configuration CRUD.
 *
 * GET  ?organizationId=  — fetch current config (returns null if not set)
 * POST ?organizationId=  — create or update config (upsert)
 *
 * Both endpoints require an active org membership.
 * The WhatsApp module must be enabled (requireWhatsAppModule guard).
 *
 * POST body (WaConfigInput):
 *   {
 *     phoneNumberId:  string   // Meta phone_number_id
 *     wabaId:         string   // WhatsApp Business Account ID
 *     webhookSecret:  string   // Meta app verify token
 *     displayName:    string   // Business display name
 *     welcomeMessage?: string  // Optional first-contact greeting
 *     intentConfig?:  object   // Per-intent settings JSON
 *     active?:        boolean  // defaults to false (draft)
 *   }
 */

import { NextRequest, NextResponse }  from "next/server";
import { getWhatsAppConfig, upsertWhatsAppConfig } from "@/lib/whatsapp/config";
import { requireWhatsAppModule }      from "@/lib/whatsapp/guard";
import type { WaConfigInput }         from "@/lib/whatsapp/types";

export const runtime = "nodejs";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const auth = await requireWhatsAppModule(organizationId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const config = await getWhatsAppConfig(organizationId);
  return NextResponse.json({ ok: true, data: config });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const auth = await requireWhatsAppModule(organizationId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let input: WaConfigInput;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const missing = (["phoneNumberId", "wabaId", "webhookSecret", "displayName"] as const)
    .filter(f => !input[f] || typeof input[f] !== "string");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const config = await upsertWhatsAppConfig(organizationId, input);
    return NextResponse.json({ ok: true, data: config });
  } catch (err) {
    console.error("[whatsapp/config] upsert failed:", err);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
