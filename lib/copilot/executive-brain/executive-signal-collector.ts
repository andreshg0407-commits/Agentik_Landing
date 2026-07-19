/**
 * lib/copilot/executive-brain/executive-signal-collector.ts
 *
 * Agentik — Executive Brain — Signal Collector
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Extracts ExecutiveSignals from operational context:
 *   - Memory entries (from Copilot Memory Engine)
 *   - Playbooks (from Copilot Playbooks layer)
 *   - Combined strategic signals
 *
 * All logic is deterministic, keyword-based. No AI. No DB. No server-only.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type {
  ExecutiveSignal,
  ExecutiveBrainInput,
  ExecutiveSignalCategory,
  ExecutiveSignalSeverity,
  ExecutiveSignalDirection,
} from "./executive-brain-types";
import { SIGNAL_REGISTRY } from "./executive-signal-registry";

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;

function nextSignalId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `es-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

// ── Signal factory ────────────────────────────────────────────────────────────

function makeSignal(
  registryId:  string,
  source:      string,
  confidence?: number,
  override?:   Partial<Pick<ExecutiveSignal, "title" | "description" | "direction">>,
  metadata:    Record<string, unknown> = {},
): ExecutiveSignal {
  const entry = SIGNAL_REGISTRY[registryId];
  if (!entry) throw new Error(`Unknown signal registry ID: ${registryId}`);

  return {
    id:          nextSignalId(),
    title:       override?.title ?? entry.title,
    description: override?.description ?? entry.description,
    category:    entry.category,
    severity:    entry.severity,
    direction:   override?.direction ?? entry.direction,
    confidence:  confidence ?? entry.defaultConfidence,
    source,
    metadata:    { registryId, ...metadata },
    generatedAt: new Date().toISOString(),
  };
}

function makeCustomSignal(
  id:          string,
  title:       string,
  description: string,
  category:    ExecutiveSignalCategory,
  severity:    ExecutiveSignalSeverity,
  direction:   ExecutiveSignalDirection,
  confidence:  number,
  source:      string,
  metadata:    Record<string, unknown> = {},
): ExecutiveSignal {
  return {
    id:          nextSignalId(),
    title,
    description,
    category,
    severity,
    direction,
    confidence,
    source,
    metadata:    { signalType: id, ...metadata },
    generatedAt: new Date().toISOString(),
  };
}

// ── Keyword helpers ───────────────────────────────────────────────────────────

const FINANCE_RISK_KW   = ["bajo saldo", "liquidez", "caja crítica", "déficit", "sin fondos", "low cash"];
const FINANCE_CLOSE_KW  = ["cierre", "closing", "estado financiero", "balance"];
const FINANCE_RECON_KW  = ["conciliación", "reconciliation", "pendiente conciliar"];
const COLLECTION_KW     = ["cartera", "cobranza", "vencida", "mora", "cobro", "overdue", "recaudo"];
const SALES_DECLINE_KW  = ["ventas bajas", "meta no alcanzada", "por debajo del objetivo", "decline", "caída ventas"];
const SALES_GROWTH_KW   = ["crecimiento", "superó meta", "ventas altas", "growth", "objetivo superado"];
const MARKETING_KW      = ["campaña", "campaign", "marketing", "redes sociales", "shopify", "meta ads", "tiktok"];
const CRITICAL_KW       = ["urgente", "crítico", "critico", "critical", "inmediato", "bloqueo", "bloqueado", "auditoria", "multa", "sanción"];
const OPPORTUNITY_KW    = ["oportunidad", "opportunity", "crecimiento estratégico", "ventaja", "expansión"];

function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

// ── Memory signal extraction ──────────────────────────────────────────────────

/**
 * Extract ExecutiveSignals from memory entries.
 * Memory entries with high importance → high-confidence signals.
 */
