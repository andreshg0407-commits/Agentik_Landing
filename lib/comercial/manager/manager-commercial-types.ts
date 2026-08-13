/**
 * lib/comercial/manager/manager-commercial-types.ts
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Client-safe types for Manager App commercial surfaces.
 * Thin DTOs derived from existing canonical domain truth.
 *
 * RULE: No Prisma, no React, no server-only. Pure domain types.
 * All business math computed server-side by canonical services.
 */

// ── Truth States ──────────────────────────────────────────────────────────────

export type ManagerTruthState =
  | "CERTIFIED"
  | "PARTIAL"
  | "IDENTITY_UNRESOLVED"
  | "SOURCE_UNAVAILABLE";

export type ManagerAttentionStatus = "NONE" | "HAS_ITEMS";

// ── Executive State ──────────────────────────────────────────────────────────

export type ManagerExecutiveState =
  | "REQUIRES_ATTENTION"
  | "STABLE"
  | "DATA_INCOMPLETE";

export interface ManagerExecutiveStatePA {
  state: ManagerExecutiveState;
  reason: string;
  participatingSources: number;
  certifiedSources: number;
  unresolvedAttentionCount: number;
  asOf: string;
}

// ── Global Attention ──────────────────────────────────────────────────────────

export interface ManagerAttentionItem {
  id: string;
  module: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  entityType: string | null;
  entityLabel: string | null;
  href: string | null;
  asOf: string;
}

// ── Home PA ──────────────────────────────────────────────────────────────────

export interface ManagerHomePA {
  orgName: string;
  userName: string | null;
  greeting: string;
  currentDate: string;
  executiveState: ManagerExecutiveStatePA;
  attention: ManagerAttentionItem[];
  asOf: string;
}

// ── Commercial Hub ────────────────────────────────────────────────────────────

export interface ManagerCommercialSurfaceDef {
  id: string;
  label: string;
  icon: string;
  href: string;
  factCount: number;
  attentionCount: number;
}

export interface ManagerCommercialHubPA {
  surfaces: ManagerCommercialSurfaceDef[];
  asOf: string;
}

// ── Ventas Surface ─────────────────────────────────────────────────────────

