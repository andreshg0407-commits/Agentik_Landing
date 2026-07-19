/**
 * /[orgSlug]/alerts — Centro de Decisiones
 *
 * Redesigned from notification inbox to executive decision center.
 * Question answered: "¿Qué requiere intervención hoy?"
 *
 * Architecture:
 *   1. Executive Priority Strip — top CRITICAL signals, economic impact
 *   2. Copilot Strip — Agentik top-3 recommendations
 *   3. Alert Clusters — grouped by domain: Cartera / Comercial / Sistema
 *   4. Per-alert ActionCard — entity, impact, suggested action, CTAs
 *
 * Data: listAlerts (system) + listBusinessAlerts (CRM).
 * Actions: POST /api/alerts/[id]/acknowledge|resolve (existing, unchanged).
 * Backend: zero changes.
 */

import type { CSSProperties }    from "react";
import type { AlertSeverity }    from "@prisma/client";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import { listAlerts, listBusinessAlerts, listAlertRules, type BusinessAlertRow, type AlertRuleRow } from "@/lib/alerts/queries";
import { AlertActionButtons }    from "./alert-action-buttons";
import { RuleToggle }            from "./rule-toggle";

// ── Types ──────────────────────────────────────────────────────────────────────

type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

interface SystemAlert {
  kind:        "system";
  id:          string;
  type:        string;
  title:       string;
  message:     string | null;
  severity:    AlertSeverity;
  status:      string;
  metadataJson: unknown;
  sourceType:  string | null;
  sourceId:    string | null;
  resolvedAt:  Date | null;
  createdAt:   Date;
  updatedAt:   Date;
}

interface BizAlert {
  kind:        "biz";
  id:          string;
  module:      string;
  type:        string;
  severity:    AlertSeverity;
  status:      string;
  title:       string;
  message:     string | null;
  entityType:  string;
  entityLabel: string;
  period:      string;
  createdAt:   Date;
  updatedAt:   Date;
}

type AnyAlert = SystemAlert | BizAlert;

type ClusterKey = "cartera" | "comercial" | "finanzas" | "fiscal" | "sistema";

// ── Cluster assignment ─────────────────────────────────────────────────────────

const CARTERA_BIZ_TYPES = new Set(["cartera_vencida"]);
const COMERCIAL_BIZ_TYPES = new Set([
  "quote_sin_seguimiento", "oportunidad_estancada", "vendedor_pipeline_envejecido",
  "sales_drop", "seller_dependency", "line_sales_drop", "line_growth",
  "customer_inactive", "customer_concentration", "seller_ticket_drop",
  "cliente_premium_inactivo",
]);

function clusterFor(a: AnyAlert): ClusterKey {
  if (a.kind === "biz") {
    if (CARTERA_BIZ_TYPES.has(a.type)) return "cartera";
    if (COMERCIAL_BIZ_TYPES.has(a.type)) return "comercial";
    if (a.module === "finanzas") return "finanzas";
    return "sistema";
  }
  if (a.type.startsWith("cartera")) return "cartera";
  if (a.type.startsWith("dian") || a.type.startsWith("fiscal")) return "fiscal";
  if (a.type.startsWith("finanzas")) return "finanzas";
  return "sistema";
}

// ── Suggested actions ─────────────────────────────────────────────────────────

