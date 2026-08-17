/**
 * lib/comercial/clientes/clientes-pure.ts
 *
 * Pure functions extracted from client-loader.ts and cliente-360-loader.ts.
 * NO server-only, NO Prisma, NO infrastructure dependencies.
 *
 * Production code and tests import from this same file.
 */

import { resolveCanonicalDocumentKind } from "./document-source-profiles";

// ── Types ────────────────────────────────────────────────────────────────────

export type ClienteCarteraState = "HAS_OPEN_AR" | "CERTIFIED_ZERO" | "CERTIFIED_CREDIT_BALANCE" | "UNVERIFIED";

export type ArDataState = "CERTIFIED" | "UNVERIFIED" | "UNAVAILABLE";

/** Minimal AR context shape needed by pure functions */
export interface ArContextCore {
  dataState: ArDataState;
  arLookup: Map<number, { clienteId: number; totalPendiente: number; totalVencido: number; creditBalance: number; netReceivable: number }>;
}

// ── resolveRowCartera ────────────────────────────────────────────────────────

export function resolveRowCartera(
  arCtx: ArContextCore,
  sagTerceroId: number | null | undefined,
): { totalReceivable: number | null; overdueReceivable: number | null; carteraState: ClienteCarteraState } {
  if (arCtx.dataState !== "CERTIFIED") {
    return { totalReceivable: null, overdueReceivable: null, carteraState: "UNVERIFIED" };
  }

  if (sagTerceroId == null || sagTerceroId <= 0) {
    return { totalReceivable: null, overdueReceivable: null, carteraState: "UNVERIFIED" };
  }

  const arSnap = arCtx.arLookup.get(sagTerceroId);
  if (arSnap) {
    if (arSnap.netReceivable > 0) {
      return {
        totalReceivable: arSnap.netReceivable,
        overdueReceivable: arSnap.totalVencido,
        carteraState: "HAS_OPEN_AR",
      };
    }
    if (arSnap.netReceivable < 0) {
      // Net credit balance — credits exceed gross receivables
      return {
        totalReceivable: arSnap.netReceivable,
        overdueReceivable: 0,
        carteraState: "CERTIFIED_CREDIT_BALANCE",
      };
    }
    // netReceivable === 0 — gross and credits cancel out, or no balance
    return { totalReceivable: 0, overdueReceivable: 0, carteraState: "CERTIFIED_ZERO" };
  }

  // Customer exists in SAG but not in cartera → CERTIFIED_ZERO
  return { totalReceivable: 0, overdueReceivable: 0, carteraState: "CERTIFIED_ZERO" };
}

// ── classifyAgingBand ────────────────────────────────────────────────────────

export function classifyAgingBand(diasMora: number | null): string | null {
  if (diasMora === null) return null;  // unknown mora — do NOT classify as CURRENT
  if (diasMora <= 0) return "CURRENT";
  if (diasMora <= 30) return "1-30";
  if (diasMora <= 60) return "31-60";
  if (diasMora <= 90) return "61-90";
  if (diasMora <= 180) return "91-180";
  if (diasMora <= 365) return "181-365";
  return "365+";
}

// ── mapCertifiedDocToReceivable ──────────────────────────────────────────────

export interface CertifiedDocInput {
  documento: string;
  tipoDocumento: string;
  valorDocumento: number;
  saldoPendiente: number;
  diasMora: number | null;
  fechaDocumento: Date;
  fechaVencimiento: Date | null;
}

export interface ReceivableOutput {
  id: string;
  erpId: string | null;
  /** Document type label for display (e.g. "Factura F2", "Nota crédito D2") */
  documentType: string;
  originalAmount: number;
  /** Paid amount from vw_agentik_recaudos evidence. Null when no recaudos data available */
  paidAmount: number | null;
  balanceDue: number;
  invoiceDate: string | null;
  dueDate: string | null;
  daysOverdue: number | null;
  agingBucket: string | null;
  status: string;
}

/**
 * Classifies tipoDocumento from SAG into a display label.
 *
 * Delegates to resolveCanonicalDocumentKind with the specified source profile.
 * Default profile: "castillitos" (current active tenant).
 *
 * FUENTES contract enforced per-tenant via document-source-profiles.ts.
 */
export function classifyDocumentType(tipoDocumento: string, documento: string, profileId: string = "castillitos"): string {
  const result = resolveCanonicalDocumentKind(profileId, { documento, tipoDocumento });
  return result.label;
}

export function mapCertifiedDocToReceivable(doc: CertifiedDocInput): ReceivableOutput {
  return {
    id: `sag-${doc.documento}`,
    erpId: doc.documento,
    documentType: classifyDocumentType(doc.tipoDocumento, doc.documento),
    originalAmount: doc.valorDocumento,
    paidAmount: null,  // NEVER infer by difference — must come from vw_agentik_recaudos
    balanceDue: doc.saldoPendiente,
    invoiceDate: doc.fechaDocumento.toISOString(),
    dueDate: doc.fechaVencimiento?.toISOString() ?? null,
    daysOverdue: doc.diasMora,  // preserve null — do NOT coerce to 0
    agingBucket: classifyAgingBand(doc.diasMora),
    status: doc.saldoPendiente < 0 ? "CREDIT"
      : doc.saldoPendiente === 0 ? "CLOSED"
      : (doc.diasMora !== null && doc.diasMora > 0) ? "OVERDUE"
      : "OPEN",
  };
}

