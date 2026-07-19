/**
 * lib/comercial/pedidos/order-versioning.ts
 *
 * Order versioning — creates snapshots on important changes.
 * Pure domain logic — no Prisma, no server-only.
 *
 * Sprint: COMERCIAL-PEDIDOS-ENTERPRISE-05
 */

import type { OrderDraft, OrderLine } from "./order-types";
import type { OrderVersion, OrderVersionDiff } from "./order-core-types";

// ── Create a new version ────────────────────────────────────────────────────

export function createVersion(
  currentVersions: OrderVersion[],
  reason:          string,
  actor:           string,
  diff:            OrderVersionDiff | null,
): OrderVersion {
  const versionNumber = currentVersions.length + 1;

  return {
    versionNumber,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    reason,
    diff,
  };
}

// ── Compute diff between two order states ───────────────────────────────────

export function computeOrderDiff(
  before: OrderDraft,
  after:  OrderDraft,
): OrderVersionDiff | null {
  const changedFields: string[] = [];

  // Header changes
  if (before.header.customerCode !== after.header.customerCode) changedFields.push("customerCode");
  if (before.header.customerName !== after.header.customerName) changedFields.push("customerName");
  if (before.header.sellerName   !== after.header.sellerName)   changedFields.push("sellerName");
  if (before.header.channel      !== after.header.channel)      changedFields.push("channel");
  if (before.header.notes        !== after.header.notes)        changedFields.push("notes");

  // Status changes
  if (before.status    !== after.status)    changedFields.push("status");
  if (before.syncState !== after.syncState) changedFields.push("syncState");

  // Lines
  const beforeActive = before.lines.filter(l => !l.removed);
  const afterActive  = after.lines.filter(l => !l.removed);
  const beforeIds    = new Set(beforeActive.map(l => l.id));
  const afterIds     = new Set(afterActive.map(l => l.id));

  let linesAdded    = 0;
  let linesRemoved  = 0;
  let linesModified = 0;

  for (const id of afterIds) {
    if (!beforeIds.has(id)) linesAdded++;
  }
  for (const id of beforeIds) {
    if (!afterIds.has(id)) linesRemoved++;
  }

  for (const afterLine of afterActive) {
    const beforeLine = beforeActive.find(l => l.id === afterLine.id);
    if (beforeLine && hasLineChanged(beforeLine, afterLine)) {
      linesModified++;
    }
  }

  const previousTotal = before.summary.totalValue;
  const newTotal      = after.summary.totalValue;

  if (linesAdded > 0)    changedFields.push("lines_added");
  if (linesRemoved > 0)  changedFields.push("lines_removed");
  if (linesModified > 0) changedFields.push("lines_modified");

  if (changedFields.length === 0) return null;

  return {
    changedFields,
    linesAdded,
    linesRemoved,
    linesModified,
    previousTotal,
    newTotal,
  };
}

// ── Check if a version should be created ────────────────────────────────────

export function shouldCreateVersion(diff: OrderVersionDiff | null): boolean {
  if (!diff) return false;
  // Create version for any meaningful change
  return diff.changedFields.length > 0;
}

// ── Get latest version number ───────────────────────────────────────────────

export function getLatestVersionNumber(versions: OrderVersion[]): number {
  return versions.length;
}

// ── Internal ────────────────────────────────────────────────────────────────

function hasLineChanged(before: OrderLine, after: OrderLine): boolean {
  return (
    before.quantity  !== after.quantity ||
    before.unitPrice !== after.unitPrice ||
    before.removed   !== after.removed ||
    before.comment   !== after.comment
  );
}
