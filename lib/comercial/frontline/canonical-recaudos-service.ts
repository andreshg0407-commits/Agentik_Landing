/**
 * lib/comercial/frontline/canonical-recaudos-service.ts
 *
 * AGENTIK-RECEIVABLES-AR-TRUTH-01
 *
 * Canonical collection applications service. Queries vw_agentik_recaudos from SAG
 * and produces certified collection snapshots at document level.
 *
 * Key invariants:
 *   - VALOR_RECAUDADO positive = payment, negative = credit note / reversal
 *   - ID_RECAUDO is NOT unique per row (same for multi-document applications)
 *   - DOCUMENTO_RELACIONADO links to vw_agentik_cartera.DOCUMENTO
 *   - No Prisma dependency — pure SAG → domain type transformation
 *   - No mutations — read-only
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import type { SagSource } from "@/lib/connectors/pya/sag-source-router";
import type {
  SagRecaudoRow,
  CertifiedCollectionApplication,
  CertifiedCustomerCollectionSnapshot,
  CanonicalRecaudosResult,
} from "./canonical-ar-types";

// ── Row mapping ──────────────────────────────────────────────────────────────

function parseDate(isoStr: string | null): Date | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? null : d;
}

function mapRecaudoRow(row: SagRecaudoRow): CertifiedCollectionApplication {
  return {
    idRecaudo:            row.ID_RECAUDO,
    fechaRecaudo:         parseDate(row.FECHA_RECAUDO) ?? new Date(0),
    clienteId:            row.CLIENTE_ID,
    clienteName:          row.CLIENTE,
    documentoRelacionado: row.DOCUMENTO_RELACIONADO,
    valorRecaudado:       row.VALOR_RECAUDADO,
    montoNoAplicado:      row.MONTO_NO_APLICADO,
    banco:                row.BANCO,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches certified collection applications for a customer from SAG vw_agentik_recaudos.
 *
 * Returns null if the customer has no collection applications.
 */
export async function fetchCertifiedCustomerRecaudos(
  clienteId: number,
  source: SagSource = "CURRENT",
): Promise<CanonicalRecaudosResult> {
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

  let rows: SagRecaudoRow[];
  try {
    rows = await consultaSagJson(
      config,
      `SELECT * FROM vw_agentik_recaudos WHERE CLIENTE_ID = ${Number(clienteId)} ORDER BY FECHA_RECAUDO DESC`,
    ) as unknown as SagRecaudoRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg,
      code: msg.includes("Invalid object name") ? "VIEW_NOT_FOUND" : "SAG_UNAVAILABLE",
    };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: true,
      snapshot: {
        clienteId,
        clienteName: "",
        totalRecaudado: 0,
        totalCreditos: 0,
        totalNeto: 0,
        totalNoAplicado: 0,
        applicationCount: 0,
        documentCount: 0,
        applications: [],
        asOf,
        source: "vw_agentik_recaudos",
        truthStatus: "CERTIFIED",
      },
    };
  }

  const applications = rows.map(mapRecaudoRow);

  let totalRecaudado = 0;
  let totalCreditos = 0;
  let totalNoAplicado = 0;
  const distinctDocs = new Set<string>();

  for (const app of applications) {
    if (app.valorRecaudado >= 0) {
      totalRecaudado += app.valorRecaudado;
    } else {
      totalCreditos += Math.abs(app.valorRecaudado);
    }
    totalNoAplicado += app.montoNoAplicado;
    distinctDocs.add(app.documentoRelacionado);
  }

  return {
    ok: true,
    snapshot: {
      clienteId,
      clienteName: applications[0].clienteName,
      totalRecaudado,
      totalCreditos,
      totalNeto: totalRecaudado - totalCreditos,
      totalNoAplicado,
      applicationCount: applications.length,
      documentCount: distinctDocs.size,
      applications,
      asOf,
      source: "vw_agentik_recaudos",
      truthStatus: "CERTIFIED",
    },
  };
}

/**
 * Fetches collection applications for a specific document.
 * Returns all recaudos where DOCUMENTO_RELACIONADO matches the given document number.
 */
export async function fetchDocumentCollections(
  documentoRelacionado: string,
  clienteId: number,
  source: SagSource = "CURRENT",
): Promise<CertifiedCollectionApplication[]> {
  let config;
  try {
    config = getSagConnection(source);
  } catch {
    return [];
  }

  try {
    const rows = await consultaSagJson(
      config,
      `SELECT * FROM vw_agentik_recaudos WHERE DOCUMENTO_RELACIONADO = '${documentoRelacionado.replace(/'/g, "''")}' AND CLIENTE_ID = ${Number(clienteId)} ORDER BY FECHA_RECAUDO DESC`,
    ) as unknown as SagRecaudoRow[];

    if (!Array.isArray(rows)) return [];
    return rows.map(mapRecaudoRow);
  } catch {
    return [];
  }
}
