/**
 * Shared Unified Commercial Ledger UI blocks.
 * Server-renderable (no "use client").
 *
 * Exports:
 *   LedgerStatusBadge   — coloured pill for a LedgerStatus value
 *   LedgerKpiRow        — 3-column grid of CRM-pipeline mini cards
 *   CommercialTimeline  — table of CommercialFact rows (most recent first)
 */

import type { ReactNode } from "react";
import type { LedgerStatus, CommercialFact } from "@/lib/commercial-ledger/types";
import { TABLE, THEAD_ROW, TH, TD, fmtCOP, EmptyState } from "./_components";

// ── Status badge ──────────────────────────────────────────────────────────────

interface StatusMeta { label: string; bg: string; color: string }

const STATUS_META: Record<LedgerStatus, StatusMeta> = {
  pending_sag:   { label: "Pendiente SAG",    bg: "#fef9c3", color: "#92400e" },
  synced_sag:    { label: "En SAG",           bg: "#dbeafe", color: "#1d4ed8" },
  invoiced:      { label: "Facturado",        bg: "#d1fae5", color: "#065f46" },
  current:       { label: "Vigente",          bg: "#f0fdf4", color: "#15803d" },
  partial:       { label: "Pago parcial",     bg: "#fef3c7", color: "#d97706" },
  overdue:       { label: "Vencido",          bg: "#fee2e2", color: "#dc2626" },
  paid:          { label: "Cobrado",          bg: "#d1fae5", color: "#065f46" },
  written_off:   { label: "Castigado",        bg: "#f5f5f5", color: "#6b7280" },
  collected_xml: { label: "Cobrado XML",      bg: "#ede9fe", color: "#6d28d9" },
};

export function LedgerStatusBadge({ status }: { status: LedgerStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: m.bg, color: m.color, whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  );
}

// ── Source type label ─────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  crm_quote:   "CRM",
  sag_invoice: "SAG",
  xml_payment: "XML",
};

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    crm_quote:   { bg: "#ede9fe", color: "#6d28d9" },
    sag_invoice: { bg: "#fff7ed", color: "#c2410c" },
    xml_payment: { bg: "#f0fdf4", color: "#15803d" },
  };
  const c = colors[source] ?? { bg: "#f5f5f5", color: "#555" };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
      background: c.bg, color: c.color,
    }}>
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

// ── Ledger pipeline KPI row ───────────────────────────────────────────────────
//
// Shows the three CRM→SAG pipeline stages as small inline cards.

interface LedgerPipelineProps {
  pendingToSag:       number;
  pendingToSagAmount: number;
  syncedToSag:        number;
  notInvoiced:        number;
  notInvoicedAmount:  number;
  acceptedQuotes:     number;
  acceptedAmount:     number;
}

export function LedgerPipelineCards(props: LedgerPipelineProps) {
  function MiniCard({
    label, count, amount, bg, color,
  }: {
    label: string; count: number; amount: number; bg: string; color: string;
  }) {
    return (
      <div style={{
        border: `1px solid ${color}33`, borderRadius: 6,
        padding: "10px 14px", background: bg,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color, textTransform: "uppercase",
          letterSpacing: "0.05em", marginBottom: 4,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1 }}>
          {count > 0 ? count : "—"}
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
          {amount > 0 ? fmtCOP(amount) : "sin monto"}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: 10,
      margin: "0 0 20px",
    }}>
      <MiniCard
        label="Pendiente SAG"
        count={props.pendingToSag}
        amount={props.pendingToSagAmount}
        bg="#fefce8" color="#92400e"
      />
      <MiniCard
        label="En SAG sin facturar"
        count={props.notInvoiced}
        amount={props.notInvoicedAmount}
        bg="#eff6ff" color="#1d4ed8"
      />
      <MiniCard
        label="Cotiz. aceptadas"
        count={props.acceptedQuotes}
        amount={props.acceptedAmount}
        bg="#f0fdf4" color="#15803d"
      />
      <MiniCard
        label="Sincron. con SAG"
        count={props.syncedToSag}
        amount={0}
        bg="#faf5ff" color="#6d28d9"
      />
    </div>
  );
}

// ── Commercial timeline table ─────────────────────────────────────────────────

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export function CommercialTimeline({
  facts,
  limit = 10,
}: {
  facts: CommercialFact[];
  limit?: number;
}) {
  const rows = facts.slice(0, limit);
  if (rows.length === 0) return <EmptyState message="Sin eventos comerciales para este cliente." />;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={TABLE}>
        <thead>
          <tr style={THEAD_ROW}>
            <TH>Fecha</TH>
            <TH>Fuente</TH>
            <TH>Documento</TH>
            <TH>Vendedor / Sucursal</TH>
            <TH right>Monto</TH>
            <TH right>Saldo</TH>
            <TH>Estado</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={f.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <TD muted>{fmtDate(f.issuedAt)}</TD>
              <TD><SourceBadge source={f.sourceType} /></TD>
              <TD bold>{f.documentNumber ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
              <TD muted>
                {f.sellerName ?? "—"}
                {f.branch ? <span style={{ fontSize: 10, marginLeft: 6, color: "#aaa" }}>{f.branch}</span> : null}
              </TD>
              <TD right>{f.grossAmount != null ? fmtCOP(f.grossAmount) : "—"}</TD>
              <TD right>
                {f.outstandingAmount != null && f.outstandingAmount > 0
                  ? <span style={{ color: "#dc2626", fontWeight: 600 }}>{fmtCOP(f.outstandingAmount)}</span>
                  : <span style={{ color: "#ccc" }}>—</span>
                }
              </TD>
              <TD><LedgerStatusBadge status={f.ledgerStatus} /></TD>
            </tr>
          ))}
        </tbody>
      </table>
      {facts.length > limit && (
        <div style={{ padding: "8px 14px", fontSize: 11, color: "#888" }}>
          Mostrando {limit} de {facts.length} eventos.
        </div>
      )}
    </div>
  );
}

// ── Section wrapper reused by all three pages ─────────────────────────────────

export function LedgerSection({
  title,
  subtitle,
  children,
}: {
  title:    string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div style={{
      border: "1px solid #c4b5fd", borderRadius: 6, overflow: "hidden", marginBottom: 20,
    }}>
      <div style={{
        padding: "9px 14px", borderBottom: "1px solid #c4b5fd",
        background: "#faf5ff",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#6d28d9" }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, color: "#888" }}>{subtitle}</span>}
        <span style={{
          fontSize: 10, background: "#ede9fe", color: "#6d28d9",
          padding: "2px 7px", borderRadius: 4, fontWeight: 700, marginLeft: "auto",
        }}>
          CRM · SAG · XML
        </span>
      </div>
      {children}
    </div>
  );
}
