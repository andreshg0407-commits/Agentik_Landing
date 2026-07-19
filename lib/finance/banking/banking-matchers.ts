/**
 * lib/finance/banking/banking-matchers.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Bank movement ↔ Financial Graph node matching.
 *
 * Match rules (in priority order):
 *   1. BANK_TO_CONSIGNACION  — credit movement ↔ consignación via reference
 *   2. BANK_TO_RECEIPT       — credit movement ↔ recibo de caja via reference or NIT+amount
 *   3. BANK_TO_EGRESO        — debit movement ↔ egreso/gasto via reference or amount
 *   4. BANK_TO_FACTURA       — credit movement ↔ factura via NIT+amount (partial payment)
 *   5. BANK_TO_PAYMENT       — credit movement ↔ anticipo via NIT+amount
 */

import type { BankMovementRecord, BankMatchCandidate, BankMatchType } from "./banking-types";
import type { FinancialNode } from "../graph/graph-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const AMOUNT_TOLERANCE_PCT = 0.02;  // 2% for most matches
const EGRESO_TOLERANCE_PCT = 0.05;  // 5% for egreso (fees, rounding)

// ── Low-level helpers ─────────────────────────────────────────────────────────

function refsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function amountsMatch(a: number, b: number, tol = AMOUNT_TOLERANCE_PCT): boolean {
  if (a === 0 && b === 0) return false;
  const larger = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= larger * tol;
}

function nitsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
  return norm(a) === norm(b);
}

// ── Match rule 1: credit → consignación ──────────────────────────────────────

function matchToConsignacion(
  mv: BankMovementRecord,
  nodes: FinancialNode[],
): BankMatchCandidate | null {
  if (mv.direction !== "credit") return null;

  const consigs = nodes.filter((n) => n.docType === "CONSIGNACION");

  for (const consig of consigs) {
    if (refsMatch(mv.reference, consig.referenceCode)) {
      return {
        graphNodeId: consig.id,
        matchType:   "BANK_TO_CONSIGNACION",
        confidence:  0.95,
        matchedBy:   ["reference"],
        explanation: `Movimiento bancario ${mv.reference} coincide exactamente con consignación ${consig.referenceCode}.`,
      };
    }
    // Fallback: amount match within tolerance
    if (amountsMatch(mv.amount, consig.amount) && consig.entityNit) {
      return {
        graphNodeId: consig.id,
        matchType:   "BANK_TO_CONSIGNACION",
        confidence:  0.70,
        matchedBy:   ["amount"],
        explanation: `Consignación por monto similar: $${mv.amount.toLocaleString("es-CO")}. Verificar referencia.`,
      };
    }
  }

  return null;
}

// ── Match rule 2: credit → recibo de caja ─────────────────────────────────────

function matchToReceipt(
  mv: BankMovementRecord,
  nodes: FinancialNode[],
): BankMatchCandidate | null {
  if (mv.direction !== "credit") return null;

  const recibos = nodes.filter(
    (n) => n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO",
  );

  for (const recibo of recibos) {
    if (refsMatch(mv.reference, recibo.referenceCode)) {
      return {
        graphNodeId: recibo.id,
        matchType:   "BANK_TO_RECEIPT",
        confidence:  0.90,
        matchedBy:   ["reference"],
        explanation: `Recibo ${recibo.referenceCode} identificado por referencia bancaria.`,
      };
    }
    if (
      amountsMatch(mv.amount, recibo.amount) &&
      nitsMatch(mv.sourceDocumentRef, recibo.entityNit)
    ) {
      return {
        graphNodeId: recibo.id,
        matchType:   "BANK_TO_RECEIPT",
        confidence:  0.75,
        matchedBy:   ["amount", "nit"],
        explanation: `Recibo ${recibo.referenceCode ?? recibo.sourceId} — NIT + monto coinciden.`,
      };
    }
  }

  return null;
}

// ── Match rule 3: debit → egreso ───────────────────────────────────────────────

