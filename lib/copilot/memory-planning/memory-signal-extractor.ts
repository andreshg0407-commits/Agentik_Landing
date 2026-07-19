/**
 * lib/copilot/memory-planning/memory-signal-extractor.ts
 *
 * Agentik — Copilot Memory-Aware Planning — Signal Extractor
 * Sprint: AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 *
 * Converts MemoryContext → MemoryPlanningSignal[].
 * Deterministic, keyword-based, no AI, no external calls.
 *
 * Algorithm:
 *   For each MemoryEntry in the context:
 *     1. Normalize content.
 *     2. Score domain keywords → emit PRIORITIZE_DOMAIN.
 *     3. Check warning triggers → emit ADD_WARNING.
 *     4. Check escalation triggers → emit ESCALATE_ATTENTION + PRIORITIZE_AGENT.
 *     5. Check LEARNING type + pattern triggers → emit PRIORITIZE_AGENT.
 *     6. Check next-action triggers → emit SUGGEST_NEXT_ACTION.
 *   Map memory importance → signal strength.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { MemoryContext, MemoryEntry, MemoryType } from "../memory/memory-types";
import type {
  MemoryPlanningSignal,
  MemoryPlanningSignalType,
  PlanningSignalStrength,
  CopilotDomain,
} from "./memory-planning-types";
import type { AgentId } from "@/lib/agents/runtime/agent-types";

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function generateSignalId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `sig-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿¡?!,;:.()'"\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Keyword scorer ────────────────────────────────────────────────────────────

function hasKeyword(text: string, keyword: string): boolean {
  return text.includes(keyword);
}

function scoreKeywords(text: string, keywords: string[]): number {
  return keywords.filter(kw => text.includes(kw)).length;
}

// ── Domain keyword sets ───────────────────────────────────────────────────────

const FINANCE_DOMAIN_KW: string[] = [
  "pagosnet", "banco", "banc", "tesoreria", "conciliacion",
  "cierre financiero", "presupuesto", "flujo de caja", "liquidez",
  "facturacion", "saldo bancario", "transferencia", "deuda",
  "sag",  // SAG is the tenant's billing/collections system
];

const MARKETING_DOMAIN_KW: string[] = [
  "campana", "marketing", "contenido", "shopify", "meta", "tiktok",
  "publicacion", "redes sociales", "instagram", "facebook",
  "canal digital", "pauta", "foto estudio", "linea bebe",
];

const COMMERCIAL_DOMAIN_KW: string[] = [
  "linea de negocio", "linea bebe", "prioridad comercial",
  "ventas comerciales", "estrategia comercial", "canal de venta",
  "clientes nuevos", "captacion", "oportunidad de venta",
  "producto prioritario", "linea de producto", "segmento",
];

const COLLECTIONS_DOMAIN_KW: string[] = [
  "mora alta", "cartera vencida", "facturas vencidas",
  "recuperacion de cartera", "dias de mora", "antiguedad de cartera",
  "cuentas por cobrar", "deuda vencida", "cobranza",
];

// ── Warning triggers ──────────────────────────────────────────────────────────

const WARNING_TRIGGERS: string[] = [
  "pendiente de integracion", "pendiente de activacion",
  "bloqueado", "sin resolver", "falla", "no funciona",
  "critico", "urgente", "sin configurar", "requiere atencion",
  "pendiente de configuracion",
];

// ── Escalation triggers (→ collections_agent + ESCALATE_ATTENTION) ────────────

const ESCALATION_TRIGGERS: string[] = [
  "mora alta", "cartera vencida", "escalar a mila",
  "escalar a cobranza", "escalar al agente de cobranza",
  "urgente", "critico",
];

// ── Learning pattern triggers (reinforce escalation from LEARNING memory) ─────

const LEARNING_ESCALATION_PATTERNS: string[] = [
  "mora alta", "cartera vencida", "escalar", "siempre que",
  "cada vez que", "cuando hay",
];

// ── Suggested action triggers ─────────────────────────────────────────────────

const ACTION_TRIGGERS: string[] = [
  "pendiente de integracion", "pendiente de activacion",
  "pendiente de configuracion", "debe integrarse",
  "necesita revision", "aprobar", "activar",
];

// ── Importance → signal strength ──────────────────────────────────────────────

function toSignalStrength(
  importance: MemoryEntry["importance"],
  type:       MemoryType,
): PlanningSignalStrength {
  const base: Record<MemoryEntry["importance"], PlanningSignalStrength> = {
    CRITICAL: "CRITICAL",
    HIGH:     "HIGH",
    MEDIUM:   "MEDIUM",
    LOW:      "LOW",
  };
  const strength = base[importance];
  // LEARNING memories carry extra weight — promote by one level
  if (type === "LEARNING" && strength === "MEDIUM") return "HIGH";
  return strength;
}

// ── Signal factory ────────────────────────────────────────────────────────────

function makeSignal(
  orgSlug:       string,
  memoryId:      string,
  signalType:    MemoryPlanningSignalType,
  strength:      PlanningSignalStrength,
  reason:        string,
  opts?: {
    targetDomain?:  CopilotDomain;
    targetAgentId?: AgentId;
  },
): MemoryPlanningSignal {
  return {
    id:             generateSignalId(),
    orgSlug,
    memoryId,
    signalType,
    strength,
    targetDomain:   opts?.targetDomain,
    targetAgentId:  opts?.targetAgentId,
    reason,
    createdAt:      new Date().toISOString(),
  };
}

// ── Per-entry extractor ───────────────────────────────────────────────────────

function extractSignalsFromEntry(
  entry:   MemoryEntry,
): MemoryPlanningSignal[] {
  const signals: MemoryPlanningSignal[] = [];
  const text     = normalize(`${entry.title} ${entry.content}`);
  const strength = toSignalStrength(entry.importance, entry.type);
  const id       = entry.id;
  const org      = entry.orgSlug;

  // ── Domain prioritization ────────────────────────────────────────────────

  if (scoreKeywords(text, FINANCE_DOMAIN_KW) >= 1) {
    signals.push(makeSignal(org, id, "PRIORITIZE_DOMAIN", strength,
      `Memory "${entry.title}" signals finance domain activity.`,
      { targetDomain: "FINANCE" },
    ));
  }

  if (scoreKeywords(text, MARKETING_DOMAIN_KW) >= 1) {
    signals.push(makeSignal(org, id, "PRIORITIZE_DOMAIN", strength,
      `Memory "${entry.title}" signals marketing domain activity.`,
      { targetDomain: "MARKETING" },
    ));
  }

  if (scoreKeywords(text, COMMERCIAL_DOMAIN_KW) >= 1) {
    signals.push(makeSignal(org, id, "PRIORITIZE_DOMAIN", strength,
      `Memory "${entry.title}" signals commercial domain activity.`,
      { targetDomain: "COMMERCIAL" },
    ));
  }

  if (scoreKeywords(text, COLLECTIONS_DOMAIN_KW) >= 1) {
    // Collections domain → also escalate + add the collections agent directly
    signals.push(makeSignal(org, id, "PRIORITIZE_DOMAIN", strength,
      `Memory "${entry.title}" signals collections domain activity.`,
      { targetDomain: "COLLECTIONS" },
    ));
    signals.push(makeSignal(org, id, "PRIORITIZE_AGENT",
      strength === "CRITICAL" ? "CRITICAL" : "HIGH",
      `Collections signals present in "${entry.title}" — include Mila (collections_agent).`,
      { targetAgentId: "collections_agent" },
    ));
  }

  // ── Warning signals ──────────────────────────────────────────────────────

  if (WARNING_TRIGGERS.some(t => hasKeyword(text, t))) {
    const trigger = WARNING_TRIGGERS.find(t => hasKeyword(text, t)) ?? "issue detected";
    signals.push(makeSignal(org, id, "ADD_WARNING", strength,
      `Warning: "${entry.title}" — ${trigger} detectado.`,
    ));
  }

  // ── Escalation signals ────────────────────────────────────────────────────

  if (ESCALATION_TRIGGERS.some(t => hasKeyword(text, t))) {
    const escalationStrength: PlanningSignalStrength =
      entry.importance === "CRITICAL" ? "CRITICAL" : "HIGH";
    signals.push(makeSignal(org, id, "ESCALATE_ATTENTION", escalationStrength,
      `Escalation trigger in "${entry.title}" — elevating plan priority.`,
    ));
  }

  // ── Learning pattern → agent escalation ───────────────────────────────────

  if (entry.type === "LEARNING" &&
      LEARNING_ESCALATION_PATTERNS.some(t => hasKeyword(text, t))) {
    signals.push(makeSignal(org, id, "PRIORITIZE_AGENT", "HIGH",
      `Learned pattern in "${entry.title}" triggers agent escalation.`,
      { targetAgentId: "collections_agent" },
    ));
  }

  // ── Suggested next actions ────────────────────────────────────────────────

  if (ACTION_TRIGGERS.some(t => hasKeyword(text, t))) {
    const trigger = ACTION_TRIGGERS.find(t => hasKeyword(text, t)) ?? "action required";
    signals.push(makeSignal(org, id, "SUGGEST_NEXT_ACTION", strength,
      `Acción sugerida a partir de "${entry.title}": revisar estado de ${trigger}.`,
    ));
  }

  return signals;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract planning signals from a MemoryContext.
 *
 * Processes each MemoryEntry and emits one or more signals.
 * Returns a flat array of all signals across all entries.
 * Never throws — returns empty array on failure.
 *
 * @param context  MemoryContext retrieved for the current request.
 * @returns        MemoryPlanningSignal[] ordered by entry then signal type.
 */
export function extractPlanningSignals(
  context: MemoryContext,
): MemoryPlanningSignal[] {
  if (!context || context.entries.length === 0) return [];

  const all: MemoryPlanningSignal[] = [];
  for (const entry of context.entries) {
    try {
      all.push(...extractSignalsFromEntry(entry));
    } catch {
      // Silently skip entries that cause extraction errors
    }
  }
  return all;
}
