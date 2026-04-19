/**
 * lib/marketing-studio/luca-hooks.ts
 *
 * Bridge between Marketing Studio and the Luca social publishing layer.
 *
 * ── What this does ────────────────────────────────────────────────────────────
 *
 *   1. buildLucaPayload()        Converts an IntakeRequest + TenantConfig
 *                                into a LucaSubmitPayload ready for
 *                                /api/luca/submit.
 *
 *   2. buildGenerativePrompt()   Builds the AI image/video generation prompt
 *                                from a GarmentFingerprint + PhotoPreset + config.
 *
 *   3. buildHashtagSuggestions() Produces hashtag candidates from garment attrs
 *                                and the tenant's signature hashtag list.
 *
 *   4. buildCopySuggestion()     Returns a copy hint using brand voice config.
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 *
 *   - No HTTP calls (no fetch, no n8n) — those happen in the API route.
 *   - No TikTok auth — handled by /api/tiktok/auth flow.
 *   - No DB writes.
 *
 * All functions are pure — safe to call from server components and edge routes.
 */

import type {
  IntakeRequest,
  TenantMarketingConfig,
  GarmentFingerprint,
  LucaSubmitPayload,
  SocialPlatform,
  ContentObjective,
  FidelityMode,
} from "./types";
import type { PhotoPreset }   from "./types";
import { resolveEffectivePreset } from "./tenant-config";
import { getPreset }             from "./preset-registry";
import {
  describeJeansDetailLocks,
  buildFidelityDirective,
} from "./detail-locks";

// ── Fidelity mode resolver ────────────────────────────────────────────────────

/**
 * Returns the effective fidelity mode for an intake request.
 * Order of precedence:
 *   1. request.fidelityMode (explicit per-request override)
 *   2. config.fidelityMode  (tenant default)
 *   3. "standard"           (safe fallback)
 */
