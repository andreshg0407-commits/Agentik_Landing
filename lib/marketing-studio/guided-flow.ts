/**
 * lib/marketing-studio/guided-flow.ts
 *
 * Guided workflow architecture for Marketing Studio.
 *
 * ── Visibility rules ──────────────────────────────────────────────────────────
 *
 *   EXPOSED to user-facing surfaces:
 *     UserObjective, StudioStep, StudioSession, StudioAction,
 *     MinimumInputFields, FieldRequirement, ReviewItem, PublishResult,
 *     STUDIO_STEPS, getRequiredFieldsForObjective, validateMinimumFields,
 *     createSession, studioReducer, canAdvanceFrom, getStepIndex
 *
 *   INTERNAL — never surfaced in UI:
 *     InternalOutputProfile, OUTPUT_PROFILES (presets, fidelity, asset config)
 *     resolveWorkflow (used only by server-side execution layer)
 *
 * ── State machine ─────────────────────────────────────────────────────────────
 *
 *   idle → upload_product → choose_objective → minimum_fields
 *        → review_approve → publish_export (terminal)
 *
 * ── Conditional output rules ──────────────────────────────────────────────────
 *
 *   shopify_listing  → photos + product_draft   | no video
 *   social_campaign  → social assets + Luca     | no product_draft
 *   catalog_export   → photos only              | no video, no social
 *   all_channels     → full output set
 */

import type { GarmentCategory, SocialPlatform } from "./types";

// ── User-facing objective options ─────────────────────────────────────────────

export type UserObjective =
  | "shopify_listing"   // publish product page to Shopify
  | "social_campaign"   // post to social media via Luca
  | "catalog_export"    // export for print / digital catalog
  | "all_channels";     // all of the above

// ── Step identifiers ──────────────────────────────────────────────────────────

export type StudioStep =
  | "upload_product"
  | "choose_objective"
  | "minimum_fields"
  | "review_approve"
  | "publish_export";

// ── Session lifecycle ─────────────────────────────────────────────────────────

export type StudioSessionStatus =
  | "idle"
  | "in_progress"
  | "pending_review"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "failed";

// ── Step definitions (drives stepper UI) ─────────────────────────────────────

export interface StepDefinition {
  step:        StudioStep;
  label:       string;
  description: string;
  next:        StudioStep | null;
  prev:        StudioStep | null;
}

export const STUDIO_STEPS: readonly StepDefinition[] = [
  {
    step:        "upload_product",
    label:       "Upload Product",
    description: "Add a product image and SKU",
    next:        "choose_objective",
    prev:        null,
  },
  {
    step:        "choose_objective",
    label:       "Choose Objective",
    description: "What do you want to do with this product?",
    next:        "minimum_fields",
    prev:        "upload_product",
  },
  {
    step:        "minimum_fields",
    label:       "Complete Details",
    description: "A few key details to get the best results",
    next:        "review_approve",
    prev:        "choose_objective",
  },
  {
    step:        "review_approve",
    label:       "Review",
    description: "Review and approve generated content",
    next:        "publish_export",
    prev:        "minimum_fields",
  },
  {
    step:        "publish_export",
    label:       "Publish",
    description: "Publish or export your content",
    next:        null,
    prev:        "review_approve",
  },
] as const;

// ── Product upload (step 1 payload) ───────────────────────────────────────────

export interface ProductUpload {
  sku:              string;
  imageUrl:         string;   // front/primary reference image
  backImageUrl?:    string;   // back reference image — used in strict Do Jeans path
  detailImage1Url?: string;   // optional detail angle 1
  detailImage2Url?: string;   // optional detail angle 2
}

// ── Minimum required fields (step 3 — conditional by objective) ───────────────

export interface MinimumInputFields {
  category:       GarmentCategory;
  colors:         string[];         // at least one required
  price?:         number;           // required: shopify_listing, catalog_export, all_channels
  title?:         string;           // required: shopify_listing, all_channels
  season?:        string;           // required: catalog_export, all_channels
  targetPlatform?: SocialPlatform; // required: social_campaign, all_channels

