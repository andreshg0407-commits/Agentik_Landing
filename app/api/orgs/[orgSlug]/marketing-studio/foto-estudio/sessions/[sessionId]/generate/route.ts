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
import { getOrgPromptEngine }                    from "@/lib/marketing-studio/tenant-config";
import type {
  FotoEstudioSettings,
  FotoOutputType,
  GarmentType,
  BrandLine,
  SocialPublicationType,
  ModelType,
  BodyType,
  VisualQuality,
  FramingType,
  KidsModelType,
  KidsAgeRange,
  KidsVisualTrait,
  KidsVisualStyle,
  KidsExpression,
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
    const modelReferenceUrl      = settings.modelReferenceUrl;
    const selectedOutputs        = settings.selectedOutputs        ?? ["catalog_photo"] as FotoOutputType[];
    const visualStyle            = settings.visualStyle            ?? "clean_studio";
    const background             = settings.background             ?? "white";
    const aspectRatio            = settings.aspectRatio            ?? "1:1";
    const quantity               = Math.min(Math.max(settings.quantity ?? 1, 1), 4);
    const garmentType            = settings.garmentType            ?? "jean";
    const brandLine              = settings.brandLine              ?? "casual";
    const socialPublicationType  = settings.socialPublicationType  ?? "feed";
    const modelType              = settings.modelType              ?? "latina_rubia";
    const bodyType               = settings.bodyType               ?? "curvy";
    const visualQuality          = settings.visualQuality          ?? "full_hd";
    const framingType            = settings.framingType            ?? "frontal_catalogo";
    // Kids visual profile (Castillitos only)
    const kidsModelType   = (settings.kidsModelType   ?? "sin_modelo") as KidsModelType;
    const kidsAgeRange    = (settings.kidsAgeRange    ?? "4_6")        as KidsAgeRange;
    const kidsVisualTrait = (settings.kidsVisualTrait ?? "latino")     as KidsVisualTrait;
    const kidsVisualStyle = (settings.kidsVisualStyle ?? "catalogo_comercial") as KidsVisualStyle;
    const kidsExpression  = (settings.kidsExpression  ?? "sonriente")  as KidsExpression;

    if (!frontImageUrl && !backImageUrl) {
      return NextResponse.json({ error: "Se requiere al menos una imagen (frontal o trasera)" }, { status: 422 });
    }

    // ── Resolve prompt engine (DB-first, code fallback) ───────────────────────
    const promptEngine = await getOrgPromptEngine(organization.id, orgSlug);

    // ── Build asset list ──────────────────────────────────────────────────────
    // Catalog asset types require strict garment fidelity; social types allow more freedom
    const CATALOG_ASSET_TYPES = new Set(["front_clean", "back_clean", "product_photo"]);

    // Multi-reference image pool for strict catalog mode.
    // flux-kontext-apps/multi-image-list uses all 4 angles simultaneously for
    // maximum forensic garment fidelity (wash, buttons, pockets, stitching, waistband).
    const MULTI_REF_MODEL = "flux-kontext-apps/multi-image-list";
    const multiRefImages = [frontImageUrl, backImageUrl, detail1Url ?? "", detail2Url ?? ""].filter(Boolean) as string[];

    const assetSpecs: Array<{
      assetType:         string;
      prompt:            string;
      negativePrompt:    string;
      replicateModelId:  string;
      sourceImageUrl:    string;
      sourceImages?:     string[];
      fidelityMode:      "strict" | "standard";
      angle:             "front" | "back" | undefined;
    }> = [];

    for (const output of selectedOutputs) {
      const assetTypes = mapOutputToAssetTypes(output);
      for (const assetType of assetTypes) {
        const isCatalog = CATALOG_ASSET_TYPES.has(assetType);
        // back_clean uses backImageUrl; everything else uses frontImageUrl
        const sourceUrl = (assetType === "back_clean" && backImageUrl) ? backImageUrl : (frontImageUrl || backImageUrl);
        if (!sourceUrl) continue; // skip if source missing (guard)
        const { prompt, negativePrompt, replicateModelId: baseModelId } = buildPrompt({
          assetType, visualStyle, background, aspectRatio,
          garmentType, brandLine, socialPublicationType, referenceImageUrl,
          modelType, bodyType, visualQuality, framingType,
          kidsModelType, kidsAgeRange, kidsVisualTrait, kidsVisualStyle, kidsExpression,
          tenantId: session.tenantId,
          promptEngine,
        });
        const fidelityMode = isCatalog ? "strict" : "standard";
        const angle: "front" | "back" | undefined = assetType === "back_clean" ? "back" : assetType === "front_clean" ? "front" : undefined;

        // Strict catalog: use multi-reference model with all available angles.
        // Standard/social: keep single-image flux-kontext-pro.
        const replicateModelId = isCatalog && multiRefImages.length >= 2 ? MULTI_REF_MODEL : baseModelId;
        const sourceImages     = isCatalog && multiRefImages.length >= 2 ? multiRefImages : undefined;

        for (let i = 0; i < quantity; i++) {
          assetSpecs.push({ assetType, prompt, negativePrompt, replicateModelId, sourceImageUrl: sourceUrl, sourceImages, fidelityMode, angle });
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
      modelReferenceUrl,
      selectedOutputs,
      visualStyle,
      background,
      aspectRatio,
      quantity,
      garmentType,
      brandLine,
      socialPublicationType,
      modelType,
      bodyType,
      visualQuality,
      framingType,
      // Session-level fidelityMode: "strict" if any catalog asset is present
      fidelityMode:    assetSpecs.some(s => s.fidelityMode === "strict") ? "strict" : "standard",
      draftShopify:    false,
      assets: dbAssets.map((a, idx) => ({
        assetId:          a.id,
        assetType:        a.assetType as OutputAssetType,
        prompt:           assetSpecs[idx]?.prompt            ?? "",
        negativePrompt:   assetSpecs[idx]?.negativePrompt    ?? "",
        replicateModelId: assetSpecs[idx]?.replicateModelId  ?? "",
        sourceImageUrl:   assetSpecs[idx]?.sourceImageUrl,
        sourceImages:     assetSpecs[idx]?.sourceImages,
        fidelityMode:     assetSpecs[idx]?.fidelityMode      ?? "standard",
        angle:            assetSpecs[idx]?.angle,
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

// ── Prompt builder — routes to tenant-specific engine ────────────────────────
//
//   castillitos → buildCastillitosProductPrompt()  (product-only / flat lay)
//   do-jeans    → buildDoJeansFashionPrompt()       (adult fashion model)
//   default     → buildDoJeansFashionPrompt()       (generic fashion fallback)
//
// Model: black-forest-labs/flux-kontext-pro (garment-preserving img2img)
// ─────────────────────────────────────────────────────────────────────────────

interface PromptResult {
  prompt:           string;
  negativePrompt:   string;
  replicateModelId: string;
}

interface BuildPromptOpts {
  assetType:             string;
  visualStyle:           string;
  background:            string;
  aspectRatio:           string;
  garmentType:           GarmentType;
  brandLine:             BrandLine;
  socialPublicationType: SocialPublicationType;
  modelType:             ModelType;
  bodyType:              BodyType;
  visualQuality:         VisualQuality;
  framingType:           FramingType;
  referenceImageUrl?:    string;
  tenantId?:             string;   // kept for payload; use promptEngine for dispatch
  promptEngine?:         string;   // "kids_product" | "fashion_adult" | "generic"
  // Kids visual profile (Castillitos)
  kidsModelType?:        KidsModelType;
  kidsAgeRange?:         KidsAgeRange;
  kidsVisualTrait?:      KidsVisualTrait;
  kidsVisualStyle?:      KidsVisualStyle;
  kidsExpression?:       KidsExpression;
}

function buildPrompt(opts: BuildPromptOpts): PromptResult {
  if (opts.promptEngine === "kids_product") {
    return buildCastillitosProductPrompt(opts);
  }
  return buildDoJeansFashionPrompt(opts);
}

// ── Castillitos: children retail product-only engine ─────────────────────────
//
// RULE: never put an adult model wearing a children's garment.
// Mode: product-only catalog / flat lay / kids product environment.
// ─────────────────────────────────────────────────────────────────────────────

/** Kids clothing garment types — require children-safe product presentation. */
const KIDS_CLOTHING_TYPES = new Set<GarmentType>([
  "ropa_nino", "ropa_nina", "bebe", "conjunto", "pijama",
  "uniforme", "kids_clothing", "calzado_nino", "accesorio_nino",
]);

/** Toy / game types — require playful product environment. */
const KIDS_TOY_TYPES = new Set<GarmentType>([
  "juguete", "juego_mesa",
]);

function buildCastillitosProductPrompt(opts: BuildPromptOpts): PromptResult {
  const {
    assetType, background, aspectRatio, garmentType, brandLine, visualQuality,
    kidsModelType   = "sin_modelo",
    kidsAgeRange    = "4_6",
    kidsVisualTrait = "latino",
    kidsVisualStyle = "catalogo_comercial",
    kidsExpression  = "sonriente",
  } = opts;

  const defaultModel = "black-forest-labs/flux-kontext-pro";

  // ── Negative prompt — hardened against adult model contamination ────────
  const castillitosNegative = [
    // Adult model — explicit exclusion
    "adult woman", "adult female model", "adult man", "adult male model",
    "teenager", "adult body", "fashion model wearing", "adult fashion",
    "sexy pose", "curvy model", "voluptuous model", "luxury denim model",
    "bodysuit", "crop top", "mature body", "adult catalog",
    "levanta cola", "editorial fashion", "fashion editorial", "runway",
    // Adult garment contamination
    "jeans", "denim pants", "adult jeans", "adult clothing on child",
    "adult top", "adult shirt",
    // Generic quality negatives
    "mannequin", "ghost mannequin", "headless mannequin",
    "deformed", "blurry", "low quality", "watermark", "text overlay",
    "bad anatomy", "extra limbs", "CGI render", "3D render",
  ].join(", ");

  // ── Background ──────────────────────────────────────────────────────────
  const bgMap: Record<string, string> = {
    white:         "pure white seamless paper backdrop, evenly lit, no shadows",
    light_gray:    "light neutral gray seamless paper backdrop, evenly lit, no shadows",
    black:         "deep matte black seamless backdrop",
    gradient:      "soft light-to-mid gray gradient seamless backdrop",
    outdoor_scene: "outdoor park or playground setting, natural soft daylight",
    indoor_scene:  "bright cheerful kids room or store shelf environment",
    transparent:   "transparent background (alpha channel PNG cutout)",
  };
  const bgStr = bgMap[background] ?? "white seamless studio backdrop";

  // ── Quality ─────────────────────────────────────────────────────────────
  const qualityDesc: Record<VisualQuality, string> = {
    standard_hd:    "HD quality, sharp commercial photography",
    full_hd:        "full HD 1080p, crisp commercial photography",
    "2k_editorial": "2K ultra-sharp, magazine quality",
    "4k_premium":   "4K ultra-high definition, premium campaign quality",
  };
  const qualityStr = qualityDesc[visualQuality] ?? qualityDesc.full_hd;

  // ── Brand line context ──────────────────────────────────────────────────
  //
  // "otros" = FISCAL/CONTABLE line (bolsas de empaque). Never a hero campaign.
  // Force product-only neutral catalog regardless of other settings.
  const isFiscalLine = brandLine === "otros";

  const brandContext: Partial<Record<BrandLine, string>> = {
    kids_fun:    "Castillitos Kids — colorful playful children's retail aesthetic",
    latin_kids:  "Latin Kids brand — vibrant children's fashion aesthetic",
    importacion: "imported product — clean commercial catalog presentation",
    otros:       "packaging accessory — neutral simple catalog image, no branding, no campaign aesthetics",
  };
  const brandStr = brandContext[brandLine] ?? "children's retail catalog";

  // ── Product descriptor ──────────────────────────────────────────────────
  const garmentDesc: Record<GarmentType, string> = {
    ropa_nino:      "children's clothing item for boys",
    ropa_nina:      "children's clothing item for girls",
    bebe:           "baby clothing or accessory",
    conjunto:       "children's outfit set",
    pijama:         "children's pajamas",
    uniforme:       "school uniform",
    juguete:        "children's toy",
    juego_mesa:     "board game or educational game",
    utiles:         "school supplies",
    mochila:        "children's school backpack",
    calzado_nino:   "children's footwear",
    accesorio_nino: "children's accessory",
    kids_clothing:  "children's clothing",
    // legacy (should not appear for castillitos but kept for safety)
    jean:     "product",
    short:    "product",
    falda:    "product",
    body:     "product",
    top:      "product",
    chaqueta: "product",
    vestido:  "product",
    otro:     "product",
  };
  const productStr = garmentDesc[garmentType] ?? "product";

  // ── Kids model context ──────────────────────────────────────────────────

  const isProductOnly = ["sin_modelo", "flat_lay", "maniqui", "producto_ambientado"].includes(kidsModelType);
  const isToy = KIDS_TOY_TYPES.has(garmentType);

  // Model descriptor built from kids profile fields
  const kidsModelDesc = (() => {
    if (kidsModelType === "flat_lay")           return "product flat-lay on clean surface, no model";
    if (kidsModelType === "maniqui")            return "children's mannequin display, not a human";
    if (kidsModelType === "producto_ambientado") return "product styled in a kids-friendly environment, no human model";
    if (kidsModelType === "sin_modelo")         return "product-only, no model";

    const genderMap: Record<string, string> = {
      nino:           "young boy",
      nina:           "young girl",
      bebe_nino:      "baby boy",
      bebe_nina:      "baby girl",
      unisex_infantil: "child",
    };
    const ageMap: Record<string, string> = {
      "0_12m": "0-12 months old",
      "1_3":   "1-3 years old",
      "4_6":   "4-6 years old",
      "7_9":   "7-9 years old",
      "10_12": "10-12 years old",
      teen:    "young teen",
    };
    const traitMap: Record<string, string> = {
      latino:               "Latino",
      afro:                 "Afro-Colombian",
      rubio:                "fair-haired",
      moreno:               "dark-featured",
      mixto_internacional:  "mixed international",
      personalizado:        "",
    };
    const expressionMap: Record<string, string> = {
      sonriente:      "smiling happily",
      natural:        "natural relaxed expression",
      activo:         "active energetic expression",
      formal_escolar: "neat formal school expression",
      neutro_catalogo: "neutral catalog expression",
    };

    const gender    = genderMap[kidsModelType] ?? "child";
    const age       = ageMap[kidsAgeRange]     ?? "";
    const trait     = traitMap[kidsVisualTrait] ?? "";
    const expr      = expressionMap[kidsExpression] ?? "";

    return [trait, gender, age ? `(${age})` : "", expr ? `— ${expr}` : ""]
      .filter(Boolean).join(" ");
  })();

  // Visual style context
  const styleContextMap: Record<string, string> = {
    catalogo_comercial: "clean commercial catalog setting, professional product photography",
    lifestyle_infantil: "warm lifestyle environment, kids playing or exploring naturally",
    escolar:            "school or classroom setting, educational context",
    jugueton:           "playful colorful environment, fun and joyful energy",
    premium_retail:     "premium retail product photography, polished and aspirational",
    marketplace:        "clean marketplace listing style, product clearly centered",
  };
  const styleCtx = styleContextMap[kidsVisualStyle] ?? "clean commercial catalog setting";

  const KIDS_PRODUCT_PREFIX =
    "CHILDREN RETAIL PRODUCT MODE. " +
    "Do not use adult model. Do not use adult body. " +
    "Preserve the children's product design, print, colors and proportions exactly.";

  // ── Fiscal line: "otros" — bolsas de empaque ──────────────────────────────
  // No campaigns, no hero content, no branding aesthetics.
  // Forced product-only neutral catalog regardless of other settings.
  if (isFiscalLine) {
    const fiscalNegative = [
      castillitosNegative,
      "campaign aesthetic", "hero image", "branding", "colorful background",
      "lifestyle", "editorial",
      "human model", "person wearing product", "child model", "lifestyle scene",
    ].join(", ");

    const fiscalPrompt = [
      "NEUTRAL CATALOG MODE — fiscal/accounting support image.",
      `Plain product shot of the ${productStr}.`,
      "Pure white seamless backdrop, even flat lighting, no shadows.",
      "Product centered and fully in frame. No model. No branding. No lifestyle context.",
      "Simple clean e-commerce style. Product only.",
      `${qualityStr}.`,
    ].join(" ");

    return { prompt: fiscalPrompt, negativePrompt: fiscalNegative, replicateModelId: defaultModel };
  }

  // ── Catalog prompt ───────────────────────────────────────────────────────
  if (assetType === "front_clean" || assetType === "back_clean" || assetType === "product_photo") {
    const displayMode = isProductOnly
      ? `The exact ${productStr} from the reference image displayed as ${kidsModelDesc}. Product fully visible, design and colors preserved exactly.`
      : isToy
      ? `The ${productStr} displayed prominently for ${kidsModelDesc} in a cheerful kids-friendly setting.`
      : `The exact ${productStr} from the reference image worn by a ${kidsModelDesc}. Garment design, print and colors preserved exactly.`;

    const catalogNegative = [
      castillitosNegative,
      "flat dark background", "cropped product", "partial view",
    ].join(", ");

    const prompt = [
      KIDS_PRODUCT_PREFIX,
      displayMode,
      `${styleCtx}. ${brandStr}.`,
      `${bgStr}.`,
      "Professional even studio lighting, soft boxes, no harsh shadows.",
      `${qualityStr}.`,
      "Product fully in frame, centered, no cropping.",
    ].join(" ");

    return { prompt, negativePrompt: catalogNegative, replicateModelId: defaultModel };
  }

  // ── Social image prompt ──────────────────────────────────────────────────
  if (assetType === "social_image") {
    const socialBg = background === "outdoor_scene"
      ? "colorful outdoor park or playground environment, natural light"
      : bgStr;

    const subjectDesc = isProductOnly
      ? `The ${productStr} in a bright playful presentation`
      : `${kidsModelDesc} with the ${productStr}`;

    const prompt = [
      KIDS_PRODUCT_PREFIX,
      `${subjectDesc}. ${brandStr}.`,
      `${styleCtx}. Cheerful kids-retail aesthetic, vibrant colors, engaging composition for ${aspectRatio}.`,
      `${socialBg}.`,
      "Warm natural light, inviting fun mood.",
      `${qualityStr}.`,
    ].join(" ");

    return { prompt, negativePrompt: castillitosNegative, replicateModelId: defaultModel };
  }

  // ── Video prompt ─────────────────────────────────────────────────────────
  if (assetType === "social_video") {
    const subjectDesc = isProductOnly
      ? `the ${productStr}`
      : `${kidsModelDesc} showcasing the ${productStr}`;

    const prompt = [
      KIDS_PRODUCT_PREFIX,
      `Short 8-second vertical 9:16 video featuring ${subjectDesc}.`,
      `${brandStr}. ${styleCtx}.`,
      `Product design and colors preserved. ${bgStr}.`,
      "Smooth camera motion, warm inviting light.",
    ].join(" ");

    return { prompt, negativePrompt: castillitosNegative, replicateModelId: defaultModel };
  }

  // Fallback
  const prompt = [
    KIDS_PRODUCT_PREFIX,
    `The ${productStr} displayed cleanly. ${brandStr}. ${styleCtx}. ${bgStr}. ${qualityStr}.`,
  ].join(" ");
  return { prompt, negativePrompt: castillitosNegative, replicateModelId: defaultModel };
}

// ── Do Jeans / default: adult fashion model engine ───────────────────────────
//
// Model: black-forest-labs/flux-kontext-pro (garment-preserving img2img)
// Rules: lead with person → kontext trigger → framing → bg/light → quality → anti-mannequin
// bodyType guard: explicitly exclude plus_size/overweight when not selected.
// ─────────────────────────────────────────────────────────────────────────────

function buildDoJeansFashionPrompt(opts: BuildPromptOpts): PromptResult {
  const {
    assetType, visualStyle, background, aspectRatio,
    garmentType, brandLine, socialPublicationType,
    modelType, bodyType, visualQuality, framingType,
  } = opts;

  // ── Garment ──────────────────────────────────────────────────────────────

  const garmentLabel: Record<GarmentType, string> = {
    // Fashion (legacy)
    jean:     "denim jeans",
    short:    "denim shorts",
    falda:    "denim skirt",
    body:     "form-fitting bodysuit",
    top:      "top",
    chaqueta: "denim jacket",
    vestido:  "dress",
    // Kids retail (Castillitos M1)
    ropa_nino:      "kids clothing for boys",
    ropa_nina:      "kids clothing for girls",
    conjunto:       "kids outfit set",
    pijama:         "children's pajamas",
    uniforme:       "school uniform",
    juguete:        "children's toy",
    juego_mesa:     "board game",
    utiles:         "school supplies",
    mochila:        "school backpack",
    calzado_nino:   "children's footwear",
    accesorio_nino: "children's accessory",
    bebe:           "baby clothing or accessory",
    kids_clothing:  "children's clothing",
    otro:           "product",
  };
  const garmentStr = garmentLabel[garmentType] ?? "garment";

  // ── Model type descriptor ────────────────────────────────────────────────

  const modelTypeDesc: Record<ModelType, string> = {
    latina_rubia:     "blonde Latina woman model, warm fair complexion, straight or wavy blonde hair, Latin features",
    latina_morena:    "brunette Latina woman model, medium-tan complexion, dark brown hair, expressive Latin features",
    europea_rubia:    "blonde European woman model, fair porcelain skin, light blue or green eyes, straight blonde hair",
    morena_editorial: "dark-haired editorial model, high cheekbones, dramatic striking features, dark brunette hair",
    luxury_curvy:     "luxury curvy woman model, voluptuous hourglass figure, accentuated hips and bust, glamorous sophisticated look",
    casual_urbana:    "casual urban Latina model, natural relaxed look, everyday contemporary style, approachable",
    fitness:          "athletic fitness model, visibly toned and muscular figure, healthy radiant glow, sporty energy",
    premium_catalogo: "premium professional catalog model, classic elegant look, versatile commercial appeal",
    personalizada:    "professional high-end fashion model",
  };
  const modelTypeStr = modelTypeDesc[modelType] ?? "professional fashion model";

  // ── Body type descriptor + exclusion guard ───────────────────────────────

  const bodyTypeDesc: Record<BodyType, string> = {
    slim:          "slim slender figure, narrow waist, lean elegant body proportions",
    curvy:         "hourglass figure, defined narrow waist, natural feminine curves",
    voluptuosa:    "voluptuous full-figured body, accentuated curves, generous hips and bust",
    atletica:      "athletic toned body, visible muscle definition, lean and powerful",
    plus_size:     "plus-size model, full-figured, body-positive representation, confident curves",
    petite:        "petite small-framed model, compact proportions, delicate features",
    personalizada: "",
  };
  const bodyTypeStr = bodyTypeDesc[bodyType] ?? "";

  // Critical: if NOT plus_size, explicitly exclude it
  const bodyExclusion = bodyType !== "plus_size" && bodyType !== "voluptuosa"
    ? "NOT plus-size, NOT overweight, NOT obese,"
    : bodyType === "voluptuosa"
    ? "NOT obese, NOT morbidly overweight,"
    : "";

  const modelDesc = [
    modelTypeStr,
    bodyTypeStr ? `with ${bodyTypeStr}` : "",
  ].filter(Boolean).join(", ");

  // ── Background — physical precision ─────────────────────────────────────

  const bgMap: Record<string, string> = {
    white:         "pure white seamless paper backdrop, evenly lit, no shadows on background",
    light_gray:    "light neutral gray seamless paper backdrop (#D3D3D3), evenly lit studio, no shadows on background",
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

  // ── Framing / shot type ──────────────────────────────────────────────────

  const framingDesc: Record<FramingType, string> = {
    frontal_catalogo:     "straight-on front view, catalog framing, waist to knee, garment fully centered and visible",
    americano:            "American shot (waist to mid-thigh), three-quarter body visible, balanced composition",
    full_body_editorial:  "full body head-to-toe editorial shot, confident dramatic pose, entire silhouette visible",
    close_up_producto:    "close-up product detail shot (waist to thigh), emphasizing garment texture, fabric and fit details",
    back_view:            "rear view shot, waist to knee, back of garment fully visible, showing rear design and fit",
    side_view:            "side profile view at 90 degrees, showing full lateral silhouette",
    tres_cuartos:         "three-quarter angle pose at 45 degrees, dynamic asymmetric composition, depth and dimension",
    movimiento_lifestyle: "lifestyle movement shot, model in natural candid motion, energy and flow in the garment",
  };
  const framingStr = framingDesc[framingType] ?? framingDesc.frontal_catalogo;

  // ── Quality descriptor ───────────────────────────────────────────────────

  const qualityDesc: Record<VisualQuality, string> = {
    standard_hd:    "HD quality, sharp commercial photography",
    full_hd:        "full HD 1080p, crisp commercial photography, fine detail",
    "2k_editorial": "2K ultra-sharp resolution, magazine editorial quality, exceptional detail and texture rendering",
    "4k_premium":   "4K ultra-high definition, premium campaign photography, razor-sharp texture, professional retouching quality",
  };
  const qualityStr = qualityDesc[visualQuality] ?? qualityDesc.full_hd;

  // ── Luxury specifics ─────────────────────────────────────────────────────

  const luxuryBackNote = brandLine === "luxury"
    ? "emphasizing the natural lifting and shaping effect of the garment on the buttocks and hips, levanta-cola silhouette,"
    : "";

  // ── Shared negative prompt ───────────────────────────────────────────────

  const sharedNegative = [
    "mannequin", "ghost mannequin", "headless mannequin", "plastic mannequin",
    "dummy", "doll", "fake legs", "mannequin legs", "isolated product",
    "floating garment", "product cutout", "flat lay", "no model", "empty clothes",
    "disembodied clothing", "invisible body", "CGI product render", "3D render",
    "deformed body", "extra limbs", "bad anatomy", "blurry", "low quality",
    "watermark", "text overlay", "wrong garment color", "different garment design",
    bodyExclusion,
  ].filter(Boolean).join(", ");

  // ── Catalog negative — strict mode only ──────────────────────────────────
  // Extended negative for front_clean / back_clean / product_photo.
  // Explicitly blocks the failure modes observed in production:
  // garment redesign, framing crop, pose reinterpretation.

  const catalogNegative = [
    sharedNegative,
    // Framing failures
    "cropped feet", "cropped legs", "cut off feet", "cut off legs",
    "portrait crop", "beauty shot", "bust shot", "head shot", "close-up",
    "partial body", "waist up", "half body",
    // Garment redesign failures
    "jumpsuit", "denim jumpsuit", "denim bodysuit", "denim overalls",
    "denim romper", "one-piece denim outfit", "denim set",
    "corset", "denim corset", "denim crop top", "matching denim top",
    "denim bra top", "bandeau", "tube top", "strapless top",
    "altered waistband", "different waistband", "redesigned waistband",
    "different buttons", "missing buttons", "added buttons",
    "different pockets", "no pockets", "redesigned jeans",
    "different denim wash", "bleached differently",
    // Pose / composition failures
    "editorial pose", "fashion editorial", "dramatic pose",
    "action pose", "dynamic pose", "runway pose",
    "magazine cover", "beauty editorial", "lookbook editorial",
  ].join(", ");

  // ── Catalog framing lock ──────────────────────────────────────────────────
  // Hardcoded for catalog assets — overrides user-selected framingType.
  // "frontal_catalogo" currently says "waist to knee" which caused crops;
  // catalog must always be full body head-to-feet.

  const CATALOG_FRAMING =
    "full body shot from head to feet, entire figure fully visible, " +
    "feet and shoes fully in frame, legs fully in frame, " +
    "centered camera, straight-on view, " +
    "full length standing pose, " +
    "not portrait crop, not beauty shot, not close-up, not cropped";

  const CATALOG_GARMENT_LOCK =
    "Use the exact same jeans from the reference image. " +
    "The jeans must remain IDENTICAL to the reference — same wash, same buttons, same pockets, same stitching, same waistband, same proportions. " +
    "Do NOT redesign the waistband. " +
    "Do NOT change buttons, pockets, stitching, rise, leg cut or wash. " +
    "Do NOT generate a jumpsuit, denim bodysuit, corset, denim top, denim crop top, or any matching upper garment. " +
    "Place ONLY the exact same jeans on the model. Do not add any upper garment that was not in the reference.";

  const CATALOG_POSE_LOCK =
    "neutral symmetrical standing pose, " +
    "both arms relaxed naturally at the sides of the body, " +
    "no editorial pose, no action pose, no crossed arms, no hands on hips, no fashion pose, no dynamic lean";

  const defaultModel = "black-forest-labs/flux-kontext-pro";
  const antiMannequin = "Real living human person. NOT a mannequin. NOT an isolated product shot. NO fake legs. NO floating garment.";

  // ── Per asset-type construction ──────────────────────────────────────────

  if (assetType === "front_clean") {
    const prompt = [
      // kontext-pro: garment preservation instruction must lead
      "STRICT CATALOG MODE — forensic garment preservation required.",
      CATALOG_GARMENT_LOCK,
      `Place a ${modelDesc} wearing EXACTLY the ${garmentStr} from the reference image.`,
      "PRESERVE WITHOUT CHANGE: exact wash color, stitching pattern, pocket placement, waistband style, button style, leg cut, proportions, and overall silhouette.",
      CATALOG_FRAMING + ".",
      CATALOG_POSE_LOCK + ".",
      `${bgStr}.`,
      "Professional studio lighting, large soft boxes, even flat exposure, no harsh shadows, no dramatic lighting, no shadows on background.",
      `${qualityStr}.`,
      antiMannequin,
    ].join(" ");
    return { prompt, negativePrompt: catalogNegative, replicateModelId: defaultModel };
  }

  if (assetType === "back_clean") {
    const prompt = [
      "STRICT CATALOG MODE — forensic garment preservation required.",
      CATALOG_GARMENT_LOCK,
      `Place a ${modelDesc} wearing EXACTLY the ${garmentStr} from the reference image, photographed from the back.`,
      "PRESERVE WITHOUT CHANGE: exact wash color, back stitching, back pocket design, rear waistband style, rear button, leg cut, and silhouette. Show the complete back view.",
      "Full body rear view from head to feet, feet and legs fully in frame, centered camera, straight back view.",
      CATALOG_POSE_LOCK + ".",
      `${bgStr}.`,
      `Professional studio lighting, large soft boxes, even flat exposure, no harsh shadows.${luxuryBackNote ? " " + luxuryBackNote : ""}`,
      `${qualityStr}.`,
      antiMannequin,
    ].join(" ");
    return { prompt, negativePrompt: catalogNegative, replicateModelId: defaultModel };
  }

  if (assetType === "social_image") {
    const pubFraming: Record<SocialPublicationType, string> = {
      feed:  `Full body portrait composition optimized for Instagram feed (${aspectRatio}), vibrant polished look, confident engaging pose toward camera.`,
      reel:  `Full body vertical 9:16 composition for Instagram Reels and TikTok, dynamic energetic pose suggesting movement, slight motion energy in hair and garment.`,
      story: `Full body vertical 9:16 composition with clear negative space at top and bottom for text overlay, model looking directly at camera.`,
    };
    const pubStr = pubFraming[socialPublicationType] ?? pubFraming.feed;
    const brandStr = brandLine === "luxury"
      ? "aspirational premium Latin fashion aesthetic, sophisticated and desirable"
      : "accessible authentic urban Latin streetwear aesthetic";

    const prompt = [
      // Social: garment recognition required but creative freedom on pose/lighting/energy
      `SOCIAL MEDIA MODE — lifestyle energy and authenticity over strict catalog fidelity.`,
      `${modelDesc} wearing the ${garmentStr} from the reference image.`,
      `Match the garment's color and overall design; minor styling variations acceptable.`,
      pubStr,
      `${bgStr}. ${lightingStr}.`,
      `${brandStr}. ${qualityStr}.`,
      antiMannequin,
    ].join(" ");
    return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
  }

  if (assetType === "social_video") {
    const prompt = [
      `${modelDesc} wearing the exact ${garmentStr} shown in the reference image, filmed as a short fashion video clip.`,
      `Keep the garment's exact color, design, and details unchanged from the reference.`,
      `Vertical 9:16 video frame, 8-second clip, ${framingStr}. Model walks naturally, light confident spin to show full silhouette.`,
      `${bgStr}. ${lightingStr}.`,
      `Cinematic smooth movement, ${qualityStr}.`,
      `Real human model in motion. Not a mannequin.`,
    ].join(" ");
    return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
  }

  if (assetType === "product_photo") {
    const prompt = [
      "STRICT CATALOG MODE — forensic garment preservation required.",
      CATALOG_GARMENT_LOCK,
      `Place a ${modelDesc} wearing EXACTLY the ${garmentStr} from the reference image.`,
      "PRESERVE WITHOUT CHANGE: exact wash color, stitching pattern, pocket placement, waistband style, button style, leg cut, proportions, and overall silhouette.",
      CATALOG_FRAMING + ".",
      CATALOG_POSE_LOCK + ".",
      `${bgStr}.`,
      "Professional studio lighting, large soft boxes, even flat exposure, no harsh shadows.",
      `${qualityStr}.`,
      antiMannequin,
    ].join(" ");
    return { prompt, negativePrompt: catalogNegative, replicateModelId: defaultModel };
  }

  // Fallback
  const prompt = [
    `${modelDesc} wearing the exact ${garmentStr} shown in the reference image.`,
    `Keep the garment's exact color, design, and details unchanged from the reference.`,
    `${framingStr}. ${bgStr}. ${lightingStr}. ${qualityStr}, ${aspectRatio} ratio.`,
    antiMannequin,
  ].join(" ");
  return { prompt, negativePrompt: sharedNegative, replicateModelId: defaultModel };
}
