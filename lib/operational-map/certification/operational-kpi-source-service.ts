/**
 * lib/operational-map/certification/operational-kpi-source-service.ts
 *
 * Operational KPI Source — Service Layer.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Manages multi-source definitions per KPI. One KPI can have multiple sources
 * with different roles (primary, secondary, fallback, calculated, hybrid).
 *
 * Sprint: AGENTIK-LIVE-KPI-CERTIFICATION-WORKSPACE-01
 */

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type KpiSourceRole   = "primary" | "secondary" | "fallback" | "calculated" | "hybrid";
export type KpiSourceType   =
  | "direct_sag" | "crm" | "bank" | "agentik" | "manual" | "external"
  | "calculated" | "hybrid" | "table" | "view" | "api" | "query"
  | "module" | "file" | "engine" | "custom"
  // SAG document-type codes (k_sc_codigo_fuente). NOT a table until DBA confirms.
  | "sag_document_type" | "sag_table" | "sag_view" | "sag_query" | "document_type";
export type KpiSourceProvider = "sag" | "crm" | "bank" | "agentik" | "manual" | "external" | "gocem" | "other" | "shopify";

export type KpiSourceValidationStatus =
  // Standard lifecycle
  | "suggested"
  | "assigned"
  | "pending_existence_validation"
  | "exists_confirmed"
  | "fields_confirmed"
  | "query_confirmed"
  | "sag_confirmed"
  | "crm_confirmed"
  | "business_confirmed"
  | "ready_for_integration"
  | "rejected"
  // Bootstrap / historical import statuses
  | "historical_import"
  | "suggested_from_csv"
  | "pending_meeting_validation"
  | "needs_source_confirmation"
  | "unresolved_mapping"
  // Runtime detection statuses (AGENTIK-SAG-RUNTIME-SOURCE-HYDRATION-01)
  // These reflect ACTUAL data in Prisma, not certification readiness.
  | "runtime_detected"     // data exists in Prisma models for this KPI
  | "connected_partial"    // partial integration — e.g. CSV import, not live ODBC
  | "snapshot_detected"    // a snapshot model (CommercialCoverageSnapshot etc.) has data
  | "used_by_agentik"      // Agentik actively uses this data for operational decisions
  // Certification / DBA confirmation
  | "confirmed_with_dba"
  | "production_certified"
  // Replaced by a different source during meeting
  | "replaced";

export type KpiSourceOrigin =
  | "runtime_detected"   // auto-detected from existing Prisma data
  | "csv_bootstrap"      // imported from historical CSV
  | "manual"             // manually added in meeting mode
  | "dba_confirmed";     // confirmed by SAG DBA

export type KpiSourceAction =
  | "confirm_sag"
  | "confirm_crm"
  | "confirm_business"
  | "confirm_exists"
  | "mark_sot"
  | "mark_ready"
  | "reject"
  | "mark_pending"
  // New certification actions
  | "confirm_dba"         // DBA confirmed table/query
  | "certify_production"  // certified for production use
  | "replace_with";       // hypothesis replaced by a different source

export interface BootstrapMetadata {
  importedFromCsv:   true;
  importedAt:        string;
  bootstrapBatchId:  string;
  originalRowNumber: number;
  originalCsvText:   string;
  sagCode:           string;
  sagId:             string;
  classification:    string;
  tipo:              string;
  matchType:         "exact_code" | "name_pattern" | "type_pattern" | "manual" | "unresolved";
  matchConfidence:   number;
  unresolvedFields?: string[];
  // Traceability fields — populated during meeting validation
  replacedBy?:       string;  // sourceId of the replacement
  replacedReason?:   string;
  dbaConfirmedBy?:   string;  // userId
  dbaConfirmedAt?:   string;  // ISO date
  certifiedBy?:      string;
  certifiedAt?:      string;
}

