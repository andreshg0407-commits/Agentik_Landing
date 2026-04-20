/**
 * app/api/orgs/[orgSlug]/marketing-studio/sessions/[sessionId]/callback/route.ts
 *
 * POST — receive per-asset generation status updates from n8n.
 *
 * Called by the n8n workflow once per GeneratedAsset after the provider
 * completes (or fails) generation. The route:
 *   1. Authenticates via STUDIO_N8N_WEBHOOK_SECRET Bearer token (skipped when unset).
 *   2. Verifies the asset belongs to the session.
 *   3. Persists the asset status update (READY + assetUrl, or FAILED).
 *   4. Checks whether all assets have settled.
 *   5. When all READY → resolves Shopify draft imageSlots + marks session PUBLISHED.
 *   6. When any FAILED → marks session FAILED.
 *
 * Body schema:
 *   {
 *     assetId:      string;              — GeneratedAsset.id
 *     status:       "READY" | "FAILED";
 *     assetUrl?:    string;              — CDN URL (required when status=READY for visual assets)
 *     content?:     string;              — text content (copy_caption, hashtags)
 *     externalRef?: string;              — provider prediction/job ID for audit trail
 *   }
 *
 * Response: { ok: true, sessionStatus? }
 */

import { NextRequest, NextResponse }         from "next/server";
import {
  getDbAsset,
  listDbAssets,
  checkAllAssetsSettled,
  updateAssetGenerationReady,
  updateAssetGenerationFailed,
}                                            from "@/lib/marketing-studio/asset-service";
import {
  getDbSession,
  resolveAndPublishSession,
  updateDbSessionFailed,
}                                            from "@/lib/marketing-studio/session-service";
import { uploadGeneratedAssetImage }         from "@/lib/marketing-studio/r2-upload";

type RouteContext = { params: Promise<{ orgSlug: string; sessionId: string }> };

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Accepts auth via:
 *   1. Authorization: Bearer <secret>  header (legacy / guided-workflow path)
 *   2. ?token=<secret>                 query param (n8n callback path — avoids credential mgmt)
 * When STUDIO_N8N_WEBHOOK_SECRET is unset, all requests are allowed (dev mode).
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.STUDIO_N8N_WEBHOOK_SECRET;
  if (!secret) return true; // dev / no-auth mode

  const auth  = req.headers.get("authorization") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return auth === `Bearer ${secret}` || token === secret;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { sessionId } = await params;

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: {
    assetId:      string;
    status:       "READY" | "FAILED";
    assetUrl?:    string;
    content?:     string;
    externalRef?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { assetId, status, assetUrl, content, externalRef } = body;

  if (!assetId || !status) {
    return NextResponse.json({ error: "assetId and status are required" }, { status: 400 });
  }
  if (status !== "READY" && status !== "FAILED") {
    return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 });
  }

  // ── 1. Verify asset belongs to session ──────────────────────────────────────
  const asset = await getDbAsset(assetId);
  if (!asset || asset.sessionId !== sessionId) {
    return NextResponse.json({ error: "ASSET_NOT_FOUND" }, { status: 404 });
  }

  // ── 2. Verify session exists ─────────────────────────────────────────────────
  const session = await getDbSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  // ── 3. Persist asset status ──────────────────────────────────────────────────
  if (status === "READY") {
    let finalUrl = assetUrl ?? "";

    // Re-host provider URLs (e.g. signed Replicate URLs) to R2 for permanence.
    if (assetUrl) {
      try {
        const r2 = await uploadGeneratedAssetImage({
          sourceUrl: assetUrl,
          tenantId:  session.tenantId,
          sessionId,
          assetId,
          assetType: asset.assetType,
        });
        if (r2) finalUrl = r2.url;
      } catch (uploadErr) {
        // R2 upload failed — log and fall back to provider URL
        console.warn("[callback] R2 upload failed, using provider URL", { assetId, err: uploadErr });
      }
    }

    await updateAssetGenerationReady(assetId, finalUrl, externalRef);
  } else {
    await updateAssetGenerationFailed(assetId);
  }

  console.info("[callback] asset update", { sessionId, assetId, status, assetType: asset.assetType });

  // ── 4. Check settlement ───────────────────────────────────────────────────────
  const { settled, allReady, anyFailed } = await checkAllAssetsSettled(sessionId);

  if (!settled) {
    return NextResponse.json({ ok: true, sessionStatus: "publishing" });
  }

  // ── 5. All settled — resolve session ─────────────────────────────────────────
  if (anyFailed) {
    await updateDbSessionFailed(sessionId, "One or more assets failed generation");
    return NextResponse.json({ ok: true, sessionStatus: "failed" });
  }

  if (allReady) {
    // Build assetId → CDN URL map from all settled assets
    const allAssets = await listDbAssets(sessionId);
    const assetUrlMap: Record<string, string> = {};
    for (const a of allAssets) {
      if (a.assetUrl) assetUrlMap[a.id] = a.assetUrl;
    }

    await resolveAndPublishSession(sessionId, assetUrlMap);

    console.info("[callback] session published", { sessionId });
    return NextResponse.json({ ok: true, sessionStatus: "published" });
  }

  return NextResponse.json({ ok: true, sessionStatus: "publishing" });
}
