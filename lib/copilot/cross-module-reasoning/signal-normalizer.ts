/**
 * lib/copilot/cross-module-reasoning/signal-normalizer.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Signal Normalization Layer
 *
 * Converts raw signals from any domain into ReasoningSignal.
 * Deterministic. No AI. Fail-closed.
 */

import type {
  ReasoningSignal,
  ReasoningSignalType,
  ReasoningSourceDomain,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Raw signal input (generic, flexible) ─────────────────────────────────────

export interface RawSignalInput {
  id?:         string;
  orgSlug:     string;
  domain:      ReasoningSourceDomain;
  label:       string;
  description?: string;
  value?:      number;
  unit?:       string;
  direction?:  "UP" | "DOWN" | "STABLE" | "VOLATILE";
  severity?:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence?: number;
  source?:     string;
  metadata?:   Record<string, unknown>;
  detectedAt?: string;
}

// ── Signal type inference ─────────────────────────────────────────────────────

function _inferSignalType(raw: RawSignalInput): ReasoningSignalType {
  const label = raw.label.toLowerCase();
  const desc  = (raw.description ?? "").toLowerCase();
  const combined = `${label} ${desc}`;

  if (combined.includes("anomal") || combined.includes("anomaly"))   return "ANOMALY";
  if (combined.includes("alert") || combined.includes("alerta"))     return "ALERT";
  if (combined.includes("trend") || combined.includes("tendencia"))  return "TREND";
  if (combined.includes("pattern") || combined.includes("patrón"))   return "PATTERN";
  if (combined.includes("correlat") || combined.includes("correlac")) return "CORRELATION";
  if (combined.includes("threshold") || combined.includes("umbral")) return "THRESHOLD_BREACH";
  if (combined.includes("shift") || combined.includes("cambio"))     return "BEHAVIORAL_SHIFT";

  if (raw.direction === "DOWN" || combined.includes("drop") || combined.includes("caída")) {
    return "METRIC_DROP";
  }
  if (raw.direction === "UP" || combined.includes("rise") || combined.includes("increment")) {
    return "METRIC_RISE";
  }
  return "EVENT";
}

// ── Severity normalization ────────────────────────────────────────────────────

function _normalizeSeverity(
  raw?: string,
  value?: number,
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (raw) {
    const upper = raw.toUpperCase();
    if (upper === "CRITICAL" || upper === "CRITICO" || upper === "CRÍTICO") return "CRITICAL";
    if (upper === "HIGH"     || upper === "ALTO")    return "HIGH";
    if (upper === "MEDIUM"   || upper === "MEDIO")   return "MEDIUM";
    if (upper === "LOW"      || upper === "BAJO")    return "LOW";
  }
  // Infer from value magnitude if given
  if (value !== undefined) {
    const abs = Math.abs(value);
    if (abs >= 50) return "CRITICAL";
    if (abs >= 20) return "HIGH";
    if (abs >= 10) return "MEDIUM";
  }
  return "MEDIUM";
}

// ── Confidence normalization ──────────────────────────────────────────────────

function _normalizeConfidence(raw?: number): number {
  if (raw === undefined || raw === null) return 0.5;
  if (raw < 0) return 0;
  if (raw > 1) return Math.min(raw / 100, 1);  // handle 0-100 scale
  return raw;
}

// ── Core normalizer ───────────────────────────────────────────────────────────

export function normalizeSignal(raw: RawSignalInput): ReasoningSignal {
  return {
    id:          raw.id ?? generateCmrId("sig"),
    orgSlug:     raw.orgSlug,
    type:        _inferSignalType(raw),
    domain:      raw.domain,
    label:       raw.label,
    description: raw.description ?? raw.label,
    value:       raw.value,
    unit:        raw.unit,
    direction:   raw.direction,
    severity:    _normalizeSeverity(raw.severity, raw.value),
    confidence:  _normalizeConfidence(raw.confidence),
    source:      raw.source ?? `${raw.domain.toLowerCase()}-module`,
    metadata:    raw.metadata ?? {},
    detectedAt:  raw.detectedAt ?? new Date().toISOString(),
  };
}

export function normalizeSignals(raws: RawSignalInput[]): ReasoningSignal[] {
  return raws.map(normalizeSignal);
}

// ── Signal validation ─────────────────────────────────────────────────────────

export interface SignalValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

export function validateSignal(signal: ReasoningSignal): SignalValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!signal.id)       errors.push("Signal missing id");
  if (!signal.orgSlug)  errors.push("Signal missing orgSlug");
  if (!signal.label)    errors.push("Signal missing label");
  if (!signal.source)   errors.push("Signal missing source (provenance)");
  if (!signal.domain)   errors.push("Signal missing domain");

  if (signal.confidence < 0 || signal.confidence > 1) {
    warnings.push(`Signal confidence ${signal.confidence} out of 0–1 range`);
  }
  if (!signal.description || signal.description === signal.label) {
    warnings.push("Signal description is missing or identical to label");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Signal scoring ────────────────────────────────────────────────────────────

const SEVERITY_SCORE: Record<string, number> = {
  CRITICAL: 1.0,
  HIGH:     0.75,
  MEDIUM:   0.5,
  LOW:      0.25,
};

export function scoreSignal(signal: ReasoningSignal): number {
  const severityScore = SEVERITY_SCORE[signal.severity] ?? 0.5;
  const confidenceScore = signal.confidence;
  return (severityScore * 0.6) + (confidenceScore * 0.4);
}

// ── Domain filtering helpers ──────────────────────────────────────────────────

export function filterSignalsByDomain(
  signals: ReasoningSignal[],
  domain: ReasoningSourceDomain,
): ReasoningSignal[] {
  return signals.filter(s => s.domain === domain);
}

export function filterSignalsBySeverity(
  signals: ReasoningSignal[],
  minSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
): ReasoningSignal[] {
  const MIN = SEVERITY_SCORE[minSeverity] ?? 0;
  return signals.filter(s => (SEVERITY_SCORE[s.severity] ?? 0) >= MIN);
}

export function sortSignalsByScore(signals: ReasoningSignal[]): ReasoningSignal[] {
  return [...signals].sort((a, b) => scoreSignal(b) - scoreSignal(a));
}
