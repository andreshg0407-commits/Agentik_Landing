/**
 * lib/comercial/frontline/canonical-ar-service.ts
 *
 * AGENTIK-RECEIVABLES-AR-TRUTH-01
 *
 * Canonical AR truth service. Queries vw_agentik_cartera from SAG
 * and produces certified receivable snapshots.
 *
 * Key invariants:
 *   - SALDO_PENDIENTE is pre-computed by SAG (includes all applied collections)
 *   - DIAS_MORA is live-computed by SAG at query time
 *   - Customers with 0 open documents are fully paid (not shown in view)
 *   - No Prisma dependency — pure SAG → domain type transformation
 *   - No mutations — read-only
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import type { SagSource } from "@/lib/connectors/pya/sag-source-router";
import type {
  SagCarteraRow,
  CertifiedReceivableDocument,
  CertifiedCustomerReceivableSnapshot,
  CertifiedArSnapshot,
  CanonicalArResult,
  CustomerArResult,
  ArAgingBand,
} from "./canonical-ar-types";

// ── Row mapping ──────────────────────────────────────────────────────────────

function parseDate(isoStr: string | null): Date | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? null : d;
}

function mapCarteraRow(row: SagCarteraRow): CertifiedReceivableDocument {
  return {
    documento:        row.DOCUMENTO,
    tipoDocumento:    row.TIPO_DOCUMENTO,
    clienteId:        row.CLIENTE_ID,
    clienteName:      row.CLIENTE,
    fechaDocumento:   parseDate(row.FECHA_DOCUMENTO) ?? new Date(0),
    fechaVencimiento: parseDate(row.FECHA_VENCIMIENTO),
    diasMora:         row.DIAS_MORA,
    valorDocumento:   row.VALOR_DOCUMENTO,
    saldoPendiente:   row.SALDO_PENDIENTE,
    estadoCartera:    row.ESTADO_CARTERA,
    ciudad:           row.CIUDAD,
    vendedor:         row.VENDEDOR,
  };
}

// ── Aging band classification ────────────────────────────────────────────────

function classifyAgingBand(diasMora: number | null): string {
  if (diasMora === null || diasMora <= 0) return "CURRENT";
  if (diasMora <= 30) return "1-30";
  if (diasMora <= 60) return "31-60";
  if (diasMora <= 90) return "61-90";
  if (diasMora <= 180) return "91-180";
  if (diasMora <= 365) return "181-365";
  return "365+";
}

function buildAgingBands(docs: CertifiedReceivableDocument[]): ArAgingBand[] {
  const bands = new Map<string, ArAgingBand>();
  const order = ["CURRENT", "1-30", "31-60", "61-90", "91-180", "181-365", "365+"];
  for (const band of order) {
    bands.set(band, { band, docCount: 0, totalPending: 0 });
  }

  for (const doc of docs) {
    if (doc.saldoPendiente <= 0) continue; // skip credit notes with negative balance
    const band = classifyAgingBand(doc.diasMora);
    const entry = bands.get(band)!;
    entry.docCount++;
    entry.totalPending += doc.saldoPendiente;
  }

  return order.map(b => bands.get(b)!);
}

// ── Customer grouping ────────────────────────────────────────────────────────

function groupByCustomer(
  docs: CertifiedReceivableDocument[],
  asOf: Date,
): CertifiedCustomerReceivableSnapshot[] {
  const groups = new Map<number, CertifiedReceivableDocument[]>();

  for (const doc of docs) {
    const existing = groups.get(doc.clienteId);
    if (existing) {
      existing.push(doc);
    } else {
      groups.set(doc.clienteId, [doc]);
    }
  }

  const snapshots: CertifiedCustomerReceivableSnapshot[] = [];

  for (const [clienteId, customerDocs] of groups) {
    let totalPendiente = 0;
    let totalVencido = 0;
    let totalVigente = 0;
    let overdueDocumentCount = 0;
    let maxDiasMora = 0;

    for (const doc of customerDocs) {
      if (doc.saldoPendiente > 0) {
        totalPendiente += doc.saldoPendiente;
        if (doc.diasMora !== null && doc.diasMora > 0) {
          totalVencido += doc.saldoPendiente;
          overdueDocumentCount++;
          if (doc.diasMora > maxDiasMora) maxDiasMora = doc.diasMora;
        } else {
          totalVigente += doc.saldoPendiente;
        }
      }
    }

    snapshots.push({
      clienteId,
      nit: null, // populated by caller if TERCEROS join is needed
      clienteName: customerDocs[0].clienteName,
      totalPendiente,
      totalVencido,
      totalVigente,
      documentCount: customerDocs.length,
      overdueDocumentCount,
      maxDiasMora,
      documents: customerDocs.sort((a, b) => (b.diasMora ?? 0) - (a.diasMora ?? 0)),
      asOf,
      source: "vw_agentik_cartera",
      truthStatus: "CERTIFIED",
    });
  }

  return snapshots.sort((a, b) => b.totalPendiente - a.totalPendiente);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches the full certified AR snapshot from SAG vw_agentik_cartera.
 *
 * This is the canonical source of truth for accounts receivable.
 * SALDO_PENDIENTE is pre-computed by SAG and includes all applied collections.
 *
 * Returns all open receivable documents grouped by customer with aging bands.
 */