export interface ManagerVentasFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface ManagerVentasPA {
  facts: ManagerVentasFact[];
  periodo: string;
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

// ── Clientes Surface ──────────────────────────────────────────────────────

export interface ManagerClientesFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface ManagerClienteHighlight {
  id: string;
  name: string;
  reason: string;
  label: string;
  value: string;
}

export interface ManagerClientesPA {
  facts: ManagerClientesFact[];
  highlights: ManagerClienteHighlight[];
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

// ── Vendedores Surface ────────────────────────────────────────────────────

export interface ManagerSellerCard {
  sellerId: string;
  sellerName: string;
  activityStatus: "activo" | "atencion" | "inactivo";
  crmQuoteCount: number;
  customerCount: number;
  totalCrmAmount: number;
  daysSinceLastActivity: number | null;
  href: string;
}

export interface ManagerVendedoresFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface ManagerVendedoresPA {
  facts: ManagerVendedoresFact[];
  sellers: ManagerSellerCard[];
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

// ── Seller Detail ────────────────────────────────────────────────────────

export interface ManagerSellerDetailPA {
  /** Canonical seller identity — persisted deterministic join key (toSlug(name)).
   *  Used across SaleRecord.sellerSlug, VendorCommercialBag.salesRepId,
   *  CustomerProfile.sellerSlug. Route parameter: [sellerId]. */
  sellerId: string;
  sellerName: string;
  sellerTerceroId: string | null;
  terceroTruthState: ManagerTruthState;
  activityStatus: "activo" | "atencion" | "inactivo";
  facts: ManagerVendedoresFact[];
  commissionTruthState: ManagerTruthState;
  commissionLabel: string | null;
  maletaSection: ManagerMaletaSection | null;
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

export interface ManagerMaletaSection {
  totalPositions: number;
  assignedPositions: number;
  coveragePercent: number;
  truthState: ManagerTruthState;
  /** Canonical business-mutation timestamp from persisted bag data, or null
   *  if no bag has a persisted timestamp. Never request-time. */
  sourceAsOf: string | null;
  /** True only after a successful canonical query returned results. */
  availabilityKnown: true;
  /** Request/provider query time. Separate from sourceAsOf. */
  queriedAt: string;
}

// ── Pedidos Surface ───────────────────────────────────────────────────────

export interface ManagerPedidosFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface ManagerPedidosPA {
  facts: ManagerPedidosFact[];
  attentionStatus: ManagerAttentionStatus;
  syncState: "SYNCED" | "SYNC_PENDING" | "SYNC_FAILED" | null;
  asOf: string;
}

// ── Tiendas Surface ───────────────────────────────────────────────────────

export interface ManagerStoreCard {
  storeId: string;
  storeName: string;
  totalReferences: number;
  referencesOutOfStock: number;
  referencesCritical: number;
  sourceStatus: string;
  href: string;
}

export interface ManagerTiendasFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface ManagerTiendasPA {
  facts: ManagerTiendasFact[];
  stores: ManagerStoreCard[];
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

// ── Store Detail ──────────────────────────────────────────────────────────

export interface ManagerStoreDetailPA {
  storeId: string;
  storeName: string;
  facts: ManagerTiendasFact[];
  sourceStatus: string;
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

// ── Inventario Surface ────────────────────────────────────────────────────

export interface ManagerInventarioFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface ManagerInventarioPA {
  facts: ManagerInventarioFact[];
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

// ── Importaciones Surface ─────────────────────────────────────────────────

export interface ManagerImportacionesFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface ManagerImportacionesPA {
  facts: ManagerImportacionesFact[];
  lowRotationCount: number;
  recompraCount: number;
  sinFechaCount: number;
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
}

// ── Alertas PA ───────────────────────────────────────────────────────────

export interface ManagerAlertaItem {
  id: string;
  severity: "critical" | "warning" | "info";
  module: string;
  title: string;
  message: string;
  entityLabel: string | null;
  createdAt: string;
}

export interface ManagerAlertasPA {
  alerts: ManagerAlertaItem[];
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
  /** Set when one or more providers failed. */
  sourceStatus?: string;
  sourceDetail?: string;
}

// ── Tareas PA ────────────────────────────────────────────────────────────

export interface ManagerTareaItem {
  id: string;
  title: string;
  priority: string;
  status: string;
  assignee: string | null;
  module: string | null;
  createdAt: string;
}

export interface ManagerTareasPA {
  tasks: ManagerTareaItem[];
  attentionStatus: ManagerAttentionStatus;
  asOf: string;
  sourceStatus?: string;
  sourceDetail?: string;
}

// ── Informes PA ──────────────────────────────────────────────────────────

export interface ManagerInformeItem {
  id: string;
  title: string;
  frequency: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface ManagerInformesPA {
  reports: ManagerInformeItem[];
  asOf: string;
  sourceStatus?: string;
  sourceDetail?: string;
}

// ── Provider Result Envelope ──────────────────────────────────────────

/** Explicit result envelope for data providers.
 *  Replaces `.catch(() => [])` pattern that hides provider failure. */
export type ProviderStatus = "OK" | "PROVIDER_ERROR" | "PROVIDER_UNAVAILABLE";

export interface ProviderResult<T> {
  status: ProviderStatus;
  items: T[];
  source: string;
  asOf: string;
  errorClassification: string | null;
}

// ── Source Availability ─────────────────────────────────────────────────

/** Separates source health from KPI values.
 *  Zero is a valid business value, not a missing-data signal. */
export type SourceAvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "DEGRADED";

export interface SourceAvailability {
  name: string;
  status: SourceAvailabilityStatus;
  /** True if the provider responded successfully, regardless of value. */
  responded: boolean;
  /** ISO timestamp of last successful load. */
  lastLoadedAt: string | null;
}

// ── Seller Identity Contract ────────────────────────────────────────────

/**
 * BLOCKED_BY_MISSING_CANONICAL_CONTRACT
 *
 * The current seller identity (`sellerId` = `toSlug(sellerName)`) is
 * name-derived and mutable. No immutable non-name-derived seller
 * identifier exists in the current data model.
 *
 * The minimal future identity model requires:
 *   - A Prisma `Seller` model with cuid `id` as primary key
 *   - `organizationId` for tenant isolation
 *   - `sellerSlug` as migration key (for backward compat with existing joins)
 *   - `sellerTerceroId` nullable (SAG ka_nl_tercero_vend mapping)
 *   - `displayName` for human-readable label
 *   - `createdAt` for audit
 *
 * Until this model exists, the Manager App uses the persisted slug as
 * a functional join key and documents it as IDENTITY_UNSTABLE.
 */
export type SellerIdentityContract = "IDENTITY_UNSTABLE";
export const SELLER_IDENTITY_STATUS: SellerIdentityContract = "IDENTITY_UNSTABLE";

// ── Copilot Status ──────────────────────────────────────────────────────

export const COPILOT_STATUS = "DELIBERATELY_DEFERRED" as const;

// ── Copilot Context ──────────────────────────────────────────────────────

export interface ManagerCopilotContext {
  orgSlug: string;
  role: string;
  moduleKey: string | null;
  submoduleKey: string | null;
  route: string;
  entityType: string | null;
  entityId: string | null;
  truthState: ManagerTruthState | null;
  freshness: string | null;
}