// ── carteraTrafficLight ──────────────────────────────────────────────────────

export interface CarteraTrafficLightInput {
  truthStatus: string;
  totalBalance: number | null;
  items: { daysOverdue: number | null; balanceDue: number }[];
}

export function carteraTrafficLight(receivables: CarteraTrafficLightInput): { label: string; color: string } {
  // UNVERIFIED — cannot assess health
  if (receivables.truthStatus !== "CERTIFIED") {
    return { label: "No verificada", color: "inkGhost" };
  }
  // CERTIFIED but totalBalance=null → data inconsistency, treat as unverified
  if (receivables.totalBalance === null) {
    return { label: "Dato inconsistente", color: "inkGhost" };
  }
  // CERTIFIED_ZERO — genuinely no cartera ($0 confirmed by SAG)
  if (receivables.totalBalance === 0) {
    return { label: "Sin cartera", color: "inkGhost" };
  }
  // Credit balance — customer has saldo a favor, not open receivables
  if (receivables.totalBalance < 0) {
    return { label: "Saldo a favor", color: "inkMid" };
  }
  // HAS_OPEN_AR — assess overdue status from items with known mora
  const itemsWithKnownMora = receivables.items.filter(r => r.daysOverdue != null);
  if (itemsWithKnownMora.length === 0) {
    return { label: "Vencimiento no verificado", color: "inkMid" };
  }
  const overdueItems = itemsWithKnownMora.filter(r => r.daysOverdue! > 0);
  if (overdueItems.length === 0) {
    return { label: "Al dia", color: "green" };
  }
  const maxDaysOverdue = Math.max(...overdueItems.map(r => r.daysOverdue!));
  const overdueBalance = overdueItems.reduce((s, r) => s + r.balanceDue, 0);
  const overdueRatio = overdueBalance / receivables.totalBalance!;
  if (maxDaysOverdue > 90 || overdueRatio > 0.5) {
    return { label: "Critica", color: "red" };
  }
  return { label: "En mora", color: "amber" };
}

// ── computeClientScore ───────────────────────────────────────────────────────

export interface ClientScoreInput {
  crmQuoteCount: number;
  sagOrderCount: number;
  salesCount: number;
  sellerConfidence: number;
  arCertified: boolean;
  totalOverdue: number | null;
  totalBalance: number | null;
  /** Opportunity types present (e.g. ["cartera", "inactividad"]) */
  opportunityTypes: string[];
}

export function computeClientScore(input: ClientScoreInput): { grade: string; incomplete: boolean } {
  let score = 0;

  // AR data is complete only when certified AND both totals are non-null.
  // certified=true + balance=null is an inconsistent state — no AR points.
  const arComplete =
    input.arCertified &&
    input.totalBalance !== null &&
    input.totalOverdue !== null;

  // Activity
  if (input.crmQuoteCount > 0) score += 20;
  if (input.sagOrderCount > 0) score += 15;
  if (input.salesCount > 0) score += 15;

  // Seller
  if (input.sellerConfidence >= 80) score += 15;
  else if (input.sellerConfidence >= 50) score += 8;

  // Receivables health — ONLY award points when AR data is complete
  if (arComplete) {
    if (input.totalOverdue === 0 && input.totalBalance! > 0) score += 20;
    else if (input.totalOverdue === 0) score += 10;
  }

  // Low risk — cartera absence-of-risk only valid when AR data is complete
  // Inactivity can be evaluated independently (has its own data source)
  const hasCarteraRisk = input.opportunityTypes.includes("cartera");
  const hasInactivityRisk = input.opportunityTypes.includes("inactividad");

  if (arComplete && !hasCarteraRisk) score += 10;
  if (!hasInactivityRisk) score += 5;

  let grade: string;
  if (score >= 85) grade = "A+";
  else if (score >= 70) grade = "A";
  else if (score >= 55) grade = "B+";
  else if (score >= 40) grade = "B";
  else if (score >= 25) grade = "C";
  else grade = "D";

  return { grade, incomplete: !arComplete };
}

// ── Loader core functions (injectable deps for testability) ──────────────────

/** Shape of a customer in the AR snapshot */
export interface ArSnapshotCustomer {
  clienteId: number;
  totalPendiente: number;
  totalVencido: number;
  creditBalance: number;
  netReceivable: number;
}

/** Shape of the full AR snapshot */
export interface ArSnapshotData {
  customers: ArSnapshotCustomer[];
  asOf: Date;
}

/** Result from fetchCertifiedArSnapshot — ok:true with data, or ok:false with error */
export type ArFetchResult =
  | { ok: true; snapshot: ArSnapshotData }
  | { ok: false; error: string };

