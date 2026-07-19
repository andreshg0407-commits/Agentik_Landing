/**
 * lib/finance/graph/graph-relations.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Relation Engine.
 *
 * Identifies provable relations between financial nodes and creates edges.
 *
 * DESIGN RULE: A relation is only created when at least one of the
 * following match signals is present:
 *   1. Exact document reference match (referenceCode)
 *   2. NIT + amount match (within tolerance)
 *   3. NIT + date proximity (±3 days) + amount match
 *
 * Speculative matches (single weak signal) → UNRESOLVED edge, NOT created.
 * Unresolvable pairs → no edge created (nodes remain with no outEdgeIds).
 */

import type {
  FinancialNode,
  FinancialEdge,
  FinancialEdgeType,
  NodeResolutionStatus,
} from "./graph-types";
import { computeEdgeStatus } from "./graph-status";

// ─────────────────────────────────────────────────────────────────────────────
// MATCH TOLERANCE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Amount tolerance for fuzzy match (as fraction: 0.02 = 2%). */
const AMOUNT_TOLERANCE_PCT = 0.02;

/** Date proximity tolerance for date-based matching (in days). */
const DATE_TOLERANCE_DAYS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// LOW-LEVEL MATCH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function amountsMatch(a: number, b: number, tolerancePct = AMOUNT_TOLERANCE_PCT): boolean {
  if (a === 0 && b === 0) return false; // both zero = no meaningful match
  const larger = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= larger * tolerancePct;
}