export function collectMemorySignals(
  entries: NonNullable<ExecutiveBrainInput["memoryEntries"]>,
): ExecutiveSignal[] {
  const signals: ExecutiveSignal[] = [];

  for (const entry of entries) {
    const text       = `${entry.title} ${entry.content}`;
    const isCritical = entry.importance === "CRITICAL";
    const isHigh     = entry.importance === "HIGH";
    const baseConf   = isCritical ? 0.9 : isHigh ? 0.75 : 0.55;
    const source     = `memory:${entry.id}`;

    // Finance signals
    if (hasAny(text, FINANCE_RISK_KW)) {
      signals.push(makeSignal("FINANCE_LOW_CASH", source, baseConf, undefined, { memoryId: entry.id }));
    }
    if (hasAny(text, FINANCE_RECON_KW)) {
      signals.push(makeSignal("FINANCE_RECONCILIATION_PENDING", source, baseConf, undefined, { memoryId: entry.id }));
    }
    if (hasAny(text, FINANCE_CLOSE_KW)) {
      signals.push(makeSignal("FINANCE_CLOSING_IN_PROGRESS", source, baseConf * 0.9, undefined, { memoryId: entry.id }));
    }

    // Collections signals
    if (hasAny(text, COLLECTION_KW)) {
      const severity: ExecutiveSignalSeverity = isCritical ? "CRITICAL" : isHigh ? "HIGH" : "MEDIUM";
      signals.push(makeCustomSignal(
        "COLLECTIONS_FROM_MEMORY",
        "Señal de cobranza detectada",
        `Contexto de memoria indica actividad de cobranza: "${entry.title}".`,
        "COLLECTIONS",
        severity,
        "STABLE",
        baseConf,
        source,
        { memoryId: entry.id },
      ));
    }

    // Sales signals
    if (hasAny(text, SALES_DECLINE_KW)) {
      signals.push(makeSignal("COMMERCIAL_SALES_DECLINE", source, baseConf, undefined, { memoryId: entry.id }));
    }
    if (hasAny(text, SALES_GROWTH_KW)) {
      signals.push(makeSignal("COMMERCIAL_SALES_GROWTH", source, baseConf, undefined, { memoryId: entry.id }));
    }

    // Marketing signals
    if (hasAny(text, MARKETING_KW)) {
      signals.push(makeSignal("MARKETING_CAMPAIGN_UNDERPERFORMING", source, baseConf * 0.7,
        { title: "Actividad de marketing detectada", description: `Memoria indica actividad de marketing: "${entry.title}".` },
        { memoryId: entry.id },
      ));
    }

    // Critical alerts from CRITICAL importance memories
    if (isCritical && hasAny(text, CRITICAL_KW)) {
      signals.push(makeSignal("EXECUTIVE_CRITICAL_ALERT", source, 0.95,
        { description: `Alerta crítica desde memoria: "${entry.title}".` },
        { memoryId: entry.id },
      ));
    }

    // Strategic opportunities
    if (hasAny(text, OPPORTUNITY_KW)) {
      signals.push(makeSignal("EXECUTIVE_STRATEGIC_OPPORTUNITY", source, baseConf,
        { description: `Oportunidad estratégica identificada: "${entry.title}".` },
        { memoryId: entry.id },
      ));
    }
  }

  return signals;
}

// ── Playbook signal extraction ────────────────────────────────────────────────

/**
 * Extract ExecutiveSignals from active playbooks.
 * CRITICAL priority playbooks → EXECUTIVE_CRITICAL_ALERT.
 * HIGH priority playbooks in specific categories → domain signals.
 */
export function collectPlaybookSignals(
  playbooks: NonNullable<ExecutiveBrainInput["playbooks"]>,
): ExecutiveSignal[] {
  const signals: ExecutiveSignal[] = [];

  for (const pb of playbooks) {
    if (pb.status !== "ACTIVE") continue;

    const source = `playbook:${pb.id}`;
    const text   = pb.title.toLowerCase();

    switch (pb.priority) {
      case "CRITICAL":
        signals.push(makeSignal("EXECUTIVE_CRITICAL_ALERT", source, 0.85,
          { description: `Playbook crítico activo: "${pb.title}".` },
          { playbookId: pb.id, category: pb.category },
        ));
        break;

      case "HIGH":
        if (pb.category === "COLLECTIONS" || hasAny(text, COLLECTION_KW)) {
          signals.push(makeSignal("COLLECTIONS_OVERDUE_PORTFOLIO", source, 0.7,
            { description: `Playbook de cobranza de alta prioridad activo: "${pb.title}".` },
            { playbookId: pb.id },
          ));
        } else if (pb.category === "FINANCE" || hasAny(text, FINANCE_CLOSE_KW)) {
          signals.push(makeSignal("FINANCE_CLOSING_IN_PROGRESS", source, 0.7,
            { description: `Playbook financiero de alta prioridad activo: "${pb.title}".` },
            { playbookId: pb.id },
          ));
        } else if (pb.category === "EXECUTIVE") {
          signals.push(makeSignal("EXECUTIVE_REVIEW_REQUIRED", source, 0.75,
            { description: `Revisión ejecutiva requerida: "${pb.title}".` },
            { playbookId: pb.id },
          ));
        }
        break;
    }
  }

  return signals;
}

