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

import React, { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { formatDateCol } from "@/lib/utils/formatDate";
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

type SerializedConsignacion = {
  id:              string;
  saleDate:        string | null;
  comprobanteCode: string;
  amount:          number;
  reference:       string | null;
  channelLabel:    string;
};

type SerializedCollectionRecord = {
  id:              string;
  comprobanteCode: string;
  documentNumber:  string | null;
  collectionDate:  string;
  customerName:    string | null;
  amount:          number;
  appliedStatus:   string;
};

type SerializedPayment = {
  id:            string;
  amount:        number;
  paymentDate:   string;
  paymentMethod: string;
  status:        string;
  reference:     string | null;
  bankName:      string | null;
  customerName:  string;
  notes:         string | null;
  allocations:   {
    allocatedAmount: number;
    balanceBefore:   number;
    balanceAfter:    number;
    receivable: {
      invoiceNumber:  string | null;
      originalAmount: number;
      balanceDue:     number;
    };
  }[];
};

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
  commercialTimeline:    SerializedCommercialFact[];
  recentPayments:        SerializedPayment[];
  pendingConsignaciones: SerializedConsignacion[];
  collectionRecords:     SerializedCollectionRecord[];
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
  return formatDateCol(d);
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

const RECO_COLORS: Record<string, CSSProperties> = {
  SIN_SOPORTE: { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" },
  PARCIAL:     { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  CONCILIADA:  { background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" },
  EXCESO:      { background: "#fce7f3", color: "#9d174d", border: "1px solid #fbcfe8" },
};

const RECO_LABELS: Record<string, string> = {
  SIN_SOPORTE: "Sin soporte",
  PARCIAL:     "Parcial",
  CONCILIADA:  "Conciliada",
  EXCESO:      "Exceso",
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
          Último sync: {formatDateCol(syncedAt)}
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
  recentPayments,
  pendingConsignaciones,
  collectionRecords,
}: Props) {
  const baseUrl = `/${orgSlug}/customer-360`;

  const [scoring, setScoring]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [scoreMsg, setScoreMsg] = useState<string>("");

  // ── Gestionar cobro panel state ──────────────────────────────────────────────
  const [cobroOpen,        setCobroOpen]        = useState<string | null>(null);
  const [cobroResponsable, setCobroResponsable] = useState("");
  const [cobroPrioridad,   setCobroPrioridad]   = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [cobroFecha,       setCobroFecha]        = useState("");
  const [cobroCanal,       setCobroCanal]        = useState("WhatsApp");

  function openCobro(customerId: string) {
    if (cobroOpen === customerId) { setCobroOpen(null); return; }
    setCobroOpen(customerId);
    setCobroResponsable("");
    setCobroPrioridad("MEDIUM");
    setCobroFecha("");
    setCobroCanal("WhatsApp");
  }


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

        {detail && <CustomerFicha detail={detail} orgSlug={orgSlug} commercialTimeline={commercialTimeline} recentPayments={recentPayments} pendingConsignaciones={pendingConsignaciones} collectionRecords={collectionRecords} />}
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
                  <React.Fragment key={c.id}>
                    <tr style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
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
                            href={buildUrl(orgSlug, { customerId: c.id, q, status, churnRisk, sellerSlug, hasOverdue: hasOverdue ? "true" : null })}
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
                          <button
                            onClick={() => openCobro(c.id)}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: cobroOpen === c.id ? "#fff" : (c.overdueReceivable ?? 0) > 0 ? "#991b1b" : "#111",
                              background: cobroOpen === c.id ? "#1e3a5f" : "transparent",
                              border: `1px solid ${cobroOpen === c.id ? "#1e3a5f" : (c.overdueReceivable ?? 0) > 0 ? "#fca5a5" : "#ddd"}`,
                              borderRadius: 4,
                              padding: "3px 10px",
                              fontFamily: "monospace",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                            }}
                          >
                            Cobro →
                          </button>
                        </div>
                      </TD>
                    </tr>

                    {/* ── Gestionar cobro inline panel ── */}
                    {cobroOpen === c.id && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0, background: "#f0f5ff", borderBottom: "2px solid #1e3a5f" }}>
                          <div style={{ padding: "14px 20px", fontFamily: "monospace" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f", marginBottom: 12, letterSpacing: "0.05em" }}>
                              GESTIONAR COBRO — {c.name.toUpperCase()}
                              {(c.overdueReceivable ?? 0) > 0 && (
                                <span style={{ marginLeft: 10, color: "#991b1b", fontWeight: 400, fontSize: 11 }}>
                                  Vencido: {fmtCOP(c.overdueReceivable)}
                                </span>
                              )}
                            </div>

                            {/* Form fields */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: "0.08em" }}>
                                RESPONSABLE
                                <input
                                  value={cobroResponsable}
                                  onChange={e => setCobroResponsable(e.target.value)}
                                  placeholder="Nombre o cargo"
                                  style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 8px", border: "1px solid #c8d4e8", borderRadius: 3, background: "#fff" }}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: "0.08em" }}>
                                PRIORIDAD
                                <select
                                  value={cobroPrioridad}
                                  onChange={e => setCobroPrioridad(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT")}
                                  style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 8px", border: "1px solid #c8d4e8", borderRadius: 3, background: "#fff" }}
                                >
                                  <option value="LOW">Baja</option>
                                  <option value="MEDIUM">Media</option>
                                  <option value="HIGH">Alta</option>
                                  <option value="URGENT">Crítica</option>
                                </select>
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: "0.08em" }}>
                                FECHA SEGUIMIENTO
                                <input
                                  type="date"
                                  value={cobroFecha}
                                  onChange={e => setCobroFecha(e.target.value)}
                                  style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 8px", border: "1px solid #c8d4e8", borderRadius: 3, background: "#fff" }}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: "0.08em" }}>
                                CANAL
                                <select
                                  value={cobroCanal}
                                  onChange={e => setCobroCanal(e.target.value)}
                                  style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 8px", border: "1px solid #c8d4e8", borderRadius: 3, background: "#fff" }}
                                >
                                  <option value="WhatsApp">WhatsApp</option>
                                  <option value="Correo">Correo</option>
                                  <option value="Llamada">Llamada</option>
                                  <option value="Manual">Manual</option>
                                </select>
                              </label>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <ActionButton
                                orgSlug={orgSlug}
                                label="Crear seguimiento"
                                variant="primary"
                                size="xs"
                                prefill={{
                                  actionType:   "CREAR_ACCION_COBRANZA",
                                  targetType:   "customer",
                                  targetId:     c.id,
                                  targetLabel:  c.name,
                                  sourceModule: "customer_360",
                                  title:        `Seguimiento cobro — ${c.name}`,
                                  priority:     cobroPrioridad,
                                  assignedTo:   cobroResponsable || undefined,
                                  description:  cobroFecha ? `Fecha: ${cobroFecha} · Canal: ${cobroCanal}` : `Canal: ${cobroCanal}`,
                                }}
                              />
                              <ActionButton
                                orgSlug={orgSlug}
                                label="Programar cobro"
                                variant="ghost"
                                size="xs"
                                prefill={{
                                  actionType:   "ASIGNAR_SEGUIMIENTO_VENDEDOR",
                                  targetType:   "customer",
                                  targetId:     c.id,
                                  targetLabel:  c.name,
                                  sourceModule: "customer_360",
                                  title:        `Cobro programado — ${c.name}`,
                                  priority:     cobroPrioridad,
                                  assignedTo:   cobroResponsable || undefined,
                                  description:  cobroFecha ? `Fecha compromiso: ${cobroFecha}` : undefined,
                                }}
                              />
                              <ActionButton
                                orgSlug={orgSlug}
                                label="Mensaje WhatsApp"
                                variant="ghost"
                                size="xs"
                                prefill={{
                                  actionType:   "CREAR_ACCION_COBRANZA",
                                  targetType:   "customer",
                                  targetId:     c.id,
                                  targetLabel:  c.name,
                                  sourceModule: "customer_360",
                                  title:        `WhatsApp cobro — ${c.name}`,
                                  priority:     cobroPrioridad,
                                  description:  "Preparar mensaje WhatsApp con agente IA",
                                }}
                              />
                              <ActionButton
                                orgSlug={orgSlug}
                                label="Escalar a gerencia"
                                variant="danger"
                                size="xs"
                                prefill={{
                                  actionType:   "ESCALAR_A_GERENCIA",
                                  targetType:   "customer",
                                  targetId:     c.id,
                                  targetLabel:  c.name,
                                  sourceModule: "customer_360",
                                  title:        `Escalamiento — ${c.name}`,
                                  priority:     "HIGH",
                                  assignedTo:   cobroResponsable || undefined,
                                }}
                              />
                              <button
                                onClick={() => setCobroOpen(null)}
                                style={{ fontSize: 10, color: "#888", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", paddingLeft: 0 }}
                              >
                                Cerrar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
  recentPayments,
  pendingConsignaciones,
  collectionRecords,
}: {
  detail: SerializedCustomer360;
  orgSlug: string;
  commercialTimeline: SerializedCommercialFact[];
  recentPayments: SerializedPayment[];
  pendingConsignaciones: SerializedConsignacion[];
  collectionRecords: SerializedCollectionRecord[];
}) {
  const { profile, salesSummary, receivables, opportunities, recentActivities, quotes, aiInsight } = detail;

  // ── Conciliation panel state ───────────────────────────────────────────────
  type ConciliarPanel = {
    type:           "conciliar" | "manual";
    receivableId:   string;
    invoiceNumber:  string | null;
    balanceDue:     number;
  } | null;
  const [conciliarPanel, setConciliarPanel] = useState<ConciliarPanel>(null);
  const [conciliarCrId,  setConciliarCrId]  = useState<string>("");
  const [conciliarAmt,   setConciliarAmt]   = useState<string>("");
  const [conciliarNotes, setConciliarNotes] = useState<string>("");
  const [conciliarBusy,         setConciliarBusy]         = useState(false);
  const [conciliarError,        setConciliarError]        = useState<string | null>(null);
  const [conciliarOk,           setConciliarOk]           = useState<string | null>(null);
  const [conciliarDocType,      setConciliarDocType]      = useState<"PAGO" | "ND" | "AJUSTE">("PAGO");
  const [conciliarDocSuggested, setConciliarDocSuggested] = useState<"PAGO" | "ND" | "AJUSTE" | null>(null);
  const [conciliarRef,          setConciliarRef]          = useState<string>("");
  const [conciliarMethod,       setConciliarMethod]       = useState<string>("TRANSFERENCIA");
  const [showAllCobros,  setShowAllCobros]  = useState(false);
  const [expandedDocs,   setExpandedDocs]   = useState<Set<string>>(new Set());

  function toggleDocExpand(id: string) {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openConciliar(type: "conciliar" | "manual", doc: {
    id: string; invoiceNumber: string | null; balanceDue: number;
  }) {
    setConciliarPanel({ type, receivableId: doc.id, invoiceNumber: doc.invoiceNumber, balanceDue: doc.balanceDue });
    setConciliarCrId("");
    setConciliarAmt(String(doc.balanceDue));
    setConciliarNotes("");
    setConciliarDocType("PAGO");
    setConciliarDocSuggested(null);
    setConciliarRef("");
    setConciliarMethod("TRANSFERENCIA");
    setConciliarError(null);
    setConciliarOk(null);
  }

  function detectDocTypeFromRef(ref: string): "PAGO" | "ND" | "AJUSTE" | null {
    const u = ref.toUpperCase();
    if (u.includes("ND") || u.includes("DESCUENTO") || u.includes("NOTA DEBITO") || u.includes("NOTA DE")) return "ND";
    if (u.includes("AJUSTE") || u.includes("CORREC")) return "AJUSTE";
    return null;
  }

  function handleConciliarRefChange(val: string) {
    setConciliarRef(val);
    const suggested = detectDocTypeFromRef(val);
    if (suggested) {
      setConciliarDocSuggested(suggested);
      setConciliarDocType(suggested);   // auto-select; user can override
    } else {
      setConciliarDocSuggested(null);
    }
  }

  function closeConciliar() {
    setConciliarPanel(null);
    setConciliarError(null);
    setConciliarOk(null);
  }

  // ── Deposit panel — apply consignación/cobro SAG to a chosen invoice ─────────
  type DepositPanel = {
    sourceType:   "collection" | "consignacion";
    sourceId:     string;
    sourceLabel:  string;
    sourceAmount: number;
    sourceRef:    string | null;
    sourceDate:   string;
  } | null;

  const [depositPanel,   setDepositPanel]   = useState<DepositPanel>(null);
  const [depositRxId,    setDepositRxId]    = useState<string>("");
  const [depositAmt,     setDepositAmt]     = useState<string>("");
  const [depositNotes,   setDepositNotes]   = useState<string>("");
  const [depositBusy,    setDepositBusy]    = useState(false);
  const [depositError,   setDepositError]   = useState<string | null>(null);
  const [depositOk,      setDepositOk]      = useState<string | null>(null);

  function openDeposit(src: NonNullable<DepositPanel>) {
    setDepositPanel(src);
    setDepositRxId("");
    setDepositAmt(String(src.sourceAmount));
    setDepositNotes("");
    setDepositError(null);
    setDepositOk(null);
  }

  async function submitDeposit() {
    if (!depositPanel) return;
    if (!depositRxId) { setDepositError("Selecciona una factura a aplicar"); return; }
    const amt = parseFloat(depositAmt);
    if (!amt || amt <= 0) { setDepositError("Monto inválido"); return; }
    setDepositBusy(true);
    setDepositError(null);
    try {
      const body: Record<string, unknown> = {
        customerNit:  profile.nit ?? null,
        customerName: profile.name,
        amount:       amt,
        paymentDate:  depositPanel.sourceDate,
        reference:    depositPanel.sourceRef ?? null,
        notes:        depositNotes || null,
        isManual:     depositPanel.sourceType === "consignacion",
        allocations:  [{ receivableId: depositRxId, allocatedAmount: amt }],
      };
      if (depositPanel.sourceType === "collection") {
        body.collectionRecordId = depositPanel.sourceId;
      }
      const res = await fetch(`/api/orgs/${orgSlug}/conciliar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as { error?: string; paymentId?: string };
      if (!res.ok) { setDepositError(json.error ?? "Error al aplicar pago"); return; }
      setDepositOk(`Pago aplicado — ID ${json.paymentId?.slice(-8)}`);
      setTimeout(() => { setDepositPanel(null); window.location.reload(); }, 1200);
    } catch {
      setDepositError("Error de red — intenta de nuevo");
    } finally {
      setDepositBusy(false);
    }
  }

  async function submitConciliar() {
    if (!conciliarPanel) return;
    const amt = parseFloat(conciliarAmt);
    if (!amt || amt <= 0) { setConciliarError("Ingresa un monto válido"); return; }
    if (amt > conciliarPanel.balanceDue) { setConciliarError(`El monto no puede superar el saldo (${fmtCOP(conciliarPanel.balanceDue)})`); return; }
    setConciliarBusy(true);
    setConciliarError(null);
    try {
      const body: Record<string, unknown> = {
        customerNit:   profile.nit ?? null,
        customerName:  profile.name,
        amount:        amt,
        paymentDate:   new Date().toISOString(),
        notes:         conciliarNotes || null,
        reference:     conciliarRef   || null,
        paymentMethod: conciliarMethod,
        documentType:  conciliarDocType,
        isManual:      conciliarPanel.type === "manual",
        allocations:   [{ receivableId: conciliarPanel.receivableId, allocatedAmount: amt }],
      };
      if (conciliarPanel.type === "conciliar" && conciliarCrId) {
        body.collectionRecordId = conciliarCrId;
      }
      const res = await fetch(`/api/orgs/${orgSlug}/conciliar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as { error?: string; paymentId?: string };
      if (!res.ok) { setConciliarError(json.error ?? "Error al aplicar pago"); return; }
      setConciliarOk(`Pago aplicado — ID ${json.paymentId?.slice(-8)}`);
      setTimeout(() => { closeConciliar(); window.location.reload(); }, 1200);
    } catch {
      setConciliarError("Error de red — intenta de nuevo");
    } finally {
      setConciliarBusy(false);
    }
  }


  // Open docs with positive balance — used in deposit receivable picker
  const openDocs = receivables.documents.filter(d => d.balanceDue > 0);

  return (
    <>
    {/* ── Deposit overlay panel — apply consignación/cobro SAG to chosen invoice ── */}
    {depositPanel && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={e => { if (e.target === e.currentTarget) setDepositPanel(null); }}
      >
        <div style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 560, width: "100%", fontFamily: "monospace", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <strong style={{ fontSize: 13, letterSpacing: "0.03em" }}>
              {depositPanel.sourceType === "collection" ? "COBRO SAG" : "CONSIGNACIÓN"} → Aplicar a factura
            </strong>
            <button onClick={() => setDepositPanel(null)} style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", background: "#fafafa" }}>
              ✕ Cerrar
            </button>
          </div>

          {/* Source info */}
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 4, padding: "8px 12px", marginBottom: 14, fontSize: 11, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: "#1e40af", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
              {depositPanel.sourceType === "collection" ? "Cobro SAG disponible" : "Consignación pendiente"}
            </div>
            <div style={{ fontSize: 12 }}>{depositPanel.sourceLabel}</div>
            <div style={{ color: "#888" }}>Monto: <b style={{ color: "#111" }}>{fmtCOP(depositPanel.sourceAmount)}</b>{depositPanel.sourceRef ? ` · Ref: ${depositPanel.sourceRef}` : ""}</div>
          </div>

          {/* Receivable picker */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Factura a aplicar
            </div>
            {openDocs.length === 0 ? (
              <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>Sin facturas abiertas con saldo positivo para este cliente.</div>
            ) : (
              <select
                value={depositRxId}
                onChange={e => {
                  setDepositRxId(e.target.value);
                  const doc = openDocs.find(d => d.id === e.target.value);
                  if (doc) setDepositAmt(String(Math.min(depositPanel.sourceAmount, doc.balanceDue)));
                }}
                style={{ fontFamily: "monospace", fontSize: 11, padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, width: "100%" }}
              >
                <option value="">— Seleccionar factura —</option>
                {openDocs.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.invoiceNumber ?? "Sin número"} · {fmtDate(d.dueDate)} · Saldo {fmtCOP(d.balanceDue)}{d.daysOverdue > 0 ? ` · +${d.daysOverdue}d mora` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount + notes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Monto a aplicar (COP)</div>
              <input
                type="number"
                value={depositAmt}
                onChange={e => setDepositAmt(e.target.value)}
                min={1}
                style={{ fontFamily: "monospace", fontSize: 12, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, width: "100%" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Notas (opcional)</div>
              <input
                type="text"
                value={depositNotes}
                onChange={e => setDepositNotes(e.target.value)}
                placeholder="Ej: acuerdo de pago"
                style={{ fontFamily: "monospace", fontSize: 11, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, width: "100%" }}
              />
            </div>
          </div>

          <button
            onClick={submitDeposit}
            disabled={depositBusy || !depositRxId || openDocs.length === 0}
            style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, padding: "7px 18px", borderRadius: 4, cursor: depositBusy ? "not-allowed" : "pointer", border: "none", background: depositBusy ? "#9ca3af" : "#1d4ed8", color: "#fff" }}
          >
            {depositBusy ? "Aplicando..." : "Aplicar pago"}
          </button>

          {depositError && <div style={{ color: "#dc2626", fontSize: 11, marginTop: 8 }}>{depositError}</div>}
          {depositOk    && <div style={{ color: "#15803d", fontSize: 11, marginTop: 8, fontWeight: 600 }}>{depositOk}</div>}
        </div>
      </div>
    )}

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
        <KpiCard label="Cartera abierta histórica"  value={fmtCOP(receivables.total)} />
        <KpiCard label="Cartera vencida histórica"  value={fmtCOP(receivables.overdue)} accent={receivables.overdue > 0 ? "red" : undefined} />
      </div>
      {receivables.total > 0 && (
        <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", marginBottom: 16, padding: "4px 2px" }}>
          Incluye saldos abiertos históricos en SAG. Requiere conciliación.
        </div>
      )}

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

        {/* Reconciliation summary strip */}
        {receivables.documents.length > 0 && (() => {
          const docs = receivables.documents;
          const totalOriginal  = docs.reduce((s, d) => s + d.originalAmount, 0);
          const totalApplied   = docs.reduce((s, d) => s + d.appliedTotal, 0);
          const totalRemaining = docs.reduce((s, d) => s + d.remainingBalance, 0);
          const conciliadas    = docs.filter(d => d.recoStatus === "CONCILIADA").length;
          const parciales      = docs.filter(d => d.recoStatus === "PARCIAL").length;
          const sinSoporte     = docs.filter(d => d.recoStatus === "SIN_SOPORTE").length;
          return (
            <div style={{
              padding: "10px 14px", borderBottom: "1px solid #e5e7eb",
              background: "#fafafa", display: "flex", gap: 20, flexWrap: "wrap",
              fontFamily: "monospace", fontSize: 11,
            }}>
              <div>
                <span style={{ color: "#6b7280" }}>Total original: </span>
                <strong>{fmtCOP(totalOriginal)}</strong>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>Total aplicado: </span>
                <strong style={{ color: "#15803d" }}>{fmtCOP(totalApplied)}</strong>
              </div>
              <div>
                <span style={{ color: "#6b7280" }}>Saldo real: </span>
                <strong style={{ color: totalRemaining > 0 ? "#991b1b" : "#15803d" }}>{fmtCOP(totalRemaining)}</strong>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {conciliadas > 0 && <span style={{ ...RECO_COLORS.CONCILIADA, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{conciliadas} conciliada{conciliadas !== 1 ? "s" : ""}</span>}
                {parciales   > 0 && <span style={{ ...RECO_COLORS.PARCIAL,     fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{parciales} parcial{parciales !== 1 ? "es" : ""}</span>}
                {sinSoporte  > 0 && <span style={{ ...RECO_COLORS.SIN_SOPORTE, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{sinSoporte} sin soporte</span>}
              </div>
            </div>
          );
        })()}

        {/* Documents table */}
        {receivables.documents.length > 0 && (
          <div style={{ padding: "6px 14px 0", fontFamily: "monospace", fontSize: 10, color: "#6b7280" }}>
            Mostrando {receivables.documents.length} de {receivables.totalOpenCount} documentos abiertos
          </div>
        )}
        {receivables.documents.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Factura</TH>
                  <TH right>Emisión</TH>
                  <TH right>Vencimiento</TH>
                  <TH right>Original</TH>
                  <TH right>Aplicado</TH>
                  <TH right>Saldo real</TH>
                  <TH right>Días mora</TH>
                  <TH>Antigüedad</TH>
                  <TH>Concil.</TH>
                  <TH>Acciones</TH>
                </tr>
              </thead>
              <tbody>
                {receivables.documents.slice(0, 20).map((doc, i) => (
                  <React.Fragment key={i}>
                  <tr style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>{doc.invoiceNumber ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD right>{fmtDate(doc.invoiceDate)}</TD>
                    <TD right>{fmtDate(doc.dueDate)}</TD>
                    <TD right>{fmtCOP(doc.originalAmount)}</TD>
                    <TD right>
                      {doc.appliedTotal > 0
                        ? <span style={{ color: "#15803d", fontWeight: 600 }}>{fmtCOP(doc.appliedTotal)}</span>
                        : <span style={{ color: "#9ca3af" }}>—</span>}
                    </TD>
                    <TD right>
                      <span style={{ fontWeight: 700, color: doc.remainingBalance > 0 ? "#991b1b" : "#15803d" }}>
                        {fmtCOP(doc.remainingBalance)}
                      </span>
                    </TD>
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
                    <TD>
                      <span style={{
                        ...(RECO_COLORS[doc.recoStatus] ?? {}),
                        fontSize: 10, fontWeight: 700, padding: "2px 7px",
                        borderRadius: 4, fontFamily: "monospace",
                        cursor: doc.appliedDocuments.length > 0 ? "pointer" : "default",
                      }}
                        onClick={() => doc.appliedDocuments.length > 0 && toggleDocExpand(doc.id)}
                        title={doc.appliedDocuments.length > 0 ? "Ver pagos aplicados" : undefined}
                      >
                        {RECO_LABELS[doc.recoStatus] ?? doc.recoStatus}
                        {doc.appliedDocuments.length > 0 && (
                          <span style={{ marginLeft: 4 }}>{expandedDocs.has(doc.id) ? "▲" : "▼"}</span>
                        )}
                      </span>
                    </TD>
                    <TD>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button
                          onClick={() => openConciliar("conciliar", doc)}
                          style={{
                            fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                            padding: "2px 8px", border: "1px solid #1d4ed8",
                            borderRadius: 4, background: "#eff6ff", color: "#1d4ed8",
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          Conciliar pago
                        </button>
                        <button
                          onClick={() => openConciliar("manual", doc)}
                          style={{
                            fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                            padding: "2px 8px", border: "1px solid #15803d",
                            borderRadius: 4, background: "#f0fdf4", color: "#15803d",
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          Pago manual
                        </button>
                      </div>
                    </TD>
                  </tr>
                  {/* ── Expandable applied payments panel ── */}
                  {expandedDocs.has(doc.id) && doc.appliedDocuments.length > 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0, background: "#f0fdf4", borderBottom: "1px solid #86efac" }}>
                        <div style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color: "#15803d", marginBottom: 6 }}>
                            Pagos aplicados — {doc.invoiceNumber ?? "factura"}
                          </div>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                            <thead>
                              <tr style={{ color: "#6b7280" }}>
                                <th style={{ textAlign: "left", padding: "2px 8px 4px 0", fontWeight: 700 }}>Tipo</th>
                                <th style={{ textAlign: "left", padding: "2px 8px 4px 0", fontWeight: 700 }}>Fecha</th>
                                <th style={{ textAlign: "left", padding: "2px 8px 4px 0", fontWeight: 700 }}>Método</th>
                                <th style={{ textAlign: "left", padding: "2px 8px 4px 0", fontWeight: 700 }}>Referencia</th>
                                <th style={{ textAlign: "right", padding: "2px 0 4px 0", fontWeight: 700 }}>Monto aplicado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {doc.appliedDocuments.map(ad => {
                                const typeStyle =
                                  ad.type === "ND"     ? { background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }
                                  : ad.type === "AJUSTE" ? { background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe" }
                                  : { background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" };
                                return (
                                  <tr key={ad.id} style={{ borderTop: "1px solid #dcfce7" }}>
                                    <td style={{ padding: "3px 8px 3px 0" }}>
                                      <span style={{ ...typeStyle, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, fontFamily: "monospace" }}>
                                        {ad.type}
                                      </span>
                                    </td>
                                    <td style={{ padding: "3px 8px 3px 0", color: "#374151" }}>{fmtDate(ad.date)}</td>
                                    <td style={{ padding: "3px 8px 3px 0", color: "#374151" }}>{ad.method ?? "—"}</td>
                                    <td style={{ padding: "3px 8px 3px 0", color: "#6b7280" }}>{ad.reference ?? "—"}</td>
                                    <td style={{ padding: "3px 0", color: "#15803d", fontWeight: 700, textAlign: "right" }}>{fmtCOP(ad.amount)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", color: "#374151" }}>
                            <span>Total aplicado: <strong style={{ color: "#15803d" }}>{fmtCOP(doc.appliedTotal)}</strong></span>
                            <span>Saldo real: <strong style={{ color: doc.remainingBalance > 0 ? "#991b1b" : "#15803d" }}>{fmtCOP(doc.remainingBalance)}</strong></span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* ── Inline conciliation panel ── */}
                  {conciliarPanel?.receivableId === doc.id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0, background: "#f0f9ff", borderBottom: "1px solid #bae6fd" }}>
                        <div style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <strong style={{ fontSize: 13 }}>
                              {conciliarPanel.type === "manual" ? "Pago manual" : "Conciliar con cobro SAG"}
                              {conciliarPanel.invoiceNumber ? ` — Factura ${conciliarPanel.invoiceNumber}` : ""}
                            </strong>
                            <button onClick={closeConciliar} style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 10, padding: "2px 8px", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", background: "#fff" }}>
                              Cerrar
                            </button>
                          </div>
                          {conciliarPanel.type === "conciliar" && (() => {
                            const available = collectionRecords
                              .filter(cr => cr.appliedStatus === "AVAILABLE" || cr.appliedStatus === "PARTIALLY_APPLIED")
                              .sort((a, b) => new Date(b.collectionDate).getTime() - new Date(a.collectionDate).getTime());
                            if (available.length === 0) {
                              return (
                                <div style={{ marginBottom: 10, fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                                  Sin cobros SAG disponibles para este cliente — usar Pago manual.
                                </div>
                              );
                            }
                            return (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                                  Cobros disponibles del cliente
                                </div>
                                <select
                                  value={conciliarCrId}
                                  onChange={e => {
                                    setConciliarCrId(e.target.value);
                                    const cr = available.find(c => c.id === e.target.value);
                                    if (cr) setConciliarAmt(String(Math.min(cr.amount, conciliarPanel.balanceDue)));
                                  }}
                                  style={{
                                    fontFamily: "monospace", fontSize: 11, padding: "4px 6px",
                                    border: "1px solid #d1d5db", borderRadius: 4,
                                    width: "100%", maxWidth: 480,
                                  }}
                                >
                                  <option value="">— Seleccionar cobro disponible —</option>
                                  {available.map(cr => (
                                    <option key={cr.id} value={cr.id}>
                                      {cr.comprobanteCode}
                                      {cr.documentNumber ? ` ${cr.documentNumber}` : ""}
                                      {" · "}{formatDateCol(cr.collectionDate)}
                                      {" · "}{fmtCOP(cr.amount)}
                                      {cr.appliedStatus === "PARTIALLY_APPLIED" ? " · parcial" : ""}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()}
                          {/* Reference + auto-detection */}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>
                              Referencia / No. comprobante
                              <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>
                                (detecta tipo automáticamente)
                              </span>
                            </div>
                            <input
                              type="text"
                              value={conciliarRef}
                              onChange={e => handleConciliarRefChange(e.target.value)}
                              placeholder="Ej: ND-2024-001, cheque #1234, trans. 9876"
                              style={{ fontFamily: "monospace", fontSize: 11, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, width: "100%", maxWidth: 380 }}
                            />
                          </div>

                          {/* Tipo de documento */}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: "#6b7280" }}>Tipo de documento</span>
                              {conciliarDocSuggested && (
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                                  background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
                                  fontFamily: "monospace",
                                }}>
                                  Auto-detectado
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              {(["PAGO", "ND", "AJUSTE"] as const).map(dt => {
                                const selected  = conciliarDocType === dt;
                                const suggested = conciliarDocSuggested === dt;
                                const col = dt === "ND"     ? { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" }
                                           : dt === "AJUSTE" ? { bg: "#f5f3ff", fg: "#7c3aed", border: "#ddd6fe" }
                                           : { bg: "#dcfce7", fg: "#15803d", border: "#86efac" };
                                return (
                                  <button key={dt} onClick={() => { setConciliarDocType(dt); setConciliarDocSuggested(null); }} style={{
                                    fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                                    padding: "3px 10px", borderRadius: 4, cursor: "pointer",
                                    background: selected ? col.bg : "#f9fafb",
                                    color:      selected ? col.fg : "#6b7280",
                                    border:     selected ? `1.5px solid ${col.border}` : suggested ? `1px dashed ${col.border}` : "1px solid #e5e7eb",
                                  }}>
                                    {dt === "PAGO" ? "Pago" : dt === "ND" ? "Nota descuento" : "Ajuste"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Payment method */}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Medio de pago</div>
                            <select
                              value={conciliarMethod}
                              onChange={e => setConciliarMethod(e.target.value)}
                              style={{ fontFamily: "monospace", fontSize: 11, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                            >
                              <option value="TRANSFERENCIA">Transferencia bancaria</option>
                              <option value="CONSIGNACION">Consignación</option>
                              <option value="CHEQUE">Cheque</option>
                              <option value="EFECTIVO">Efectivo</option>
                              <option value="PSE">PSE</option>
                              <option value="OTRO">Otro</option>
                            </select>
                          </div>

                          {/* Inconsistency warning — ND + bank transfer */}
                          {conciliarDocType === "ND" && (conciliarMethod === "TRANSFERENCIA" || conciliarMethod === "CONSIGNACION" || conciliarMethod === "PSE") && (
                            <div style={{
                              marginBottom: 10, padding: "7px 10px", borderRadius: 4,
                              background: "#fff7ed", border: "1px solid #fed7aa",
                              fontSize: 11, color: "#92400e", fontFamily: "monospace",
                            }}>
                              <strong>Advertencia:</strong> Las notas de descuento no suelen registrarse como transferencias bancarias.
                              Verifica que el tipo de documento sea correcto antes de aplicar.
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Monto a aplicar (COP)</div>
                              <input
                                type="number"
                                value={conciliarAmt}
                                onChange={e => setConciliarAmt(e.target.value)}
                                min={1}
                                max={doc.balanceDue}
                                style={{ fontFamily: "monospace", fontSize: 12, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, width: 140 }}
                              />
                              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Saldo: {fmtCOP(doc.balanceDue)} · Parcial = dividir pago</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Notas (opcional)</div>
                              <input
                                type="text"
                                value={conciliarNotes}
                                onChange={e => setConciliarNotes(e.target.value)}
                                placeholder="Ej: acuerdo de pago, cheque #1234"
                                style={{ fontFamily: "monospace", fontSize: 11, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, width: "100%" }}
                              />
                            </div>
                            {(() => {
                              const isDisabled = conciliarBusy || (conciliarPanel.type === "conciliar" && !conciliarCrId);
                              return (
                                <button
                                  onClick={() => submitConciliar()}
                                  disabled={isDisabled}
                                  style={{
                                    fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                                    padding: "5px 14px", borderRadius: 4, border: "none",
                                    background: isDisabled ? "#9ca3af" : "#1d4ed8",
                                    color: "#fff",
                                    cursor: isDisabled ? "not-allowed" : "pointer",
                                    opacity: isDisabled && !conciliarBusy ? 0.6 : 1,
                                  }}
                                >
                                  {conciliarBusy ? "Aplicando..." : "Aplicar pago"}
                                </button>
                              );
                            })()}
                          </div>
                          {conciliarError && <div style={{ color: "#dc2626", fontSize: 11, marginTop: 4 }}>{conciliarError}</div>}
                          {conciliarOk    && <div style={{ color: "#15803d", fontSize: 11, marginTop: 4, fontWeight: 600 }}>{conciliarOk}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
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

      {/* ── Section 6b: Cobros SAG — compact summary strip + collapsible detail ── */}
      {collectionRecords.length > 0 && (() => {
        const available = collectionRecords.filter(
          cr => cr.appliedStatus === "AVAILABLE" || cr.appliedStatus === "PARTIALLY_APPLIED",
        );
        const applied = collectionRecords.filter(
          cr => cr.appliedStatus === "APPLIED" || cr.appliedStatus === "MANUAL_OVERRIDE",
        );
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "9px 16px", background: "#f8fafc",
            borderTop: "1px solid #e5e7eb", fontSize: 11, fontFamily: "monospace", color: "#6b7280",
          }}>
            <span>
              Cobros SAG:{" "}
              <strong style={{ color: available.length > 0 ? "#1e40af" : "#9ca3af" }}>
                {available.length} disponible{available.length !== 1 ? "s" : ""}
              </strong>
              {applied.length > 0 && (
                <span style={{ color: "#9ca3af" }}> · {applied.length} aplicado{applied.length !== 1 ? "s" : ""}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowAllCobros(v => !v)}
              style={{
                background: "none", border: "none", color: "#1d4ed8", cursor: "pointer",
                fontFamily: "monospace", fontSize: 11, padding: 0, textDecoration: "underline",
              }}
            >
              {showAllCobros ? "Ocultar cobros ↑" : "Ver todos los cobros →"}
            </button>
          </div>
        );
      })()}
      {showAllCobros && (
      <div>
        <div style={{ overflowX: "auto", borderTop: "1px solid #e5e7eb" }}>
          <table style={TABLE}>
            <thead>
              <tr style={THEAD_ROW}>
                <TH>Fuente</TH>
                <TH>Recibo</TH>
                <TH right>Fecha</TH>
                <TH right>Monto</TH>
                <TH>Estado</TH>
              </tr>
            </thead>
            <tbody>
              {collectionRecords.map((cr, i) => {
                const isApplied = cr.appliedStatus === "APPLIED" || cr.appliedStatus === "MANUAL_OVERRIDE";
                const isPartial = cr.appliedStatus === "PARTIALLY_APPLIED";
                const statusBadge = isApplied ? { bg: "#f0fdf4", color: "#166534", label: "Aplicado" }
                                  : isPartial  ? { bg: "#fefce8", color: "#92400e", label: "Parcial" }
                                  :              { bg: "#eff6ff", color: "#1e40af", label: "Disponible" };
                return (
                  <tr key={cr.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", opacity: isApplied ? 0.55 : 1 }}>
                    <TD bold>{cr.comprobanteCode}</TD>
                    <TD>{cr.documentNumber ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD right>{formatDateCol(cr.collectionDate)}</TD>
                    <TD right>{fmtCOP(cr.amount)}</TD>
                    <TD>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, fontFamily: "monospace", background: statusBadge.bg, color: statusBadge.color }}>
                        {statusBadge.label}
                      </span>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* ── Section 6c: Consignaciones pendientes ── */}
      <Section title={`Consignaciones pendientes (${pendingConsignaciones.length})`}>
        {pendingConsignaciones.length === 0 ? (
          <div style={{ padding: "14px 16px", fontSize: 12, color: "#aaa", background: "#fafafa" }}>
            Sin consignaciones pendientes de identificar para este cliente.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Fecha</TH>
                  <TH>Código</TH>
                  <TH>Canal</TH>
                  <TH right>Monto</TH>
                  <TH>Referencia</TH>
                  <TH>Acciones</TH>
                </tr>
              </thead>
              <tbody>
                {pendingConsignaciones.map((c, i) => (
                  <tr key={c.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD>{fmtDate(c.saleDate)}</TD>
                    <TD bold>{c.comprobanteCode}</TD>
                    <TD>{c.channelLabel}</TD>
                    <TD right>{c.amount !== 0 ? fmtCOP(Math.abs(c.amount)) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD>{c.reference ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD>
                      <button
                        onClick={() => openDeposit({
                          sourceType:   "consignacion",
                          sourceId:     c.id,
                          sourceLabel:  `${c.comprobanteCode} · ${c.channelLabel} · ${fmtDate(c.saleDate)}`,
                          sourceAmount: Math.abs(c.amount),
                          sourceRef:    c.reference,
                          sourceDate:   c.saleDate ?? new Date().toISOString(),
                        })}
                        style={{
                          fontFamily:   "monospace",
                          fontSize:     10,
                          fontWeight:   600,
                          padding:      "2px 8px",
                          border:       "1px solid #92400e",
                          borderRadius: 4,
                          background:   "#fffbeb",
                          color:        "#92400e",
                          cursor:       "pointer",
                          whiteSpace:   "nowrap",
                        }}
                      >
                        Aplicar a factura
                      </button>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* ── Section 11: Historial de cobros ── */}
      <Section title={`Cobros registrados (últimos ${recentPayments.length})`}>
        {recentPayments.length === 0 ? (
          <div style={{ padding: "16px 0", color: "#9ca3af", fontSize: 12, fontStyle: "italic" }}>
            Sin cobros registrados para este cliente. Use "Registrar cobro" en la Cola de Cobranza.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Fecha</TH>
                  <TH>Método</TH>
                  <TH>Referencia</TH>
                  <TH right>Monto cobrado</TH>
                  <TH right>Saldo antes</TH>
                  <TH right>Saldo después</TH>
                  <TH>Factura</TH>
                  <TH>Estado</TH>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p, i) => {
                  const statusStyle: Record<string, { bg: string; color: string }> = {
                    RECONCILED:            { bg: "#dcfce7", color: "#15803d" },
                    PARTIALLY_RECONCILED:  { bg: "#fef9c3", color: "#854d0e" },
                    PENDING:               { bg: "#fef3c7", color: "#92400e" },
                    REVERSED:              { bg: "#fee2e2", color: "#991b1b" },
                    DRAFT:                 { bg: "#f3f4f6", color: "#4b5563" },
                  };
                  const ss = statusStyle[p.status] ?? { bg: "#f3f4f6", color: "#555" };
                  const firstAlloc = p.allocations[0];
                  return (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD>{fmtDate(p.paymentDate)}</TD>
                      <TD>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#374151" }}>
                          {p.paymentMethod.replace(/_/g, " ")}
                        </span>
                      </TD>
                      <TD>{p.reference ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>
                        <span style={{ fontWeight: 700, color: "#15803d" }}>{fmtCOP(p.amount)}</span>
                      </TD>
                      <TD right>
                        {firstAlloc ? fmtCOP(firstAlloc.balanceBefore) : <span style={{ color: "#ccc" }}>—</span>}
                      </TD>
                      <TD right>
                        {firstAlloc
                          ? <span style={{ color: firstAlloc.balanceAfter > 0 ? "#dc2626" : "#15803d" }}>{fmtCOP(firstAlloc.balanceAfter)}</span>
                          : <span style={{ color: "#ccc" }}>—</span>}
                      </TD>
                      <TD>
                        {firstAlloc?.receivable?.invoiceNumber
                          ? <span style={{ fontSize: 11, color: "#6b7280" }}>{firstAlloc.receivable.invoiceNumber}</span>
                          : <span style={{ color: "#ccc" }}>sin conciliar</span>}
                        {p.allocations.length > 1 && (
                          <span style={{ fontSize: 10, color: "#9ca3af" }}> +{p.allocations.length - 1} más</span>
                        )}
                      </TD>
                      <TD>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          padding: "2px 7px", borderRadius: 4,
                          background: ss.bg, color: ss.color,
                          fontFamily: "monospace",
                        }}>
                          {p.status.replace(/_/g, " ")}
                        </span>
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
    </>
  );
}