export interface KpiSourceRecord {
  id:                string;
  organizationId:    string;
  kpiKey:            string;
  sourceName:        string;
  sourceType:        KpiSourceType;
  sourceRole:        KpiSourceRole;
  provider:          KpiSourceProvider;
  validationStatus:  KpiSourceValidationStatus;
  description:       string | null;
  tableName:         string | null;
  viewName:          string | null;
  endpoint:          string | null;
  moduleName:        string | null;
  approvedQuery:     string | null;
  approvedFields:    string[] | null;
  approvedFilters:   string[] | null;
  sourceOfTruth:     boolean;
  freshnessMinutes:  number | null;
  expectedFrequency: string | null;
  connectorActive:   boolean;
  queryValidated:    boolean;
  fieldsValidated:   boolean;
  businessValidated: boolean;
  sagValidated:      boolean;
  confidenceScore:   number;
  bootstrapBatchId:  string | null;
  bootstrapMetadata: BootstrapMetadata | null;
  sourceOrigin:      KpiSourceOrigin | null;
  runtimeRowCount:   number | null;
  runtimeLastSyncAt: string | null;
  runtimeConfidence: number | null;
  runtimeLineage:    import("@/lib/operational-map/runtime/runtime-source-lineage-detector").RuntimeSourceLineage | null;
  validatedBy:       string | null;
  validatedAt:       string | null;
  notes:             string | null;
  // Governance fields (AGENTIK-OPS-CERTIFICATION-GOVERNANCE-01)
  sourceContribution:   string | null;
  sourceTruthPriority:  string | null;
  viewType:             string | null;   // consolidated | fuente_1 | fuente_2 | tiendas | web
  createdAt:         string;
  updatedAt:         string;
}

export interface KpiSourceUpsertInput {
  organizationId:    string;
  kpiKey:            string;
  sourceName:        string;
  sourceType:        KpiSourceType;
  sourceRole:        KpiSourceRole;
  provider:          KpiSourceProvider;
  validationStatus?: KpiSourceValidationStatus;
  description?:      string;
  tableName?:        string;
  viewName?:         string;
  endpoint?:         string;
  moduleName?:       string;
  approvedQuery?:    string;
  approvedFields?:   string[];
  approvedFilters?:  string[];
  sourceOfTruth?:    boolean;
  freshnessMinutes?: number;
  expectedFrequency?: string;
  connectorActive?:  boolean;
  queryValidated?:   boolean;
  fieldsValidated?:  boolean;
  businessValidated?: boolean;
  sagValidated?:     boolean;
  bootstrapBatchId?:  string;
  bootstrapMetadata?: Record<string, unknown>;
  sourceOrigin?:      KpiSourceOrigin;
  runtimeRowCount?:   number;
  runtimeLastSyncAt?: Date;
  runtimeConfidence?: number;
  runtimeLineage?:    import("@/lib/operational-map/runtime/runtime-source-lineage-detector").RuntimeSourceLineage;
  notes?:            string;
  // Governance fields
  sourceContribution?:   string;
  sourceTruthPriority?:  string;
  viewType?:             string;
  actorId:           string;
}

export interface KpiSourceUpdateInput {
  validationStatus?: KpiSourceValidationStatus;
  sourceOfTruth?:    boolean;
  description?:      string;
  tableName?:        string;
  viewName?:         string;
  endpoint?:         string;
  moduleName?:       string;
  approvedQuery?:    string;
  approvedFields?:   string[];
  approvedFilters?:  string[];
  expectedFrequency?: string;
  notes?:            string;
  action?:           KpiSourceAction;
  // Governance fields
  sourceContribution?:   string;
  sourceTruthPriority?:  string;
  viewType?:             string;
}

// ─── Delegate guard ───────────────────────────────────────────────────────────

