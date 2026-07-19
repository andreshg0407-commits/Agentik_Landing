/**
 * lib/comercial/pedidos/order-dedup-engine.ts
 *
 * Deduplication engine for hybrid SAG-Agentik order model.
 * Pure domain logic — no Prisma, no server-only.
 *
 * Before importing a SAG order, this engine attempts to match it
 * against existing Agentik orders using multiple strategies:
 *
 * 1. externalSyncKey — exact match (confidence: exact)
 * 2. sagOrderId — exact match (confidence: exact)
 * 3. Cross-reference — configurable external ID match (confidence: high)
 * 4. Strong match — customer + date + seller + lines similarity (confidence: medium/high)
 *
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 */

import type { OrderDraft, OrderLine } from "./order-types";
import type { DedupMatchResult, DedupConfidence } from "./order-core-types";

// ── Main entry: find a match for a candidate SAG order ──────────────────────

export function findDedupMatch(
  candidate: SagOrderCandidate,
  existingOrders: OrderDraft[],
): DedupMatchResult {
  const noMatch: DedupMatchResult = {
    matched:         false,
    existingOrderId: null,
    method:          null,
    confidence:      null,
    score:           0,
    reasons:         [],
  };

  if (existingOrders.length === 0) return noMatch;

  // Strategy 1: externalSyncKey
  if (candidate.externalSyncKey) {
    const match = existingOrders.find(
      o => o.externalSyncKey === candidate.externalSyncKey,
    );
    if (match) {
      return {
        matched:         true,
        existingOrderId: match.id,
        method:          "external_sync_key",
        confidence:      "exact",
        score:           100,
        reasons:         [`externalSyncKey coincide: ${candidate.externalSyncKey}`],
      };
    }
  }

  // Strategy 2: sagOrderId
  if (candidate.sagOrderId) {
    const match = existingOrders.find(
      o => o.sagOrderId === candidate.sagOrderId,
    );
    if (match) {
      return {
        matched:         true,
        existingOrderId: match.id,
        method:          "sag_order_id",
        confidence:      "exact",
        score:           100,
        reasons:         [`sagOrderId coincide: ${candidate.sagOrderId}`],
      };
    }
  }

  // Strategy 3: Cross-reference (configurable external ID)
  if (candidate.crossReferenceId) {
    const match = existingOrders.find(o => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (o as any).crossReferenceId === candidate.crossReferenceId;
    });
    if (match) {
      return {
        matched:         true,
        existingOrderId: match.id,
        method:          "cross_reference",
        confidence:      "high",
        score:           95,
        reasons:         [`Referencia cruzada coincide: ${candidate.crossReferenceId}`],
      };
    }
  }

  // Strategy 4: Strong match — customer + date proximity + seller + lines
  const strongMatch = findStrongMatch(candidate, existingOrders);
  if (strongMatch) return strongMatch;

  return noMatch;
}

// ── Strong match: heuristic comparison ──────────────────────────────────────

function findStrongMatch(
  candidate: SagOrderCandidate,
  existingOrders: OrderDraft[],
): DedupMatchResult | null {
  let bestMatch: { order: OrderDraft; score: number; reasons: string[] } | null = null;

  for (const order of existingOrders) {
    if (order.status === "cancelado") continue;

    const { score, reasons } = computeMatchScore(candidate, order);

    if (score >= STRONG_MATCH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { order, score, reasons };
    }
  }

  if (!bestMatch) return null;

  const confidence: DedupConfidence = bestMatch.score >= 90 ? "high" : "medium";

  return {
    matched:         true,
    existingOrderId: bestMatch.order.id,
    method:          "strong_match",
    confidence,
    score:           bestMatch.score,
    reasons:         bestMatch.reasons,
  };
}

// ── Score computation ───────────────────────────────────────────────────────

const STRONG_MATCH_THRESHOLD = 70;

function computeMatchScore(
  candidate: SagOrderCandidate,
  order: OrderDraft,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Customer match (30 points)
  if (candidate.customerCode && order.header.customerCode) {
    if (candidate.customerCode.toUpperCase() === order.header.customerCode.toUpperCase()) {
      score += 30;
      reasons.push(`Mismo cliente: ${candidate.customerCode}`);
    }
  }

  // Seller match (15 points)
  if (candidate.sellerName && order.header.sellerName) {
    if (candidate.sellerName.trim().toLowerCase() === order.header.sellerName.trim().toLowerCase()) {
      score += 15;
      reasons.push(`Mismo vendedor: ${candidate.sellerName}`);
    }
  }

  // Date proximity (20 points)
  if (candidate.orderDate) {
    const candidateDay = candidate.orderDate.slice(0, 10); // YYYY-MM-DD
    const orderDay     = order.createdAt.slice(0, 10);
    if (candidateDay === orderDay) {
      score += 20;
      reasons.push(`Misma fecha: ${candidateDay}`);
    } else {
      const diffMs = Math.abs(
        new Date(candidateDay).getTime() - new Date(orderDay).getTime(),
      );
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays <= 1) {
        score += 10;
        reasons.push(`Fecha cercana: ${candidateDay} vs ${orderDay}`);
      }
    }
  }

  // Lines similarity (35 points)
  const lineSimilarity = computeLineSimilarity(candidate.lines, order.lines);
  const lineScore = Math.round(lineSimilarity * 35);
  score += lineScore;
  if (lineSimilarity >= 0.8) {
    reasons.push(`Lineas coinciden al ${Math.round(lineSimilarity * 100)}%`);
  } else if (lineSimilarity >= 0.5) {
    reasons.push(`Lineas similares al ${Math.round(lineSimilarity * 100)}%`);
  }

  return { score, reasons };
}

// ── Line similarity: Jaccard-like coefficient on ref|size|color keys ────────

function computeLineSimilarity(
  candidateLines: SagOrderCandidateLine[],
  orderLines: OrderLine[],
): number {
  const activeOrderLines = orderLines.filter(l => !l.removed);

  if (candidateLines.length === 0 && activeOrderLines.length === 0) return 1;
  if (candidateLines.length === 0 || activeOrderLines.length === 0) return 0;

  const candidateKeys = new Set(
    candidateLines.map(l => lineKey(l.referenceCode, l.size, l.color)),
  );
  const orderKeys = new Set(
    activeOrderLines.map(l => lineKey(l.referenceCode, l.size, l.color)),
  );

  let intersection = 0;
  for (const key of candidateKeys) {
    if (orderKeys.has(key)) intersection++;
  }

  const union = new Set([...candidateKeys, ...orderKeys]).size;
  return union > 0 ? intersection / union : 0;
}

function lineKey(ref: string, size: string, color: string): string {
  return `${(ref ?? "").toUpperCase()}|${(size ?? "").toUpperCase()}|${(color ?? "").toUpperCase()}`;
}

// ── Candidate types (what SAG gives us) ─────────────────────────────────────

export interface SagOrderCandidate {
  sagOrderId:         string;
  externalSyncKey:    string | null;
  crossReferenceId:   string | null;
  customerCode:       string;
  customerName:       string;
  sellerCode:         string;
  sellerName:         string;
  orderDate:          string;
  totalValue:         number;
  lines:              SagOrderCandidateLine[];
}

export interface SagOrderCandidateLine {
  referenceCode:  string;
  productName:    string;
  size:           string;
  color:          string;
  quantity:       number;
  unitPrice:      number;
  lineTotal:      number;
}
