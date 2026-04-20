/**
 * POST /api/orgs/[orgSlug]/marketing-studio/foto-estudio/sessions/[sessionId]/generate
 *
 * Foto Estudio generation entry point.
 * Reads selectedOutputs + visual settings from session.inputsJson,
 * creates GeneratedAsset rows, dispatches to n8n, persists jobId.
 *
 * No objective required — output types drive the assets.
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireOrgAccess }                       from "@/lib/auth/org-access";
import { getDbSession, updateDbSessionExecution } from "@/lib/marketing-studio/session-service";
import { createDbAssetsForSession }               from "@/lib/marketing-studio/asset-service";
import { getExecutor }                            from "@/lib/marketing-studio/n8n-executor";
import { buildN8nWebhookPayload }                 from "@/lib/marketing-studio/execution-payload";
import type { StudioExecutionPayload }            from "@/lib/marketing-studio/execution-payload";
import { mapOutputToAssetTypes }                  from "@/lib/marketing-studio/foto-estudio-types";
import type { FotoEstudioSettings, FotoOutputType } from "@/lib/marketing-studio/foto-estudio-types";
import type { OutputAssetType }                   from "@/lib/marketing-studio/guided-flow";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string; sessionId: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, sessionId } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    // ── Load session ──────────────────────────────────────────────────────────
    const session = await getDbSession(sessionId);
    if (!session || session.organizationId !== organization.id) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const settings = (session.inputsJson ?? {}) as Partial<FotoEstudioSettings>;
    const frontImageUrl   = settings.frontImageUrl ?? "";
    const backImageUrl    = settings.backImageUrl   ?? "";
    const detail1Url      = settings.detail1Url;
    const detail2Url      = settings.detail2Url;
    const selectedOutputs = settings.selectedOutputs ?? ["catalog_photo"] as FotoOutputType[];
    const visualStyle     = settings.visualStyle     ?? "clean_studio";
    const background      = settings.background      ?? "white";
    const aspectRatio     = settings.aspectRatio     ?? "1:1";
    const quantity        = Math.min(Math.max(settings.quantity ?? 1, 1), 4);

    if (!frontImageUrl && !backImageUrl) {
      return NextResponse.json({ error: "Se requiere al menos una imagen (frontal o trasera)" }, { status: 422 });
    }

    // ── Build asset list ──────────────────────────────────────────────────────
    const assetSpecs: Array<{ assetType: string; prompt: string; sourceImageUrl: string }> = [];

    for (const output of selectedOutputs) {
      const assetTypes = mapOutputToAssetTypes(output);
      for (const assetType of assetTypes) {
        // back_clean uses backImageUrl; everything else uses frontImageUrl
        const sourceUrl = (assetType === "back_clean" && backImageUrl) ? backImageUrl : (frontImageUrl || backImageUrl);
        if (!sourceUrl) continue; // skip if source missing (guard)
        const prompt    = buildPrompt({ assetType, visualStyle, background, aspectRatio });
        for (let i = 0; i < quantity; i++) {
          assetSpecs.push({ assetType, prompt, sourceImageUrl: sourceUrl });
        }
      }
    }

    // ── Create GeneratedAsset rows ────────────────────────────────────────────
    const dbAssets = await createDbAssetsForSession(
      sessionId,
      assetSpecs.map(s => ({
        sessionId,
        assetType:  s.assetType as OutputAssetType,
        prompt:     s.prompt,
      })),
    );

    // ── Build n8n payload ─────────────────────────────────────────────────────
    const callbackSecret = process.env.STUDIO_N8N_WEBHOOK_SECRET;
    const callbackBase   = `${new URL(req.url).origin}/api/orgs/${orgSlug}/marketing-studio/sessions/${sessionId}/callback`;
    const callbackUrl    = callbackSecret
      ? `${callbackBase}?token=${encodeURIComponent(callbackSecret)}`
      : callbackBase;

    const executionPayload: StudioExecutionPayload = {
      sessionId,
      organizationId:  organization.id,
      tenantId:        session.tenantId,
      requestId:       `req_foto_${sessionId}_${Date.now().toString(36)}`,
      mode:            "foto_estudio",
      locale:          "es-CO",
      // Foto Estudio settings
      frontImageUrl,
      backImageUrl,
      detail1Url,
      detail2Url,
      selectedOutputs,
      visualStyle,
      background,
      aspectRatio,
      quantity,
      fidelityMode:    "standard",
      draftShopify:    false,
      assets: dbAssets.map((a, idx) => ({
        assetId:        a.id,
        assetType:      a.assetType as OutputAssetType,
        prompt:         assetSpecs[idx]?.prompt ?? "",
        sourceImageUrl: assetSpecs[idx]?.sourceImageUrl,
      })),
      callbackUrl,
      schemaVersion:   "1.0",
      createdAt:       new Date().toISOString(),
    };

    const webhookPayload = buildN8nWebhookPayload(executionPayload);

    // ── Dispatch ──────────────────────────────────────────────────────────────
    const executor = getExecutor();
    const result   = await executor.dispatch(webhookPayload);

    // ── Persist ───────────────────────────────────────────────────────────────
    await updateDbSessionExecution(sessionId, result.jobId, webhookPayload);

    return NextResponse.json({
      ok:       true,
      jobId:    result.jobId,
      stubbed:  result.stubbed,
      assetIds: dbAssets.map(a => ({ id: a.id, assetType: a.assetType })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[foto-estudio/generate]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildPrompt(opts: {
  assetType:    string;
  visualStyle:  string;
  background:   string;
  aspectRatio:  string;
}): string {
  const styleMap: Record<string, string> = {
    clean_studio: "clean studio lighting, white backdrop",
    editorial:    "editorial fashion photography, dramatic lighting",
    urban:        "urban street style setting, natural light",
    lifestyle:    "lifestyle product shot, natural environment",
    luxury:       "luxury brand aesthetic, premium lighting, bokeh",
    minimal:      "minimalist composition, flat lay, neutral tones",
  };
  const bgMap: Record<string, string> = {
    white:         "pure white background",
    light_gray:    "light gray seamless background",
    black:         "deep black background",
    gradient:      "soft gradient background",
    outdoor_scene: "outdoor natural scene",
    indoor_scene:  "indoor lifestyle scene",
    transparent:   "transparent/removed background",
  };
  const style = styleMap[opts.visualStyle] ?? opts.visualStyle;
  const bg    = bgMap[opts.background]    ?? opts.background;
  return `Product photo, ${style}, ${bg}, ${opts.aspectRatio} format, professional photography, high resolution.`;
}