function datesProximate(a: Date, b: Date, days = DATE_TOLERANCE_DAYS): boolean {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

function refsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function nitsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  // Normalize: strip leading zeros and non-digits
  const norm = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
  return norm(a) === norm(b);
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

function makeEdgeId(type: FinancialEdgeType, from: string, to: string): string {
  return `${type}:${from}:${to}`;
}

function buildEdge(
  type:         FinancialEdgeType,
  from:         FinancialNode,
  to:           FinancialNode,
  confidence:   number,
  matchFields:  string[],
  status:       NodeResolutionStatus,
  metadata:     Record<string, unknown> = {},
): FinancialEdge {
  const id = makeEdgeId(type, from.id, to.id);
  from.outEdgeIds.push(id);
  to.inEdgeIds.push(id);
  return { id, orgId: from.orgId, type, fromNodeId: from.id, toNodeId: to.id, confidence, status, matchFields, metadata };
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATION RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rule 1: RECIBO_CAJA → FACTURA (via CustomerReceivable)
 * CollectionRecord (recibo) matches CustomerReceivable (factura).
 * Signals: NIT match + amount match + date proximity.
 */
export function resolveRecibosToFacturas(
  recibos:     FinancialNode[], // CollectionRecord nodes
  facturas:    FinancialNode[], // CustomerReceivable nodes
): FinancialEdge[] {
  const edges: FinancialEdge[] = [];

  const reciboSet = recibos.filter(n => n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO");
  const facturaSet = facturas.filter(n => n.docType === "FACTURA");

  for (const recibo of reciboSet) {
    let bestMatch: { node: FinancialNode; conf: number; fields: string[] } | null = null;

    for (const factura of facturaSet) {
      const matchFields: string[] = [];
      let confidence = 0;

      // Signal 1: reference code exact match
      if (refsMatch(recibo.referenceCode, factura.referenceCode)) {
        matchFields.push("referenceCode");
        confidence += 0.5;
      }
      // Signal 2: NIT match
      if (nitsMatch(recibo.entityNit, factura.entityNit)) {
        matchFields.push("entityNit");
        confidence += 0.25;
      }
      // Signal 3: amount match
      if (amountsMatch(recibo.amount, factura.amount)) {
        matchFields.push("amount");
        confidence += 0.25;
      }

      // Need at least reference OR (NIT + amount) to form a relation
      const hasRefMatch    = matchFields.includes("referenceCode");
      const hasNitAndAmt   = matchFields.includes("entityNit") && matchFields.includes("amount");
      if (!hasRefMatch && !hasNitAndAmt) continue;

      if (!bestMatch || confidence > bestMatch.conf) {
        bestMatch = { node: factura, conf: confidence, fields: matchFields };
      }
    }

    if (bestMatch && bestMatch.conf >= 0.5) {
      const status = computeEdgeStatus(bestMatch.conf, bestMatch.fields.length);
      edges.push(buildEdge(
        "FACTURA_TO_RECAUDO",
        recibo, bestMatch.node,
        bestMatch.conf, bestMatch.fields, status,
        { matchedBy: bestMatch.fields },
      ));
    }
  }

  return edges;
}

/**
 * Rule 2: CONSIGNACION → RECIBO_CAJA
 * Bank deposit (consignación) linked to its originating cash receipt.
 * Signal: bankReference in CollectionRecord matches referenceCode.
 */
export function resolveConsignacionToRecibo(
  consignaciones: FinancialNode[], // BANK SYNC_PENDING nodes
  recibos:        FinancialNode[], // RECIBO_CAJA nodes
): FinancialEdge[] {
  const edges: FinancialEdge[] = [];

  for (const consig of consignaciones) {
    if (consig.docType !== "CONSIGNACION") continue;
    const ref = consig.referenceCode;
    if (!ref) continue;

    const match = recibos.find(r =>
      (r.docType === "RECIBO_CAJA" || r.docType === "ANTICIPO") &&
      refsMatch(r.referenceCode, ref),
    );

    if (match) {
      const status = computeEdgeStatus(0.85, 1);
      edges.push(buildEdge(
        "RECIBO_TO_CONSIGNACION",
        match, consig,
        0.85, ["referenceCode"], status,
        { bankReference: ref },
      ));
    }
  }

  return edges;
}

/**
 * Rule 3: NOTA_CREDITO → FACTURA
 * Credit note applied to invoice.
 * Signal: NIT match + amount proximity + date proximity.
 */
export function resolveNotaCreditoToFactura(
  notas:    FinancialNode[], // NOTA_CREDITO nodes
  facturas: FinancialNode[], // FACTURA / CustomerReceivable nodes
): FinancialEdge[] {
  const edges: FinancialEdge[] = [];

  const notaSet    = notas.filter(n => n.docType === "NOTA_CREDITO");
  const facturaSet = facturas.filter(n => n.docType === "FACTURA");

  for (const nota of notaSet) {
    const candidates = facturaSet.filter(f =>
      nitsMatch(nota.entityNit, f.entityNit) &&
      amountsMatch(nota.amount, f.amount, 0.05) && // 5% tolerance for partial credit notes
      datesProximate(nota.date, f.date, 60), // 60 days — credit notes can be issued later
    );

    for (const candidate of candidates) {
      const matchFields = ["entityNit", "amount"];
      if (datesProximate(nota.date, candidate.date, 30)) matchFields.push("date");
      const confidence = 0.7 + (matchFields.length - 2) * 0.1;
      const status = computeEdgeStatus(confidence, matchFields.length);
      edges.push(buildEdge(
        "NOTA_CREDITO_TO_FACTURA",
        nota, candidate,
        confidence, matchFields, status,
      ));
    }
  }

  return edges;
}

/**
 * Rule 4: CRUCE → FACTURA (cartera cross/netting)
 * Cross document applied to receivable.
 * Signal: NIT match + amount proximity.
 */
export function resolveCruceToCartera(
  cruces:   FinancialNode[], // CRUCE nodes
  facturas: FinancialNode[], // CustomerReceivable FACTURA nodes
): FinancialEdge[] {
  const edges: FinancialEdge[] = [];

  for (const cruce of cruces.filter(n => n.docType === "CRUCE")) {
    const candidates = facturas.filter(f =>
      f.docType === "FACTURA" &&
      nitsMatch(cruce.entityNit, f.entityNit) &&
      amountsMatch(cruce.amount, f.amount, 0.10), // 10% tolerance for netting
    );

    for (const candidate of candidates) {
      const matchFields = ["entityNit", "amount"];
      const confidence = 0.65;
      const status = computeEdgeStatus(confidence, matchFields.length);
      edges.push(buildEdge(
        "CRUCE_TO_CARTERA",
        cruce, candidate,
        confidence, matchFields, status,
      ));
    }
  }

  return edges;
}

/**
 * Rule 5: ANTICIPO → FACTURA
 * Advance payment applied to invoice.
 * Signal: NIT match + amount <= factura amount.
 */
export function resolveAnticipoToFactura(
  anticipos: FinancialNode[], // ANTICIPO nodes
  facturas:  FinancialNode[], // FACTURA nodes
): FinancialEdge[] {
  const edges: FinancialEdge[] = [];

  for (const anticipo of anticipos.filter(n => n.docType === "ANTICIPO")) {
    const candidates = facturas.filter(f =>
      f.docType === "FACTURA" &&
      nitsMatch(anticipo.entityNit, f.entityNit) &&
      anticipo.amount <= f.amount * 1.02, // anticipo can't exceed invoice
    );

    for (const candidate of candidates) {
      const confidence = 0.6;
      const status = computeEdgeStatus(confidence, 2);
      edges.push(buildEdge(
        "ANTICIPO_TO_FACTURA",
        anticipo, candidate,
        confidence, ["entityNit", "amountConstraint"], status,
      ));
    }
  }

  return edges;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RELATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs all relation rules across the full node set.
 * Returns all edges that could be established.
 * Mutates nodes' inEdgeIds / outEdgeIds in place.
 */
export function buildAllRelations(nodes: FinancialNode[]): FinancialEdge[] {
  const edges: FinancialEdge[] = [];

  const recibos       = nodes.filter(n => n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO");
  const facturas      = nodes.filter(n => n.docType === "FACTURA");
  const consignaciones = nodes.filter(n => n.docType === "CONSIGNACION");
  const notas         = nodes.filter(n => n.docType === "NOTA_CREDITO");
  const cruces        = nodes.filter(n => n.docType === "CRUCE");
  const anticipos     = nodes.filter(n => n.docType === "ANTICIPO");

  edges.push(...resolveRecibosToFacturas(recibos, facturas));
  edges.push(...resolveConsignacionToRecibo(consignaciones, recibos));
  edges.push(...resolveNotaCreditoToFactura(notas, facturas));
  edges.push(...resolveCruceToCartera(cruces, facturas));
  edges.push(...resolveAnticipoToFactura(anticipos, facturas));

  return edges;
}