// ── Strategic signal extraction ───────────────────────────────────────────────

/**
 * Extract strategic cross-cutting signals when memory and playbooks are combined.
 * Detects patterns that emerge only when both contexts are considered together.
 */
export function collectStrategicSignals(
  input: ExecutiveBrainInput,
): ExecutiveSignal[] {
  const signals: ExecutiveSignal[] = [];
  const intent  = input.intent?.toLowerCase() ?? "";

  const entries   = input.memoryEntries ?? [];
  const playbooks = input.playbooks ?? [];

  // Pattern: multiple CRITICAL memories + COLLECTIONS playbooks = portfolio crisis
  const criticalMemories = entries.filter(e => e.importance === "CRITICAL");
  const collectionsPbs   = playbooks.filter(p => p.category === "COLLECTIONS" && p.status === "ACTIVE");

  if (criticalMemories.length > 0 && collectionsPbs.length > 0) {
    signals.push(makeCustomSignal(
      "STRATEGIC_COLLECTIONS_CRISIS",
      "Posible crisis de recuperación de cartera",
      `${criticalMemories.length} memorias críticas coinciden con ${collectionsPbs.length} playbook(s) de cobranza activos.`,
      "COLLECTIONS",
      "CRITICAL",
      "DECLINING",
      0.85,
      "strategic:memory+playbooks",
      { criticalMemoryCount: criticalMemories.length, collectionsPlaybookCount: collectionsPbs.length },
    ));
  }

  // Pattern: finance intent + no finance playbooks = blind spot
  if (intent.includes("finance") || intent.includes("finanz")) {
    const financePbs = playbooks.filter(p => p.category === "FINANCE" && p.status === "ACTIVE");
    if (financePbs.length === 0 && entries.length > 0) {
      signals.push(makeCustomSignal(
        "STRATEGIC_FINANCE_NO_PLAYBOOK",
        "Sin playbooks financieros activos",
        "La intención es financiera pero no hay playbooks de finanzas activos para guiar el proceso.",
        "FINANCE",
        "MEDIUM",
        "STABLE",
        0.6,
        "strategic:intent+playbooks",
        { intent, financePlaybookCount: 0 },
      ));
    }
  }

  // Pattern: executive/multi-domain intent = surface strategic opportunities
  if (intent === "multi_domain" || intent === "executive" || intent === "general") {
    const stratMemories = entries.filter(e =>
      e.type === "STRATEGIC" && (e.importance === "HIGH" || e.importance === "CRITICAL"),
    );
    if (stratMemories.length >= 2) {
      signals.push(makeCustomSignal(
        "STRATEGIC_CONTEXT_RICH",
        "Contexto estratégico enriquecido",
        `${stratMemories.length} memorias estratégicas disponibles para análisis ejecutivo.`,
        "EXECUTIVE",
        "MEDIUM",
        "IMPROVING",
        0.65,
        "strategic:memory",
        { strategicMemoryCount: stratMemories.length },
      ));
    }
  }

  return signals;
}

// ── Combined collection ───────────────────────────────────────────────────────

/**
 * Collect all signals from all available sources.
 * Merges memory, playbook, and strategic signals.
 */
export function collectAllSignals(input: ExecutiveBrainInput): ExecutiveSignal[] {
  const memSignals      = collectMemorySignals(input.memoryEntries ?? []);
  const pbSignals       = collectPlaybookSignals(input.playbooks ?? []);
  const strategicSignals = collectStrategicSignals(input);

  return [...memSignals, ...pbSignals, ...strategicSignals];
}