const SUGGESTED_ACTIONS: Record<string, string> = {
  "cartera.90dpd":              "Asignar gestora de cobro a cada cliente con mora >90 días. Generar cronograma de contacto.",
  "cartera.top_debtor":         "Escalar al comité de cobranza. Evaluar acuerdo de pago o inicio de proceso legal.",
  "cartera.concentration":      "Revisar política de crédito. Establecer límite máximo de exposición por cliente.",
  "cartera_vencida":            "Iniciar proceso de cobro formal. Verificar historial del cliente en Customer 360.",
  "quote_sin_seguimiento":      "Contactar al cliente antes de 24h. Actualizar estado de la cotización en CRM.",
  "cliente_premium_inactivo":   "Asignar visita prioritaria de reactivación. Revisar último pedido y canal preferido.",
  "oportunidad_estancada":      "Revisar el pipeline con el vendedor responsable. Definir próximo paso antes de 48h.",
  "vendedor_pipeline_envejecido": "Auditoría de pipeline. Depurar oportunidades sin actividad en los últimos 30 días.",
  "sales_drop":                 "Analizar caída con gerencia comercial. Identificar canal y período de mayor impacto.",
  "seller_dependency":          "Revisar plan de cobertura. Mitigar riesgo de dependencia por vendedor clave.",
  "line_sales_drop":            "Identificar causa raíz: precio, disponibilidad o demanda. Escalar a planeación comercial.",
  "line_growth":                "Asegurar stock suficiente y capacidad de despacho para sostener el crecimiento.",
  "customer_inactive":          "Activar campaña de reactivación. Asignar visita o llamada de recuperación.",
  "customer_concentration":     "Diversificar base activa. Revisar incentivos para clientes de menor volumen.",
  "seller_ticket_drop":         "Revisar mix de producto y políticas de precio con el vendedor.",
};

function suggestedAction(type: string): string {
  return SUGGESTED_ACTIONS[type] ?? "Revisar el detalle de la alerta y definir responsable y fecha de resolución.";
}

// ── Owner derivation ───────────────────────────────────────────────────────────

function ownerFor(a: AnyAlert): string {
  if (a.kind === "biz") {
    if (CARTERA_BIZ_TYPES.has(a.type)) return "Gestión de Cobro";
    if (["sales_drop", "seller_dependency", "line_sales_drop", "seller_ticket_drop"].includes(a.type)) return "Gerencia Comercial";
    return "Ventas / CRM";
  }
  if (a.type.startsWith("cartera")) return "Gestión de Cobro";
  return "Operaciones";
}

// ── Impact extraction ─────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

interface ImpactInfo {
  amount?:  string;
  dpd?:     number;
  slug?:    string;
  name?:    string;
  share?:   number;
}

function extractImpact(a: AnyAlert): ImpactInfo {
  if (a.kind !== "system") return {};
  const m = a.metadataJson as Record<string, unknown> | null;
  if (!m) return {};
  return {
    amount: typeof m.overdueReceivable === "number" ? fmtCOP(m.overdueReceivable) : undefined,
    dpd:    typeof m.maxDpd            === "number" ? m.maxDpd : undefined,
    slug:   typeof m.slug              === "string" ? m.slug   : (typeof m.topDebtorSlug === "string" ? m.topDebtorSlug : undefined),
    name:   typeof m.name              === "string" ? m.name   : (typeof m.topDebtorName === "string" ? m.topDebtorName : undefined),
    share:  typeof m.share             === "number" ? m.share  : (typeof m.concentrationRisk === "number" ? m.concentrationRisk : undefined),
  };
}

// ── Audit trail from metadata ─────────────────────────────────────────────────

function extractAudit(a: AnyAlert): { by?: string; at?: string } | null {
  if (a.kind !== "system") return null;
  const m = a.metadataJson as Record<string, unknown> | null;
  if (!m) return null;
  if (typeof m.resolvedAt === "string")     return { at: m.resolvedAt.slice(0, 16).replace("T", " "), by: typeof m.resolvedBy === "string" ? m.resolvedBy : undefined };
  if (typeof m.acknowledgedAt === "string") return { at: m.acknowledgedAt.slice(0, 16).replace("T", " "), by: typeof m.acknowledgedBy === "string" ? m.acknowledgedBy : undefined };
  return null;
}

// ── Severity palette ──────────────────────────────────────────────────────────

