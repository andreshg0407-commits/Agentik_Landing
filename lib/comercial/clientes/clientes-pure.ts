/**
 * lib/comercial/clientes/clientes-pure.ts
 *
 * Pure functions extracted from client-loader.ts and cliente-360-loader.ts.
 * NO server-only, NO Prisma, NO infrastructure dependencies.
 *
 * Production code and tests import from this same file.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ClienteCarteraState = "HAS_OPEN_AR" | "CERTIFIED_ZERO" | "UNVERIFIED";

export type ArDataState = "CERTIFIED" | "UNVERIFIED" | "UNAVAILABLE";

/** Minimal AR context shape needed by pure functions */
export interface ArContextCore {
  dataState: ArDataState;
  arLookup: Map<number, { clienteId: number; totalPendiente: number; totalVencido: number }>;
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
    return {
      totalReceivable: arSnap.totalPendiente,
      overdueReceivable: arSnap.totalVencido,
      carteraState: "HAS_OPEN_AR",
    };
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
  valorDocumento: number;
  saldoPendiente: number;
  diasMora: number | null;
  fechaDocumento: Date;
  fechaVencimiento: Date | null;
}

export interface ReceivableOutput {
  id: string;
  erpId: string | null;
  originalAmount: number;
  paidAmount: number;
  balanceDue: number;
  invoiceDate: string | null;
  dueDate: string | null;
  daysOverdue: number | null;
  agingBucket: string | null;
  status: string;
}

export function mapCertifiedDocToReceivable(doc: CertifiedDocInput): ReceivableOutput {
  return {
    id: `sag-${doc.documento}`,
    erpId: doc.documento,
    originalAmount: doc.valorDocumento,
    paidAmount: doc.valorDocumento - doc.saldoPendiente,
    balanceDue: doc.saldoPendiente,
    invoiceDate: doc.fechaDocumento.toISOString(),
    dueDate: doc.fechaVencimiento?.toISOString() ?? null,
    daysOverdue: doc.diasMora,  // preserve null — do NOT coerce to 0
    agingBucket: classifyAgingBand(doc.diasMora),
    status: doc.saldoPendiente <= 0 ? "CLOSED"
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
  // CERTIFIED_ZERO — genuinely no cartera
  if (receivables.totalBalance === null || receivables.totalBalance === 0) {
    return { label: "Sin cartera", color: "inkGhost" };
  }
  // HAS_OPEN_AR — assess overdue status from items with known mora
  const itemsWithKnownMora = receivables.items.filter(r => r.daysOverdue != null);
  if (itemsWithKnownMora.length === 0) {
    return { label: "Mora no disponible", color: "inkMid" };
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

  // Activity
  if (input.crmQuoteCount > 0) score += 20;
  if (input.sagOrderCount > 0) score += 15;
  if (input.salesCount > 0) score += 15;

  // Seller
  if (input.sellerConfidence >= 80) score += 15;
  else if (input.sellerConfidence >= 50) score += 8;

  // Receivables health — ONLY award points when AR is certified
  if (input.arCertified) {
    if ((input.totalOverdue ?? 0) === 0 && (input.totalBalance ?? 0) > 0) score += 20;
    else if ((input.totalOverdue ?? 0) === 0) score += 10;
  }

  // Low risk — ONLY count absence of cartera risk when certified
  const riskTypes = input.opportunityTypes.filter(t => t === "cartera" || t === "inactividad");
  const hasCarteraRisk = riskTypes.includes("cartera");
  const hasInactivityRisk = riskTypes.includes("inactividad");

  // Cartera absence-of-risk only valid when certified
  // Inactivity can be evaluated independently (has its own data source)
  let lowRiskPoints = 0;
  if (input.arCertified && !hasCarteraRisk) lowRiskPoints += 10;
  if (!hasInactivityRisk) lowRiskPoints += 5;
  score += lowRiskPoints;

  let grade: string;
  if (score >= 85) grade = "A+";
  else if (score >= 70) grade = "A";
  else if (score >= 55) grade = "B+";
  else if (score >= 40) grade = "B";
  else if (score >= 25) grade = "C";
  else grade = "D";

  return { grade, incomplete: !input.arCertified };
}
