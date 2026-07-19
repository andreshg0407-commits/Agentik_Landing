/**
 * lib/finance/banking/banking-integrity.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Banking integrity engine.
 *
 * Detects anomalies in bank movements and reconciliation state.
 * All checks are non-destructive reads.
 */

import type {
  BankMovementRecord,
  BankIntegrityIssue,
  BankIntegrityIssueType,
} from "./banking-types";

let _counter = 0;
function makeId(type: BankIntegrityIssueType): string {
  return `${type}:${++_counter}`;
}

// ── Detector 1: Duplicate movements ──────────────────────────────────────────
// Same reference + same amount + same direction within the same account.

export function detectDuplicateMovements(
  movements: BankMovementRecord[],
): BankIntegrityIssue[] {
  const issues: BankIntegrityIssue[] = [];
  const now = new Date();

  const withRef = movements.filter((m) => m.reference);
  const byKey   = new Map<string, BankMovementRecord[]>();

  for (const m of withRef) {
    const key = `${m.bankAccountId}:${m.reference!.toUpperCase()}:${m.direction}`;
    const group = byKey.get(key) ?? [];
    group.push(m);
    byKey.set(key, group);
  }

  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    issues.push({
      id:          makeId("DUPLICATE_MOVEMENT"),
      orgId:       group[0].organizationId,
      type:        "DUPLICATE_MOVEMENT",
      severity:    "critical",
      movementIds: group.map((m) => m.id),
      message:     `${group.length} movimientos con referencia duplicada "${group[0].reference}". Revisar importación.`,
      detectedAt:  now,
      metadata: {
        reference: group[0].reference,
        count:     group.length,
        accountId: group[0].bankAccountId,
      },
    });
  }

  return issues;
}

// ── Detector 2: Unmatched consignaciones ──────────────────────────────────────
// Credit movements of type CONSIGNACION that haven't been matched to a graph node.

export function detectUnmatchedConsignaciones(
  movements: BankMovementRecord[],
): BankIntegrityIssue[] {
  const issues: BankIntegrityIssue[] = [];
  const now = new Date();

  const unmatched = movements.filter(
    (m) =>
      m.direction === "credit" &&
      m.sourceDocumentType === "CONSIGNACION" &&
      !m.matched,
  );

  if (unmatched.length > 0) {
    const total = unmatched.reduce((s, m) => s + m.amount, 0);
    issues.push({
      id:          makeId("UNMATCHED_CONSIGNACION"),
      orgId:       unmatched[0].organizationId,
      type:        "UNMATCHED_CONSIGNACION",
      severity:    "warning",
      movementIds: unmatched.map((m) => m.id),
      message:     `${unmatched.length} consignaciones bancarias sin match en sistema. Total: $${(total / 1_000_000).toFixed(2)}M.`,
      detectedAt:  now,
      metadata:    { count: unmatched.length, totalAmount: total },
    });
  }

  return issues;
}

// ── Detector 3: Orphan transfers ──────────────────────────────────────────────
// Debit movements marked as transfers with no corresponding credit movement.

export function detectOrphanTransfers(
  movements: BankMovementRecord[],
): BankIntegrityIssue[] {
  const issues: BankIntegrityIssue[] = [];
  const now = new Date();

  const debits  = movements.filter((m) => m.direction === "debit"  && m.reference);
  const credits = movements.filter((m) => m.direction === "credit" && m.reference);
  const creditRefs = new Set(credits.map((m) => m.reference!.toUpperCase()));

  for (const debit of debits) {
    if (!creditRefs.has(debit.reference!.toUpperCase())) {
      // Debit has no paired credit — potential orphan transfer
      issues.push({
        id:          makeId("ORPHAN_TRANSFER"),
        orgId:       debit.organizationId,
        type:        "ORPHAN_TRANSFER",
        severity:    "info",
        movementIds: [debit.id],
        message:     `Débito ${debit.reference} sin crédito correspondiente. Monto: $${(debit.amount / 1_000_000).toFixed(2)}M.`,
        detectedAt:  now,
        metadata:    { reference: debit.reference, amount: debit.amount },
      });
    }
  }

  return issues;
}

// ── Detector 4: Invalid balance ───────────────────────────────────────────────
// Movements where balanceAfter doesn't match expected running total.

export function detectInvalidBalances(
  movements: BankMovementRecord[],
  openingBalance: number,
): BankIntegrityIssue[] {
  const issues: BankIntegrityIssue[] = [];
  const now = new Date();

  // Sort by date ascending to reconstruct balance
  const sorted = [...movements]
    .filter((m) => m.balanceAfter !== null)
    .sort((a, b) => a.movementDate.getTime() - b.movementDate.getTime());

  let running = openingBalance;

  for (const m of sorted) {
    const expected = m.direction === "credit"
      ? running + m.amount
      : running - m.amount;

    const delta = Math.abs(expected - m.balanceAfter!);
    // Tolerance: 1 COP (rounding)
    if (delta > 1) {
      issues.push({
        id:          makeId("INVALID_BALANCE"),
        orgId:       m.organizationId,
        type:        "INVALID_BALANCE",
        severity:    delta > 10_000 ? "critical" : "warning",
        movementIds: [m.id],
        message:     `Balance inconsistente en movimiento ${m.reference ?? m.id}: esperado $${expected.toLocaleString("es-CO")}, reportado $${m.balanceAfter!.toLocaleString("es-CO")}.`,
        detectedAt:  now,
        metadata:    { expected, reported: m.balanceAfter, delta },
      });
    }

    running = m.balanceAfter ?? expected;
  }

  return issues;
}

// ── Detector 5: Missing references ───────────────────────────────────────────
// Movements above threshold (>1M COP) with no reference code.

export function detectMissingReferences(
  movements: BankMovementRecord[],
  thresholdAmount = 1_000_000,
): BankIntegrityIssue[] {
  const issues: BankIntegrityIssue[] = [];
  const now = new Date();

  const noRef = movements.filter(
    (m) => !m.reference && m.amount >= thresholdAmount,
  );

  for (const m of noRef) {
    issues.push({
      id:          makeId("MISSING_REFERENCE"),
      orgId:       m.organizationId,
      type:        "MISSING_REFERENCE",
      severity:    "info",
      movementIds: [m.id],
      message:     `Movimiento de $${(m.amount / 1_000_000).toFixed(2)}M sin referencia bancaria. Conciliación manual requerida.`,
      detectedAt:  now,
      metadata:    { amount: m.amount, direction: m.direction, date: m.movementDate },
    });
  }

  return issues;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runBankIntegrityChecks(
  movements:      BankMovementRecord[],
  openingBalance: number,
): BankIntegrityIssue[] {
  _counter = 0; // reset per run

  return [
    ...detectDuplicateMovements(movements),
    ...detectUnmatchedConsignaciones(movements),
    ...detectOrphanTransfers(movements),
    ...detectInvalidBalances(movements, openingBalance),
    ...detectMissingReferences(movements),
  ];
}