export function getEffectiveFidelityMode(
  request: IntakeRequest,
  config:  TenantMarketingConfig,
): FidelityMode {
  return request.fidelityMode ?? config.fidelityMode ?? "standard";
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Constructs the generative AI prompt seed for an image / video generation job.
 *
 * Routing logic:
 *   strict + jeans  → buildJeansStrictPrompt()
 *   everything else → standard generic prompt
 *
 * Combines:
 *   • Garment semantic attributes (category, colors, fit, fabric)
 *   • Preset visual treatment (background, lighting, style, aiPromptHint)
 *   • Tenant brand adjectives (injected at the end for style calibration)
 *   • In strict+jeans mode: detail locks + PRESERVE EXACTLY directive
 */
export function buildGenerativePrompt(
  fingerprint: GarmentFingerprint,
  preset:      PhotoPreset,
  config:      TenantMarketingConfig,
  fidelityMode: FidelityMode = "standard",
): string {
  if (fidelityMode === "strict" && fingerprint.attributes.category === "jeans") {
    return buildJeansStrictPrompt(fingerprint, preset, config);
  }
  return buildStandardPrompt(fingerprint, preset, config);
}

/**
 * Standard prompt — used for non-strict requests and non-jeans categories.
 */
function buildStandardPrompt(
  fingerprint: GarmentFingerprint,
  preset:      PhotoPreset,
  config:      TenantMarketingConfig,
): string {
  const { attributes } = fingerprint;
  const parts: string[] = [];

  const colorStr = attributes.colors.join(" and ");
  const fitStr   = attributes.fit    ? `${attributes.fit} fit ` : "";
  const fabStr   = attributes.fabric ? `${attributes.fabric} ` : "";
  parts.push(`${colorStr} ${fabStr}${fitStr}${attributes.category}`);

  if (attributes.pattern && attributes.pattern !== "solid") {
    parts.push(`with ${attributes.pattern} pattern`);
  }

  if (attributes.gender !== "unisex") {
    parts.push(`on ${attributes.gender} model`);
  }

  if (preset.aiPromptHint) {
    parts.push(preset.aiPromptHint);
  } else {
    const bgDesc = preset.background.value ?? preset.background.type;
    parts.push(`${bgDesc} background`);
    parts.push(`${preset.lighting.setup} lighting`);
    parts.push(`${preset.style.replace(/_/g, " ")} photography`);
  }

  const adj = config.brandVoice.adjectives.slice(0, 2).join(", ");
  if (adj) parts.push(`${adj} aesthetic`);

  if (attributes.occasion?.length) {
    parts.push(attributes.occasion.slice(0, 2).join(" / ") + " wear");
  }

  return parts.join(", ") + ". Professional fashion photography, high resolution.";
}

/**
 * Strict-fidelity jeans prompt.
 *
 * Structure:
 *   [garment description with detail locks] — [visual treatment] — PRESERVE EXACTLY: [locks]
 *
 * The PRESERVE EXACTLY directive is appended last so the AI generator treats it
 * as an absolute constraint, not a stylistic suggestion.
 */
function buildJeansStrictPrompt(
  fingerprint: GarmentFingerprint,
  preset:      PhotoPreset,
  config:      TenantMarketingConfig,
): string {
  const { attributes } = fingerprint;
  const parts: string[] = [];

  // Garment core
  const colorStr  = attributes.colors.join(" and ");
  const fitStr    = attributes.fit ? `${attributes.fit} fit ` : "";
  parts.push(`${colorStr} ${fitStr}jeans`);

  // Inject detail lock description into the garment line
  if (attributes.detailLocks) {
    const lockDesc = describeJeansDetailLocks(attributes.detailLocks);
    if (lockDesc) parts.push(lockDesc);
  }

  // Model direction
  if (attributes.gender !== "unisex") {
    parts.push(`on ${attributes.gender} model`);
  }

  // Preset visual treatment
  if (preset.aiPromptHint) {
    parts.push(preset.aiPromptHint);
  } else {
    const bgDesc = preset.background.value ?? preset.background.type;
    parts.push(`${bgDesc} background`);
    parts.push(`${preset.lighting.setup} lighting`);
    parts.push(`${preset.style.replace(/_/g, " ")} photography`);
  }

  // Brand adjectives
  const adj = config.brandVoice.adjectives.slice(0, 2).join(", ");
  if (adj) parts.push(`${adj} aesthetic`);

  // Occasion
  if (attributes.occasion?.length) {
    parts.push(attributes.occasion.slice(0, 2).join(" / ") + " wear");
  }

  const basePrompt = parts.join(", ") + ". Professional fashion photography, high resolution.";

  // Append strict fidelity directive
  if (attributes.detailLocks) {
    const directive = buildFidelityDirective(attributes.detailLocks);
    if (directive) return basePrompt + " " + directive;
  }

  return basePrompt;
}

// ── Hashtag builder ───────────────────────────────────────────────────────────

/**
 * Generates hashtag suggestions for a garment based on:
 *   • Garment attributes (category, colors, occasion, season)
 *   • Tenant signature hashtags
 *   • Platform-safe formatting (#PascalCase for readability)
 *
 * Returns a deduplicated array of hashtags. TikTok/Instagram safe.
 */
export function buildHashtagSuggestions(
  fingerprint: GarmentFingerprint,
  config:      TenantMarketingConfig,
  maxCount     = 12,
): string[] {
  const { attributes } = fingerprint;
  const tags = new Set<string>();

  // Tenant signature tags (highest priority)
  config.brandVoice.signatureHashtags.forEach(t => tags.add(t));

  // Category tag
  const catTag = "#" + attributes.category.charAt(0).toUpperCase() + attributes.category.slice(1);
  tags.add(catTag);

  // Color tags (1–2 main colors)
  attributes.colors.slice(0, 2).forEach(c => {
    const t = "#" + c.charAt(0).toUpperCase() + c.slice(1);
    tags.add(t);
  });

  // Occasion tags
  (attributes.occasion ?? []).forEach(o => {
    const t = "#" + o.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
    tags.add(t);
  });

  // Season
  (attributes.season ?? []).forEach(s => {
    const t = "#" + s.charAt(0).toUpperCase() + s.slice(1) + "Fashion";
    tags.add(t);
  });

  // Generic fashion tags
  tags.add("#ModaColombia");
  tags.add("#FashionInspo");

  return Array.from(tags).slice(0, maxCount);
}

// ── Copy suggestion ───────────────────────────────────────────────────────────

/**
 * Returns a copy (caption / post text) suggestion based on:
 *   • Tenant brand voice sample hints
 *   • Garment category + occasion context
 *
 * Selects a sample hint and appends a garment-specific complement.
 * For now this is rule-based; future versions will call the AI layer.
 */
export function buildCopySuggestion(
  fingerprint: GarmentFingerprint,
  config:      TenantMarketingConfig,
): string {
  const { attributes } = fingerprint;
  const hints = config.brandVoice.copySampleHints;
  // Cycle through hints based on category hash
  const idx  = attributes.category.length % hints.length;
  const hint = hints[idx] ?? hints[0] ?? "Descubre nuestra nueva colección.";

  const colorCtx = attributes.colors.slice(0, 1).join(" y ");
  const catCtx   = attributes.category;

  return `${hint} ${colorCtx ? `Nuevo ${catCtx} en ${colorCtx}.` : `Nuevo ${catCtx}.`}`;
}

// ── Luca payload builder ──────────────────────────────────────────────────────

/**
 * Converts an IntakeRequest + TenantMarketingConfig into a LucaSubmitPayload
 * ready to be sent (as FormData) to /api/luca/submit.
 *
 * @param request  Validated IntakeRequest.
 * @param config   Tenant's marketing config — drives Luca defaults.
 * @returns        LucaSubmitPayload or null if the preset cannot be resolved.
 */
export function buildLucaPayload(
  request: IntakeRequest,
  config:  TenantMarketingConfig,
): LucaSubmitPayload | null {
  const preset = resolveEffectivePreset(request.presetId, config, request.overrides);
  if (!preset) return null;

  const platforms = request.content.targetPlatforms;

  // Determine aspect ratio from preset style
  const aspectRatio: "9:16" | "16:9" =
    preset.style === "flat_lay"
    || preset.style === "ecommerce_clean"
      ? "16:9"
      : "9:16";

  // Content objective
  const objective: ContentObjective =
    request.content.objective ?? config.luca.defaultObjective;

  // Hashtags
  const hashtags = buildHashtagSuggestions(request.garment, config);

  // Copy
  const copyText = buildCopySuggestion(request.garment, config);

  // Fidelity mode
  const fidelityMode = getEffectiveFidelityMode(request, config);

  // Prompt description (used for text-to-video)
  const description = buildGenerativePrompt(request.garment, preset, config, fidelityMode);

  return {
    post_type:        "video",
    objective,
    description,
    optimize:         true,
    hashtags:         { mode: "custom", values: hashtags },
    copy:             { mode: "custom", value: copyText },
    generation_type:  "text-to-video",
    aspect_ratio:     aspectRatio,
    duration_seconds: 8,
    prompt_mode:      config.luca.promptMode,
    client_id:        config.luca.clientId,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when a platform is in the tenant's default publishing channels.
 */
export function isTenantPlatformEnabled(
  platform: SocialPlatform,
  config:   TenantMarketingConfig,
): boolean {
  return config.luca.defaultPlatforms.includes(platform);
}