  // ── Do Jeans strict jeans detail locks ──────────────────────────────────────
  // Collected in Step 3 when tenantId="do-jeans" and category="jeans".
  // Flat fields (not nested GarmentDetailLocks) for simpler form patching.
  detailPocket?:            string;   // JeansPocketStyle — required for strict
  detailWash?:              string;   // DenimWash         — required for strict
  detailStitching?:         string;   // JeansStitching    — required for strict
  detailRise?:              string;   // JeansRise         — required for strict
  detailEmbellishments?:    string;   // comma-separated JeansEmbellishment values — required for strict
  detailHardwareType?:      string;   // e.g. "triple-button" | "single-button" | "zip-fly"
  detailHardwareFinish?:    string;   // e.g. "gold" | "silver" | "antique-brass"
  detailHardwareDetail?:    string;   // free-text hardware placement / orientation
  detailEmbellishmentDetail?: string; // free-text geometry descriptor for embellishments
  detailWashDetail?:        string;   // free-text wash elaboration — overrides enum phrase in directive

  // ── Extra reference images (upload zones 3 & 4) ──────────────────────────
  detailImage1Url?:         string;   // CDN URL — detail photo 1
  detailImage2Url?:         string;   // CDN URL — detail photo 2
}

export interface FieldRequirement {
  field:    keyof MinimumInputFields;
  required: boolean;
  label:    string;
}

// Internal map — defines the minimum set of fields per objective.
// Keys intentionally mirror MinimumInputFields to stay type-safe.
const FIELD_REQUIREMENTS_BY_OBJECTIVE: Readonly<Record<UserObjective, FieldRequirement[]>> = {
  shopify_listing: [
    { field: "category",       required: true,  label: "Category"       },
    { field: "colors",         required: true,  label: "Colors"         },
    { field: "price",          required: true,  label: "Price"          },
    { field: "title",          required: true,  label: "Product Title"  },
  ],
  social_campaign: [
    { field: "category",       required: true,  label: "Category"       },
    { field: "colors",         required: true,  label: "Colors"         },
    { field: "targetPlatform", required: true,  label: "Platform"       },
  ],
  catalog_export: [
    { field: "category",       required: true,  label: "Category"       },
    { field: "colors",         required: true,  label: "Colors"         },
    { field: "price",          required: true,  label: "Price"          },
    { field: "season",         required: true,  label: "Season"         },
  ],
  all_channels: [
    { field: "category",       required: true,  label: "Category"       },
    { field: "colors",         required: true,  label: "Colors"         },
    { field: "price",          required: true,  label: "Price"          },
    { field: "title",          required: true,  label: "Product Title"  },
    { field: "season",         required: true,  label: "Season"         },
    { field: "targetPlatform", required: true,  label: "Platform"       },
  ],
};

export function getRequiredFieldsForObjective(
  objective: UserObjective,
): FieldRequirement[] {
  return FIELD_REQUIREMENTS_BY_OBJECTIVE[objective];
}

export function validateMinimumFields(
  objective: UserObjective,
  inputs: Partial<MinimumInputFields>,
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const req of FIELD_REQUIREMENTS_BY_OBJECTIVE[objective]) {
    if (!req.required) continue;
    const val = inputs[req.field];
    if (val === undefined || val === null) {
      missing.push(req.label);
    } else if (Array.isArray(val) && val.length === 0) {
      missing.push(req.label);
    } else if (typeof val === "string" && val.trim() === "") {
      missing.push(req.label);
    }
  }

  return { valid: missing.length === 0, missing };
}

// ── Output asset types ────────────────────────────────────────────────────────

export type OutputAssetType =
  | "product_photo"    // clean e-commerce photo (generic)
  | "front_clean"      // studio clean — front angle (strict fidelity, Do Jeans)
  | "back_clean"       // studio clean — back angle (strict fidelity, Do Jeans)
  | "social_image"     // cropped/styled for social
  | "social_video"     // short-form video clip
  | "copy_caption"     // social caption text
  | "hashtags"         // hashtag set
  | "product_draft";   // Shopify product draft record

// ── Internal output profiles ──────────────────────────────────────────────────
// NOT exported. Only resolveWorkflow() may read this.

interface InternalOutputProfile {
  objective:          UserObjective;
  /** Global preset ID — resolved internally, never shown to user */
  presetId:           string;
  assets:             OutputAssetType[];
  createProductDraft: boolean;
  publishToLuca:      boolean;
  includeVideo:       boolean;
}