const SEV: Record<AlertSeverity, { label: string; bg: string; color: string; border: string; cardBorder: string }> = {
  CRITICAL: { label: "CRÍTICO",       bg: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5", cardBorder: "#fca5a5" },
  WARNING:  { label: "ALTA PRIORIDAD", bg: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74", cardBorder: "#fdba74" },
  INFO:     { label: "SEGUIMIENTO",   bg: "#f0f9ff", color: "#075985", border: "1px solid #7dd3fc", cardBorder: "#7dd3fc" },
};

const STATUS_LABEL: Record<string, string> = {
  OPEN:         "Abierta",
  ACKNOWLEDGED: "Reconocida",
  RESOLVED:     "Resuelta",
};

const CLUSTER_LABELS: Record<ClusterKey, string> = {
  cartera:   "Cartera y Cobranza",
  comercial: "Comercial / CRM",
  finanzas:  "Finanzas",
  fiscal:    "Fiscal / DIAN",
  sistema:   "Sistema",
};

const CLUSTER_ORDER: ClusterKey[] = ["cartera", "finanzas", "fiscal", "comercial", "sistema"];

// ── Inline style tokens ───────────────────────────────────────────────────────

const MONO: CSSProperties = { fontFamily: "monospace" };
const LABEL_TINY: CSSProperties = {
  fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
};

// ── SeverityBadge ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const s = SEV[severity];
  return (
    <span style={{
      ...LABEL_TINY,
      ...MONO,
      padding: "2px 8px",
      borderRadius: 3,
      background: s.bg,
      color: s.color,
      border: s.border,
    }}>
      {s.label}
    </span>
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const color = status === "RESOLVED" ? "#15803d" : status === "ACKNOWLEDGED" ? "#b45309" : "#7c3aed";
  const bg    = status === "RESOLVED" ? "#f0fdf4"  : status === "ACKNOWLEDGED" ? "#fffbeb"  : "#f5f3ff";
  return (
    <span style={{ ...LABEL_TINY, ...MONO, padding: "2px 8px", borderRadius: 3, background: bg, color }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ── ActionCard ────────────────────────────────────────────────────────────────

function ActionCard({
  alert,
  orgId,
  orgSlug,
}: {
  alert:   AnyAlert;
  orgId:   string;
  orgSlug: string;
}) {
  const sev    = SEV[alert.severity];
  const impact = extractImpact(alert);
  const audit  = extractAudit(alert);
  const owner  = ownerFor(alert);
  const action = suggestedAction(alert.type);
  const customerSlug =
    impact.slug ??
    (alert.kind === "biz" && alert.entityType === "customer"
      ? alert.entityLabel.toLowerCase().replace(/\s+/g, "-")
      : undefined);

  return (
    <div style={{
      ...MONO,
      border: `1.5px solid ${sev.cardBorder}`,
      borderRadius: 7,
      padding: "16px 20px",
      background: "#fff",
      marginBottom: 12,
    }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <SeverityBadge severity={alert.severity} />
        <StatusPill status={alert.status} />
        <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#111" }}>{alert.title}</span>
        <span style={{ fontSize: 10, color: "#aaa" }}>
          {alert.createdAt.toISOString().slice(0, 10)}
        </span>
      </div>

      {/* Body grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", marginBottom: 10 }}>

        {/* Entity */}
        <div>
          <span style={{ ...LABEL_TINY, color: "#888" }}>Entidad{" "}</span>
          <span style={{ fontSize: 12, color: "#333" }}>
            {alert.kind === "biz" ? alert.entityLabel : (impact.name ?? "—")}
          </span>
        </div>

        {/* Owner */}
        <div>
          <span style={{ ...LABEL_TINY, color: "#888" }}>Responsable{" "}</span>
          <span style={{ fontSize: 12, color: "#333" }}>{owner}</span>
        </div>

        {/* Impact */}
        {(impact.amount || impact.dpd) && (
          <div>
            <span style={{ ...LABEL_TINY, color: "#888" }}>Impacto{" "}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#991b1b" }}>
              {impact.amount && <>{impact.amount}</>}
              {impact.amount && impact.dpd && " · "}
              {impact.dpd && <>{impact.dpd} días mora</>}
              {impact.share && ` · ${impact.share.toFixed(0)}% concentración`}
            </span>
          </div>
        )}

        {/* Period (biz only) */}
        {alert.kind === "biz" && (
          <div>
            <span style={{ ...LABEL_TINY, color: "#888" }}>Período{" "}</span>
            <span style={{ fontSize: 12, color: "#555" }}>{alert.period}</span>
          </div>
        )}
      </div>

      {/* Message (if present) */}
      {alert.message && (
        <div style={{
          fontSize: 11,
          color: "#555",
          padding: "8px 12px",
          background: "#fafafa",
          borderRadius: 4,
          borderLeft: `3px solid ${sev.cardBorder}`,
          marginBottom: 10,
          lineHeight: 1.5,
        }}>
          {alert.message}
        </div>
      )}

      {/* Suggested action */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ ...LABEL_TINY, color: "#6d28d9" }}>Accion sugerida{" "}</span>
        <span style={{ fontSize: 12, color: "#3730a3" }}>{action}</span>
      </div>

      {/* Audit trail */}
      {audit && (
        <div style={{ fontSize: 10, color: "#aaa", marginBottom: 6 }}>
          {alert.status === "RESOLVED" ? "Resuelta" : "Reconocida"} el {audit.at}
          {audit.by ? ` por ${audit.by.slice(0, 8)}...` : ""}
        </div>
      )}

      {/* Action buttons — client component */}
      {alert.status !== "RESOLVED" && (
        <AlertActionButtons
          alertId={alert.id}
          orgId={orgId}
          orgSlug={orgSlug}
          status={alert.status as AlertStatus}
          customerSlug={customerSlug}
          alertHref={alert.kind === "system" ? `/${orgSlug}/alerts/${alert.id}` : undefined}
        />
      )}
    </div>
  );
}

// ── Priority card (Executive Strip) ──────────────────────────────────────────

function PriorityCard({ alert }: { alert: AnyAlert }) {
  const sev    = SEV[alert.severity];
  const impact = extractImpact(alert);

  return (
    <div style={{
      ...MONO,
      border: `2px solid ${sev.cardBorder}`,
      borderRadius: 7,
      padding: "16px 18px",
      background: sev.bg,
      flex: "1 1 220px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <SeverityBadge severity={alert.severity} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#111", marginBottom: 4, lineHeight: 1.3 }}>
        {alert.title}
      </div>
      {impact.amount && (
        <div style={{ fontSize: 18, fontWeight: 800, color: sev.color, marginBottom: 4 }}>
          {impact.amount}
        </div>
      )}
      {impact.dpd && (
        <div style={{ fontSize: 11, color: sev.color }}>
          {impact.dpd} días · mayor mora activa
        </div>
      )}
      {!impact.amount && !impact.dpd && alert.message && (
        <div style={{ fontSize: 11, color: "#555", lineHeight: 1.4 }}>
          {alert.message.slice(0, 100)}{alert.message.length > 100 ? "…" : ""}
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 10, color: "#888" }}>
        {ownerFor(alert)} · {alert.createdAt.toISOString().slice(0, 10)}
      </div>
    </div>
  );
}

// ── Copilot strip ─────────────────────────────────────────────────────────────

function CopilotStrip({
  critical,
  orgSlug,
}: {
  critical: AnyAlert[];
  orgSlug:  string;
}) {
  const top3 = critical.slice(0, 3);
  if (top3.length === 0) return null;

  const lines = top3.map((a, i) => {
    const action = suggestedAction(a.type);
    const short  = action.split(".")[0];
    return `${i + 1}. ${short}.`;
  });

  return (
    <div style={{
      ...MONO,
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
      padding: "14px 18px",
      marginBottom: 24,
      border: "1px solid #e0e7ff",
      borderLeft: "3px solid #4f46e5",
      borderRadius: 6,
      background: "#f5f3ff",
      flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ ...LABEL_TINY, color: "#6d28d9", marginBottom: 6 }}>
          Agentik recomienda
        </div>
        <div style={{ fontSize: 12, color: "#3730a3", fontWeight: 700, marginBottom: 6 }}>
          Si hoy solo haces {lines.length} cosa{lines.length > 1 ? "s" : ""}:
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 12, color: "#3730a3", lineHeight: 1.6 }}>{l}</div>
        ))}
      </div>
      <a
        href={`/${orgSlug}/customer-360`}
        style={{
          padding: "7px 16px",
          fontSize: 12,
          fontWeight: 700,
          background: "#4f46e5",
          color: "#fff",
          borderRadius: 4,
          textDecoration: "none",
          whiteSpace: "nowrap",
          alignSelf: "center",
        }}
      >
        Ver cartera →
      </a>
    </div>
  );
}

