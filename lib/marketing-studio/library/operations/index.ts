/**
 * lib/marketing-studio/library/operations/index.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Barrel export for the Biblioteca operational layer.
 *
 * ── MODULES ───────────────────────────────────────────────────────────────────
 *
 *   studio-session   — bridge between Foto Estudio generation and Biblioteca
 *   approval         — review queue, approval decisions, batch approval
 *   destinations     — destination routing and channel eligibility
 *   actions          — operational action contracts and audit records
 *   relations        — asset relation graph (products, campaigns, agents, etc.)
 *   catalogs         — catalog definition, sections, and generation context
 *   ingestion        — asset ingestion pipeline (all sources → Biblioteca)
 */

// Studio session bridge
export type {
  StudioSessionReference,
  SessionContext,
  AssetPromotionRequest,
  AssetPromotionResult,
  BatchSessionSummary,
} from "./studio-session";
export {
  inferAssetType,
  buildSessionReference,
} from "./studio-session";

// Approval system
export type {
  ApprovalDecision,
  AssetApprovalRecord,
  ApprovalQueueItem,
  ApprovalQueue,
  BatchApprovalRequest,
  BatchApprovalResult,
  ApprovalValidationResult,
  ApprovalIssue,
  ApprovalIssueCode,
} from "./approval";
export {
  validateForApproval,
  shouldAutoApprove,
} from "./approval";

// Destination routing
export type {
  AssetDestination,
  FormatConstraint,
  DestinationRequirements,
  DestinationEligibilityResult,
} from "./destinations";
export {
  DESTINATION_TO_CHANNELS,
  DESTINATION_REQUIREMENTS,
  isEligibleForDestination,
  getAssetDestinationCapabilities,
} from "./destinations";

// Action contracts
export type {
  LibraryActionResult,
  LibraryAuditRecord,
  LibraryActionType,
  ApproveAssetAction,
  RejectAssetAction,
  ArchiveAssetAction,
  RestoreAssetAction,
  SendToReviewAction,
  DuplicateAssetAction,
  DuplicateAssetResult,
  CreateVariantAction,
  CreateVariantResult,
  AssignChannelsAction,
  AssignRelationsAction,
  RemoveRelationAction,
  MarkReadyForDestinationAction,
  UpdateMetadataAction,
  BulkActionRequest,
  BulkActionResult,
  LibraryAction,
} from "./actions";
export {
  ACTION_ROLE_REQUIREMENTS,
  approveAsset,
  rejectAsset,
  sendToReview,
  archiveAsset,
  assignChannels,
} from "./actions";

// Relation graph
export type {
  RelationType,
  TypedAssetRelation,
  RelationGraphNode,
  RelationQuery,
} from "./relations";
export {
  addRelation,
  removeRelation,
  findRelations,
  hasRelation,
  buildRelationGraph,
  productRelation,
  campaignRelation,
  agentRelation,
  parentAssetRelation,
  shopifyRelation,
  batchJobRelation,
} from "./relations";

// Catalog foundations
export type {
  CatalogType,
  CatalogStatus,
  CatalogAssetReference,
  CatalogSection,
  CatalogDefinition,
  CatalogRenderSettings,
  CatalogDistribution,
  CatalogGenerationContext,
  CatalogChannelConstraints,
} from "./catalogs";
export {
  CATALOG_TYPE_CONFIG,
  buildCatalogSection,
  buildCatalogAssetRef,
  getCatalogConstraints,
  countCatalogAssets,
} from "./catalogs";

// Ingestion pipeline
export type {
  IngestionSource,
  FotoEstudioIngestionMeta,
  ManualUploadIngestionMeta,
  ShopifyImportIngestionMeta,
  CrmImportIngestionMeta,
  BatchGenerationIngestionMeta,
  ExternalProviderIngestionMeta,
  IngestionSourceMeta,
  IngestionRequest,
  IngestionResult,
  IngestionStage,
  IngestionStageResult,
  IngestionPipelineTrace,
  BulkIngestionRequest,
  BulkIngestionResult,
  DeduplicationResult,
  ClassificationResult,
  IngestionValidationResult,
} from "./ingestion";
export {
  INGESTION_SOURCE_TO_ORIGIN,
  validateIngestionRequest,
  buildFotoEstudioIngestionRequest,
  buildManualUploadIngestionRequest,
} from "./ingestion";
