// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 13 — Executive Agenda Builder
// Generates suggested executive agendas — never executes, only suggests

import type {
  ExecutiveAgenda,
  ExecutiveAgendaItem,
  ExecutivePriority,
  ExecutiveRisk,
  ExecutiveConflict,
  ExecutiveDomain,
} from "./executive-brain-types";
import { generateEbv2Id } from "./executive-brain-types";

// ── Agenda Builder API ────────────────────────────────────────────────────────

export interface AgendaBuilderInput {
  readonly orgSlug: string;
  readonly priorities: ExecutivePriority[];
  readonly risks: ExecutiveRisk[];
  readonly conflicts: ExecutiveConflict[];
  readonly maxItems?: number;
}

export function buildExecutiveAgenda(input: AgendaBuilderInput): ExecutiveAgenda {
  const { orgSlug, maxItems = 10 } = input;
  const items = _buildAgendaItems(input).slice(0, maxItems);

  const title = `Agenda ejecutiva sugerida — ${orgSlug}`;

  return {
    id: generateEbv2Id("agenda"),
    orgSlug,
    title,
    items,
    generatedAt: new Date().toISOString(),
    metadata: {
      itemCount: items.length,
      suggestedOnly: true,
      source: "EXECUTIVE_BRAIN_V2",
    },
  };
}

export function buildTop5Agenda(input: Omit<AgendaBuilderInput, "maxItems">): ExecutiveAgenda {
  return buildExecutiveAgenda({ ...input, maxItems: 5 });
}

// ── Private agenda item building ──────────────────────────────────────────────

function _buildAgendaItems(input: AgendaBuilderInput): ExecutiveAgendaItem[] {
  const items: ExecutiveAgendaItem[] = [];
  const { priorities, risks, conflicts } = input;
  let rank = 1;

  // 1. Critical risks first
  for (const risk of risks.filter((r) => r.level === "CRITICAL").slice(0, 2)) {
    items.push({
      rank: rank++,
      title: _domainLabel(risk.domain),
      rationale: `Riesgo crítico activo: ${risk.title}. ${risk.description.slice(0, 80)}`,
      domain: risk.domain,
      priority: "CRITICAL",
      estimatedTimeMinutes: 20,
      suggestedOnly: true,
    });
  }

  // 2. Top priority items
  for (const p of priorities.filter((p) => p.level === "CRITICAL" || p.level === "HIGH").slice(0, 3)) {
    if (items.some((i) => i.domain === p.domain)) continue;
    items.push({
      rank: rank++,
      title: _domainLabel(p.domain),
      rationale: p.title,
      domain: p.domain,
      priority: p.level,
      estimatedTimeMinutes: _estimateTime(p.level),
      suggestedOnly: true,
    });
  }

  // 3. Conflicts requiring explicit resolution
  for (const conflict of conflicts.filter((c) => c.severity === "HIGH" || c.severity === "CRITICAL").slice(0, 1)) {
    items.push({
      rank: rank++,
      title: "Resolución de conflicto estratégico",
      rationale: conflict.description,
      domain: conflict.domain,
      priority: "HIGH",
      estimatedTimeMinutes: 30,
      suggestedOnly: true,
    });
  }

  // 4. High risks
  for (const risk of risks.filter((r) => r.level === "HIGH").slice(0, 2)) {
    if (items.some((i) => i.domain === risk.domain)) continue;
    items.push({
      rank: rank++,
      title: `Riesgos: ${_domainLabel(risk.domain)}`,
      rationale: risk.title,
      domain: risk.domain,
      priority: "HIGH",
      estimatedTimeMinutes: 15,
      suggestedOnly: true,
    });
  }

  // 5. Remaining priorities
  for (const p of priorities.filter((p) => p.level === "MEDIUM").slice(0, 2)) {
    if (items.some((i) => i.domain === p.domain)) continue;
    items.push({
      rank: rank++,
      title: _domainLabel(p.domain),
      rationale: p.title,
      domain: p.domain,
      priority: "MEDIUM",
      estimatedTimeMinutes: 10,
      suggestedOnly: true,
    });
  }

  // Renumber
  return items.map((item, i) => ({ ...item, rank: i + 1 }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _domainLabel(domain: ExecutiveDomain): string {
  const labels: Record<ExecutiveDomain, string> = {
    FINANCE: "Liquidez y finanzas",
    COMMERCIAL: "Cartera y ventas",
    MARKETING: "Marketing y campaña",
    OPERATIONS: "Riesgos operativos",
    EXECUTIVE: "Prioridades ejecutivas",
    COMPLIANCE: "Cumplimiento regulatorio",
    TECHNOLOGY: "Infraestructura tecnológica",
    PEOPLE: "Personas y talento",
    CROSS_DOMAIN: "Revisión estratégica general",
  };
  return labels[domain] ?? domain;
}

function _estimateTime(priority: string): number {
  if (priority === "CRITICAL") return 20;
  if (priority === "HIGH") return 15;
  return 10;
}