const OUTPUT_PROFILES: Readonly<Record<UserObjective, InternalOutputProfile>> = {
  shopify_listing: {
    objective:          "shopify_listing",
    presetId:           "studio_clean_white",
    assets:             ["product_photo", "product_draft"],
    createProductDraft: true,
    publishToLuca:      false,
    includeVideo:       false,
  },
  social_campaign: {
    objective:          "social_campaign",
    presetId:           "editorial_urban",
    assets:             ["social_image", "social_video", "copy_caption", "hashtags"],
    createProductDraft: false,
    publishToLuca:      true,
    includeVideo:       true,
  },
  catalog_export: {
    objective:          "catalog_export",
    presetId:           "lookbook_neutral",
    assets:             ["product_photo"],
    createProductDraft: false,
    publishToLuca:      false,
    includeVideo:       false,
  },
  all_channels: {
    objective:          "all_channels",
    presetId:           "studio_clean_white",
    assets:             [
      "product_photo",
      "social_image",
      "social_video",
      "copy_caption",
      "hashtags",
      "product_draft",
    ],
    createProductDraft: true,
    publishToLuca:      true,
    includeVideo:       true,
  },
};

// ── Resolved workflow (server-side execution layer only) ──────────────────────

export interface ResolvedWorkflow {
  presetId:           string;
  assets:             OutputAssetType[];
  createProductDraft: boolean;
  publishToLuca:      boolean;
  includeVideo:       boolean;
}

/**
 * Maps a user objective to the internal execution plan.
 *
 * @internal — called only by the server-side generation pipeline.
 * Never pass this result to client components.
 */
export function resolveWorkflow(objective: UserObjective): ResolvedWorkflow {
  const { presetId, assets, createProductDraft, publishToLuca, includeVideo } =
    OUTPUT_PROFILES[objective];
  return { presetId, assets, createProductDraft, publishToLuca, includeVideo };
}

// ── Review items (step 4) ─────────────────────────────────────────────────────

export type ReviewItemStatus = "pending" | "approved" | "rejected";

export interface ReviewItem {
  id:          string;
  type:        OutputAssetType;
  previewUrl?: string;   // for visual assets
  content?:    string;   // for text assets (copy_caption, hashtags)
  status:      ReviewItemStatus;
}

// ── Publish result (step 5) ───────────────────────────────────────────────────

/**
 * Shopify draft package stored in publishResult for the Do Jeans strict path.
 * Reflects what would be sent to the Shopify Products API when the provider is wired.
 */
export interface ShopifyDraftPackage {
  title:       string;
  productType: string;          // e.g. "Jeans"
  vendor:      string;          // e.g. "Do Jeans"
  tags:        string[];
  bodyHtml:    string;
  variants:    Array<{
    price:    string;           // ISO numeric string e.g. "89900.00"
    sku?:     string;
    option1?: string;           // size placeholder
  }>;
  imageSlots: Array<{
    assetId:   string;          // GeneratedAsset.id
    assetType: "front_clean" | "back_clean";
    position:  number;          // 1 = front, 2 = back
    /** CDN URL filled in by the callback handler when the asset becomes READY */
    imageUrl?: string;
  }>;
}

export interface PublishResult {
  objective:       UserObjective;
  shopifyDraftId?: string;
  lucaJobId?:      string;
  exportUrl?:      string;
  publishedAt:     string;  // ISO
  /** Full Shopify draft payload — set for shopify_listing and all_channels objectives */
  shopifyDraft?:   ShopifyDraftPackage;
}

// ── Studio session (state machine entity) ────────────────────────────────────

export interface StudioSession {
  id:            string;
  tenantId:      string;
  step:          StudioStep;
  status:        StudioSessionStatus;
  product:       ProductUpload | null;
  objective:     UserObjective | null;
  inputs:        Partial<MinimumInputFields>;
  reviewItems:   ReviewItem[];
  publishResult: PublishResult | null;
  createdAt:     string;   // ISO
  updatedAt:     string;   // ISO
}

// ── Action union ──────────────────────────────────────────────────────────────