/** Full AR context with snapshot (superset of ArContextCore) */
export interface ArContextFull extends ArContextCore {
  snapshot: ArSnapshotData | null;
  arCustomerIds: Set<number>;
  overdueCustomerIds: Set<number>;
  asOf: string;
  reason: string;
}

/** Injectable dependencies for loadArContext */
export interface LoadArContextDeps {
  isCertified: (orgId: string) => boolean;
  fetchSnapshot: () => Promise<ArFetchResult>;
}

/**
 * Core logic of loadArContext — testable with injected dependencies.
 * Production wraps this with real Prisma/SAG deps.
 */
export async function loadArContextCore(
  organizationId: string,
  deps: LoadArContextDeps,
): Promise<ArContextFull> {
  const certified = deps.isCertified(organizationId);

  if (!certified) {
    return {
      dataState: "UNVERIFIED",
      snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set(),
      overdueCustomerIds: new Set(),
      asOf: new Date().toISOString(),
      reason: "TENANT_NOT_CERTIFIED",
    };
  }

  let arResult: ArFetchResult;
  try {
    arResult = await deps.fetchSnapshot();
  } catch (err: any) {
    return {
      dataState: "UNAVAILABLE",
      snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set(),
      overdueCustomerIds: new Set(),
      asOf: new Date().toISOString(),
      reason: err?.message ?? "FETCH_EXCEPTION",
    };
  }

  if (!arResult.ok) {
    return {
      dataState: "UNAVAILABLE",
      snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set(),
      overdueCustomerIds: new Set(),
      asOf: new Date().toISOString(),
      reason: arResult.error,
    };
  }

  const arLookup = new Map<number, ArSnapshotCustomer>();
  const arCustomerIds = new Set<number>();
  const overdueCustomerIds = new Set<number>();

  for (const c of arResult.snapshot.customers) {
    arLookup.set(c.clienteId, c);
    // Only customers with positive net receivable count as "open AR"
    if (c.netReceivable > 0) {
      arCustomerIds.add(c.clienteId);
      if (c.totalVencido > 0) {
        overdueCustomerIds.add(c.clienteId);
      }
    }
  }

  return {
    dataState: "CERTIFIED",
    snapshot: arResult.snapshot,
    arLookup,
    arCustomerIds,
    overdueCustomerIds,
    asOf: arResult.snapshot.asOf.toISOString(),
    reason: "SAG_CERTIFIED",
  };
}

/** Injectable deps for loadClientesSummary core */
export interface SummaryDbDeps {
  queryProfileAgg: (orgId: string) => Promise<{
    total: number; active: number; inactive: number;
    withSeller: number; sinCompra90d: number; withCrm: number;
  }>;
  countDistinctProfiles: (orgId: string, sagIds: number[]) => Promise<number>;
}

/** Core logic of loadClientesSummary — testable */
export async function loadClientesSummaryCoreLogic(
  organizationId: string,
  arCtx: ArContextFull,
  deps: SummaryDbDeps,
): Promise<{
  total: number; active: number; inactive: number;
  withSeller: number; withCartera: number | null; withOverdue: number | null;
  sinCompra90d: number; withCrm: number;
  dataState: ArDataState; arAsOf: string | null; loadFailed: boolean;
}> {
  try {
    const agg = await deps.queryProfileAgg(organizationId);

    let withCartera: number | null = null;
    let withOverdue: number | null = null;

    if (arCtx.dataState === "CERTIFIED" && arCtx.arCustomerIds.size > 0) {
      const carteraIds = [...arCtx.arCustomerIds];
      const overdueIds = [...arCtx.overdueCustomerIds];

      const [carteraCount, overdueCount] = await Promise.all([
        deps.countDistinctProfiles(organizationId, carteraIds),
        overdueIds.length > 0
          ? deps.countDistinctProfiles(organizationId, overdueIds)
          : Promise.resolve(0),
      ]);

      withCartera = carteraCount;
      withOverdue = overdueCount;
    } else if (arCtx.dataState === "CERTIFIED") {
      withCartera = 0;
      withOverdue = 0;
    }

    return {
      ...agg,
      withCartera,
      withOverdue,
      dataState: arCtx.dataState,
      arAsOf: arCtx.dataState === "CERTIFIED" ? arCtx.asOf : null,
      loadFailed: false,
    };
  } catch {
    return {
      total: 0, active: 0, inactive: 0,
      withSeller: 0, withCartera: null, withOverdue: null,
      sinCompra90d: 0, withCrm: 0,
      dataState: "UNAVAILABLE",
      arAsOf: null,
      loadFailed: true,
    };
  }
}

/** Core logic of loadClientesPage filter guard for con_cartera */
export function resolveConCarteraFilter(
  arCtx: ArContextCore & { arCustomerIds: Set<number> },
): { allowed: false; dataState: ArDataState } | { allowed: true; sagIds: number[] } {
  if (arCtx.dataState !== "CERTIFIED" || arCtx.arCustomerIds.size === 0) {
    return { allowed: false, dataState: arCtx.dataState };
  }
  return { allowed: true, sagIds: [...arCtx.arCustomerIds] };
}