function getDelegate() {
  const d = prisma.operationalKpiSource;
  if (!d) {
    console.warn(
      "[OperationalKpiSource] Prisma delegate not found. " +
      "Run: npx prisma generate && npx prisma db push, then restart the dev server.",
    );
    throw new Error("PRISMA_DELEGATE_MISSING: operationalKpiSource");
  }
  return d;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): KpiSourceRecord {
  return {
    id:                r.id,
    organizationId:    r.organizationId,
    kpiKey:            r.kpiKey,
    sourceName:        r.sourceName,
    sourceType:        r.sourceType as KpiSourceType,
    sourceRole:        r.sourceRole as KpiSourceRole,
    provider:          r.provider as KpiSourceProvider,
    validationStatus:  (r.validationStatus ?? "suggested") as KpiSourceValidationStatus,
    description:       r.description ?? null,
    tableName:         r.tableName ?? null,
    viewName:          r.viewName ?? null,
    endpoint:          r.endpoint ?? null,
    moduleName:        r.moduleName ?? null,
    approvedQuery:     r.approvedQuery ?? null,
    approvedFields:    Array.isArray(r.approvedFields) ? r.approvedFields : null,
    approvedFilters:   Array.isArray(r.approvedFilters) ? r.approvedFilters : null,
    sourceOfTruth:     r.sourceOfTruth,
    freshnessMinutes:  r.freshnessMinutes ?? null,
    expectedFrequency: r.expectedFrequency ?? null,
    connectorActive:   r.connectorActive,
    queryValidated:    r.queryValidated,
    fieldsValidated:   r.fieldsValidated,
    businessValidated: r.businessValidated,
    sagValidated:      r.sagValidated,
    confidenceScore:   r.confidenceScore,
    bootstrapBatchId:  r.bootstrapBatchId ?? null,
    bootstrapMetadata: r.bootstrapMetadata as BootstrapMetadata | null,
    sourceOrigin:      (r.sourceOrigin ?? null) as KpiSourceOrigin | null,
    runtimeRowCount:   r.runtimeRowCount ?? null,
    runtimeLastSyncAt: r.runtimeLastSyncAt?.toISOString() ?? null,
    runtimeConfidence: r.runtimeConfidence ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtimeLineage:    (r.runtimeLineage ?? null) as any,
    validatedBy:       r.validatedBy ?? null,
    validatedAt:       r.validatedAt?.toISOString() ?? null,
    notes:             r.notes ?? null,
    sourceContribution:   r.sourceContribution   ?? null,
    sourceTruthPriority:  r.sourceTruthPriority  ?? null,
    viewType:             r.viewType             ?? null,
    createdAt:         r.createdAt.toISOString(),
    updatedAt:         r.updatedAt.toISOString(),
  };
}

/**
 * Derives default validationStatus when caller does not provide one.
 * Free-text sources (no known table/endpoint) default to pending_existence_validation.
 */
function deriveDefaultValidationStatus(input: Partial<KpiSourceUpsertInput>): KpiSourceValidationStatus {
  if (input.validationStatus) return input.validationStatus;
  // Free-text providers with no concrete location → pending_existence_validation
  const freeTextProviders: KpiSourceProvider[] = ["manual", "external", "other"];
  if (freeTextProviders.includes(input.provider as KpiSourceProvider) && !input.tableName && !input.endpoint && !input.viewName && !input.moduleName) {
    return "pending_existence_validation";
  }
  // Known location → assigned
  if (input.tableName || input.endpoint || input.viewName || input.moduleName) return "assigned";
  return "suggested";
}

// ─── Confidence score ─────────────────────────────────────────────────────────

