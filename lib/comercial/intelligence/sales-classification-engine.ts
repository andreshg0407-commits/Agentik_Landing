/**
 * lib/comercial/intelligence/sales-classification-engine.ts
 *
 * Commercial Sales Classification Engine.
 *
 * Determines the sales channel (DETAL vs MAYORISTA) for each transaction
 * using multiple evidence sources, confidence scoring, and explainability.
 *
 * Design principles:
 *   - Multi-evidence scoring (not rigid rules on a single field)
 *   - Supports partial evidence (degrades gracefully)
 *   - Per-tenant configuration (different tenants have different data)
 *   - Full explainability (every decision has traceable reasoning)
 *   - Fail-safe: insufficient evidence = PENDIENTE, never a wrong guess
 *
 * Sprint: COMMERCIAL-SALES-CLASSIFICATION-ENGINE-01
 */

import type {
  SalesChannel,
  SalesClassificationResult,
  ClassificationEvidence,
  ClassificationInput,
  BulkClassificationInput,
  BulkClassificationResult,
  EvidenceStrength,
  PriceComparisonInput,
  SaleOriginInput,
  CustomerTypeInput,
  OperationTypeInput,
} from "./sales-classification-types";
import type { SalesClassificationConfig } from "./sales-classification-config";
import { getSalesClassificationConfig } from "./sales-classification-config";

// ── Public API ──────────────────────────────────────────────────────────────

export function classifySale(
  input: ClassificationInput,
  tenantId: string,
): SalesClassificationResult {
  const config = getSalesClassificationConfig(tenantId);
  return classifySaleWithConfig(input, config);
}

export function classifySaleWithConfig(
  input: ClassificationInput,
  config: SalesClassificationConfig,
): SalesClassificationResult {
  const evidence: ClassificationEvidence[] = [];

  // Collect evidence from all available sources
  evidence.push(evaluatePriceComparison(input.price ?? null, config));
  evidence.push(evaluateSaleOrigin(input.origin ?? null, config));
  evidence.push(evaluateCustomerType(input.customer ?? null, config));
  evidence.push(evaluateOperationType(input.operation ?? null, config));

  // Price list evidence — no data source exists yet, always UNAVAILABLE
  evidence.push({
    type: "price_list",
    strength: "UNAVAILABLE",
    weight: config.evidenceWeights.price_list,
    detalScore: 0,
    mayoristaScore: 0,
    reasoning: "No price list field available in schema",
    dataAvailable: false,
  });

  // Calculate weighted scores
  const availableEvidence = evidence.filter(e => e.dataAvailable);
  const availableCount = availableEvidence.length;

  if (availableCount < config.minEvidenceSources) {
    return {
      channel: "PENDIENTE",
      confidence: 0,
      score: { detal: 0, mayorista: 0 },
      evidence,
      channelPending: true,
    };
  }

  const totalWeight = availableEvidence.reduce((s, e) => s + e.weight, 0);

  if (totalWeight === 0) {
    return {
      channel: "PENDIENTE",
      confidence: 0,
      score: { detal: 0, mayorista: 0 },
      evidence,
      channelPending: true,
    };
  }

  let detalScore = 0;
  let mayoristaScore = 0;

  for (const e of availableEvidence) {
    const normalizedWeight = e.weight / totalWeight;
    detalScore += e.detalScore * normalizedWeight;
    mayoristaScore += e.mayoristaScore * normalizedWeight;
  }

  // Determine channel and confidence
  const maxScore = Math.max(detalScore, mayoristaScore);
  const spread = Math.abs(detalScore - mayoristaScore);

  // Confidence is based on evidence strength and score spread
  const strengthBonus = computeStrengthBonus(availableEvidence);
  const confidence = Math.min(1, (spread * 0.6 + maxScore * 0.2 + strengthBonus * 0.2));

  if (confidence < config.confidenceThreshold) {
    return {
      channel: "PENDIENTE",
      confidence: Math.round(confidence * 100) / 100,
      score: {
        detal: Math.round(detalScore * 100) / 100,
        mayorista: Math.round(mayoristaScore * 100) / 100,
      },
      evidence,
      channelPending: true,
    };
  }

  const channel: SalesChannel = detalScore >= mayoristaScore ? "DETAL" : "MAYORISTA";

  return {
    channel,
    confidence: Math.round(confidence * 100) / 100,
    score: {
      detal: Math.round(detalScore * 100) / 100,
      mayorista: Math.round(mayoristaScore * 100) / 100,
    },
    evidence,
    channelPending: false,
  };
}

