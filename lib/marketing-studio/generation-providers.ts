/**
 * lib/marketing-studio/generation-providers.ts
 *
 * Agentik Foto Estudio — AI Generation Provider Abstraction
 * Sprint: AGENTIK-FOTOESTUDIO-REVIEW-LAYER-01
 *
 * Hybrid provider architecture: Replicate (current) + Fal.ai (next).
 *
 * Design principles:
 * - Provider-agnostic: callers use GenerationProvider interface, never SDK directly.
 * - Graceful fallback: Fal.ai primary → Replicate fallback for legacy/test paths.
 * - Refinement-capable: supports inpainting, partial correction, scene regeneration.
 * - Versioned: each generation call returns a versionable result.
 */

// ── Provider identifiers ───────────────────────────────────────────────────────

export type GenerationProviderId = "replicate" | "fal";

// ── Generation modes ──────────────────────────────────────────────────────────

export type GenerationMode =
  | "initial"        // Full scene generation from product photos
  | "refinement"     // Targeted correction via inpainting or re-prompting
  | "regeneration"   // Full scene regeneration preserving product identity
  | "variation";     // Stylistic variation of an existing generation

// ── Correction type (maps to CORRECTION_CHIPS in wizard) ─────────────────────

export type CorrectionType =
  | "fix_face"
  | "fix_hands"
  | "remove_object"
  | "improve_light"
  | "improve_sharp"
  | "fix_proportions"
  | "replace_bg"
  | "bigger_product"
  | "improve_realism"
  | "regen_scene";

// ── Generation request ────────────────────────────────────────────────────────

export interface GenerationRequest {
  /** Session identifier for asset tracking */
  sessionId:       string;
  /** Tenant context for prompt engine selection */
  tenantId:        string;
  /** Provider to use — defaults to "fal" with "replicate" fallback */
  provider?:       GenerationProviderId;
  /** Generation mode */
  mode:            GenerationMode;
  /** Source image URL (product photo) */
  sourceImageUrl:  string;
  /** Optional back/secondary image */
  backImageUrl?:   string;
  /** Structured prompt built by the tenant prompt engine */
  structuredPrompt: string;
  /** Free-text creative direction from user */
  creativeDirection?: string;
  /** Correction type when mode = "refinement" */
  correctionType?:  CorrectionType;
  /** Free-text correction description */
  correctionText?:  string;
  /** Previous generation URL (required for refinement/variation modes) */
  baseImageUrl?:   string;
  /** Aspect ratio */
  aspectRatio:     string;
  /** Number of images to generate */
  count:           number;
  /** Parent asset ID (for version tracking) */
  parentAssetId?:  string;
}

// ── Generation result ─────────────────────────────────────────────────────────

export interface GenerationResult {
  /** Unique result ID */
  id:          string;
  /** Provider that served this result */
  provider:    GenerationProviderId;
  /** Output image URL(s) */
  imageUrls:   string[];
  /** Version number (1 = initial, 2+ = refined) */
  version:     number;
  /** Raw provider job ID for audit */
  providerJobId?: string;
  /** Whether fallback provider was used */
  usedFallback?: boolean;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface GenerationProvider {
  id:       GenerationProviderId;
  name:     string;
  supports: GenerationMode[];
  generate: (req: GenerationRequest) => Promise<GenerationResult>;
  healthCheck: () => Promise<boolean>;
}

// ── Provider registry ─────────────────────────────────────────────────────────

/**
 * REPLICATE provider stub.
 * Current production provider — used for initial generation.
 * Routes to n8n webhook which dispatches to Replicate API.
 */
const ReplicateProvider: GenerationProvider = {
  id:       "replicate",
  name:     "Replicate",
  supports: ["initial", "regeneration"],
  generate: async (_req: GenerationRequest): Promise<GenerationResult> => {
    // PLACEHOLDER — real implementation routes through n8n-executor.ts
    throw new Error("ReplicateProvider.generate: use n8n-executor.ts directly for initial generation");
  },
  healthCheck: async () => true, // PLACEHOLDER
};

/**
 * FAL.AI provider stub.
 * Next-generation provider — advanced inpainting, refinement, real-time pipelines.
 * Activate: set FAL_API_KEY in environment and implement generate().
 *
 * Key capabilities when activated:
 * - fal-ai/flux/dev         → initial generation
 * - fal-ai/flux/dev/image-to-image → variation
 * - fal-ai/sd-turbo/inpaint → face/hand correction
 * - fal-ai/rembg            → background replacement
 *
 * Sprint: AGENTIK-FOTOESTUDIO-FAL-01
 */
const FalProvider: GenerationProvider = {
  id:       "fal",
  name:     "Fal.ai",
  supports: ["initial", "refinement", "regeneration", "variation"],
  generate: async (_req: GenerationRequest): Promise<GenerationResult> => {
    // PLACEHOLDER — implement when FAL_API_KEY is available
    // See: https://fal.ai/docs
    throw new Error("FalProvider: not yet implemented — Sprint AGENTIK-FOTOESTUDIO-FAL-01");
  },
  healthCheck: async () => {
    // PLACEHOLDER — ping fal.ai health endpoint
    return false;
  },
};

const PROVIDER_REGISTRY: Record<GenerationProviderId, GenerationProvider> = {
  replicate: ReplicateProvider,
  fal:       FalProvider,
};

// ── Provider resolution ───────────────────────────────────────────────────────

/**
 * Resolve the best available provider for a given request.
 *
 * Priority:
 * 1. Explicitly requested provider (if it supports the mode)
 * 2. Fal.ai (if mode is supported + API key available)
 * 3. Replicate (fallback)
 */
export function resolveProvider(
  req: Pick<GenerationRequest, "provider" | "mode">,
): GenerationProvider {
  const hasFalKey = typeof process !== "undefined" && !!process.env.FAL_API_KEY;

  if (req.provider) {
    const explicit = PROVIDER_REGISTRY[req.provider];
    if (explicit.supports.includes(req.mode)) return explicit;
  }

  if (hasFalKey && FalProvider.supports.includes(req.mode)) {
    return FalProvider;
  }

  return ReplicateProvider;
}

export { PROVIDER_REGISTRY };
