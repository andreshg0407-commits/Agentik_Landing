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
import type {
  FotoEstudioSettings,
  FotoOutputType,
  GarmentType,
  BrandLine,
  SocialPublicationType,
}                                                 from "@/lib/marketing-studio/foto-estudio-types";
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
    const frontImageUrl          = settings.frontImageUrl          ?? "";
    const backImageUrl           = settings.backImageUrl           ?? "";
    const detail1Url             = settings.detail1Url;
    const detail2Url             = settings.detail2Url;
    const referenceImageUrl      = settings.referenceImageUrl;
    const selectedOutputs        = settings.selectedOutputs        ?? ["catalog_photo"] as FotoOutputType[];
    const visualStyle            = settings.visualStyle            ?? "clean_studio";
    const background             = settings.background             ?? "white";
    const aspectRatio            = settings.aspectRatio            ?? "1:1";
    const quantity               = Math.min(Math.max(settings.quantity ?? 1, 1), 4);
    const garmentType            = settings.garmentType            ?? "jean";
    const brandLine              = settings.brandLine              ?? "casual";
    const socialPublicationType  = settings.socialPublicationType  ?? "feed";

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
        const prompt    = buildPrompt({ assetType, visualStyle, background, aspectRatio, garmentType, brandLine, socialPublicationType, referenceImageUrl });
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
      referenceImageUrl,
      selectedOutputs,
      visualStyle,
      background,
      aspectRatio,
      quantity,
      garmentType,
      brandLine,
      socialPublicationType,
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

// ── Prompt builder — commercial-grade, Do Jeans spec ──────────────────────────

