/**
 * Sales Executive Analyst — AI-powered commercial intelligence brief.
 *
 * Takes a snapshot of the current sales state (KPIs, alerts, line mix,
 * top customers, seller participation) and returns a structured executive
 * brief via Claude claude-sonnet-4-6.
 *
 * The brief is deterministic-fallback-safe: if the API key is missing or
 * the call fails, a rule-based brief is derived from the input data so the
 * caller always receives a usable `SalesExecutiveBrief`.
 *
 * Reusable for any connector source — the input types are all sourced from
 * the canonical reports layer, not from a specific adapter.
 *
 * Usage:
 *   import { generateExecutiveBrief } from "@/lib/agents/sales-executive-analyst";
 *   const brief = await generateExecutiveBrief({ orgName, period, kpis, ... });
 */

import Anthropic                           from "@anthropic-ai/sdk";
import type { DashboardKpis,
              LineaMixRow,
              TopClienteRow,
              ParticipacionVendedorRow }   from "@/lib/sales/reports";
import type { BusinessAlertRow }           from "@/lib/sales/alert-engine";

// ── Output types ──────────────────────────────────────────────────────────────

export interface MetricPoint {
  label:  string;
  value:  string;
  trend?: "up" | "down" | "flat";
}

export interface RiskItem {
  severity:     "HIGH" | "MEDIUM" | "LOW";
  title:        string;
  detail:       string;
  entityType?:  string;
  entityLabel?: string;
}

export interface OpportunityItem {
  title:           string;
  detail:          string;
  potentialImpact?: string;
}

export interface ActionItem {
  priority:  1 | 2 | 3;          // 1 = urgent, 2 = this week, 3 = this month
  action:    string;
  rationale: string;
  owner?:    "gerencia" | "vendedor" | "marketing" | "operaciones";
}

export interface SalesExecutiveBrief {
  period:       string;           // "YYYYMM" of the analysed period
  generatedAt:  string;           // ISO timestamp
  source:       "ai" | "fallback"; // "ai" = Claude answered; "fallback" = rule-based
  summary:      string;           // 2–3 sentence executive overview in Spanish
  performance: {
    headline:   string;
    metrics:    MetricPoint[];
  };
  risks:        RiskItem[];
  opportunities: OpportunityItem[];
  actions:      ActionItem[];
}

// ── Input type ────────────────────────────────────────────────────────────────

export interface SalesAnalystInput {
  orgName:       string;
  period:        string;          // "YYYYMM"
  kpis:          DashboardKpis;
  alerts:        BusinessAlertRow[];
  lineaMix:      LineaMixRow[];
  topClientes:   TopClienteRow[];
  participacion: ParticipacionVendedorRow[];
  prevKpis?:     DashboardKpis;   // prior period — used for MoM comparison context
}

