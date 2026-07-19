/**
 * lib/finance/graph/graph-integrity/integrity-engine.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Integrity Engine.
 *
 * Detects financial integrity violations across the graph.
 * Each detector returns zero or more FinancialIntegrityIssue instances.
 *
 * All issues are non-destructive reads — no data is modified.
 */

import type {
  FinancialNode,
  FinancialEdge,
  FinancialIntegrityIssue,
  IntegrityIssueType,
} from "../graph-types";

let _issueCounter = 0;
function makeIssueId(type: IntegrityIssueType): string {
  return `${type}:${++_issueCounter}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 1: ORPHAN DOCUMENTS
// Nodes with no inEdges AND no outEdges AND not SYNC_PENDING.
// ─────────────────────────────────────────────────────────────────────────────

export function detectOrphanDocuments(
  nodes: FinancialNode[],
): FinancialIntegrityIssue[] {
  const issues: FinancialIntegrityIssue[] = [];
  const now = new Date();

  for (const node of nodes) {
    if (node.status === "SYNC_PENDING") continue;
    if (node.inEdgeIds.length > 0 || node.outEdgeIds.length > 0) continue;
    // Nodes that are expected to have relations but don't
    const isRelationExpected = ["RECIBO_CAJA", "ANTICIPO", "NOTA_CREDITO", "CRUCE"].includes(node.docType);
    if (!isRelationExpected) continue;

    issues.push({
      id:         makeIssueId("ORPHAN_DOCUMENT"),
      orgId:      node.orgId,
      type:       "ORPHAN_DOCUMENT",
      severity:   "warning",
      nodeIds:    [node.id],
      message:    `${node.docType} ${node.referenceCode ?? node.sourceId} sin contrapartida detectada. Monto: ${node.amount > 0 ? `$${(node.amount / 1_000_000).toFixed(2)}M` : "—"}.`,
      detectedAt: now,
      metadata: {
        docType:       node.docType,
        amount:        node.amount,
        date:          node.date,
        sourceSystem:  node.sourceSystem,
      },
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 2: DUPLICATE RECEIPTS
// CollectionRecord nodes with identical referenceCode for the same org.
// ─────────────────────────────────────────────────────────────────────────────

export function detectDuplicateReceipts(
  nodes: FinancialNode[],
): FinancialIntegrityIssue[] {
  const issues: FinancialIntegrityIssue[] = [];
  const now = new Date();

  const recibos = nodes.filter(n =>
    (n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO") &&
    n.referenceCode,
  );

  // Group by referenceCode
  const byRef = new Map<string, FinancialNode[]>();
  for (const r of recibos) {
    const key = `${r.orgId}:${r.referenceCode!.toUpperCase()}`;
    const group = byRef.get(key) ?? [];
    group.push(r);
    byRef.set(key, group);
  }

  for (const [, group] of byRef) {
    if (group.length < 2) continue;
    const totalAmount = group.reduce((s, n) => s + n.amount, 0);
    issues.push({
      id:         makeIssueId("DUPLICATE_RECEIPT"),
      orgId:      group[0].orgId,
      type:       "DUPLICATE_RECEIPT",
      severity:   "critical",
      nodeIds:    group.map(n => n.id),
      message:    `${group.length} recibos con referencia duplicada "${group[0].referenceCode}". Monto total: $${(totalAmount / 1_000_000).toFixed(2)}M.`,
      detectedAt: now,
      metadata:   { referenceCode: group[0].referenceCode, count: group.length, totalAmount },
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 3: INVOICE WITHOUT PAYMENT
// CustomerReceivable FACTURA nodes that are OPEN + overdue + no inEdges.
// ─────────────────────────────────────────────────────────────────────────────

export function detectInvoicesWithoutPayment(
  nodes: FinancialNode[],
): FinancialIntegrityIssue[] {
  const issues: FinancialIntegrityIssue[] = [];
  const now = new Date();

  const overdueInvoices = nodes.filter(n =>
    n.docType === "FACTURA" &&
    n.sourceSystem === "PYA" &&
    n.inEdgeIds.length === 0 &&
    n.status !== "SYNC_PENDING" &&
    // daysOverdue is in metadata
    ((n.metadata.daysOverdue as number) ?? 0) > 0,
  );

  for (const inv of overdueInvoices) {
    const daysOverdue = (inv.metadata.daysOverdue as number) ?? 0;
    const severity = daysOverdue > 90 ? "critical" : daysOverdue > 30 ? "warning" : "info";
    issues.push({
      id:         makeIssueId("INVOICE_WITHOUT_PAYMENT"),
      orgId:      inv.orgId,
      type:       "INVOICE_WITHOUT_PAYMENT",
      severity,
      nodeIds:    [inv.id],
      message:    `Factura ${inv.referenceCode ?? inv.sourceId} sin pago registrado. Vencida hace ${daysOverdue} días. Saldo: $${(inv.amount / 1_000_000).toFixed(2)}M.`,
      detectedAt: now,
      metadata: {
        invoiceRef:  inv.referenceCode,
        amount:      inv.amount,
        entityNit:   inv.entityNit,
        entityName:  inv.entityName,
        daysOverdue,
        agingBucket: inv.metadata.agingBucket,
      },
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 4: PAYMENT WITHOUT INVOICE
// CollectionRecord nodes (recibos) with no outEdges and appliedFacts empty.
// ─────────────────────────────────────────────────────────────────────────────

export function detectPaymentsWithoutInvoice(
  nodes: FinancialNode[],
): FinancialIntegrityIssue[] {
  const issues: FinancialIntegrityIssue[] = [];
  const now = new Date();

  const unapplied = nodes.filter(n =>
    n.sourceSystem === "SAG" &&
    (n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO") &&
    n.outEdgeIds.length === 0 &&
    !n.metadata.hasAppliedFacts,
  );

  for (const pmt of unapplied) {
    issues.push({
      id:         makeIssueId("PAYMENT_WITHOUT_INVOICE"),
      orgId:      pmt.orgId,
      type:       "PAYMENT_WITHOUT_INVOICE",
      severity:   "warning",
      nodeIds:    [pmt.id],
      message:    `Recibo ${pmt.referenceCode ?? pmt.sourceId} sin factura asociada y sin aplicación registrada. Monto: $${(pmt.amount / 1_000_000).toFixed(2)}M.`,
      detectedAt: now,
      metadata: {
        referenceCode: pmt.referenceCode,
        amount:        pmt.amount,
        entityNit:     pmt.entityNit,
        date:          pmt.date,
        comprobanteCode: pmt.metadata.comprobanteCode,
      },
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 5: INVALID CROSSES
// CRUCE nodes where the amount doesn't match any related factura within tolerance.
// ─────────────────────────────────────────────────────────────────────────────

export function detectInvalidCrosses(
  nodes:  FinancialNode[],
  edges:  FinancialEdge[],
): FinancialIntegrityIssue[] {
  const issues: FinancialIntegrityIssue[] = [];
  const now = new Date();

  const cruces = nodes.filter(n => n.docType === "CRUCE");

  for (const cruce of cruces) {
    if (cruce.outEdgeIds.length === 0) {
      // Cross with no matched factura
      issues.push({
        id:         makeIssueId("INVALID_CROSS"),
        orgId:      cruce.orgId,
        type:       "INVALID_CROSS",
        severity:   "warning",
        nodeIds:    [cruce.id],
        message:    `Cruce ${cruce.referenceCode ?? cruce.sourceId} sin factura contrapartida identificada. Revisar manualmente.`,
        detectedAt: now,
        metadata:   { amount: cruce.amount, entityNit: cruce.entityNit },
      });
      continue;
    }

    // Check if the matched edge has low confidence
    const cruceEdges = edges.filter(e => e.fromNodeId === cruce.id);
    for (const edge of cruceEdges) {
      if (edge.confidence < 0.5) {
        issues.push({
          id:         makeIssueId("INVALID_CROSS"),
          orgId:      cruce.orgId,
          type:       "INVALID_CROSS",
          severity:   "info",
          nodeIds:    [cruce.id, edge.toNodeId],
          message:    `Cruce ${cruce.referenceCode ?? cruce.sourceId} con baja confianza (${Math.round(edge.confidence * 100)}%). Requiere validación manual.`,
          detectedAt: now,
          metadata:   { confidence: edge.confidence, matchFields: edge.matchFields },
        });
      }
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 6: MISSING BANK SYNC
// CONSIGNACION nodes that are SYNC_PENDING (no bank model to confirm).
// Informational — not a data error, but a sync gap.
// ─────────────────────────────────────────────────────────────────────────────

export function detectMissingBankSync(
  nodes: FinancialNode[],
): FinancialIntegrityIssue[] {
  const issues: FinancialIntegrityIssue[] = [];
  const now = new Date();

  const pendingBanks = nodes.filter(n =>
    n.docType === "CONSIGNACION" && n.status === "SYNC_PENDING",
  );

  if (pendingBanks.length > 0) {
    const totalPending = pendingBanks.reduce((s, n) => s + n.amount, 0);
    issues.push({
      id:         makeIssueId("MISSING_BANK_SYNC"),
      orgId:      pendingBanks[0].orgId,
      type:       "MISSING_BANK_SYNC",
      severity:   "info",
      nodeIds:    pendingBanks.map(n => n.id),
      message:    `${pendingBanks.length} consignaciones pendientes de confirmación bancaria. Total: $${(totalPending / 1_000_000).toFixed(2)}M. Integración BankAccount requerida.`,
      detectedAt: now,
      metadata: {
        count:        pendingBanks.length,
        totalAmount:  totalPending,
        note:         "BankAccount model not created. Direct bank confirmation unavailable.",
      },
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN INTEGRITY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function runIntegrityChecks(
  nodes: FinancialNode[],
  edges: FinancialEdge[],
): FinancialIntegrityIssue[] {
  _issueCounter = 0; // reset per run

  return [
    ...detectOrphanDocuments(nodes),
    ...detectDuplicateReceipts(nodes),
    ...detectInvoicesWithoutPayment(nodes),
    ...detectPaymentsWithoutInvoice(nodes),
    ...detectInvalidCrosses(nodes, edges),
    ...detectMissingBankSync(nodes),
  ];
}
