/**
 * lib/comercial/executive/commercial-executive-intelligence.ts
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B02 / B02.1
 *
 * Maps existing deterministic domain signals into ExecutiveInsight[].
 *
 * PURE: no Prisma, no LLM, no React, no viewport.
 * Consumes ControlComercialSnapshot + ImportSupplyIntelligenceResult.
 * Does NOT create new business engines — maps existing truth.
 *
 * Priority is DETERMINISTIC: severity → domain order → natural insertion.
 * No hidden scoring. No LLM ranking.
 */

import type { ControlComercialSnapshot } from "../control/control-comercial-loader";
import type { ImportSupplyIntelligenceResult } from "../importaciones/import-intelligence-service";
import type {
  ExecutiveInsight,
  InsightKind,
  InsightSeverity,
  InsightTruthStatus,
  LowRotationImportItem,
} from "./commercial-executive-types";

// ── Main ────────────────────────────────────────────────────────────────────

export interface IntelligenceInput {
  snapshot: ControlComercialSnapshot;
  importIntelligence: ImportSupplyIntelligenceResult | null;
  lowRotationItems: LowRotationImportItem[];
  orgSlug: string;
  asOf: string;
}

/**
 * Assembles executive insights from existing domain signals.
 *
 * DETERMINISTIC: same input → same output.
 * Severity order: critical → warning → info.
 */