// ── Formatters (shared with prompt builder) ───────────────────────────────────

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function pctStr(a: number, b: number): string {
  if (b === 0) return "N/A";
  return `${((a - b) / b * 100).toFixed(1)}%`;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(input: SalesAnalystInput): string {
  const { orgName, period, kpis, alerts, lineaMix, topClientes, participacion, prevKpis } = input;

  const criticalAlerts = alerts.filter(a => a.severity === "CRITICAL");
  const warningAlerts  = alerts.filter(a => a.severity === "WARNING");
  const infoAlerts     = alerts.filter(a => a.severity === "INFO");

  const topLinea    = lineaMix[0];
  const topCliente  = topClientes[0];
  const topVendedor = participacion[0];

  const momVentas = prevKpis
    ? `MoM ventas: ${pctStr(kpis.ventasMesActual, prevKpis.ventasMesActual)}`
    : "MoM ventas: sin datos período anterior";

  const lineaMixText = lineaMix.slice(0, 5).map(l =>
    `  - ${l.linea}: ${fmtCOP(l.ventas)} (${l.share.toFixed(1)}%)`
  ).join("\n");

  const topClientesText = topClientes.slice(0, 5).map((c, i) =>
    `  ${i + 1}. ${c.customerName} — ${fmtCOP(c.ventas)}${c.pedidos ? ` (${c.pedidos} pedidos)` : ""}`
  ).join("\n");

  const participacionText = participacion.slice(0, 5).map(v =>
    `  - ${v.sellerName}: ${fmtCOP(v.totalAmount)} (${v.share.toFixed(1)}%)`
  ).join("\n");

  const alertsText = alerts.slice(0, 10).map(a =>
    `  [${a.severity}] ${a.type}: ${a.title} — ${a.message}`
  ).join("\n");

  return `Eres un analista comercial ejecutivo senior para la empresa ${orgName}.
Analiza los datos de ventas del período ${fmtPeriodo(period)} y genera un informe ejecutivo estructurado.

DATOS DEL PERÍODO ${fmtPeriodo(period)}:

KPIs PRINCIPALES:
- Ventas totales: ${fmtCOP(kpis.ventasMesActual)}
- ${momVentas}
- Pedidos: ${kpis.pedidosMesActual != null ? kpis.pedidosMesActual : "N/D"}
- Ticket promedio: ${kpis.ticketPromedio != null ? fmtCOP(kpis.ticketPromedio) : "N/D"}
- Clientes únicos: ${kpis.clientesUnicos}
- Top línea: ${kpis.topLinea ?? "N/D"} (${fmtCOP(kpis.topLineaAmount)})
- Top vendedor: ${kpis.topVendedor ?? "N/D"} (${fmtCOP(kpis.topVendedorAmount)})

MIX POR LÍNEA:
${lineaMixText || "  Sin datos"}

TOP CLIENTES:
${topClientesText || "  Sin datos"}

PARTICIPACIÓN VENDEDORES:
${participacionText || "  Sin datos"}

ALERTAS AUTOMÁTICAS (${alerts.length} total: ${criticalAlerts.length} críticas, ${warningAlerts.length} advertencias, ${infoAlerts.length} informativas):
${alertsText || "  Sin alertas activas"}

INSTRUCCIONES:
Responde ÚNICAMENTE con un JSON válido siguiendo exactamente esta estructura (sin texto fuera del JSON):

{
  "summary": "string — 2-3 oraciones describiendo el estado comercial general del período",
  "performance": {
    "headline": "string — una frase tipo titular ejecutivo, ej: 'Ventas crecen 12% impulsadas por línea CASTILLITOS'",
    "metrics": [
      { "label": "string", "value": "string", "trend": "up|down|flat" }
    ]
  },
  "risks": [
    {
      "severity": "HIGH|MEDIUM|LOW",
      "title": "string",
      "detail": "string — explicación concisa con números",
      "entityType": "string — opcional",
      "entityLabel": "string — opcional"
    }
  ],
  "opportunities": [
    {
      "title": "string",
      "detail": "string — qué, por qué, con qué datos lo sustenta",
      "potentialImpact": "string — estimado en COP o % cuando sea posible"
    }
  ],
  "actions": [
    {
      "priority": 1|2|3,
      "action": "string — acción específica y accionable",
      "rationale": "string — dato que lo justifica",
      "owner": "gerencia|vendedor|marketing|operaciones"
    }
  ]
}

Reglas:
- 3-5 métricas en performance.metrics
- 2-4 riesgos, ordenados por severidad
- 2-3 oportunidades basadas en los datos reales
- 3-5 acciones priorizadas (prioridad 1 = urgente, máximo 2 de prioridad 1)
- Todo en español colombiano
- Números siempre en formato COP cuando aplique
- No inventes datos que no estén en el input`;
}

// ── Rule-based fallback brief ─────────────────────────────────────────────────
// Generated deterministically from input data when AI call is unavailable.

function buildFallbackBrief(input: SalesAnalystInput): SalesExecutiveBrief {
  const { period, kpis, alerts, lineaMix, topClientes, prevKpis } = input;

  const criticals = alerts.filter(a => a.severity === "CRITICAL");
  const warnings  = alerts.filter(a => a.severity === "WARNING");

  const momPct = prevKpis && prevKpis.ventasMesActual > 0
    ? ((kpis.ventasMesActual - prevKpis.ventasMesActual) / prevKpis.ventasMesActual * 100)
    : null;
  const momText = momPct != null
    ? `${momPct >= 0 ? "+" : ""}${momPct.toFixed(1)}% vs mes anterior`
    : "";

  const summary = [
    `Ventas ${fmtPeriodo(period)}: ${fmtCOP(kpis.ventasMesActual)}${momText ? ` (${momText})` : ""}.`,
    kpis.topLinea ? `Top línea: ${kpis.topLinea} con ${fmtCOP(kpis.topLineaAmount)}.` : "",
    criticals.length > 0
      ? `⚠ ${criticals.length} alerta(s) crítica(s) requieren atención inmediata.`
      : warnings.length > 0
      ? `${warnings.length} advertencia(s) activa(s).`
      : "Sin alertas críticas activas.",
  ].filter(Boolean).join(" ");

  const momTrend: MetricPoint["trend"] = momPct != null ? (momPct > 0 ? "up" : momPct < 0 ? "down" : "flat") : undefined;

  const metrics: MetricPoint[] = [
    { label: "Ventas totales",   value: fmtCOP(kpis.ventasMesActual), trend: momTrend },
    { label: "Ticket promedio",  value: kpis.ticketPromedio != null ? fmtCOP(kpis.ticketPromedio) : "N/D" },
    { label: "Clientes únicos",  value: String(kpis.clientesUnicos) },
    { label: "Top línea",        value: kpis.topLinea ? `${kpis.topLinea} — ${fmtCOP(kpis.topLineaAmount)}` : "N/D" },
    { label: "Top vendedor",     value: kpis.topVendedor ? `${kpis.topVendedor} — ${fmtCOP(kpis.topVendedorAmount)}` : "N/D" },
  ].filter(m => m.value !== "N/D");

  const risks: RiskItem[] = [
    ...criticals.map(a => ({
      severity: "HIGH" as const,
      title:    a.title,
      detail:   a.message,
      entityType:  a.entityType,
      entityLabel: a.entityLabel,
    })),
    ...warnings.slice(0, 3).map(a => ({
      severity: "MEDIUM" as const,
      title:    a.title,
      detail:   a.message,
      entityType:  a.entityType,
      entityLabel: a.entityLabel,
    })),
  ];

  const opportunities: OpportunityItem[] = lineaMix
    .filter(l => l.share > 0)
    .slice(0, 2)
    .map(l => ({
      title:  `Fortalecer línea ${l.linea}`,
      detail: `Representa ${l.share.toFixed(1)}% de las ventas (${fmtCOP(l.ventas)}). ` +
              `${l.pedidos != null ? `${l.pedidos} pedidos con ticket ${l.ticketProm != null ? fmtCOP(l.ticketProm) : "N/D"}.` : ""}`,
    }));

  const actions: ActionItem[] = [
    ...criticals.slice(0, 2).map((a): ActionItem => ({
      priority: 1,
      action:   `Revisar alerta: ${a.title}`,
      rationale: a.message,
      owner:    "gerencia",
    })),
    ...(topClientes[0] ? [{
      priority: 2 as const,
      action:   `Contactar cliente: ${topClientes[0].customerName}`,
      rationale: `Cliente de mayor valor con ${fmtCOP(topClientes[0].ventas)} en el período.`,
      owner:    "vendedor" as const,
    }] : []),
  ].slice(0, 5);

  return {
    period,
    generatedAt: new Date().toISOString(),
    source:      "fallback",
    summary,
    performance: {
      headline: `Ventas ${fmtPeriodo(period)}: ${fmtCOP(kpis.ventasMesActual)}${momText ? " — " + momText : ""}`,
      metrics,
    },
    risks,
    opportunities,
    actions,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function generateExecutiveBrief(
  input: SalesAnalystInput
): Promise<SalesExecutiveBrief> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // No API key → return deterministic fallback immediately
  if (!apiKey) {
    return buildFallbackBrief(input);
  }

  const client = new Anthropic({ apiKey });
  const prompt  = buildPrompt(input);

  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 2048,
      messages:   [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Extract JSON — Claude sometimes wraps in markdown fences
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, rawText];
    const jsonStr   = (jsonMatch[1] ?? rawText).trim();

    const parsed = JSON.parse(jsonStr) as Omit<SalesExecutiveBrief, "period" | "generatedAt" | "source">;

    return {
      ...parsed,
      period:      input.period,
      generatedAt: new Date().toISOString(),
      source:      "ai",
    };
  } catch (e) {
    console.error("[SalesExecutiveAnalyst] AI call failed, using fallback:", (e as Error).message);
    return buildFallbackBrief(input);
  }
}
