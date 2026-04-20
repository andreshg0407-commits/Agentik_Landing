"use client";

/**
 * Customer 360 client component.
 *
 * Two views:
 *  - LIST view: customer table with filters and KPI summary row
 *  - FICHA view: full 360 card when ?slug is set
 *
 * All styling is inline CSS, monospace font family, enterprise dark-on-white
 * style — no Tailwind classes.
 */

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { statusLabel, stageLabel } from "@/lib/ui/status-labels";
import type {
  SerializedCustomerSummary,
  SerializedCustomer360,
} from "./page";
import type { SerializedCommercialFact } from "@/lib/commercial-ledger/types";
import SagEnqueueButton from "./sag-enqueue-button";
import ActionButton     from "../_action-button";
import { suggestAction } from "@/lib/collections/suggest-action";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:            string;
  selectedSlug:       string | null;
  q:                  string | null;
  status:             string | null;
  churnRisk:          string | null;
  sellerSlug:         string | null;
  hasOverdue:         boolean;
  customers:          SerializedCustomerSummary[];
  customersError:     boolean;
  detail:             SerializedCustomer360 | null;
  detailError:        boolean;
  commercialTimeline: SerializedCommercialFact[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCOP(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtN(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO").format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CO", {
    year: "numeric", month: "short", day: "numeric",
  });
}

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

// ── Risk / churn helpers ──────────────────────────────────────────────────────

const CHURN_COLORS: Record<string, CSSProperties> = {
  LOW:      { background: "#bbf7d0", color: "#14532d" },
  MEDIUM:   { background: "#fde68a", color: "#92400e" },
  HIGH:     { background: "#fed7aa", color: "#9a3412" },
  CRITICAL: { background: "#fca5a5", color: "#991b1b" },
};

const CHURN_LABELS: Record<string, string> = {
  LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto", CRITICAL: "Crítico",
};

const STATUS_COLORS: Record<string, CSSProperties> = {
  ACTIVE:   { background: "#bbf7d0", color: "#14532d" },
  INACTIVE: { background: "#e5e7eb", color: "#374151" },
  BLOCKED:  { background: "#fca5a5", color: "#991b1b" },
};

function ChurnBadge({ risk }: { risk: string | null }) {
  if (!risk) return <span style={{ color: "#ccc" }}>—</span>;
  const style = CHURN_COLORS[risk] ?? { background: "#e5e7eb", color: "#374151" };
  return (
    <span style={{
      ...style,
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 4,
      fontFamily: "monospace",
    }}>
      {CHURN_LABELS[risk] ?? risk}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] ?? { background: "#e5e7eb", color: "#374151" };
  return (
    <span style={{
      ...style,
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 4,
      fontFamily: "monospace",
    }}>
      {statusLabel(status)}
    </span>
  );
}

const STAGE_COLORS: Record<string, string> = {
  prospect:    "#94a3b8",
  qualified:   "#60a5fa",
  proposal:    "#a78bfa",
  negotiation: "#fb923c",
  closed_won:  "#4ade80",
  closed_lost: "#f87171",
};

const AGING_COLORS: Record<string, CSSProperties> = {
  CURRENT:  { background: "#bbf7d0", color: "#14532d" },
  "1-30":   { background: "#fde68a", color: "#92400e" },
  "31-60":  { background: "#fed7aa", color: "#9a3412" },
  "61-90":  { background: "#fca5a5", color: "#991b1b" },
  "90+":    { background: "#f87171", color: "#7f1d1d" },
};

const ACTIVITY_ICONS: Record<string, string> = {
  call:     "📞",
  email:    "📧",
  meeting:  "🤝",
  note:     "📝",
  task:     "✅",
  demo:     "🖥",
  visit:    "🏢",
};

// ── Commercial ledger helpers ─────────────────────────────────────────────────

const LEDGER_SOURCE_INFO: Record<string, { label: string; bg: string; color: string }> = {
  crm_quote:   { label: "Pedido CRM",  bg: "#ede9fe", color: "#6d28d9" },
  sag_invoice: { label: "Factura SAG", bg: "#dbeafe", color: "#1d4ed8" },
  xml_payment: { label: "Pago XML",    bg: "#dcfce7", color: "#15803d" },
};

const PAYMENT_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  paid:    { bg: "#bbf7d0", color: "#14532d", label: "Pagado"   },
  partial: { bg: "#fde68a", color: "#92400e", label: "Parcial"  },
  pending: { bg: "#e5e7eb", color: "#374151", label: "Pendiente"},
  overdue: { bg: "#fca5a5", color: "#991b1b", label: "Vencido"  },
};