export type StudioAction =
  | { type: "SET_PRODUCT";       product:     ProductUpload            }
  | { type: "SET_OBJECTIVE";     objective:   UserObjective            }
  | { type: "SET_INPUTS";        inputs:      Partial<MinimumInputFields> }
  | { type: "SUBMIT_FOR_REVIEW"; reviewItems: ReviewItem[]             }
  | { type: "APPROVE_ITEM";      itemId:      string                   }
  | { type: "REJECT_ITEM";       itemId:      string                   }
  | { type: "APPROVE_ALL"                                              }
  | { type: "START_PUBLISHING"                                         }
  | { type: "PUBLISH_SUCCESS";   result:      PublishResult            }
  | { type: "PUBLISH_FAILED";    reason:      string                   }
  | { type: "GO_BACK"                                                  }
  | { type: "RESET"                                                    };

// ── Pure reducer ──────────────────────────────────────────────────────────────

export function studioReducer(
  session: StudioSession,
  action:  StudioAction,
): StudioSession {
  const now = new Date().toISOString();

  switch (action.type) {
    case "SET_PRODUCT":
      return {
        ...session,
        product:   action.product,
        step:      "choose_objective",
        status:    "in_progress",
        updatedAt: now,
      };

    case "SET_OBJECTIVE":
      return {
        ...session,
        objective: action.objective,
        step:      "minimum_fields",
        updatedAt: now,
      };

    case "SET_INPUTS":
      return {
        ...session,
        inputs:    { ...session.inputs, ...action.inputs },
        updatedAt: now,
      };

    case "SUBMIT_FOR_REVIEW":
      return {
        ...session,
        reviewItems: action.reviewItems,
        step:        "review_approve",
        status:      "pending_review",
        updatedAt:   now,
      };

    case "APPROVE_ITEM":
      return {
        ...session,
        reviewItems: session.reviewItems.map((item) =>
          item.id === action.itemId ? { ...item, status: "approved" as const } : item,
        ),
        updatedAt: now,
      };

    case "REJECT_ITEM":
      return {
        ...session,
        reviewItems: session.reviewItems.map((item) =>
          item.id === action.itemId ? { ...item, status: "rejected" as const } : item,
        ),
        updatedAt: now,
      };

    case "APPROVE_ALL":
      return {
        ...session,
        reviewItems: session.reviewItems.map((item) => ({
          ...item,
          status: "approved" as const,
        })),
        status:    "approved",
        updatedAt: now,
      };

    case "START_PUBLISHING":
      return {
        ...session,
        step:      "publish_export",
        status:    "publishing",
        updatedAt: now,
      };

    case "PUBLISH_SUCCESS":
      return {
        ...session,
        publishResult: action.result,
        status:        "published",
        updatedAt:     now,
      };

    case "PUBLISH_FAILED":
      return {
        ...session,
        status:    "failed",
        updatedAt: now,
      };

    case "GO_BACK": {
      const stepDef = STUDIO_STEPS.find((s) => s.step === session.step);
      if (!stepDef?.prev) return session;
      return {
        ...session,
        step:      stepDef.prev,
        // Revert pending_review back to in_progress when backing out of review
        status:    session.status === "pending_review" ? "in_progress" : session.status,
        updatedAt: now,
      };
    }

    case "RESET":
      return createSession(session.tenantId);
  }
}

// ── Session factory ───────────────────────────────────────────────────────────

export function createSession(tenantId: string): StudioSession {
  const now = new Date().toISOString();
  return {
    id:            `ss_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    step:          "upload_product",
    status:        "idle",
    product:       null,
    objective:     null,
    inputs:        {},
    reviewItems:   [],
    publishResult: null,
    createdAt:     now,
    updatedAt:     now,
  };
}

// ── Guard helpers ─────────────────────────────────────────────────────────────

/** Returns true when the session satisfies the requirements to advance to the next step. */
export function canAdvanceFrom(session: StudioSession): boolean {
  switch (session.step) {
    case "upload_product":
      return session.product !== null;

    case "choose_objective":
      return session.objective !== null;

    case "minimum_fields": {
      if (!session.objective) return false;
      const { valid } = validateMinimumFields(session.objective, session.inputs);
      return valid;
    }

    case "review_approve":
      return (
        session.reviewItems.length > 0 &&
        session.reviewItems.every((item) => item.status !== "pending")
      );

    case "publish_export":
      return false; // terminal step
  }
}

/** Zero-based index of the given step in STUDIO_STEPS. */
export function getStepIndex(step: StudioStep): number {
  return STUDIO_STEPS.findIndex((s) => s.step === step);
}
