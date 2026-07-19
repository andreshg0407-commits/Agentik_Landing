/**
 * POST   /api/orgs/[orgSlug]/marketing-studio/video-editor/drafts
 * GET    /api/orgs/[orgSlug]/marketing-studio/video-editor/drafts[?draftId=xxx]
 * PATCH  /api/orgs/[orgSlug]/marketing-studio/video-editor/drafts?draftId=xxx
 * DELETE /api/orgs/[orgSlug]/marketing-studio/video-editor/drafts?draftId=xxx
 *
 * MARKETING-VIDEO-DRAFT-WORKSPACE-01 — Draft API
 *
 * POST:   Create a new video draft.
 * GET:    List active drafts (draft + ready_to_export) or fetch a single draft by draftId.
 * PATCH:  Update draft content (nombre, config, videoUrl, referencia, status).
 * DELETE: Soft-delete (abandon) a draft.
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - organizationId always comes from server session.
 *   - tenant boundary enforced in service (tenantId filter on every query).
 */

export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import {
  createVideoDraft,
  updateVideoDraft,
  getVideoDraft,
  listVideoDrafts,
  deleteVideoDraft,
}                                        from "@/lib/marketing-studio/video-editor/drafts/video-draft-service";
import type {
  CreateVideoDraftInput,
  UpdateVideoDraftInput,
}                                        from "@/lib/marketing-studio/video-editor/drafts/video-draft-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── POST — create draft ────────────────────────────────────────────────────────

export async function POST(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization, user } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const body = await req.json() as {
      nombre?:       string;
      source?:       "local_file" | "biblioteca";
      videoUrl?:     string;
      assetPadreId?: string | null;
      config?:       CreateVideoDraftInput["config"];
      referenceSku?:  string | null;
      referenceName?: string | null;
    };

    if (!body.videoUrl) {
      return NextResponse.json({ error: "Se requiere videoUrl" }, { status: 400 });
    }

    const draft = await createVideoDraft({
      organizationId: organization.id,
      createdBy:      user.name ?? user.id ?? "usuario",
      nombre:         (body.nombre ?? "Sin nombre").slice(0, 120),
      source:         body.source        ?? "local_file",
      videoUrl:       body.videoUrl,
      assetPadreId:   body.assetPadreId  ?? null,
      config:         body.config        ?? ({} as CreateVideoDraftInput["config"]),
      referenceSku:   body.referenceSku  ?? null,
      referenceName:  body.referenceName ?? null,
    });

    return NextResponse.json({ draft }, { status: 201 });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    console.error("[drafts] POST error:", message);
    return NextResponse.json({ error: "No pudimos guardar el borrador." }, { status: 500 });
  }
}

// ── GET — list or fetch draft ──────────────────────────────────────────────────

export async function GET(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const url     = new URL(req.url);
    const draftId = url.searchParams.get("draftId") ?? undefined;
    const limit   = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

    if (draftId) {
      const draft = await getVideoDraft(draftId, organization.id);
      if (!draft) {
        return NextResponse.json({ error: "Borrador no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ draft });
    }

    const drafts = await listVideoDrafts(organization.id, { limit });
    return NextResponse.json({ drafts });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH — update draft ───────────────────────────────────────────────────────

export async function PATCH(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const url     = new URL(req.url);
    const draftId = url.searchParams.get("draftId");
    if (!draftId) {
      return NextResponse.json({ error: "Se requiere draftId" }, { status: 400 });
    }

    const body = await req.json() as UpdateVideoDraftInput;

    const draft = await updateVideoDraft(draftId, organization.id, body);
    if (!draft) {
      return NextResponse.json({ error: "Borrador no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ draft });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    console.error("[drafts] PATCH error:", message);
    return NextResponse.json({ error: "No pudimos actualizar el borrador." }, { status: 500 });
  }
}

// ── DELETE — abandon draft ────────────────────────────────────────────────────

export async function DELETE(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const url     = new URL(req.url);
    const draftId = url.searchParams.get("draftId");
    if (!draftId) {
      return NextResponse.json({ error: "Se requiere draftId" }, { status: 400 });
    }

    const ok = await deleteVideoDraft(draftId, organization.id);
    if (!ok) {
      return NextResponse.json({ error: "Borrador no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