// ── Bulk classification ─────────────────────────────────────────────────────

export function classifyBulk(
  input: BulkClassificationInput,
  tenantId: string,
): BulkClassificationResult {
  const config = getSalesClassificationConfig(tenantId);
  const lineResults = input.lines.map(line => classifySaleWithConfig(line, config));

  const detalLines = lineResults.filter(r => r.channel === "DETAL").length;
  const mayoristaLines = lineResults.filter(r => r.channel === "MAYORISTA").length;
  const pendingLines = lineResults.filter(r => r.channel === "PENDIENTE").length;

  let dominantChannel: SalesChannel;
  if (detalLines > mayoristaLines) {
    dominantChannel = "DETAL";
  } else if (mayoristaLines > detalLines) {
    dominantChannel = "MAYORISTA";
  } else {
    dominantChannel = "PENDIENTE";
  }

  const avgConfidence = lineResults.length > 0
    ? lineResults.reduce((s, r) => s + r.confidence, 0) / lineResults.length
    : 0;

  return {
    referenceCode: input.referenceCode,
    dominantChannel,
    confidence: Math.round(avgConfidence * 100) / 100,
    totalLines: input.lines.length,
    detalLines,
    mayoristaLines,
    pendingLines,
    lineResults,
  };
}

// ── Evidence evaluators ─────────────────────────────────────────────────────

function evaluatePriceComparison(
  input: PriceComparisonInput | null,
  config: SalesClassificationConfig,
): ClassificationEvidence {
  if (!input || input.unitValue <= 0) {
    return unavailable("price_comparison", config.evidenceWeights.price_comparison, "No unit value available");
  }

  const { unitValue, pricePV3, pricePV4 } = input;
  const hasPV3 = pricePV3 !== null && pricePV3 > 0;
  const hasPV4 = pricePV4 !== null && pricePV4 > 0;

  if (!hasPV3 && !hasPV4) {
    return unavailable("price_comparison", config.evidenceWeights.price_comparison, "No PV3/PV4 reference prices available");
  }

  const tolerance = config.priceTolerance;
  let detalScore = 0;
  let mayoristaScore = 0;
  const reasons: string[] = [];

  // Compare against PV3 (detal price)
  if (hasPV3) {
    const pv3 = pricePV3!;
    const pv3Diff = Math.abs(unitValue - pv3) / pv3;

    if (pv3Diff <= tolerance) {
      detalScore += 0.9;
      reasons.push(`unitValue ${unitValue} matches PV3 ${pv3} within ${(tolerance * 100).toFixed(0)}% (diff: ${(pv3Diff * 100).toFixed(1)}%)`);
    } else if (unitValue > pv3) {
      detalScore += 0.3;
      reasons.push(`unitValue ${unitValue} > PV3 ${pv3} — possible detal with surcharge`);
    }
  }

  // Compare against PV4 (mayorista price)
  if (hasPV4) {
    const pv4 = pricePV4!;
    const pv4Diff = Math.abs(unitValue - pv4) / pv4;

    if (pv4Diff <= tolerance) {
      mayoristaScore += 0.9;
      reasons.push(`unitValue ${unitValue} matches PV4 ${pv4} within ${(tolerance * 100).toFixed(0)}% (diff: ${(pv4Diff * 100).toFixed(1)}%)`);
    } else if (unitValue < (pricePV3 ?? Infinity) && hasPV3) {
      mayoristaScore += 0.3;
      reasons.push(`unitValue ${unitValue} < PV3 ${pricePV3} — possible mayorista discount`);
    }
  }

  // If both PV3 and PV4 are available, use proximity
  if (hasPV3 && hasPV4) {
    const distToPV3 = Math.abs(unitValue - pricePV3!);
    const distToPV4 = Math.abs(unitValue - pricePV4!);
    const totalDist = distToPV3 + distToPV4;

    if (totalDist > 0) {
      // Closer to PV3 = more detal, closer to PV4 = more mayorista
      const proximityDetal = 1 - (distToPV3 / totalDist);
      const proximityMayorista = 1 - (distToPV4 / totalDist);
      detalScore = Math.max(detalScore, proximityDetal * 0.8);
      mayoristaScore = Math.max(mayoristaScore, proximityMayorista * 0.8);
      reasons.push(`Proximity: ${(proximityDetal * 100).toFixed(0)}% detal, ${(proximityMayorista * 100).toFixed(0)}% mayorista`);
    }
  }

  // Determine strength based on match quality
  const maxScore = Math.max(detalScore, mayoristaScore);
  let strength: EvidenceStrength;
  if (maxScore >= 0.8) strength = "STRONG";
  else if (maxScore >= 0.5) strength = "MODERATE";
  else strength = "WEAK";

  return {
    type: "price_comparison",
    strength,
    weight: config.evidenceWeights.price_comparison,
    detalScore: Math.round(detalScore * 100) / 100,
    mayoristaScore: Math.round(mayoristaScore * 100) / 100,
    reasoning: reasons.join("; "),
    dataAvailable: true,
  };
}