export async function fetchCertifiedArSnapshot(
  source: SagSource = "CURRENT",
): Promise<CanonicalArResult> {
  const asOf = new Date();

  let config;
  try {
    config = getSagConnection(source);
  } catch (err) {
    return {
      ok: false,
      error: `SAG connection failed: ${err instanceof Error ? err.message : String(err)}`,
      code: "SAG_UNAVAILABLE",
    };
  }

  let rows: SagCarteraRow[];
  try {
    rows = await consultaSagJson(config, "SELECT * FROM vw_agentik_cartera") as unknown as SagCarteraRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg,
      code: msg.includes("Invalid object name") ? "VIEW_NOT_FOUND" : "SAG_UNAVAILABLE",
    };
  }

  if (!Array.isArray(rows)) {
    return { ok: false, error: "SAG returned non-array result", code: "PARSE_ERROR" };
  }

  const docs = rows.map(mapCarteraRow);
  const customers = groupByCustomer(docs, asOf);
  const agingBands = buildAgingBands(docs);

  // Compute global totals
  let totalOpenAr = 0;
  let totalOverdueAr = 0;
  let totalUnappliedCredits = 0;
  let totalOverdueDocuments = 0;
  const overdueCustomerIds = new Set<number>();
  const openCustomerIds = new Set<number>();

  for (const doc of docs) {
    if (doc.saldoPendiente > 0) {
      totalOpenAr += doc.saldoPendiente;
      openCustomerIds.add(doc.clienteId);
      if (doc.diasMora !== null && doc.diasMora > 0) {
        totalOverdueAr += doc.saldoPendiente;
        totalOverdueDocuments++;
        overdueCustomerIds.add(doc.clienteId);
      }
    } else if (doc.saldoPendiente < 0) {
      totalUnappliedCredits += Math.abs(doc.saldoPendiente);
    }
  }

  const snapshot: CertifiedArSnapshot = {
    asOf,
    sagSource: source,
    totalOpenAr,
    totalOverdueAr,
    totalUnappliedCredits,
    totalOpenDocuments: docs.filter(d => d.saldoPendiente > 0).length,
    totalOverdueDocuments,
    totalOpenCustomers: openCustomerIds.size,
    totalOverdueCustomers: overdueCustomerIds.size,
    agingBands,
    customers,
    source: "vw_agentik_cartera",
    truthStatus: "CERTIFIED",
  };

  return { ok: true, snapshot };
}

/**
 * Fetches certified AR for a single customer by CLIENTE_ID (ka_nl_tercero).
 *
 * Returns null if the customer has no open receivables (fully paid).
 *
 * For richer zero-row semantics, use fetchCustomerArWithStatus().
 */
export async function fetchCertifiedCustomerAr(
  clienteId: number,
  source: SagSource = "CURRENT",
): Promise<CertifiedCustomerReceivableSnapshot | null> {
  const result = await fetchCustomerArWithStatus(clienteId, source);
  if (result.status === "HAS_OPEN_AR") return result.snapshot;
  return null;
}

/**
 * Fetches certified AR for a single customer with explicit zero-row semantics.
 *
 * Zero-row safety:
 *   CERTIFIED_ZERO   — customer found, zero open AR (fully paid)
 *   HAS_OPEN_AR      — customer has open receivable documents
 *   SAG_UNAVAILABLE   — canonical source unreachable
 *   IDENTITY_UNKNOWN — clienteId invalid or not resolvable
 */
export async function fetchCustomerArWithStatus(
  clienteId: number,
  source: SagSource = "CURRENT",
): Promise<CustomerArResult> {
  const asOf = new Date();

  if (!clienteId || clienteId <= 0) {
    return { status: "IDENTITY_UNKNOWN", clienteId };
  }

  let config;
  try {
    config = getSagConnection(source);
  } catch (err) {
    return {
      status: "SAG_UNAVAILABLE",
      error: `SAG connection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let rows: SagCarteraRow[];
  try {
    rows = await consultaSagJson(
      config,
      `SELECT * FROM vw_agentik_cartera WHERE CLIENTE_ID = ${Number(clienteId)}`,
    ) as unknown as SagCarteraRow[];
  } catch (err) {
    return {
      status: "SAG_UNAVAILABLE",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    // Zero rows from cartera could mean:
    //   a) Customer exists and has no open AR (genuine CERTIFIED_ZERO)
    //   b) Customer does not exist in SAG (IDENTITY_UNKNOWN)
    // We must verify existence in TERCEROS before certifying zero.
    try {
      const terceroRows = await consultaSagJson(
        config,
        `SELECT ka_nl_tercero FROM TERCEROS WHERE ka_nl_tercero = ${Number(clienteId)}`,
      ) as unknown as Array<{ ka_nl_tercero: number }>;
      if (!Array.isArray(terceroRows) || terceroRows.length === 0) {
        // Customer does not exist in SAG — not a genuine zero
        return { status: "IDENTITY_UNKNOWN", clienteId };
      }
    } catch {
      // If TERCEROS check fails, we cannot certify — fall back to SAG_UNAVAILABLE
      return { status: "SAG_UNAVAILABLE", error: "TERCEROS existence check failed" };
    }
    // Customer confirmed in TERCEROS + 0 cartera rows = genuine fully paid.
    // vw_agentik_cartera filters WHERE n_saldo_actual <> 0.00,
    // so 0 rows means all invoices are fully paid.
    // AMV LLANO (856) is the canonical proof: 330 recaudos, 0 cartera rows = fully paid.
    return { status: "CERTIFIED_ZERO", clienteId, asOf };
  }

  const docs = rows.map(mapCarteraRow);
  const customers = groupByCustomer(docs, asOf);
  const snapshot = customers[0];
  if (!snapshot) {
    return { status: "CERTIFIED_ZERO", clienteId, asOf };
  }

  return { status: "HAS_OPEN_AR", snapshot };
}