export function assembleExecutiveInsights(input: IntelligenceInput): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  let seq = 0;
  const id = () => `exec-insight-${++seq}`;

  const { snapshot: s, importIntelligence, lowRotationItems, orgSlug, asOf } = input;

  // ── Inventario: agotadas ──────────────────────────────────────────────
  if (s.refsAgotadas > 0) {
    insights.push({
      id: id(),
      domain: "inventario",
      kind: "RISK",
      severity: s.refsAgotadas > 20 ? "critical" : "warning",
      what: `${s.refsAgotadas} referencias agotadas en inventario.`,
      why: "Referencias sin stock disponible no pueden ser vendidas ni incluidas en maletas.",
      evidence: `${s.refsAgotadas} de ${s.refsTotales} referencias totales (${pct(s.refsAgotadas, s.refsTotales)}%).`,
      suggestedNextStep: "Ver inventario",
      deepLink: `/${orgSlug}/comercial/inventario`,
      asOf,
      truthStatus: "CONFIRMED",
    });
  }

  // ── Cartera: vencida ──────────────────────────────────────────────────
  if (s.cartera.carteraVencida > 0 && s.cartera.pctVencida > 0) {
    const sev: InsightSeverity = s.cartera.pctVencida > 30 ? "critical" : s.cartera.pctVencida > 15 ? "warning" : "info";
    insights.push({
      id: id(),
      domain: "cartera",
      kind: "RISK",
      severity: sev,
      what: `${s.cartera.pctVencida}% de la cartera esta vencida.`,
      why: "Cartera vencida afecta el flujo de caja y la capacidad de compra.",
      evidence: `${fmtCOP(s.cartera.carteraVencida)} vencida de ${fmtCOP(s.cartera.carteraTotal)} total. ${s.cartera.clientesConMora} clientes con mora.`,
      suggestedNextStep: "Ver cartera",
      deepLink: `/${orgSlug}/comercial/clientes`,
      asOf,
      truthStatus: "CONFIRMED",
    });
  }

  // ── Importaciones: baja rotacion ──────────────────────────────────────
  const lowRotCount = lowRotationItems.filter(i => i.rotationStatus === "LOW_ROTATION").length;
  if (lowRotCount > 0) {
    const capitalItems = lowRotationItems.filter(i => i.rotationStatus === "LOW_ROTATION" && i.inventoryValue !== null);
    const capitalTotal = capitalItems.reduce((sum, i) => sum + (i.inventoryValue ?? 0), 0);
    const capitalText = capitalTotal > 0 ? ` Capital estimado: ${fmtCOP(capitalTotal)}.` : "";
    const certified: InsightTruthStatus = capitalItems.length > 0 && capitalItems.length === lowRotCount ? "CONFIRMED" : "PARTIAL";

    insights.push({
      id: id(),
      domain: "importaciones",
      kind: "RISK",
      severity: lowRotCount > 10 ? "critical" : "warning",
      what: `${lowRotCount} referencias llevan mas de 8 meses sin recompra/reingreso y aun tienen inventario.`,
      why: "Capital inmovilizado en referencias sin movimiento reduce la capacidad de inversion en producto activo.",
      evidence: `${lowRotCount} refs en baja rotacion de ${importIntelligence?.items.length ?? 0} importadas.${capitalText}`,
      suggestedNextStep: "Ver importaciones",
      deepLink: `/${orgSlug}/comercial/importaciones`,
      asOf,
      truthStatus: certified,
    });
  }

  // ── Importaciones: SIN_FECHA ──────────────────────────────────────────
  const sinFechaCount = lowRotationItems.filter(i => i.rotationStatus === "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION").length;
  if (sinFechaCount > 0) {
    insights.push({
      id: id(),
      domain: "importaciones",
      kind: "OBSERVATION",
      severity: "info",
      what: `${sinFechaCount} referencia${sinFechaCount !== 1 ? "s" : ""} importada${sinFechaCount !== 1 ? "s" : ""} sin fecha de actividad de importacion.`,
      why: "Sin fecha de ingreso o compra registrada, no es posible calcular rotacion.",
      evidence: `${sinFechaCount} de ${importIntelligence?.items.length ?? 0} refs importadas no tienen fecha de actividad.`,
      suggestedNextStep: "Ver importaciones",
      deepLink: `/${orgSlug}/comercial/importaciones`,
      asOf,
      truthStatus: "CONFIRMED",
    });
  }

  // ── Importaciones: recompra urgente ───────────────────────────────────
  const recompraCount = importIntelligence?.kpis.comprarAhora ?? 0;
  if (recompraCount > 0) {
    insights.push({
      id: id(),
      domain: "importaciones",
      kind: "RISK",
      severity: recompraCount > 5 ? "critical" : "warning",
      what: `${recompraCount} referencia${recompraCount !== 1 ? "s" : ""} requiere${recompraCount === 1 ? "" : "n"} recompra inmediata.`,
      why: "Desabastecimiento inminente o alta rotacion con stock bajo.",
      evidence: `${recompraCount} refs clasificadas como INMEDIATA por el motor de recompra.`,
      suggestedNextStep: "Ver importaciones",
      deepLink: `/${orgSlug}/comercial/importaciones`,
      asOf,
      truthStatus: "CONFIRMED",
    });
  }

  // ── Inventario: criticas ──────────────────────────────────────────────
  if (s.refsCriticas > 0) {
    insights.push({
      id: id(),
      domain: "inventario",
      kind: "RISK",
      severity: "warning",
      what: `${s.refsCriticas} referencias en nivel critico de inventario.`,
      why: "Stock bajo puede generar perdida de ventas o incumplimiento de pedidos.",
      evidence: `${s.refsCriticas} refs criticas de ${s.refsTotales} totales.`,
      suggestedNextStep: "Ver inventario",
      deepLink: `/${orgSlug}/comercial/inventario`,
      asOf,
      truthStatus: "CONFIRMED",
    });
  }

  // ── Snapshot insights (from control-comercial-loader) ─────────────────
  for (const ins of s.insights) {
    const domain = inferDomainFromInsight(ins.text);
    insights.push({
      id: id(),
      domain,
      kind: "OBSERVATION",
      severity: ins.severity === "neutral" ? "info" : ins.severity,
      what: ins.text,
      why: "Concentracion detectada por reglas del control comercial.",
      evidence: ins.text,
      suggestedNextStep: null,
      deepLink: null,
      asOf,
      truthStatus: "CONFIRMED",
    });
  }

  // ── Snapshot alertas (from control-comercial-loader) ───────────────────
  for (const al of s.alertas) {
    // Skip duplicates we already generated above
    if (al.id === "alert-inv-agotadas" || al.id === "alert-inv-criticas") continue;

    const domain = inferDomainFromModule(al.module);
    insights.push({
      id: id(),
      domain,
      kind: "RISK",
      severity: al.severity,
      what: al.title,
      why: al.detail,
      evidence: al.detail,
      suggestedNextStep: al.action?.label ?? null,
      deepLink: al.action?.href ?? null,
      asOf,
      truthStatus: "CONFIRMED",
    });
  }

  // ── Sort: kind (RISK → OPPORTUNITY → OBSERVATION), then severity ─────
  const kindOrder: Record<InsightKind, number> = {
    RISK: 0,
    OPPORTUNITY: 1,
    OBSERVATION: 2,
  };
  const severityOrder: Record<InsightSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  insights.sort((a, b) => {
    const k = kindOrder[a.kind] - kindOrder[b.kind];
    return k !== 0 ? k : severityOrder[a.severity] - severityOrder[b.severity];
  });

  return insights;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString("es-CO")}`;
}

function inferDomainFromInsight(text: string): ExecutiveInsight["domain"] {
  if (text.includes("vendedor")) return "vendedores";
  if (text.includes("cliente")) return "clientes";
  if (text.includes("cartera")) return "cartera";
  if (text.includes("inventario") || text.includes("referencia")) return "inventario";
  if (text.includes("importa")) return "importaciones";
  if (text.includes("tienda")) return "tiendas";
  return "ventas";
}

function inferDomainFromModule(module: string): ExecutiveInsight["domain"] {
  const m = module.toLowerCase();
  if (m.includes("cartera")) return "cartera";
  if (m.includes("inventario")) return "inventario";
  if (m.includes("vendedor")) return "vendedores";
  if (m.includes("import")) return "importaciones";
  if (m.includes("tienda")) return "tiendas";
  if (m.includes("cliente")) return "clientes";
  if (m.includes("pedido")) return "pedidos";
  return "ventas";
}