function evaluateSaleOrigin(
  input: SaleOriginInput | null,
  config: SalesClassificationConfig,
): ClassificationEvidence {
  if (!input || !input.sourceCode) {
    return unavailable("sale_origin", config.evidenceWeights.sale_origin, "No source code available");
  }

  const { sourceCode, rawJson } = input;

  // Check if rawJson has channel info
  const rawChannel = rawJson && typeof rawJson === "object"
    ? (rawJson as Record<string, unknown>).channel ?? (rawJson as Record<string, unknown>).canal
    : null;

  if (!rawChannel && config.detalSourceCodes.length === 0 && config.mayoristaSourceCodes.length === 0) {
    return unavailable("sale_origin", config.evidenceWeights.sale_origin,
      `sourceCode "${sourceCode}" not configured as detal or mayorista; rawJson has no channel data`);
  }

  let detalScore = 0;
  let mayoristaScore = 0;
  const reasons: string[] = [];

  if (config.detalSourceCodes.includes(sourceCode)) {
    detalScore = 0.8;
    reasons.push(`sourceCode "${sourceCode}" configured as detal`);
  }
  if (config.mayoristaSourceCodes.includes(sourceCode)) {
    mayoristaScore = 0.8;
    reasons.push(`sourceCode "${sourceCode}" configured as mayorista`);
  }

  if (typeof rawChannel === "string") {
    const ch = rawChannel.toUpperCase();
    if (ch.includes("DETAL") || ch.includes("RETAIL") || ch.includes("TIENDA")) {
      detalScore = Math.max(detalScore, 0.7);
      reasons.push(`rawJson channel "${rawChannel}" indicates detal`);
    }
    if (ch.includes("MAYOR") || ch.includes("WHOLESALE") || ch.includes("DISTRIBUCI")) {
      mayoristaScore = Math.max(mayoristaScore, 0.7);
      reasons.push(`rawJson channel "${rawChannel}" indicates mayorista`);
    }
  }

  if (detalScore === 0 && mayoristaScore === 0) {
    return unavailable("sale_origin", config.evidenceWeights.sale_origin,
      `sourceCode "${sourceCode}" not a discriminator; rawJson channel not found`);
  }

  return {
    type: "sale_origin",
    strength: Math.max(detalScore, mayoristaScore) >= 0.7 ? "MODERATE" : "WEAK",
    weight: config.evidenceWeights.sale_origin,
    detalScore,
    mayoristaScore,
    reasoning: reasons.join("; "),
    dataAvailable: true,
  };
}