function computeSourceConfidence(data: Partial<KpiSourceUpsertInput>): number {
  let score = 0;
  if (data.tableName)       score += 25;
  if (data.approvedQuery)   score += 25;
  if (data.approvedFields && (data.approvedFields as string[]).length > 0) score += 20;
  if (data.queryValidated)  score += 10;
  if (data.fieldsValidated) score += 10;
  if (data.sagValidated)    score += 5;
  if (data.businessValidated) score += 5;
  return Math.min(100, score);
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getKpiSources(
  organizationId: string,
  kpiKey?:        string,
): Promise<KpiSourceRecord[]> {
  const rows = await getDelegate().findMany({
    where:   kpiKey ? { organizationId, kpiKey } : { organizationId },
    orderBy: [{ sourceRole: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(mapRow);
}

export async function getKpiSourceById(id: string): Promise<KpiSourceRecord | null> {
  const row = await getDelegate().findUnique({ where: { id } });
  return row ? mapRow(row) : null;
}

export async function getAllKpiSources(organizationId: string): Promise<KpiSourceRecord[]> {
  return getKpiSources(organizationId);
}

export async function upsertKpiSource(input: KpiSourceUpsertInput): Promise<KpiSourceRecord> {
  const confidenceScore    = computeSourceConfidence(input);
  const validationStatus   = deriveDefaultValidationStatus(input);

  const existing = await getDelegate().findFirst({
    where: { organizationId: input.organizationId, kpiKey: input.kpiKey, sourceName: input.sourceName },
  });

  if (input.sourceOfTruth) {
    await getDelegate().updateMany({
      where: { organizationId: input.organizationId, kpiKey: input.kpiKey },
      data:  { sourceOfTruth: false },
    });
  }

  if (existing) {
    const row = await getDelegate().update({
      where: { id: existing.id },
      data: {
        sourceType:        input.sourceType,
        sourceRole:        input.sourceRole,
        provider:          input.provider,
        validationStatus:  validationStatus,
        description:       input.description       ?? existing.description,
        tableName:         input.tableName         ?? existing.tableName,
        viewName:          input.viewName          ?? existing.viewName,
        endpoint:          input.endpoint          ?? existing.endpoint,
        moduleName:        input.moduleName        ?? existing.moduleName,
        approvedQuery:     input.approvedQuery     ?? existing.approvedQuery,
        approvedFields:    (input.approvedFields   ?? existing.approvedFields) as string[] | undefined,
        approvedFilters:   (input.approvedFilters  ?? existing.approvedFilters) as string[] | undefined,
        sourceOfTruth:     input.sourceOfTruth     ?? existing.sourceOfTruth,
        freshnessMinutes:  input.freshnessMinutes  ?? existing.freshnessMinutes,
        expectedFrequency: input.expectedFrequency ?? existing.expectedFrequency,
        connectorActive:   input.connectorActive   ?? existing.connectorActive,
        queryValidated:    input.queryValidated    ?? existing.queryValidated,
        fieldsValidated:   input.fieldsValidated   ?? existing.fieldsValidated,
        businessValidated: input.businessValidated ?? existing.businessValidated,
        sagValidated:      input.sagValidated      ?? existing.sagValidated,
        confidenceScore,
        bootstrapBatchId:   input.bootstrapBatchId  ?? existing.bootstrapBatchId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bootstrapMetadata:  (input.bootstrapMetadata ?? existing.bootstrapMetadata ?? undefined) as any,
        sourceOrigin:       input.sourceOrigin       ?? existing.sourceOrigin,
        runtimeRowCount:    input.runtimeRowCount    ?? existing.runtimeRowCount,
        runtimeLastSyncAt:  input.runtimeLastSyncAt  ?? existing.runtimeLastSyncAt,
        runtimeConfidence:  input.runtimeConfidence  ?? existing.runtimeConfidence,
        runtimeLineage:     (input.runtimeLineage  ?? existing.runtimeLineage  ?? undefined) as any,
        validatedBy:        input.actorId,
        validatedAt:        new Date(),
        notes:              input.notes ?? existing.notes,
      },
    });
    return mapRow(row);
  }

  const row = await getDelegate().create({
    data: {
      organizationId:    input.organizationId,
      kpiKey:            input.kpiKey,
      sourceName:        input.sourceName,
      sourceType:        input.sourceType,
      sourceRole:        input.sourceRole,
      provider:          input.provider,
      validationStatus,
      description:       input.description       ?? null,
      tableName:         input.tableName         ?? null,
      viewName:          input.viewName          ?? null,
      endpoint:          input.endpoint          ?? null,
      moduleName:        input.moduleName        ?? null,
      approvedQuery:     input.approvedQuery     ?? null,
      approvedFields:    input.approvedFields    ?? undefined,
      approvedFilters:   input.approvedFilters   ?? undefined,
      sourceOfTruth:     input.sourceOfTruth     ?? false,
      freshnessMinutes:  input.freshnessMinutes  ?? null,
      expectedFrequency: input.expectedFrequency ?? null,
      connectorActive:   input.connectorActive   ?? false,
      queryValidated:    input.queryValidated    ?? false,
      fieldsValidated:   input.fieldsValidated   ?? false,
      businessValidated: input.businessValidated ?? false,
      sagValidated:      input.sagValidated      ?? false,
      confidenceScore,
      bootstrapBatchId:  input.bootstrapBatchId  ?? null,
      bootstrapMetadata: input.bootstrapMetadata  ? (input.bootstrapMetadata as object) : undefined,
      sourceOrigin:      input.sourceOrigin      ?? null,
      runtimeRowCount:   input.runtimeRowCount   ?? null,
      runtimeLastSyncAt: input.runtimeLastSyncAt ?? null,
      runtimeConfidence: input.runtimeConfidence ?? null,
      runtimeLineage:    (input.runtimeLineage    ?? undefined) as any,
      validatedBy:       input.actorId,
      validatedAt:       new Date(),
      notes:             input.notes             ?? null,
      sourceContribution:   input.sourceContribution   ?? null,
      sourceTruthPriority:  input.sourceTruthPriority  ?? null,
      viewType:             input.viewType             ?? null,
    },
  });
  return mapRow(row);
}

/**
 * Apply a named action or field update to an existing source.
 * Used by the meeting drawer for validation lifecycle transitions.
 */
export async function updateKpiSource(
  id:      string,
  actorId: string,
  input:   KpiSourceUpdateInput,
): Promise<KpiSourceRecord> {
  // Compute status from action if provided
  let validationStatus = input.validationStatus;
  let sagValidated:      boolean | undefined;
  let businessValidated: boolean | undefined;
  let queryValidated:    boolean | undefined;
  let fieldsValidated:   boolean | undefined;

  if (input.action) {
    switch (input.action) {
      case "confirm_sag":
        validationStatus = "sag_confirmed";
        sagValidated     = true;
        queryValidated   = !!(input.tableName);
        fieldsValidated  = !!(input.approvedFields?.length);
        break;
      case "confirm_crm":
        validationStatus  = "crm_confirmed";
        businessValidated = true;
        break;
      case "confirm_business":
        validationStatus  = "business_confirmed";
        businessValidated = true;
        break;
      case "confirm_exists":
        validationStatus = "exists_confirmed";
        break;
      case "mark_ready":
        validationStatus = "ready_for_integration";
        break;
      case "reject":
        validationStatus = "rejected";
        break;
      case "mark_pending":
        validationStatus = "pending_existence_validation";
        break;
      case "confirm_dba":
        validationStatus = "confirmed_with_dba";
        queryValidated   = true;
        fieldsValidated  = !!(input.approvedFields?.length);
        break;
      case "certify_production":
        validationStatus = "production_certified";
        sagValidated     = true;
        queryValidated   = true;
        break;
      case "replace_with":
        validationStatus = "replaced";
        break;
      case "mark_sot":
        // unmark others first
        break;
    }
  }

  if (input.action === "mark_sot" || input.sourceOfTruth) {
    // Get organizationId + kpiKey first
    const existing = await getDelegate().findUnique({ where: { id } });
    if (existing) {
      await getDelegate().updateMany({
        where: { organizationId: existing.organizationId, kpiKey: existing.kpiKey },
        data:  { sourceOfTruth: false },
      });
    }
  }

  const row = await getDelegate().update({
    where: { id },
    data: {
      ...(validationStatus       !== undefined && { validationStatus }),
      ...(input.sourceOfTruth    !== undefined && { sourceOfTruth: input.action === "mark_sot" ? true : input.sourceOfTruth }),
      ...(input.description      !== undefined && { description:       input.description }),
      ...(input.tableName        !== undefined && { tableName:         input.tableName }),
      ...(input.viewName         !== undefined && { viewName:          input.viewName }),
      ...(input.endpoint         !== undefined && { endpoint:          input.endpoint }),
      ...(input.moduleName       !== undefined && { moduleName:        input.moduleName }),
      ...(input.approvedQuery    !== undefined && { approvedQuery:     input.approvedQuery }),
      ...(input.approvedFields   !== undefined && { approvedFields:    input.approvedFields as string[] }),
      ...(input.approvedFilters  !== undefined && { approvedFilters:   input.approvedFilters as string[] }),
      ...(input.expectedFrequency !== undefined && { expectedFrequency: input.expectedFrequency }),
      ...(input.notes                !== undefined && { notes:               input.notes }),
      ...(input.sourceContribution  !== undefined && { sourceContribution:  input.sourceContribution }),
      ...(input.sourceTruthPriority !== undefined && { sourceTruthPriority: input.sourceTruthPriority }),
      ...(input.viewType            !== undefined && { viewType:            input.viewType }),
      ...(sagValidated      !== undefined && { sagValidated }),
      ...(businessValidated !== undefined && { businessValidated }),
      ...(queryValidated    !== undefined && { queryValidated }),
      ...(fieldsValidated   !== undefined && { fieldsValidated }),
      ...(input.action === "mark_sot" && { sourceOfTruth: true }),
      validatedBy:  actorId,
      validatedAt:  new Date(),
    },
  });
  return mapRow(row);
}

export async function confirmSourceSag(
  id:      string,
  actorId: string,
  data: {
    tableName?:      string;
    approvedQuery?:  string;
    approvedFields?: string[];
    approvedFilters?: string[];
    notes?:          string;
  },
): Promise<KpiSourceRecord> {
  return updateKpiSource(id, actorId, {
    action:         "confirm_sag",
    tableName:      data.tableName,
    approvedQuery:  data.approvedQuery,
    approvedFields: data.approvedFields,
    approvedFilters: data.approvedFilters,
    notes:          data.notes,
  });
}

export async function deleteKpiSource(id: string): Promise<void> {
  await getDelegate().delete({ where: { id } });
}
