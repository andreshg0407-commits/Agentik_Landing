/**
 * domains/customer/customer-commercial-assignment.ts
 *
 * Normalizes raw SAG/CRM data into a CustomerCommercialAssignment.
 * Handles lookup resolution, sales rep conflict detection, and evidence.
 *
 * Sprint: CUSTOMER-SAG-ENRICHMENT-02
 */

import type {
  CustomerCommercialAssignment,
  ResolvedLookup,
  FieldEvidence,
  AssignmentConflict,
  LookupTable,
  SalesRepInput,
} from "./customer-entities";
import { resolveSalesRep, resolveLookup } from "./customer-entities";
import type { CommercialIdentity, CommercialTimestamp, DataSourceMetadata } from "../../contracts";
import { buildCanonicalId } from "../../shared/identifiers";
import { normalizeNullableString } from "../../shared/normalizers";

// ── Raw Input ────────────────────────────────────────────────────────────────

export interface CommercialAssignmentRawInput {
  readonly customerTaxId: string;

  // Sales rep (SAG)
  readonly vendedor?: unknown;
  readonly nitVendedor?: unknown;

  // Sales rep (CRM)
  readonly crmAssignedUserName?: unknown;
  readonly crmAssignedUserId?: unknown;

  // Supervisor
  readonly supervisor?: unknown;

  // Lookups
  readonly canal?: unknown;
  readonly zona?: unknown;
  readonly territorio?: unknown;
  readonly segmento?: unknown;
  readonly segmentoNombre?: unknown;
  readonly listaPrecios?: unknown;
  readonly ruta?: unknown;
  readonly clasificacion?: unknown;
  readonly tipoCliente?: unknown;
}

// ── Lookup Tables ────────────────────────────────────────────────────────────

export interface CommercialAssignmentLookups {
  readonly zones?: LookupTable | null;
  readonly channels?: LookupTable | null;
  readonly segments?: LookupTable | null;
  readonly priceLists?: LookupTable | null;
  readonly routes?: LookupTable | null;
  readonly classifications?: LookupTable | null;
  readonly territories?: LookupTable | null;
}

// ── Normalization Context ────────────────────────────────────────────────────

export interface CommercialAssignmentContext {
  readonly tenantId: string;
  readonly sourceSystem: string;
  readonly instanceId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly correlationId: string;
  readonly extractedAt: Date;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function normalizeCommercialAssignment(
  raw: CommercialAssignmentRawInput,
  ctx: CommercialAssignmentContext,
  lookups: CommercialAssignmentLookups = {}
): CustomerCommercialAssignment {
  const now = ctx.extractedAt;
  const conflicts: AssignmentConflict[] = [];

  // ── Identity ───────────────────────────────────────────────────────────
  const identity: CommercialIdentity = {
    canonicalId: buildCanonicalId({
      tenantId: ctx.tenantId,
      domain: "CUSTOMER",
      entityType: "CommercialAssignment",
      naturalKey: raw.customerTaxId,
    }),
    tenantId: ctx.tenantId,
    domain: "CUSTOMER",
    naturalKey: raw.customerTaxId,
  };

  const sourceMetadata: DataSourceMetadata = {
    sourceType: ctx.sourceSystem as any,
    adapterId: ctx.adapterId,
    adapterVersion: ctx.adapterVersion,
    extractedAt: ctx.extractedAt,
    extractionMode: "FULL",
    correlationId: ctx.correlationId,
  };

  const timestamps: CommercialTimestamp = {
    createdAt: now,
    updatedAt: now,
    sourceModifiedAt: null,
    lastSyncAt: ctx.extractedAt,
  };

  // ── Sales Rep Resolution (FASE 5) ──────────────────────────────────────
  const repInput: SalesRepInput = {
    sagVendedorName: str(raw.vendedor),
    sagVendedorNit: str(raw.nitVendedor),
    crmAssignedUserName: str(raw.crmAssignedUserName),
    crmAssignedUserId: str(raw.crmAssignedUserId),
  };
  const repResult = resolveSalesRep(repInput, now);
  if (repResult.conflict) conflicts.push(repResult.conflict);

  // ── Supervisor ─────────────────────────────────────────────────────────
  const supervisorName = str(raw.supervisor);
  const supervisorEvidence: FieldEvidence | null = supervisorName
    ? { source: "SAG", quality: "CONFIRMED", observedAt: now, rawValue: raw.supervisor, confidence: 0.8, note: null }
    : null;

  // ── Lookup Resolutions (FASE 6) ────────────────────────────────────────
  const zoneResult = resolveLookup(str(raw.zona), lookups.zones ?? null, "SAG", now);
  const channelResult = resolveLookup(str(raw.canal), lookups.channels ?? null, "SAG", now);
  const territoryResult = resolveLookup(str(raw.territorio), lookups.territories ?? null, "SAG", now);
  const priceListResult = resolveLookup(str(raw.listaPrecios), lookups.priceLists ?? null, "SAG", now);
  const routeResult = resolveLookup(str(raw.ruta), lookups.routes ?? null, "SAG", now);
  const classificationResult = resolveLookup(str(raw.clasificacion) ?? str(raw.tipoCliente), lookups.classifications ?? null, "SAG", now);

  // Segment: use segmentoNombre if available, otherwise lookup
  const segCode = str(raw.segmento);
  const segName = str(raw.segmentoNombre);
  let segmentLookup: ResolvedLookup | null = null;
  let segmentEvidence: FieldEvidence | null = null;
  if (segCode) {
    if (segName) {
      segmentLookup = { code: segCode.toUpperCase(), name: segName, resolved: true };
      segmentEvidence = { source: "SAG", quality: "CONFIRMED", observedAt: now, rawValue: raw.segmento, confidence: 1.0, note: null };
    } else {
      const result = resolveLookup(segCode, lookups.segments ?? null, "SAG", now);
      segmentLookup = result.lookup;
      segmentEvidence = result.evidence;
    }
  }

  return {
    identity,
    sourceMetadata,
    timestamps,
    schemaVersion: 1,
    customerTaxId: raw.customerTaxId,

    salesRepName: repResult.salesRepName,
    salesRepCode: repResult.salesRepCode,
    salesRepTaxId: repResult.salesRepTaxId,
    salesRepEvidence: repResult.evidence,

    supervisorName,
    supervisorCode: null,
    supervisorEvidence,

    channel: channelResult.lookup,
    channelEvidence: channelResult.evidence,

    zone: zoneResult.lookup,
    zoneEvidence: zoneResult.evidence,

    territory: territoryResult.lookup,
    territoryEvidence: territoryResult.evidence,

    segment: segmentLookup,
    segmentEvidence,

    priceList: priceListResult.lookup,
    priceListEvidence: priceListResult.evidence,

    route: routeResult.lookup,
    routeEvidence: routeResult.evidence,

    classification: classificationResult.lookup,
    classificationEvidence: classificationResult.evidence,

    conflicts,
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v == null) return null;
  const result = normalizeNullableString(v);
  return result.ok ? result.value : null;
}