// ── ClusterSection ────────────────────────────────────────────────────────────

function ClusterSection({
  cluster,
  alerts,
  orgId,
  orgSlug,
}: {
  cluster: ClusterKey;
  alerts:  AnyAlert[];
  orgId:   string;
  orgSlug: string;
}) {
  if (alerts.length === 0) return null;
  const openCount = alerts.filter(a => a.status !== "RESOLVED").length;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        ...MONO,
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: "1.5px solid #111",
      }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{CLUSTER_LABELS[cluster]}</span>
        {openCount > 0 && (
          <span style={{
            ...LABEL_TINY,
            padding: "2px 8px",
            borderRadius: 3,
            background: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fca5a5",
          }}>
            {openCount} requiere{openCount > 1 ? "n" : ""} accion
          </span>
        )}
        <span style={{ fontSize: 11, color: "#aaa" }}>{alerts.length} total</span>
      </div>
      {alerts.map(a => (
        <ActionCard key={a.id} alert={a} orgId={orgId} orgSlug={orgSlug} />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Rule catalogue templates (shown when no rules exist yet) ──────────────────

interface RuleTemplate {
  id:          string;
  cluster:     string;
  name:        string;
  description: string;
  eventType:   string;
  example:     string;
}

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "cartera-60",
    cluster: "Cartera",
    name: "Cartera +60 días supera monto",
    description: "Alerta cuando la cartera vencida a más de 60 días supera un umbral definido en COP.",
    eventType: "cartera.aging",
    example: "Si cartera +60d > $100M → CRÍTICO · Responsable: Gestión de Cobro",
  },
  {
    id: "f2-unconverted",
    cluster: "Cartera",
    name: "Remisiones F2 sin convertir",
    description: "Detecta remisiones F2 que no se han convertido a factura F1 en N días.",
    eventType: "f2.unconverted",
    example: "Si remisión F2 > 30 días sin factura → ALTA PRIORIDAD",
  },
  {
    id: "budget-exceeded",
    cluster: "Finanzas",
    name: "Presupuesto mensual superado",
    description: "Alerta cuando el gasto real del período supera el presupuesto aprobado.",
    eventType: "budget.exceeded",
    example: "Si ejecución > 100% del presupuesto → CRÍTICO · Canal: Email gerencia",
  },
  {
    id: "budget-marketing-80",
    cluster: "Finanzas",
    name: "Presupuesto marketing al 80%",
    description: "Alerta temprana cuando marketing consume el 80% del presupuesto asignado.",
    eventType: "budget.threshold",
    example: "Si marketing > 80% del budget → SEGUIMIENTO · Responsable: CMO",
  },
  {
    id: "dian-mismatch",
    cluster: "Fiscal",
    name: "DIAN con diferencias",
    description: "Detecta facturas con diferencia entre lo declarado en DIAN y el sistema interno.",
    eventType: "dian.mismatch",
    example: "Si factura DIAN ≠ SAG → FISCAL · Requiere carga XML",
  },
  {
    id: "inventory-low",
    cluster: "Operaciones",
    name: "Inventario bajo por línea",
    description: "Alerta cuando el inventario de una línea, marca o producto cae por debajo del mínimo.",
    eventType: "inventory.updated",
    example: "Si stock línea Jean < 50 unidades → OPERATIVO",
  },
  {
    id: "store-no-close",
    cluster: "Operaciones",
    name: "Tienda sin cierre diario",
    description: "Detecta tiendas que no registraron cierre de caja en el día.",
    eventType: "store.close_missing",
    example: "Si tienda sin cierre antes de 22:00 → ALTA PRIORIDAD · Canal: WhatsApp encargado",
  },
  {
    id: "line-sales-drop",
    cluster: "Comercial",
    name: "Caída de ventas en línea",
    description: "Alerta cuando las ventas de una línea caen más de X% respecto al promedio histórico.",
    eventType: "sales.line_drop",
    example: "Si línea cae >25% vs. promedio 3 meses → WARNING",
  },
];

const CLUSTER_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Cartera:     { bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" },
  Finanzas:    { bg: "#fff7ed", color: "#9a3412", border: "#fdba74" },
  Fiscal:      { bg: "#eff6ff", color: "#1e40af", border: "#93c5fd" },
  Operaciones: { bg: "#faf5ff", color: "#6b21a8", border: "#d8b4fe" },
  Comercial:   { bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AlertsPage({
  params,
  searchParams,
}: {
  params:       { orgSlug: string };
  searchParams: { tab?: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const orgSlug          = params.orgSlug;
  const orgId            = organization.id;
  const tab              = searchParams.tab === "reglas" ? "reglas" : "centro";

  const [rawAlerts, rawBiz, rules] = await Promise.all([
    listAlerts(orgId),
    listBusinessAlerts(orgId),
    listAlertRules(orgId),
  ]);

  // Merge into unified list
  const allAlerts: AnyAlert[] = [
    ...rawAlerts.map(a => ({ ...a, kind: "system" as const })),
    ...rawBiz.map((a: BusinessAlertRow) => ({ ...a, kind: "biz" as const })),
  ];

  // Sort: CRITICAL first, then WARNING, then INFO; within same severity — newest first
  const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  allAlerts.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.createdAt.getTime() - a.createdAt.getTime(),
  );

  // Active (not resolved) subset
  const activeAlerts  = allAlerts.filter(a => a.status !== "RESOLVED");
  const criticalStrip = allAlerts
    .filter(a => (a.severity === "CRITICAL" || a.severity === "WARNING") && a.status !== "RESOLVED")
    .slice(0, 5);

  // Cluster map
  const clusters = new Map<ClusterKey, AnyAlert[]>();
  for (const k of CLUSTER_ORDER) clusters.set(k, []);
  for (const a of allAlerts) {
    const c = clusterFor(a);
    clusters.get(c)!.push(a);
  }

  const totalOpen = activeAlerts.length;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: 11, color: "#888", marginBottom: 18, display: "flex", gap: 6 }}>
        <a href={`/${orgSlug}/agentik`} style={{ color: "#888", textDecoration: "none" }}>Operaciones</a>
        <span style={{ color: "#ccc" }}>/</span>
        <span style={{ color: "#111", fontWeight: 700 }}>
          {tab === "reglas" ? "Reglas de Alertas" : "Centro de Decisiones"}
        </span>
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1.5px solid #111" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111", letterSpacing: "-0.02em" }}>
            {tab === "reglas" ? "Reglas de Alertas" : "Centro de Decisiones"}
          </h1>
          {tab === "centro" && (totalOpen > 0 ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", background: "#fef2f2", padding: "3px 10px", borderRadius: 4, border: "1px solid #fca5a5" }}>
              {totalOpen} requieren intervención hoy
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#15803d", background: "#f0fdf4", padding: "3px 10px", borderRadius: 4, border: "1px solid #bbf7d0" }}>
              Sin alertas activas
            </span>
          ))}
          {tab === "reglas" && (
            <span style={{ fontSize: 12, color: "#555" }}>
              {rules.length} regla{rules.length !== 1 ? "s" : ""} configurada{rules.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          {tab === "reglas"
            ? "Define cuándo y cómo Agentik te alerta. Configurable por tenant sin código."
            : "¿Qué requiere intervención hoy? Resuelve de arriba hacia abajo."}
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid #e5e7eb" }}>
        {([
          { key: "centro", label: "Centro de Decisiones", count: totalOpen },
          { key: "reglas", label: "Reglas de Alertas",    count: rules.length },
        ] as { key: string; label: string; count: number }[]).map(t => (
          <a
            key={t.key}
            href={`/${orgSlug}/alerts${t.key === "reglas" ? "?tab=reglas" : ""}`}
            style={{
              padding: "8px 18px",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              color: tab === t.key ? "#111" : "#888",
              borderBottom: tab === t.key ? "2px solid #111" : "2px solid transparent",
              marginBottom: -1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                padding: "1px 6px",
                borderRadius: 10,
                background: tab === t.key ? "#111" : "#e5e7eb",
                color: tab === t.key ? "#fff" : "#666",
              }}>
                {t.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: CENTRO DE DECISIONES
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "centro" && allAlerts.length === 0 && (
        <div style={{
          ...MONO,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "48px 24px",
          border: "1.5px solid #bbf7d0",
          borderRadius: 10,
          background: "#f0fdf4",
          textAlign: "center",
          maxWidth: 520,
          margin: "0 auto",
        }}>
          {/* Status icon */}
          <div style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "#dcfce7",
            border: "2px solid #86efac",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            marginBottom: 16,
          }}>
            ✓
          </div>

          <div style={{ fontSize: 17, fontWeight: 800, color: "#15803d", marginBottom: 6 }}>
            Operación normal
          </div>
          <div style={{ fontSize: 13, color: "#166534", marginBottom: 20, lineHeight: 1.5 }}>
            No hay alertas que requieran intervención en este momento.
          </div>

          {/* Mini checks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, alignSelf: "stretch" }}>
            {[
              "Sin alertas críticas activas",
              "Sin tareas vencidas asociadas",
              "Monitoreo activo en todos los dominios",
            ].map(label => (
              <div key={label} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                background: "#fff",
                borderRadius: 6,
                border: "1px solid #bbf7d0",
                fontSize: 12,
                color: "#166534",
                fontWeight: 600,
              }}>
                <span style={{ color: "#15803d", fontWeight: 800, fontSize: 14 }}>✓</span>
                {label}
              </div>
            ))}
          </div>

          {/* Copilot note */}
          <div style={{
            fontSize: 11,
            color: "#15803d",
            marginBottom: 20,
            padding: "8px 14px",
            background: "#dcfce7",
            borderRadius: 5,
            border: "1px solid #86efac",
            lineHeight: 1.5,
          }}>
            Agentik monitorea cartera, finanzas, comercial y sistema continuamente.
            Recibirás alertas en cuanto se detecte algo que requiera tu atención.
          </div>

          <a
            href={`/${orgSlug}/dashboard`}
            style={{
              padding: "8px 20px",
              fontSize: 12,
              fontWeight: 700,
              background: "#15803d",
              color: "#fff",
              borderRadius: 5,
              textDecoration: "none",
            }}
          >
            Volver al Centro de Operaciones
          </a>
        </div>
      )}

      {tab === "centro" && allAlerts.length > 0 && (
        <>
          {/* ── Copilot strip ── */}
          <CopilotStrip critical={criticalStrip} orgSlug={orgSlug} />

          {/* ── Executive Priority Strip ── */}
          {criticalStrip.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#888",
                marginBottom: 12,
              }}>
                Prioridades ejecutivas — intervención inmediata
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {criticalStrip.map(a => <PriorityCard key={a.id} alert={a} />)}
              </div>
            </div>
          )}

          {/* ── Alert Clusters ── */}
          <div style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#888",
            marginBottom: 16,
            marginTop: 8,
          }}>
            Cola de accion — por dominio
          </div>

          {CLUSTER_ORDER.map(k => (
            <ClusterSection
              key={k}
              cluster={k}
              alerts={clusters.get(k) ?? []}
              orgId={orgId}
              orgSlug={orgSlug}
            />
          ))}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: REGLAS DE ALERTAS
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "reglas" && (
        <div>

          {/* Header actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <span style={{ ...LABEL_TINY, color: "#888" }}>
                {rules.filter(r => r.status === "ACTIVE").length} activas ·{" "}
                {rules.filter(r => r.status === "PAUSED").length} pausadas
              </span>
            </div>
            {/* Placeholder — creation form coming next sprint */}
            <button
              disabled
              title="Creación de reglas personalizadas — próxima versión"
              style={{
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "monospace",
                borderRadius: 4,
                border: "1px solid #ddd",
                background: "#f5f5f5",
                color: "#aaa",
                cursor: "not-allowed",
              }}
            >
              + Crear regla
            </button>
          </div>

          {/* ── Active rules list ── */}
          {rules.length > 0 ? (
            <div style={{ marginBottom: 32 }}>
              <div style={{ ...LABEL_TINY, color: "#888", marginBottom: 12 }}>
                Reglas configuradas
              </div>
              {rules.map(rule => (
                <div key={rule.id} style={{
                  ...MONO,
                  border: rule.status === "ACTIVE" ? "1.5px solid #bbf7d0" : "1px solid #e5e7eb",
                  borderRadius: 7,
                  padding: "14px 18px",
                  marginBottom: 10,
                  background: rule.status === "ACTIVE" ? "#fafffe" : "#fafafa",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginBottom: 3 }}>
                      {rule.name}
                    </div>
                    {rule.description && (
                      <div style={{ fontSize: 11, color: "#666" }}>{rule.description}</div>
                    )}
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
                      evento: {rule.eventType}
                      {rule.moduleCode && ` · módulo: ${rule.moduleCode}`}
                      {" · prioridad "}{rule.priority}
                      {" · "}{rule.updatedAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  {rule.status !== "ARCHIVED" && (
                    <RuleToggle ruleId={rule.id} orgId={orgId} status={rule.status} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              ...MONO,
              padding: "24px 20px",
              border: "1px solid #e5e7eb",
              borderRadius: 7,
              background: "#fafafa",
              marginBottom: 32,
              textAlign: "center",
              fontSize: 12,
              color: "#888",
            }}>
              Aún no hay reglas configuradas para esta organización.
              <br />
              <span style={{ fontSize: 11, color: "#aaa" }}>
                Las alertas actuales son generadas automáticamente por Agentik a partir de datos de cartera y ventas.
              </span>
            </div>
          )}

          {/* ── Rule catalogue ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...LABEL_TINY, color: "#888", marginBottom: 4 }}>
              Catálogo de reglas disponibles
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 16 }}>
              Estas reglas pueden activarse para tu organización. Configuración personalizada disponible en la próxima versión.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {RULE_TEMPLATES.map(t => {
                const c = CLUSTER_COLORS[t.cluster] ?? { bg: "#f5f5f5", color: "#555", border: "#ddd" };
                return (
                  <div key={t.id} style={{
                    ...MONO,
                    border: `1px solid ${c.border}`,
                    borderRadius: 7,
                    padding: "14px 16px",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                      <span style={{
                        ...LABEL_TINY,
                        padding: "2px 7px",
                        borderRadius: 3,
                        background: c.bg,
                        color: c.color,
                        border: `1px solid ${c.border}`,
                      }}>
                        {t.cluster}
                      </span>
                      <span style={{
                        ...LABEL_TINY,
                        padding: "2px 7px",
                        borderRadius: 3,
                        background: "#fef9c3",
                        color: "#854d0e",
                        border: "1px solid #fde68a",
                      }}>
                        Próximamente
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#111", marginBottom: 5 }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5, marginBottom: 8, flex: 1 }}>
                      {t.description}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: "#6d28d9",
                      background: "#f5f3ff",
                      border: "1px solid #e0e7ff",
                      borderRadius: 4,
                      padding: "5px 8px",
                      lineHeight: 1.4,
                    }}>
                      {t.example}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div style={{
            ...MONO,
            marginTop: 24,
            padding: "12px 16px",
            border: "1px solid #e0e7ff",
            borderLeft: "3px solid #4f46e5",
            borderRadius: 6,
            background: "#f5f3ff",
            fontSize: 11,
            color: "#3730a3",
          }}>
            <strong>Próxima versión:</strong> creación de reglas con umbral configurable,
            canal de notificación (Email / WhatsApp / Sistema) y responsable asignado por tenant.
            Las reglas del catálogo se podrán activar con un clic.
          </div>

        </div>
      )}

    </div>
  );
}
