/**
 * GET  /api/orgs/[orgSlug]/reconciliation/review/[itemId]
 * PATCH /api/orgs/[orgSlug]/reconciliation/review/[itemId]
 *
 * AGENTIK-RECON-REVIEW-CENTER-01 — Phase 4 + 5 + 6
 *
 * GET  — full item detail including explanationJson + audit trail
 * PATCH — update lifecycle status OR resolve with resolution code
 *
 * PATCH body shapes:
 *
 *   Status transition:
 *     { action: "set_status", status: "in_review" | "escalated" | "dismissed", note?: string, actor: string }
 *
 *   Resolve:
 *     { action: "resolve", resolution: "approved" | "rejected" | "manual_match"
 *         | "needs_sag_validation" | "needs_business_validation" | "needs_bank_support",
 *       note?: string, actor: string }
 *
 * IMPORTANT: Backend-only API route.
 */

import { NextRequest, NextResponse }       from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import {
  getReviewItem,
  updateReviewItemStatus,
  resolveReviewItem,
  listReviewAuditEvents,
} from "@/lib/reconciliation/review/review-repository";
import type {
  ReviewItemStatus,
  ReviewItemResolution,
} from "@/lib/reconciliation/review/review-types";

const VALID_STATUSES  = new Set<ReviewItemStatus>(["open", "in_review", "resolved", "dismissed", "escalated"]);
const VALID_RESOLUTIONS = new Set<ReviewItemResolution>([
  "approved", "rejected", "manual_match",
  "needs_sag_validation", "needs_business_validation", "needs_bank_support",
]);

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ orgSlug: string; itemId: string }> },
): Promise<NextResponse> {
  const { orgSlug, itemId } = await context.params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    const [item, auditEvents] = await Promise.all([
      getReviewItem(organizationId, itemId),
      listReviewAuditEvents(organizationId, itemId),
    ]);

    if (!item) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });

    return NextResponse.json({ item, auditEvents });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED" || msg === "ORG_NOT_FOUND" || msg === "ORG_INACTIVE") {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
    console.error("[RECON_REVIEW_GET]", msg);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req:     NextRequest,
  context: { params: Promise<{ orgSlug: string; itemId: string }> },
): Promise<NextResponse> {
  const { orgSlug, itemId } = await context.params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    const body = await req.json() as {
      action?:     unknown;
      status?:     unknown;
      resolution?: unknown;
      note?:       unknown;
      actor?:      unknown;
    };

    const action = typeof body.action === "string" ? body.action : null;
    const actor  = typeof body.actor  === "string" ? body.actor  : "system";

    if (action === "set_status") {
      const newStatus = typeof body.status === "string" ? body.status as ReviewItemStatus : null;
      if (!newStatus || !VALID_STATUSES.has(newStatus)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      const note = typeof body.note === "string" ? body.note : undefined;
      const updated = await updateReviewItemStatus(organizationId, itemId, newStatus, actor, note);
      if (!updated) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
      return NextResponse.json({ item: updated });
    }

    if (action === "resolve") {
      const resolution = typeof body.resolution === "string" ? body.resolution as ReviewItemResolution : null;
      if (!resolution || !VALID_RESOLUTIONS.has(resolution)) {
        return NextResponse.json({ error: "Resolution inválida" }, { status: 400 });
      }
      const note = typeof body.note === "string" ? body.note : undefined;
      const updated = await resolveReviewItem(organizationId, itemId, { resolution, reviewNote: note, actor });
      if (!updated) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
      return NextResponse.json({ item: updated });
    }

    return NextResponse.json({ error: "action debe ser 'set_status' o 'resolve'" }, { status: 400 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED" || msg === "ORG_NOT_FOUND" || msg === "ORG_INACTIVE") {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
    console.error("[RECON_REVIEW_PATCH]", msg);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