function buildPrompt(opts: {
  assetType:             string;
  visualStyle:           string;
  background:            string;
  aspectRatio:           string;
  garmentType:           GarmentType;
  brandLine:             BrandLine;
  socialPublicationType: SocialPublicationType;
  referenceImageUrl?:    string;
}): string {
  const { assetType, visualStyle, background, aspectRatio, garmentType, brandLine, socialPublicationType } = opts;

  // ── Shared vocab ─────────────────────────────────────────────────────────

  const garmentLabel: Record<GarmentType, string> = {
    jean:     "denim jeans",
    short:    "denim shorts",
    falda:    "denim skirt",
    body:     "bodysuit",
    top:      "top",
    chaqueta: "denim jacket",
    vestido:  "dress",
    otro:     "garment",
  };

  const garmentStr = garmentLabel[garmentType] ?? "garment";

  // ── Model aesthetic per brand line ───────────────────────────────────────

  const modelDescLuxury =
    "a voluptuous Latin woman model, curvy figure, accentuated silhouette, " +
    "booty-lifting fit, confident and sensual pose, glamorous but tasteful";
  const modelDescCasual =
    "a young Latin woman model, slim athletic build, natural relaxed pose, " +
    "urban everyday look, approachable and confident";
  const modelDesc = brandLine === "luxury" ? modelDescLuxury : modelDescCasual;

  // ── Background ──────────────────────────────────────────────────────────

  const bgMap: Record<string, string> = {
    white:         "pure white seamless background",
    light_gray:    "light gray seamless studio background",
    black:         "deep black background, dramatic lighting",
    gradient:      "soft gradient background, smooth tonal transition",
    outdoor_scene: "outdoor urban setting, natural daylight",
    indoor_scene:  "indoor lifestyle environment, warm ambient light",
    transparent:   "transparent background (PNG cutout)",
  };
  const bgStr = bgMap[background] ?? background;

  // ── Visual style lighting ────────────────────────────────────────────────

  const lightingMap: Record<string, string> = {
    clean_studio: "clean studio lighting, even soft boxes, no harsh shadows",
    editorial:    "editorial fashion lighting, dramatic shadows, high contrast",
    urban:        "natural city light, golden hour, authentic street atmosphere",
    lifestyle:    "lifestyle natural light, warm tones, candid atmosphere",
    luxury:       "premium studio lighting, rim light, bokeh depth-of-field",
    minimal:      "minimalist flat lighting, neutral tones, understated elegance",
  };
  const lightingStr = lightingMap[visualStyle] ?? "professional studio lighting";

  // ── Per asset-type prompt construction ──────────────────────────────────

  // CATALOG (front_clean): half-body, garment in center, e-commerce focus
  if (assetType === "front_clean") {
    return [
      `Commercial e-commerce product photo of ${garmentStr} worn by ${modelDesc}.`,
      `American shot (waist to knee), garment centered and fully visible, flat-front view.`,
      `${lightingStr}. ${bgStr}.`,
      `Hyper-realistic, sharp garment texture and stitching detail, accurate color rendition.`,
      `${aspectRatio} format. Commercial fashion photography, high resolution, ready for online store.`,
    ].join(" ");
  }

  // CATALOG BACK (back_clean): rear view, same e-commerce focus
  if (assetType === "back_clean") {
    return [
      `Commercial e-commerce product photo of ${garmentStr} worn by ${modelDesc}, rear view.`,
      `American shot (waist to knee), garment centered, full back visible, showing fit and back design details.`,
      `${lightingStr}. ${bgStr}.`,
      `Hyper-realistic, sharp garment texture and stitching detail, accurate color rendition.`,
      `${aspectRatio} format. Commercial fashion photography, high resolution, ready for online store.`,
    ].join(" ");
  }

  // SOCIAL (social_image): full model, publication-type specific framing
  if (assetType === "social_image") {
    const pubTypePrompts: Record<SocialPublicationType, string> = {
      feed: [
        `Social media feed photo of ${garmentStr} worn by ${modelDesc}, full body shot.`,
        `Balanced square or portrait composition, vibrant colors, polished post-processing.`,
        `Model posing naturally for Instagram feed, confident engaging look.`,
      ].join(" "),
      reel: [
        `Social media reel thumbnail photo of ${garmentStr} worn by ${modelDesc}, dynamic full body.`,
        `Vertical 9:16 composition optimized for Reels and TikTok, energetic pose suggesting movement.`,
        `Model mid-motion, hair and clothing with slight motion blur, cinematic feel.`,
      ].join(" "),
      story: [
        `Instagram Story photo of ${garmentStr} worn by ${modelDesc}, full body or close-up.`,
        `Vertical 9:16 composition with negative space at top and bottom for text overlay.`,
        `Model gazing directly at camera, minimal background distractions.`,
      ].join(" "),
    };
    const pubStr = pubTypePrompts[socialPublicationType] ?? pubTypePrompts.feed;
    return [
      pubStr,
      `${lightingStr}. ${bgStr}.`,
      `Hyper-realistic, commercial fashion quality, ${aspectRatio} format.`,
      `Brand aesthetic: ${brandLine === "luxury" ? "aspirational luxury Latin fashion" : "accessible urban Latin streetwear"}.`,
    ].join(" ");
  }

  // SHORT VIDEO (social_video): motion, vertical, natural movement descriptor
  if (assetType === "social_video") {
    return [
      `Short fashion video clip (8 seconds) featuring ${garmentStr} worn by ${modelDesc}.`,
      `Vertical 9:16 format, optimized for TikTok and Instagram Reels.`,
      `Model walking naturally, adjusting garment, light spin to show full silhouette.`,
      `${lightingStr}. ${bgStr}.`,
      `Smooth slow-motion segments, upbeat pacing, commercial fashion video quality.`,
      `Brand aesthetic: ${brandLine === "luxury" ? "aspirational luxury Latin fashion" : "authentic urban Latin streetwear"}.`,
    ].join(" ");
  }

  // CUSTOM TEMPLATE (product_photo): reference style analysis
  if (assetType === "product_photo") {
    const refNote = opts.referenceImageUrl
      ? "Match the visual composition, color palette and layout style of the provided reference image exactly."
      : "Create a lookbook-style brand composition with brand-consistent color palette.";
    return [
      `Custom brand template photo featuring ${garmentStr} worn by ${modelDesc}.`,
      refNote,
      `${lightingStr}. ${bgStr}.`,
      `${aspectRatio} format. Hyper-realistic commercial fashion photography.`,
      `Brand aesthetic: ${brandLine === "luxury" ? "premium aspirational Latin fashion" : "modern accessible urban fashion"}.`,
    ].join(" ");
  }

  // Fallback
  return [
    `Commercial fashion photo of ${garmentStr} worn by ${modelDesc}.`,
    `${lightingStr}. ${bgStr}.`,
    `${aspectRatio} format. Hyper-realistic, high resolution.`,
  ].join(" ");
}
