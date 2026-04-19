import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@prisma/client";
import { requireIntegrationAccess } from "@/lib/api/integration-auth";
import { syncPyaProducts } from "@/lib/sync/pya/sync-products";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { integrationId: string } }
) {
  const body = await req.json().catch(() => null);
  const organizationId = body?.organizationId;
  const workspaceId    = body?.workspaceId  ?? undefined;
  const projectId      = body?.projectId    ?? undefined;

  if (!organizationId) {
    return NextResponse.json({ ok: false, error: "organizationId is required" }, { status: 400 });
  }

  try {
    await requireIntegrationAccess(organizationId, params.integrationId, IntegrationProvider.PYA);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "INTEGRATION_NOT_FOUND" ? 404 : 403;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  try {
    const result = await syncPyaProducts({
      organizationId,
      integrationId: params.integrationId,
      workspaceId,
      projectId,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Sync failed";
    console.error("[pya/sync-products]", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