function PaymentStatusBadge({ status }: { status: string }) {
  const s = PAYMENT_STATUS_STYLES[status] ?? { bg: "#e5e7eb", color: "#374151", label: status };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px",
      borderRadius: 4, fontFamily: "monospace",
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const QUOTE_STATUS_COLORS: Record<string, CSSProperties> = {
  DRAFT:    { background: "#e5e7eb", color: "#374151" },
  SENT:     { background: "#bfdbfe", color: "#1e3a8a" },
  ACCEPTED: { background: "#bbf7d0", color: "#14532d" },
  REJECTED: { background: "#fca5a5", color: "#991b1b" },
  EXPIRED:  { background: "#fde68a", color: "#92400e" },
};

// ── CRM empty state helper ────────────────────────────────────────────────────
// Distinguishes three states in CRM sections (opportunities, activities, quotes):
//   • CRM never synced  → amber warning prompting sync run
//   • Customer unmatched (no NIT) → orange notice
//   • Synced but no records → neutral grey message

function CrmEmptyState({
  synced,
  syncedAt,
  neverSyncedMsg,
  emptyMsg,
  unmatchedMsg,
}: {
  synced:         boolean;
  syncedAt:       string | null;
  neverSyncedMsg: string;
  emptyMsg:       string;
  unmatchedMsg?:  string;
}) {
  if (!synced) {
    return (
      <div style={{
        padding: "12px 16px",
        fontSize: 12,
        color: "#92400e",
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: 4,
      }}>
        {neverSyncedMsg}
      </div>
    );
  }

  if (unmatchedMsg) {
    return (
      <div style={{
        padding: "12px 16px",
        fontSize: 12,
        color: "#9a3412",
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: 4,
      }}>
        {unmatchedMsg}
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 16px", fontSize: 12, color: "#aaa", background: "#fafafa" }}>
      {emptyMsg}
      {syncedAt && (
        <span style={{ marginLeft: 8, fontSize: 11, color: "#ccc" }}>
          Último sync: {new Date(syncedAt).toLocaleDateString("es-CO", { dateStyle: "medium" })}
        </span>
      )}
    </div>
  );
}

// ── Table primitives ──────────────────────────────────────────────────────────

const TABLE: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const THEAD_ROW: CSSProperties = { borderBottom: "1px solid #eee", background: "#fafafa" };

function TH({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "6px 14px",
      textAlign: right ? "right" : "left",
      fontWeight: 600,
      color: "#777",
      fontSize: 11,
    }}>
      {children}
    </th>
  );
}

