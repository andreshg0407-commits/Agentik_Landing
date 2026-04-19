/**
 * lib/marketing-studio/index.ts
 *
 * Public barrel export for the Marketing Studio module.
 *
 * ── Import surface ────────────────────────────────────────────────────────────
 *
 *   Types only:
 *     import type { IntakeRequest, GarmentFingerprint, ... } from "@/lib/marketing-studio";
 *
 *   Engine + registry:
 *     import { computeGarmentFingerprint, getPreset, ... } from "@/lib/marketing-studio";
 *
 *   Tenant config:
 *     import { getTenantConfig, DO_JEANS_CONFIG, ... } from "@/lib/marketing-studio";
 *
 *   Intake:
 *     import { createIntakeRequest, validateIntakeRequest } from "@/lib/marketing-studio";
 *
 *   Luca hooks:
 *     import { buildLucaPayload, buildGenerativePrompt } from "@/lib/marketing-studio";
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  GarmentCategory,
  GarmentGender,
  PriceSegment,
  FitType,
  FabricType,
  FidelityMode,
  GarmentDetailLocks,
  GarmentAttributes,
  GarmentFingerprint,
  CameraAngle,
  CameraAngleConfig,
  ShootStyle,
  BackgroundConfig,
  LightingConfig,
  PresetOverridePolicy,
  PhotoPreset,
  SocialPlatform,
  ContentObjective,
  ContentTone,
  IntakePriority,
  IntakeSource,
  SessionOverrides,
  ContentConfig,
  PublishingConfig,
  IntakeMeta,
  IntakeRequest,
  BrandVoiceConfig,
  ApprovalRuleConfig,
  LucaIntegrationConfig,
  TenantMarketingConfig,
  LucaSubmitPayload,
  ValidationResult,
} from "./types";

// ── Garment fingerprint engine ────────────────────────────────────────────────

export {
  FINGERPRINT_VERSION,
  fingerprintId,
  computeGarmentFingerprint,
  fingerprintsMatch,
} from "./garment-fingerprint";

// ── Preset registry ───────────────────────────────────────────────────────────

export {
  ALL_PRESETS,
  PRESET_REGISTRY,
  getPreset,
  getPresetsForCategory,
  getTenantPresets,
} from "./preset-registry";

// ── Tenant config ─────────────────────────────────────────────────────────────

export {
  DO_JEANS_CONFIG,
  CASTILLITOS_CONFIG,
  ALL_TENANT_CONFIGS,
  TENANT_CONFIG_MAP,
  getTenantConfig,
  getActiveTenantConfigs,
  resolveEffectivePreset,
  resolveCategory,
} from "./tenant-config";

// ── Intake schema ─────────────────────────────────────────────────────────────

export {
  newRequestId,
  createIntakeRequest,
  validateIntakeRequest,
  validateOverrides,
} from "./intake-schema";

export type { CreateIntakeOptions } from "./intake-schema";

// ── Detail locks (Phase 2) ────────────────────────────────────────────────────

export {
  JEANS_POCKET_STYLES,
  DENIM_WASHES,
  JEANS_RISES,
  JEANS_STITCHINGS,
  JEANS_EMBELLISHMENTS,
  JEANS_HARDWARE_TYPES,
  JEANS_HARDWARE_FINISHES,
  JEANS_STRICT_REQUIRED,
  JEANS_STANDARD_RECOMMENDED,
  validateJeansDetailLocks,
  describeJeansDetailLocks,
  describeJeansEmbellishments,
  buildFidelityDirective,
} from "./detail-locks";

export type {
  JeansPocketStyle,
  DenimWash,
  JeansRise,
  JeansStitching,
  JeansEmbellishment,
  JeansHardwareType,
  JeansHardwareFinish,
} from "./detail-locks";

// ── Category requirements (Phase 2) ──────────────────────────────────────────

export {
  CATEGORY_REQUIREMENTS,
  getRequiredInputs,
  validateCategoryInputs,
} from "./category-requirements";

export type { CategoryRequirements } from "./category-requirements";

// ── Luca hooks ────────────────────────────────────────────────────────────────

export {
  getEffectiveFidelityMode,
  buildGenerativePrompt,
  buildHashtagSuggestions,
  buildCopySuggestion,
  buildLucaPayload,
  isTenantPlatformEnabled,
} from "./luca-hooks";

// ── Execution payload schema (Sprint 4) ──────────────────────────────────────

export type {
  AssetGenerationRequest,
  StudioExecutionPayload,
  N8nWebhookPayload,
} from "./execution-payload";

export {
  buildN8nWebhookPayload,
  buildAssetRequests,
} from "./execution-payload";

// ── n8n executor stub (Sprint 4) ─────────────────────────────────────────────

export type {
  ExecutionResult,
  StudioExecutor,
} from "./n8n-executor";

export {
  StubN8nExecutor,
  LiveN8nExecutor,
  getExecutor,
} from "./n8n-executor";

// ── Provider stubs (Sprint 4) ─────────────────────────────────────────────────

export type {
  GenerationRequest,
  GenerationResult,
  GenerationProvider,
  PublishRequest,
  PublishResult as ProviderPublishResult,
  PublishProvider,
} from "./provider-stub";

export {
  StubGenerationProvider,
  StubPublishProvider,
  getGenerationProvider,
  getPublishProvider,
} from "./provider-stub";

// ── Do Jeans strict path (Sprint 5) ─────────────────────────────────────────

export {
  extractDetailLocks,
  validateDoJeansStrictIntake,
  canAdvanceDoJeansStrict,
} from "./do-jeans-intake";

export {
  DO_JEANS_PRESET_ID,
  DO_JEANS_SHOPIFY_WORKFLOW,
  resolveDoJeansWorkflow,
  buildDoJeansAssetPrompts,
} from "./do-jeans-workflow";

export type { BuildShopifyDraftOptions } from "./shopify-draft-builder";

export { buildShopifyDraft } from "./shopify-draft-builder";

// ── Guided flow (Sprint 3) ────────────────────────────────────────────────────

export type {
  UserObjective,
  StudioStep,
  StudioSessionStatus,
  StepDefinition,
  ProductUpload,
  MinimumInputFields,
  FieldRequirement,
  OutputAssetType,
  ReviewItemStatus,
  ReviewItem,
  ShopifyDraftPackage,
  PublishResult,
  StudioSession,
  StudioAction,
  ResolvedWorkflow,
} from "./guided-flow";

export {
  STUDIO_STEPS,
  getRequiredFieldsForObjective,
  validateMinimumFields,
  createSession,
  studioReducer,
  resolveWorkflow,
  canAdvanceFrom,
  getStepIndex,
} from "./guided-flow";