function matchToEgreso(
  mv: BankMovementRecord,
  nodes: FinancialNode[],
): BankMatchCandidate | null {
  if (mv.direction !== "debit") return null;

  const egresos = nodes.filter((n) => n.docType === "EGRESO");

  for (const egreso of egresos) {
    if (refsMatch(mv.reference, egreso.referenceCode)) {
      return {
        graphNodeId: egreso.id,
        matchType:   "BANK_TO_EGRESO",
        confidence:  0.92,
        matchedBy:   ["reference"],
        explanation: `Egreso ${egreso.referenceCode} identificado por referencia bancaria.`,
      };
    }
    if (amountsMatch(mv.amount, egreso.amount, EGRESO_TOLERANCE_PCT)) {
      return {
        graphNodeId: egreso.id,
        matchType:   "BANK_TO_EGRESO",
        confidence:  0.60,
        matchedBy:   ["amount"],
        explanation: `Egreso por monto similar ($${mv.amount.toLocaleString("es-CO")}). Verificar referencia.`,
      };
    }
  }

  return null;
}

// ── Match rule 4: credit → factura (partial/full payment) ────────────────────

function matchToFactura(
  mv: BankMovementRecord,
  nodes: FinancialNode[],
): BankMatchCandidate | null {
  if (mv.direction !== "credit") return null;

  const facturas = nodes.filter((n) => n.docType === "FACTURA");

  for (const factura of facturas) {
    if (
      amountsMatch(mv.amount, factura.amount) &&
      nitsMatch(mv.sourceDocumentRef, factura.entityNit)
    ) {
      return {
        graphNodeId: factura.id,
        matchType:   "BANK_TO_FACTURA",
        confidence:  0.72,
        matchedBy:   ["amount", "nit"],
        explanation: `Factura ${factura.referenceCode ?? factura.sourceId} — pago bancario por NIT + monto.`,
      };
    }
  }

  return null;
}

// ── Match rule 5: credit → anticipo ──────────────────────────────────────────

function matchToPayment(
  mv: BankMovementRecord,
  nodes: FinancialNode[],
): BankMatchCandidate | null {
  if (mv.direction !== "credit") return null;

  const anticipos = nodes.filter((n) => n.docType === "ANTICIPO");

  for (const anticipo of anticipos) {
    if (amountsMatch(mv.amount, anticipo.amount)) {
      return {
        graphNodeId: anticipo.id,
        matchType:   "BANK_TO_PAYMENT",
        confidence:  0.62,
        matchedBy:   ["amount"],
        explanation: `Anticipo por monto ${mv.amount.toLocaleString("es-CO")}. Verificar NIT.`,
      };
    }
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find the best match for a bank movement against all financial graph nodes.
 * Returns the highest-confidence candidate, or null if no match found.
 */
export function findBestMatch(
  movement: BankMovementRecord,
  graphNodes: FinancialNode[],
): BankMatchCandidate | null {
  const candidates: Array<BankMatchCandidate | null> = [
    matchToConsignacion(movement, graphNodes),
    matchToReceipt(movement, graphNodes),
    matchToEgreso(movement, graphNodes),
    matchToFactura(movement, graphNodes),
    matchToPayment(movement, graphNodes),
  ];

  const valid = candidates.filter((c): c is BankMatchCandidate => c !== null);
  if (valid.length === 0) return null;

  return valid.reduce((best, c) => (c.confidence > best.confidence ? c : best));
}

/**
 * Find all candidates for a movement (for review UI — shows all options).
 */
export function findAllCandidates(
  movement: BankMovementRecord,
  graphNodes: FinancialNode[],
): BankMatchCandidate[] {
  const candidates: Array<BankMatchCandidate | null> = [
    matchToConsignacion(movement, graphNodes),
    matchToReceipt(movement, graphNodes),
    matchToEgreso(movement, graphNodes),
    matchToFactura(movement, graphNodes),
    matchToPayment(movement, graphNodes),
  ];

  return candidates
    .filter((c): c is BankMatchCandidate => c !== null)
    .sort((a, b) => b.confidence - a.confidence);
}