function TD({ children, right, bold }: { children: ReactNode; right?: boolean; bold?: boolean }) {
  return (
    <td style={{
      padding: "7px 14px",
      textAlign: right ? "right" : "left",
      fontWeight: bold ? 600 : 400,
      color: "#111",
      borderBottom: "1px solid #f5f5f5",
    }}>
      {children}
    </td>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
}: {
  label:   string;
  value:   string;
  accent?: "green" | "red" | "yellow";
}) {
  const bg    = accent === "green" ? "#f0fdf4" : accent === "red" ? "#fef2f2" : accent === "yellow" ? "#fffbeb" : "#fff";
  const color = accent === "green" ? "#15803d" : accent === "red" ? "#991b1b" : accent === "yellow" ? "#92400e" : "#111";
  return (
    <div style={{
      border: "1px solid #ddd",
      borderRadius: 6,
      padding: "14px 18px",
      background: bg,
      fontFamily: "monospace",
    }}>
      <div style={{
        fontSize: 10,
        color: "#888",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
      <div style={{
        padding: "9px 14px",
        borderBottom: "1px solid #ddd",
        background: "#f5f5f5",
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Empty state card ──────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      border: "1px solid #ddd",
      borderRadius: 6,
      padding: "32px 24px",
      background: "#fafafa",
      textAlign: "center",
      fontFamily: "monospace",
    }}>
      <div style={{ fontSize: 13, color: "#888", maxWidth: 480, margin: "0 auto" }}>
        {message}
      </div>
    </div>
  );
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function buildUrl(orgSlug: string, params: Record<string, string | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return `/${orgSlug}/customer-360${qs ? `?${qs}` : ""}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomerClient({
  orgSlug,
  selectedSlug,
  q,
  status,
  churnRisk,
  sellerSlug,
  hasOverdue,
  customers,
  customersError,
  detail,
  detailError,
  commercialTimeline,
}: Props) {
  const baseUrl = `/${orgSlug}/customer-360`;

  const [scoring, setScoring]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [scoreMsg, setScoreMsg] = useState<string>("");

  async function runScoring() {
    setScoring("loading");
    setScoreMsg("");
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/customer-360/score`, { method: "POST" });
      const json = await res.json() as { scored?: number; source?: string; ms?: number; error?: string };
      if (!res.ok) {
        setScoreMsg(json.error ?? "Error desconocido");
        setScoring("error");
        return;
      }
      setScoreMsg(`${json.scored ?? 0} clientes actualizados (${json.source === "ai" ? "IA" : "determinístico"}, ${json.ms ?? 0}ms)`);
      setScoring("done");
      // Reload page so scores appear in the table
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setScoreMsg((e as Error).message);
      setScoring("error");
    }
  }

  // ── FICHA view ──────────────────────────────────────────────────────────────

  if (selectedSlug) {
    return (
      <div style={{ fontFamily: "monospace", maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

        {/* Back link */}
        <div style={{ marginBottom: 16 }}>
          <a
            href={buildUrl(orgSlug, { q, status, churnRisk, sellerSlug, hasOverdue: hasOverdue ? "true" : null })}
            style={{ fontSize: 11, color: "#888", textDecoration: "none", fontFamily: "monospace" }}
          >
            ← Volver a clientes
          </a>
        </div>

        {detailError && (
          <EmptyState message="No hay datos de clientes disponibles. Configure los conectores SAG PYA SOAP y CRM para importar clientes." />
        )}

        {!detailError && !detail && (
          <EmptyState message="Cliente no encontrado." />
        )}

        {detail && <CustomerFicha detail={detail} orgSlug={orgSlug} commercialTimeline={commercialTimeline} />}
      </div>
    );
  }

  // ── LIST view ───────────────────────────────────────────────────────────────

  // Compute KPIs from customer list
  const total        = customers.length;
  const withOverdue  = customers.filter(c => (c.overdueReceivable ?? 0) > 0).length;
  const highCritical = customers.filter(c => c.churnRisk === "HIGH" || c.churnRisk === "CRITICAL").length;
  const now90        = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const inactive90d  = customers.filter(c =>
    c.lastPurchaseAt && new Date(c.lastPurchaseAt) < now90,
  ).length;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <a href={`/${orgSlug}/sales`} style={{ fontSize: 11, color: "#888", textDecoration: "none", fontFamily: "monospace" }}>← Control Comercial</a>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Cliente 360</h1>
        <span style={{
          fontSize: 11,
          background: "#111",
          color: "#fff",
          padding: "2px 10px",
          borderRadius: 4,
          fontWeight: 700,
          letterSpacing: "0.03em",
        }}>
          {fmtN(total)} clientes
        </span>

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Scoring button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {scoring === "done" && (
            <span style={{ fontSize: 11, color: "#15803d", fontFamily: "monospace" }}>✓ {scoreMsg}</span>
          )}
          {scoring === "error" && (
            <span style={{ fontSize: 11, color: "#991b1b", fontFamily: "monospace" }}>✗ {scoreMsg}</span>
          )}
          <button
            type="button"
            disabled={scoring === "loading"}
            onClick={runScoring}
            style={{
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 700,
              background: scoring === "loading" ? "#aaa" : "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: scoring === "loading" ? "not-allowed" : "pointer",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}
          >
            {scoring === "loading" ? "Calculando…" : "Actualizar scoring"}
          </button>
        </div>
      </div>

      {/* ── Filter form ── */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "9px 14px", borderBottom: "1px solid #ddd", background: "#f5f5f5" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Filtros</span>
        </div>
        <form method="GET" action={baseUrl} style={{ padding: "14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>

            {/* Search */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Buscar (nombre/NIT)
              </label>
              <input
                type="text"
                name="q"
                defaultValue={q ?? ""}
                placeholder="nombre o NIT..."
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace", boxSizing: "border-box" }}
              />
            </div>

            {/* Status */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Estado
              </label>
              <select
                name="status"
                defaultValue={status ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Todos</option>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
                <option value="BLOCKED">Bloqueado</option>
              </select>
            </div>

            {/* Churn risk */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Riesgo Churn
              </label>
              <select
                name="churnRisk"
                defaultValue={churnRisk ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Todos</option>
                <option value="LOW">Bajo</option>
                <option value="MEDIUM">Medio</option>
                <option value="HIGH">Alto</option>
                <option value="CRITICAL">Crítico</option>
              </select>
            </div>

            {/* Has overdue */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="hasOverdue"
                  value="true"
                  defaultChecked={hasOverdue}
                  style={{ cursor: "pointer" }}
                />
                <span>Con cartera vencida</span>
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              style={{
                padding: "6px 20px",
                fontSize: 12,
                fontWeight: 700,
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              Aplicar
            </button>
            <a
              href={baseUrl}
              style={{ fontSize: 12, color: "#666", textDecoration: "none", fontFamily: "monospace", paddingTop: 7 }}
            >
              Limpiar
            </a>
          </div>
        </form>
      </div>

      {/* ── KPI summary row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total clientes"       value={fmtN(total)} />
        <KpiCard label="Con cartera vencida"  value={fmtN(withOverdue)}  accent={withOverdue > 0 ? "red" : undefined} />
        <KpiCard label="Riesgo alto/crítico"  value={fmtN(highCritical)} accent={highCritical > 0 ? "yellow" : undefined} />
        <KpiCard label="Inactivos +90d"       value={fmtN(inactive90d)}  accent={inactive90d > 0 ? "yellow" : undefined} />
      </div>

      {/* ── Error / empty state ── */}
      {customersError && (
        <EmptyState message="No hay datos de clientes disponibles. Configure los conectores SAG PYA SOAP y CRM para importar clientes." />
      )}

      {!customersError && customers.length === 0 && (
        <EmptyState message="No hay clientes para los filtros seleccionados." />
      )}

      {/* ── Customer table ── */}
      {!customersError && customers.length > 0 && (
        <Section title={`Clientes — ${customers.length} resultados`}>
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Cliente / NIT</TH>
                  <TH>Vendedor</TH>
                  <TH>Ciudad</TH>
                  <TH right>LTV</TH>
                  <TH right>Ventas L12M</TH>
                  <TH right>Cartera vencida</TH>
                  <TH>Riesgo</TH>
                  <TH right>Última compra</TH>
                  <TH>Acciones</TH>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>
                      <div>{c.name}</div>
                      {c.nit && <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>NIT: {c.nit}</div>}
                    </TD>
                    <TD>{c.sellerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD>{c.city ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD right>{fmtCOP(c.ltv)}</TD>
                    <TD right>{fmtCOP(c.totalSalesL12)}</TD>
                    <TD right>
                      {(c.overdueReceivable ?? 0) > 0
                        ? <span style={{ color: "#991b1b", fontWeight: 600 }}>{fmtCOP(c.overdueReceivable)}</span>
                        : <span style={{ color: "#ccc" }}>—</span>}
                    </TD>
                    <TD><ChurnBadge risk={c.churnRisk} /></TD>
                    <TD right>
                      {c.lastPurchaseAt
                        ? <span style={{ color: "#555" }}>{fmtDate(c.lastPurchaseAt)}</span>
                        : <span style={{ color: "#ccc" }}>—</span>}
                    </TD>
                    <TD>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <a
                          href={buildUrl(orgSlug, { slug: c.slug, q, status, churnRisk, sellerSlug, hasOverdue: hasOverdue ? "true" : null })}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#111",
                            textDecoration: "none",
                            border: "1px solid #ddd",
                            borderRadius: 4,
                            padding: "3px 10px",
                            fontFamily: "monospace",
                            whiteSpace: "nowrap",
                          }}
                        >
                          360 →
                        </a>
                        {(c.overdueReceivable ?? 0) > 0 && (
                          <ActionButton
                            orgSlug={orgSlug}
                            label="Cobro"
                            icon="💰"
                            variant="danger"
                            size="xs"
                            prefill={{
                              actionType:   "CREAR_ACCION_COBRANZA",
                              targetType:   "customer",
                              targetId:     c.id,
                              targetLabel:  c.name,
                              sourceModule: "customer_360",
                              title:        `Cobranza — ${c.name}`,
                              priority:     "HIGH",
                            }}
                          />
                        )}
                        <ActionButton
                          orgSlug={orgSlug}
                          label="Tarea"
                          variant="ghost"
                          size="xs"
                          prefill={{
                            actionType:   "CREAR_TAREA_COMERCIAL",
                            targetType:   "customer",
                            targetId:     c.id,
                            targetLabel:  c.name,
                            sourceModule: "customer_360",
                            title:        `Tarea comercial — ${c.name}`,
                            assignedTo:   c.sellerName ?? undefined,
                          }}
                        />
                      </div>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Customer Ficha 360 ────────────────────────────────────────────────────────

function CustomerFicha({
  detail,
  orgSlug,
  commercialTimeline,
}: {
  detail: SerializedCustomer360;
  orgSlug: string;
  commercialTimeline: SerializedCommercialFact[];
}) {
  const { profile, salesSummary, receivables, opportunities, recentActivities, quotes, aiInsight } = detail;

  return (
    <div style={{ fontFamily: "monospace" }}>

      {/* ── Section 1: Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{profile.name}</h1>
          {profile.segment && (
            <span style={{
              fontSize: 11,
              background: "#f0f9ff",
              color: "#0369a1",
              padding: "2px 10px",
              borderRadius: 4,
              fontWeight: 700,
              border: "1px solid #bae6fd",
            }}>
              {profile.segment}
            </span>
          )}
          <StatusBadge status={profile.status} />
          {/* SAG write action — enqueue customer upsert */}
          <div style={{ marginLeft: "auto" }}>
            <SagEnqueueButton
              orgSlug={orgSlug}
              customer={{
                id:         profile.id,
                nit:        profile.nit ?? null,
                name:       profile.name,
                email:      profile.email ?? null,
                phone:      profile.phone ?? null,
                city:       profile.city ?? null,
                department: profile.department ?? null,
                address:    profile.address ?? null,
                erpId:      profile.erpId ?? null,
              }}
            />
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#666", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {profile.nit && <span>NIT: <b>{profile.nit}</b></span>}
          {profile.legalName && profile.legalName !== profile.name && <span>{profile.legalName}</span>}
          {profile.city && <span>{profile.city}{profile.department ? `, ${profile.department}` : ""}</span>}
          {profile.sellerName && <span>Vendedor: <b>{profile.sellerName}</b></span>}
          {profile.email && <span>{profile.email}</span>}
          {profile.phone && <span>{profile.phone}</span>}
          {profile.erpId
            ? <span style={{ color: "#15803d" }}>ERP: <b>{profile.erpId}</b></span>
            : <span style={{ color: "#9ca3af" }}>Sin ID ERP</span>
          }
        </div>
      </div>

      {/* ── Agentik Action Layer ── */}
      <div style={{
        display: "flex", gap: 6, flexWrap: "wrap",
        marginBottom: 16, paddingBottom: 16,
        borderBottom: "1px solid #f5f5f5",
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "center", marginRight: 4 }}>
          Acciones →
        </span>
        <ActionButton
          orgSlug={orgSlug}
          label="Acción de cobranza"
          icon="💰"
          variant="outline"
          size="sm"
          prefill={{
            actionType:   "CREAR_ACCION_COBRANZA",
            targetType:   "customer",
            targetId:     profile.id,
            targetLabel:  profile.name,
            sourceModule: "customer_360",
            title:        `Cobranza — ${profile.name}`,
            description:  profile.overdueReceivable && profile.overdueReceivable > 0
              ? `Cartera vencida: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(profile.overdueReceivable)}`
              : undefined,
            priority: profile.overdueReceivable && profile.overdueReceivable > 0 ? "HIGH" : "MEDIUM",
          }}
        />
        <ActionButton
          orgSlug={orgSlug}
          label="Programar seguimiento"
          icon="📅"
          variant="outline"
          size="sm"
          prefill={{
            actionType:   "ASIGNAR_SEGUIMIENTO_VENDEDOR",
            targetType:   "customer",
            targetId:     profile.id,
            targetLabel:  profile.name,
            sourceModule: "customer_360",
            title:        `Seguimiento comercial — ${profile.name}`,
            assignedTo:   profile.sellerName ?? undefined,
          }}
        />
        <ActionButton
          orgSlug={orgSlug}
          label="Marcar recuperación"
          icon="🔄"
          variant="outline"
          size="sm"
          prefill={{
            actionType:   "MARCAR_CLIENTE_RECUPERACION",
            targetType:   "customer",
            targetId:     profile.id,
            targetLabel:  profile.name,
            sourceModule: "customer_360",
            title:        `Recuperación de cliente — ${profile.name}`,
            priority:     "HIGH",
          }}
        />
        <ActionButton
          orgSlug={orgSlug}
          label="Escalar a gerencia"
          icon="⬆"
          variant="danger"
          size="sm"
          prefill={{
            actionType:   "ESCALAR_A_GERENCIA",
            targetType:   "customer",
            targetId:     profile.id,
            targetLabel:  profile.name,
            sourceModule: "customer_360",
            title:        `Escalamiento gerencia — ${profile.name}`,
            priority:     "URGENT",
          }}
        />
      </div>

      {/* ── Recommended collection action ── */}
      {(() => {
        const ov  = receivables.overdue ?? 0;
        const tot = receivables.total   ?? 0;
        if (ov <= 0) return null;
        const ovRatio   = tot > 0 ? (ov / tot) * 100 : 0;
        const maxDpd    = receivables.maxDpd ?? 0;
        const suggested = suggestAction(maxDpd, ovRatio);

        const borderColor =
          suggested.priority === "URGENT" ? "#fca5a5"
          : suggested.priority === "HIGH" ? "#fde68a"
          : "#e5e7eb";
        const bgColor =
          suggested.priority === "URGENT" ? "#fef2f2"
          : suggested.priority === "HIGH" ? "#fffbeb"
          : "#fafafa";
        const textColor =
          suggested.priority === "URGENT" ? "#991b1b"
          : suggested.priority === "HIGH" ? "#92400e"
          : "#374151";
        const dotColor =
          suggested.priority === "URGENT" ? "#dc2626"
          : suggested.priority === "HIGH" ? "#d97706"
          : "#9ca3af";

        const channelIcon: Record<string, string> = {
          whatsapp: "💬", call: "📞", email: "✉️", legal: "⚖️",
        };

        return (
          <div style={{
            border: `1px solid ${borderColor}`,
            borderLeft: `4px solid ${dotColor}`,
            borderRadius: 6,
            background: bgColor,
            padding: "10px 14px",
            marginBottom: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>
              {channelIcon[suggested.channel] ?? "📋"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: dotColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  ACCIÓN RECOMENDADA
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  background: bgColor, color: textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 4, padding: "1px 6px",
                }}>
                  {suggested.priority}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: textColor, marginBottom: 2 }}>
                {suggested.label}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                {suggested.scriptHint}
              </div>
            </div>
            <ActionButton
              orgSlug={orgSlug}
              label="Crear tarea"
              variant={suggested.priority === "URGENT" ? "danger" : "outline"}
              size="sm"
              prefill={{
                actionType:   "CREAR_ACCION_COBRANZA",
                targetType:   "customer",
                targetId:     profile.id,
                targetLabel:  profile.name,
                sourceModule: "customer_360",
                title:        `Cobranza — ${profile.name}`,
                description:  `${suggested.label}\n\n${suggested.scriptHint}\n\nCartera vencida: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(ov)} · DPD máximo: +${maxDpd}d`,
                priority:     suggested.priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW",
              }}
            />
          </div>
        );
      })()}

      {/* ── Section 2: AI Insight bar ── */}
      {(aiInsight.churnRisk || aiInsight.healthScore != null || aiInsight.nextBestAction) && (
        <div style={{
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: "12px 16px",
          background: "#fafafa",
          marginBottom: 16,
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: 12,
        }}>
          <span style={{ fontWeight: 700, fontSize: 11, color: "#888", textTransform: "uppercase" }}>Inteligencia IA</span>
          {aiInsight.churnRisk && (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#888" }}>Churn:</span>
              <ChurnBadge risk={aiInsight.churnRisk} />
            </span>
          )}
          {aiInsight.healthScore != null && (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#888" }}>Salud:</span>
              <span style={{
                fontWeight: 700,
                color: aiInsight.healthScore >= 70 ? "#15803d" : aiInsight.healthScore >= 40 ? "#92400e" : "#991b1b",
              }}>
                {aiInsight.healthScore}/100
              </span>
            </span>
          )}
          {aiInsight.nextBestAction && (
            <span style={{ flex: 1, color: "#333" }}>
              <span style={{ color: "#888" }}>Siguiente acción:</span> {aiInsight.nextBestAction}
            </span>
          )}
          {aiInsight.scoredAt && (
            <span style={{ color: "#bbb", fontSize: 10, marginLeft: "auto" }}>
              {fmtDate(aiInsight.scoredAt)}
            </span>
          )}
        </div>
      )}

      {/* ── Section 3: KPI grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard label="LTV Total"       value={fmtCOP(profile.ltv)} />
        <KpiCard label="Ventas L12M"     value={fmtCOP(salesSummary.totalSalesL12)} />
        <KpiCard label="Cartera Total"   value={fmtCOP(receivables.total)} />
        <KpiCard label="Cartera Vencida" value={fmtCOP(receivables.overdue)} accent={receivables.overdue > 0 ? "red" : undefined} />
      </div>

      {/* ── Section 4: Sales trend ── */}
      {salesSummary.monthlyTrend.length > 0 && (
        <Section title="Tendencia de ventas (últimos 12M)">
          <div style={{ overflowX: "auto", padding: "12px 14px" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Período</TH>
                  <TH right>Monto</TH>
                  <TH>Barra</TH>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxAmt = Math.max(...salesSummary.monthlyTrend.map(r => r.amount), 1);
                  return salesSummary.monthlyTrend.map((r, i) => (
                    <tr key={r.period} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD>{fmtPeriodo(r.period)}</TD>
                      <TD right>{fmtCOP(r.amount)}</TD>
                      <TD>
                        <div style={{
                          height: 10,
                          width: Math.max(2, Math.round((r.amount / maxAmt) * 160)),
                          background: "#7c3aed",
                          borderRadius: 2,
                        }} />
                      </TD>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Section 5: Top líneas ── */}
      {salesSummary.topLines.length > 0 && (
        <Section title="Top líneas de producto">
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Línea</TH>
                  <TH right>Monto</TH>
                  <TH>Participación</TH>
                </tr>
              </thead>
              <tbody>
                {salesSummary.topLines.map((l, i) => (
                  <tr key={l.productLine} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>{l.productLine}</TD>
                    <TD right>{fmtCOP(l.amount)}</TD>
                    <TD>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          display: "inline-block",
                          height: 8,
                          width: Math.max(2, Math.round(l.share * 1.2)),
                          background: "#3b82f6",
                          borderRadius: 2,
                          verticalAlign: "middle",
                        }} />
                        <span style={{ fontSize: 11 }}>{l.share.toFixed(1)}%</span>
                      </span>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Section 5b: Fuente de venta (Fuente 1 / Fuente 2) ── */}
      {salesSummary.source.hasSourceData && (
        <Section title="Fuente de venta — últimos 12M">
          <div style={{ padding: "12px 14px" }}>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              <KpiCard
                label="F1 · Factura oficial"
                value={fmtCOP(salesSummary.source.oficialAmountL12)}
                accent="green"
              />
              <KpiCard
                label="F2 · Remisión / Despacho"
                value={fmtCOP(salesSummary.source.remisionAmountL12)}
                accent={salesSummary.source.remisionAmountL12 > salesSummary.source.oficialAmountL12 ? "red" : "yellow"}
              />
              <KpiCard
                label="Conversión F2 → F1"
                value={`${salesSummary.source.conversionRate.toFixed(1)}%`}
                accent={
                  salesSummary.source.conversionRate >= 80 ? "green"
                  : salesSummary.source.conversionRate >= 50 ? "yellow"
                  : "red"
                }
              />
              <KpiCard
                label="Despachos sin factura"
                value={String(salesSummary.source.remisionPendingCount)}
                accent={salesSummary.source.remisionPendingCount > 5 ? "red" : salesSummary.source.remisionPendingCount > 0 ? "yellow" : undefined}
              />
            </div>
            {/* Source legend */}
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6 }}>
              <strong style={{ color: "#4a6" }}>Fuente 1 (Oficial):</strong>{" "}
              Facturas fiscales — ingresos reconocidos, genera cartera (cuentas por cobrar).
              {"  "}
              <strong style={{ color: "#c84" }}>Fuente 2 (Remisión):</strong>{" "}
              Despachos operativos — señal de demanda, aún pendiente de conversión a factura oficial.
              {salesSummary.source.remisionPendingCount > 0 && (
                <span style={{ color: "#c44", marginLeft: 8 }}>
                  ⚠ {salesSummary.source.remisionPendingCount} despacho{salesSummary.source.remisionPendingCount > 1 ? "s" : ""} sin factura oficial.
                </span>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Section 6: Cartera ── */}
      <Section title="Cartera">
        {/* ── Risk KPI header ── */}
        {receivables.total > 0 && (() => {
          const overdueRatio = receivables.total > 0 ? (receivables.overdue / receivables.total) * 100 : 0;
          const dominantBucket = receivables.byBucket.reduce<{ bucket: string; amount: number } | null>(
            (best, b) => (!best || b.amount > best.amount) ? b : best, null
          );
          const riskScore = aiInsight.riskScore;
          const riskColor = riskScore != null
            ? riskScore >= 70 ? "#dc2626" : riskScore >= 40 ? "#d97706" : "#16a34a"
            : "#9ca3af";
          return (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              borderBottom: "1px solid #eee",
              fontFamily: "monospace",
            }}>
              {[
                {
                  label: "Ratio de mora",
                  value: overdueRatio.toFixed(1) + "%",
                  sub: `${fmtCOP(receivables.overdue)} vencido`,
                  dot: overdueRatio > 30 ? "#dc2626" : overdueRatio > 10 ? "#d97706" : "#16a34a",
                },
                {
                  label: "DPD máximo",
                  value: receivables.maxDpd > 0 ? `+${receivables.maxDpd}d` : "Al día",
                  sub: receivables.maxDpd > 90 ? "mora crítica" : receivables.maxDpd > 30 ? "mora media" : "sin mora grave",
                  dot: receivables.maxDpd > 180 ? "#dc2626" : receivables.maxDpd > 90 ? "#d97706" : receivables.maxDpd > 30 ? "#ca8a04" : "#6b7280",
                },
                {
                  label: "Tramo dominante",
                  value: dominantBucket?.bucket ?? "—",
                  sub: dominantBucket ? `${fmtCOP(dominantBucket.amount)}` : "sin saldo",
                  dot: dominantBucket?.bucket === "90+" ? "#dc2626"
                     : dominantBucket?.bucket === "61-90" ? "#d97706"
                     : dominantBucket?.bucket === "31-60" ? "#ca8a04"
                     : "#6b7280",
                },
                {
                  label: "Risk score",
                  value: riskScore != null ? `${riskScore}/100` : "—",
                  sub: riskScore != null
                    ? riskScore >= 70 ? "riesgo alto" : riskScore >= 40 ? "riesgo medio" : "riesgo bajo"
                    : "sin score",
                  dot: riskColor,
                },
              ].map((item, idx) => (
                <div key={idx} style={{
                  padding: "10px 14px",
                  borderRight: idx < 3 ? "1px solid #eee" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {item.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#111", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
                    {item.sub}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* By bucket summary */}
        {receivables.byBucket.length > 0 && (
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {receivables.byBucket.map(b => (
                <div key={b.bucket} style={{
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  background: "#fff",
                }}>
                  <div style={{ fontWeight: 700, color: "#333" }}>{b.bucket}</div>
                  <div style={{ color: "#888" }}>{b.count} docs · {fmtCOP(b.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents table */}
        {receivables.documents.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Factura</TH>
                  <TH right>Vencimiento</TH>
                  <TH right>Saldo</TH>
                  <TH right>Días mora</TH>
                  <TH>Antigüedad</TH>
                  <TH>Estado</TH>
                </tr>
              </thead>
              <tbody>
                {receivables.documents.slice(0, 20).map((doc, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>{doc.invoiceNumber ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD right>{fmtDate(doc.dueDate)}</TD>
                    <TD right>{fmtCOP(doc.balanceDue)}</TD>
                    <TD right>
                      {doc.daysOverdue > 0
                        ? <span style={{ color: "#991b1b", fontWeight: 600 }}>+{doc.daysOverdue}d</span>
                        : <span style={{ color: "#15803d" }}>Al día</span>}
                    </TD>
                    <TD>
                      {doc.agingBucket ? (
                        <span style={{
                          ...(AGING_COLORS[doc.agingBucket] ?? { background: "#e5e7eb", color: "#374151" }),
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 4,
                          fontFamily: "monospace",
                        }}>
                          {doc.agingBucket}
                        </span>
                      ) : <span style={{ color: "#ccc" }}>—</span>}
                    </TD>
                    <TD>{statusLabel(doc.status)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "14px 16px", fontSize: 12, color: "#aaa", background: "#fafafa" }}>
            Sin documentos de cartera.
          </div>
        )}
      </Section>

      {/* ── Section 7: Oportunidades abiertas ── */}
      <Section title={`Oportunidades abiertas (${opportunities.filter(o => !["closed_won", "closed_lost"].includes(o.stage)).length})`}>
        {opportunities.filter(o => !["closed_won", "closed_lost"].includes(o.stage)).length === 0 ? (
          <CrmEmptyState synced={!!profile.crmSyncedAt} syncedAt={profile.crmSyncedAt}
            neverSyncedMsg="CRM no sincronizado — ejecute el conector castillitos_crm para importar oportunidades."
            emptyMsg="Sin oportunidades abiertas para este cliente."
            unmatchedMsg={!profile.nit ? "Cliente sin NIT — no se puede cruzar con datos CRM automáticamente." : undefined}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Título</TH>
                  <TH>Etapa</TH>
                  <TH right>Monto</TH>
                  <TH right>Cierre esperado</TH>
                  <TH>Vendedor</TH>
                </tr>
              </thead>
              <tbody>
                {opportunities
                  .filter(o => !["closed_won", "closed_lost"].includes(o.stage))
                  .map((o, i) => (
                    <tr key={o.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD bold>{o.title}</TD>
                      <TD>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontFamily: "monospace",
                          background: (STAGE_COLORS[o.stage] ?? "#94a3b8") + "33",
                          color: STAGE_COLORS[o.stage] ?? "#555",
                          border: `1px solid ${STAGE_COLORS[o.stage] ?? "#94a3b8"}66`,
                        }}>
                          {stageLabel(o.stage)}
                        </span>
                      </TD>
                      <TD right>{fmtCOP(o.amount)}</TD>
                      <TD right>{fmtDate(o.expectedCloseAt)}</TD>
                      <TD>{o.sellerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 8: Actividad reciente ── */}
      <Section title="Actividad reciente (últimas 10)">
        {recentActivities.length === 0 ? (
          <CrmEmptyState synced={!!profile.crmSyncedAt} syncedAt={profile.crmSyncedAt}
            neverSyncedMsg="CRM no sincronizado — ejecute el conector castillitos_crm para importar actividades."
            emptyMsg="Sin actividad CRM registrada para este cliente."
            unmatchedMsg={!profile.nit ? "Cliente sin NIT — no se puede cruzar con datos CRM automáticamente." : undefined}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Tipo</TH>
                  <TH right>Fecha</TH>
                  <TH>Asunto</TH>
                  <TH>Vendedor</TH>
                </tr>
              </thead>
              <tbody>
                {recentActivities.slice(0, 10).map((a, i) => (
                  <tr key={a.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD>
                      <span style={{ fontSize: 13, marginRight: 4 }}>
                        {ACTIVITY_ICONS[a.type] ?? "📋"}
                      </span>
                      <span style={{ color: "#555", textTransform: "capitalize" }}>{a.type}</span>
                    </TD>
                    <TD right>{fmtDate(a.occurredAt)}</TD>
                    <TD>{a.subject ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD>{a.sellerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 9: Cotizaciones / Pedidos recientes (AOS_Quotes) ── */}

      <Section title="Pedidos / Cotizaciones recientes — AOS_Quotes (últimas 5)">
        {quotes.length === 0 ? (
          <CrmEmptyState synced={!!profile.crmSyncedAt} syncedAt={profile.crmSyncedAt}
            neverSyncedMsg="CRM no sincronizado — ejecute el conector castillitos_crm para importar pedidos y cotizaciones."
            emptyMsg="Sin pedidos / cotizaciones CRM registradas para este cliente."
            unmatchedMsg={!profile.nit ? "Cliente sin NIT — no se puede cruzar con datos CRM automáticamente." : undefined}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Pedido / Cotización</TH>
                  <TH>Etapa CRM</TH>
                  <TH>Vendedor</TH>
                  <TH right>Monto</TH>
                  <TH>Sucursal</TH>
                  <TH>SAG</TH>
                  <TH right>Emitida</TH>
                </tr>
              </thead>
              <tbody>
                {quotes.slice(0, 5).map((q, i) => {
                  // Extract AOS_Quotes custom fields from rawCrmJson
                  const raw = (q.rawCrmJson as Record<string, unknown> | null) ?? {};
                  // rawCrmJson structure: { raw: { name, stage, id_sag_c, ... } }
                  const attrs = ((raw["raw"] as Record<string, unknown> | null) ?? raw) as Record<string, unknown>;
                  const quoteName    = String(attrs["name"]            ?? "").trim() || null;
                  const stageRaw     = String(attrs["stage"]           ?? "").trim() || null;
                  const idSag        = String(attrs["id_sag_c"]        ?? "").trim() || null;
                  const respuestaSag = String(attrs["respuesta_sag_c"] ?? "").trim() || null;
                  const sucursal     = String(attrs["sucursal_c"]      ?? "").trim() || null;
                  const invoiceStatus= String(attrs["invoice_status"]  ?? "").trim() || null;

                  const hasSag = !!(idSag && idSag !== "null");
                  const sagOk  = hasSag && respuestaSag && !respuestaSag.toLowerCase().includes("error");

                  return (
                    <tr key={q.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD bold>
                        <div>{quoteName ?? q.quoteNumber ?? q.crmId ?? q.id.slice(-8)}</div>
                        {q.quoteNumber && quoteName && (
                          <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>#{q.quoteNumber}</div>
                        )}
                        {invoiceStatus && (
                          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                            Factura: {invoiceStatus}
                          </div>
                        )}
                      </TD>
                      <TD>
                        {stageRaw ? (
                          <span style={{
                            ...(QUOTE_STATUS_COLORS[q.status] ?? { background: "#e5e7eb", color: "#374151" }),
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 4,
                            fontFamily: "monospace",
                          }}>
                            {stageRaw}
                          </span>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </TD>
                      <TD>{q.sellerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>{fmtCOP(q.amount)}</TD>
                      <TD>{sucursal ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD>
                        {hasSag ? (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 4,
                            fontFamily: "monospace",
                            background: sagOk ? "#bbf7d0" : "#fde68a",
                            color:      sagOk ? "#14532d" : "#92400e",
                            cursor: respuestaSag ? "help" : "default",
                          }}
                          title={respuestaSag ?? undefined}
                          >
                            {sagOk ? "En SAG" : "Pendiente"}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: "#ccc" }}>Sin SAG</span>
                        )}
                      </TD>
                      <TD right>{fmtDate(q.issuedAt)}</TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 10: Línea de tiempo comercial unificada ── */}
      <Section title={`Línea de tiempo comercial (${commercialTimeline.length} eventos)`}>
        {commercialTimeline.length === 0 ? (
          <div style={{ padding: "14px 16px", fontSize: 12, color: "#aaa", background: "#fafafa" }}>
            Sin eventos comerciales. Importe pedidos CRM, cartera SAG o ventas XML para ver la línea de tiempo.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Fecha</TH>
                  <TH>Fuente</TH>
                  <TH>Documento</TH>
                  <TH>Vendedor / Sucursal</TH>
                  <TH right>Monto bruto</TH>
                  <TH right>Cobrado</TH>
                  <TH right>Saldo</TH>
                  <TH>Estado</TH>
                </tr>
              </thead>
              <tbody>
                {commercialTimeline.slice(0, 60).map((f, i) => {
                  const sourceInfo = LEDGER_SOURCE_INFO[f.sourceType];
                  return (
                    <tr key={f.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD>
                        <span style={{ color: "#555", whiteSpace: "nowrap" }}>
                          {fmtDate(f.issuedAt)}
                        </span>
                      </TD>
                      <TD>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 4,
                          fontFamily: "monospace",
                          background: sourceInfo.bg,
                          color:      sourceInfo.color,
                        }}>
                          {sourceInfo.label}
                        </span>
                      </TD>
                      <TD>
                        <span style={{ fontWeight: 600 }}>
                          {f.documentNumber ?? <span style={{ color: "#ccc" }}>—</span>}
                        </span>
                        {f.crmStatus && (
                          <div style={{ fontSize: 10, color: "#7c3aed", marginTop: 1 }}>{f.crmStatus}</div>
                        )}
                      </TD>
                      <TD>
                        <div>{f.sellerName ?? <span style={{ color: "#ccc" }}>—</span>}</div>
                        {f.branch && (
                          <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{f.branch}</div>
                        )}
                      </TD>
                      <TD right>{fmtCOP(f.grossAmount)}</TD>
                      <TD right>
                        {f.paidAmount != null
                          ? <span style={{ color: "#15803d" }}>{fmtCOP(f.paidAmount)}</span>
                          : <span style={{ color: "#ccc" }}>—</span>}
                      </TD>
                      <TD right>
                        {f.outstandingAmount != null && f.outstandingAmount > 0
                          ? <span style={{ color: "#dc2626" }}>{fmtCOP(f.outstandingAmount)}</span>
                          : f.outstandingAmount === 0
                            ? <span style={{ color: "#aaa" }}>—</span>
                            : <span style={{ color: "#ccc" }}>—</span>}
                      </TD>
                      <TD>
                        {f.paymentStatus
                          ? <PaymentStatusBadge status={f.paymentStatus} />
                          : f.sagStatus
                            ? <span style={{ fontSize: 10, color: "#555" }}>{f.sagStatus}</span>
                            : <span style={{ color: "#ccc" }}>—</span>}
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

    </div>
  );
}