function evaluateCustomerType(
  input: CustomerTypeInput | null,
  config: SalesClassificationConfig,
): ClassificationEvidence {
  if (!input || (!input.customerType && !input.segment)) {
    return unavailable("customer_type", config.evidenceWeights.customer_type, "No customer type or segment available");
  }

  let detalScore = 0;
  let mayoristaScore = 0;
  const reasons: string[] = [];

  if (input.customerType) {
    if (config.detalCustomerTypes.includes(input.customerType)) {
      detalScore = 0.6;
      reasons.push(`customerType "${input.customerType}" configured as detal`);
    }
    if (config.mayoristaCustomerTypes.includes(input.customerType)) {
      mayoristaScore = 0.6;
      reasons.push(`customerType "${input.customerType}" configured as mayorista`);
    }
  }

  if (input.segment) {
    const seg = input.segment.toUpperCase();
    if (seg.includes("DETAL") || seg.includes("RETAIL") || seg.includes("CONSUMIDOR")) {
      detalScore = Math.max(detalScore, 0.5);
      reasons.push(`segment "${input.segment}" indicates detal`);
    }
    if (seg.includes("MAYOR") || seg.includes("WHOLESALE") || seg.includes("DISTRIBUI")) {
      mayoristaScore = Math.max(mayoristaScore, 0.5);
      reasons.push(`segment "${input.segment}" indicates mayorista`);
    }
  }

  if (detalScore === 0 && mayoristaScore === 0) {
    return unavailable("customer_type", config.evidenceWeights.customer_type,
      `customerType "${input.customerType ?? "null"}" and segment "${input.segment ?? "null"}" not discriminators`);
  }

  return {
    type: "customer_type",
    strength: "WEAK",
    weight: config.evidenceWeights.customer_type,
    detalScore,
    mayoristaScore,
    reasoning: reasons.join("; "),
    dataAvailable: true,
  };
}

function evaluateOperationType(
  input: OperationTypeInput | null,
  config: SalesClassificationConfig,
): ClassificationEvidence {
  if (!input || !input.documentType) {
    return unavailable("operation_type", config.evidenceWeights.operation_type, "No document type available");
  }

  let detalScore = 0;
  let mayoristaScore = 0;
  const reasons: string[] = [];

  if (config.detalDocumentTypes.includes(input.documentType)) {
    detalScore = 0.7;
    reasons.push(`documentType "${input.documentType}" configured as detal`);
  }
  if (config.mayoristaDocumentTypes.includes(input.documentType)) {
    mayoristaScore = 0.7;
    reasons.push(`documentType "${input.documentType}" configured as mayorista`);
  }

  if (detalScore === 0 && mayoristaScore === 0) {
    return unavailable("operation_type", config.evidenceWeights.operation_type,
      `documentType "${input.documentType}" not configured as detal or mayorista`);
  }

  return {
    type: "operation_type",
    strength: "MODERATE",
    weight: config.evidenceWeights.operation_type,
    detalScore,
    mayoristaScore,
    reasoning: reasons.join("; "),
    dataAvailable: true,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function unavailable(
  type: ClassificationEvidence["type"],
  weight: number,
  reasoning: string,
): ClassificationEvidence {
  return {
    type,
    strength: "UNAVAILABLE",
    weight,
    detalScore: 0,
    mayoristaScore: 0,
    reasoning,
    dataAvailable: false,
  };
}

function computeStrengthBonus(evidence: ClassificationEvidence[]): number {
  const strengthValues: Record<EvidenceStrength, number> = {
    STRONG: 1.0,
    MODERATE: 0.6,
    WEAK: 0.3,
    UNAVAILABLE: 0,
  };
  if (evidence.length === 0) return 0;
  return evidence.reduce((s, e) => s + strengthValues[e.strength], 0) / evidence.length;
}
