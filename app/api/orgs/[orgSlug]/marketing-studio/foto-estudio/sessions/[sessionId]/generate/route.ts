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
    const assetSpecs: Array<{
      assetType:         string;
      prompt:            string;
      negativePrompt:    string;
      replicateModelId:  string;
      sourceImageUrl:    string;
    }> = [];

    for (const output of selectedOutputs) {
      const assetTypes = mapOutputToAssetTypes(output);
      for (const assetType of assetTypes) {
        // back_clean uses backImageUrl; everything else uses frontImageUrl
        const sourceUrl = (assetType === "back_clean" && backImageUrl) ? backImageUrl : (frontImageUrl || backImageUrl);
        if (!sourceUrl) continue; // skip if source missing (guard)
        const { prompt, negativePrompt, replicateModelId } = buildPrompt({
          assetType, visualStyle, background, aspectRatio,
          garmentType, brandLine, socialPublicationType, referenceImageUrl,
        });
        for (let i = 0; i < quantity; i++) {
          assetSpecs.push({ assetType, prompt, negativePrompt, replicateModelId, sourceImageUrl: sourceUrl });
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
        assetId:          a.id,
        assetType:        a.assetType as OutputAssetType,
        prompt:           assetSpecs[idx]?.prompt            ?? "",
        negativePrompt:   assetSpecs[idx]?.negativePrompt    ?? "",
        replicateModelId: assetSpecs[idx]?.replicateModelId  ?? "",
        sourceImageUrl:   assetSpecs[idx]?.sourceImageUrl,
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

// ── Prompt builder — commercial fashion model, Do Jeans spec ─────────────────
//
// Model recommendation for n8n:
//   Primary:   black-forest-labs/flux-kontext-pro  (garment-preserving img2img)
//   Fallback:  black-forest-labs/flux-1.1-pro-ultra (higher realism if kontext unavailable)
//   Virtual try-on alternative: cuuupid/idm-vton   (best garment fidelity, separate person
//              image required — wire separately in n8n if available)
//
// Prompting rules for flux-kontext-pro garment→model generation:
//   1. Lead with the PERSON, not the product. The model must understand the subject is human.
//   2. Explicitly forbid mannequin/isolated product IN the positive prompt (flux ignores neg prompts).
//   3. "Keep the exact garment from the reference image" triggers kontext preservation.
//   4. Describe background with physical precision — "light gray seamless paper" not "gray bg".
//   5. Use negativePrompt field for APIs that accept it (Stable Diffusion / SDXL paths in n8n).
// ─────────────────────────────────────────────────────────────────────────────

interface PromptResult {
  prompt:           string;
  negativePrompt:   string;
  replicateModelId: string;
}

function buildPrompt(opts: {
  assetType:             string;
  visualStyle:           string;
  background:            string;
  aspectRatio:           string;
  garmentType:           GarmentType;
  brandLine:             BrandLine;
  socialPublicationType: SocialPublicationType;
  referenceImageUrl?:    string;
}): PromptResult {
  const { assetType, visualStyle, background, aspectRatio, garmentType, brandLine, socialPublicationType } = opts;

  // ── Garment vocabulary ───────────────────────────────────────────────────

  const garmentLabel: Record<GarmentType, string> = {
    jean:     "denim jeans",
    short:    "denim shorts",
    falda:    "denim skirt",
    body:     "form-fitting bodysuit",
    top:      "top",
    chaqueta: "denim jacket",
    vestido:  "dress",
    otro:     "clothing",
  };
  const garmentStr = garmentLabel[garmentType] ?? "clothing";

  // ── Model descriptor ─────────────────────────────────────────────────────

  const modelLuxury =
    "a real Latina woman fashion model with a curvy voluptuous figure, " +
    "accentuated hips and buttocks, natural feminine silhouette, " +
    "confident elegant pose that highlights the fit of the garment";

  const modelCasual =
    "a real young Latina woman fashion model with a slim athletic build, " +
    "natural relaxed posture, approachable urban look";

  const modelDesc = brandLine === "luxury" ? modelLuxury : modelCasual;

  // ── Background — physical precision ─────────────────────────────────────

  const bgMap: Record<string, string> = {
    white:         "pure white seamless paper backdrop, evenly lit, no shadows on background",
    light_gray:    "light neutral gray seamless paper backdrop, evenly lit studio, no shadows on background",
    black:         "deep matte black seamless backdrop, dramatic split lighting",
    gradient:      "soft light-to-mid gray gradient seamless backdrop",
    outdoor_scene: "outdoor urban street setting, natural overcast daylight",
    indoor_scene:  "modern indoor lifestyle space, warm window light",
    transparent:   "transparent background (alpha channel PNG cutout)",
  };
  const bgStr = bgMap[background] ?? "neutral studio backdrop";

  // ── Lighting ─────────────────────────────────────────────────────────────

  const lightingMap: Record<string, string> = {
    clean_studio: "professional studio lighting, large soft boxes, even exposure, no harsh shadows",
    editorial:    "editorial high-contrast lighting, strong key light, dramatic shadows",
    urban:        "natural outdoor light, overcast sky, soft diffuse illumination",
    lifestyle:    "warm natural window light, soft fill, lifestyle mood",
    luxury:       "premium studio lighting, rim light separation, subtle bokeh, polished finish",
    minimal:      "clean flat even lighting, minimal shadows, clinical white-light setup",
  };
  const lightingStr = lightingMap[visualStyle] ?? "professional studio lighting";

  // ── Shared negative prompt ───────────────────────────────────────────────

  const sharedNegative = [
    "mannequin", "ghost mannequin", "headless mannequin", "plastic mannequin",
    "dummy", "doll", "fake legs", "mannequin legs", "isolated product",
    "floating garment", "product cutout", "flat lay", "no model", "empty clothes",
    "disembodied clothing", "invisible body", "CGI product", "3D render",
    "deformed body", "extra limbs", "bad anatomy", "blurry", "low quality",
    "watermark", "logo overlay", "text on image", "wrong color garment",
    "different garment", "pattern change", "fabric change",
  ].join(", ");

  // ── Recommended model ────────────────────────────────────────────────────

  // flux-kontext-pro: img2img with context preservation — best for garment fidelity
  const defaultModel = "black-forest-labs/flux-kontext-pro";

  // ── Per asset-type construction ──────────────────────────────────────────

  // CATALOG FRONT (front_clean)
  if (assetType === "front_clean") {
    const prompt = [
      // 1. Lead with person — critical for flux-kontext-pro
      `${modelDesc} wearing the exact ${garmentStr} shown in the reference image.`,
      // 2. Garment preservation instruction (kontext trigger)
      `Keep the garment's exact color, stitching, wash, pocket placement, waistband, and silhouette unchanged from the reference.`,
      // 3. Shot framing
      `American shot framing (waist to mid-thigh), model facing camera, straight-on front view, garment fully visible and centered.`,
      // 4. Environment
      `${bgStr}. ${lightingStr}.`,
      // 5. Quality and commercial use
      `Sharp garment texture, high-resolution skin detail, commercial e-commerce fashion photography quality, ${aspectRatio} ratio.`,
      // 6. Explicit exclusions IN the positive prompt (flux-kontext-pro ignores negatives)
      `Not a mannequin. Not an isolated product. Real living person. No fake legs. No floating garment.`,
    ].join(" ");

    return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
  }

  // CATALOG BACK (back_clean)
  if (assetType === "back_clean") {
    const booty = brandLine === "luxury"
      ? "showing the natural lifting effect of the garment on the buttocks and hips, silhouette highlighted"
      : "relaxed natural rear pose";

    const prompt = [
      `${modelDesc} wearing the exact ${garmentStr} shown in the reference image, photographed from behind.`,
      `Keep the garment's exact color, stitching, back pockets, rear waistband, and silhouette unchanged from the reference.`,
      `American shot framing (waist to mid-thigh), rear view, ${booty}.`,
      `${bgStr}. ${lightingStr}.`,
      `Sharp garment texture, commercial e-commerce fashion photography quality, ${aspectRatio} ratio.`,
      `Not a mannequin. Not an isolated product. Real living person. No fake legs. No floating garment.`,
    ].join(" ");

    return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
  }

  // SOCIAL FEED / REEL / STORY (social_image)
  if (assetType === "social_image") {
    const pubFraming: Record<SocialPublicationType, string> = {
      feed: [
        `Full body shot, model centered, ${aspectRatio} portrait composition optimized for Instagram feed.`,
        `Vibrant polished look, confident engaging pose toward camera.`,
      ].join(" "),
      reel: [
        `Full body vertical 9:16 composition optimized for Instagram Reels and TikTok.`,
        `Dynamic energetic pose suggesting movement, slight motion energy in hair and garment.`,
      ].join(" "),
      story: [
        `Full body vertical 9:16 composition with clear negative space at top and bottom for text overlay.`,
        `Model looking directly at camera, minimal background distractions.`,
      ].join(" "),
    };
    const framingStr = pubFraming[socialPublicationType] ?? pubFraming.feed;

    const brandStr = brandLine === "luxury"
      ? "aspirational premium Latin fashion aesthetic, sophisticated and desirable"
      : "accessible authentic urban Latin streetwear aesthetic";

    const prompt = [
      `${modelDesc} wearing the exact ${garmentStr} shown in the reference image.`,
      `Keep the garment's exact color, design, and details unchanged from the reference.`,
      framingStr,
      `${bgStr}. ${lightingStr}.`,
      `${brandStr}. Hyper-realistic commercial fashion photography, ${aspectRatio} ratio.`,
      `Not a mannequin. Not an isolated product. Real living person.`,
    ].join(" ");

    return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
  }

  // SHORT VIDEO (social_video)
  if (assetType === "social_video") {
    const prompt = [
      `${modelDesc} wearing the exact ${garmentStr} shown in the reference image, filmed as a short fashion video clip.`,
      `Keep the garment's exact color, design, and details unchanged from the reference.`,
      `Vertical 9:16 video frame, 8-second clip. Model walks naturally, does a slow confident turn to show front and back silhouette.`,
      `${bgStr}. ${lightingStr}.`,
      `Cinematic 24fps feel, smooth movement, commercial fashion video quality.`,
      `Not a mannequin. Real human model in motion.`,
    ].join(" ");

    return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
  }

  // CUSTOM TEMPLATE / PLANTILLA (product_photo)
  if (assetType === "product_photo") {
    const refNote = opts.referenceImageUrl
      ? "Match the visual composition, color palette, and layout style of the reference template image exactly. Place the garment and model within that layout."
      : "Lookbook-style brand editorial composition, brand-consistent color palette and layout.";

    const prompt = [
      `${modelDesc} wearing the exact ${garmentStr} shown in the reference image.`,
      `Keep the garment's exact color, design, and details unchanged from the reference.`,
      refNote,
      `${bgStr}. ${lightingStr}.`,
      `${aspectRatio} ratio. Hyper-realistic commercial fashion photography.`,
      `Not a mannequin. Real living person.`,
    ].join(" ");

    return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
  }

  // Fallback
  const prompt = [
    `${modelDesc} wearing the exact ${garmentStr} shown in the reference image.`,
    `Keep the garment's exact color, design, and details unchanged from the reference.`,
    `${bgStr}. ${lightingStr}. ${aspectRatio} ratio.`,
    `Commercial fashion photography, hyper-realistic. Real human model, not a mannequin.`,
  ].join(" ");

  return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
}
