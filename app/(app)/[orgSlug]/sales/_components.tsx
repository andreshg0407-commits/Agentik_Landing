/**
 * Shared UI primitives for sales drill-down pages.
 * Server-renderable (no "use client").
 */

import Link from "next/link";
import type { ReactNode, CSSProperties } from "react";

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtCOP(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export function fmtN(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO").format(n);
}

// ── Table primitives ──────────────────────────────────────────────────────────

export const TABLE: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
export const THEAD_ROW: CSSProperties = { borderBottom: "1px solid #eee", background: "#fafafa" };

export function TH({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "7px 14px", textAlign: right ? "right" : "left",
      fontWeight: 600, color: "#777", fontSize: 11, whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

export function TD({
  children, right, bold, muted,
}: {
  children: ReactNode; right?: boolean; bold?: boolean; muted?: boolean;
}) {
  return (
    <td style={{
      padding: "8px 14px", textAlign: right ? "right" : "left",
      fontWeight: bold ? 600 : 400,
      color: muted ? "#888" : "#111",
      borderBottom: "1px solid #f5f5f5",
    }}>
      {children}
    </td>
  );
}

// ── Data source badge ─────────────────────────────────────────────────────────

type DataSource = "SAG" | "CRM" | "XML" | "ERP" | "Agentik";

const SOURCE_STYLE: Record<DataSource, { bg: string; color: string }> = {
  SAG:     { bg: "#fff7ed", color: "#c2410c" },
  CRM:     { bg: "#ede9fe", color: "#6d28d9" },
  XML:     { bg: "#f0fdf4", color: "#15803d" },
  ERP:     { bg: "#eff6ff", color: "#1d4ed8" },
  Agentik: { bg: "#faf5ff", color: "#7c3aed" },
};

export function SourceBadge({ source }: { source: DataSource }) {
  const s = SOURCE_STYLE[source];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "1px 5px",
      borderRadius: 3, background: s.bg, color: s.color,
      letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>
      {source}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

export function KpiCard({
  label, value, sub, accent, hint, source,
}: {
  label:   string;
  value:   string;
  sub?:    string;
  accent?: boolean;
  /** Short contextual help shown below the value — explains what this KPI means. */
  hint?:   string;
  /** Data source attribution badge (SAG / CRM / XML / ERP / Agentik). */
  source?: DataSource;
}) {
  return (
    <div style={{
      border:       `1px solid ${accent ? "#c4b5fd" : "#ddd"}`,
      borderRadius: 6,
      padding:      "14px 18px",
      background:   accent ? "#faf5ff" : "#fff",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 10, color: "#888", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          {label}
        </span>
        {source && <SourceBadge source={source} />}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ? "#6d28d9" : "#111", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{sub}</div>}
      {hint && (
        <div style={{
          fontSize: 10, color: "#aaa", marginTop: 5, lineHeight: 1.4,
          borderTop: "1px solid #f5f5f5", paddingTop: 5,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ── Section box ───────────────────────────────────────────────────────────────

export function Section({
  title, subtitle, action, children,
}: {
  title:     string;
  subtitle?: string;
  /** Optional element rendered at the right side of the section header. */
  action?:   ReactNode;
  children:  ReactNode;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
      <div style={{
        padding: "9px 14px", borderBottom: "1px solid #ddd",
        background: "#f5f5f5",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, color: "#888" }}>{subtitle}</span>}
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Share bar ─────────────────────────────────────────────────────────────────

export function ShareBar({ share, color = "#7c3aed" }: { share: number; color?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        display: "inline-block", height: 6,
        width: Math.max(2, Math.min(80, share * 0.8)),
        background: color, borderRadius: 2, verticalAlign: "middle",
      }} />
      <span style={{ fontSize: 11 }}>{share.toFixed(1)}%</span>
    </span>
  );
}

// ── Growth badge ──────────────────────────────────────────────────────────────

export function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: "#ccc" }}>—</span>;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#15803d" : "#dc2626" }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

export function Breadcrumb({ crumbs }: { crumbs: Array<{ label: string; href?: string }> }) {
  return (
    <nav style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 11, fontFamily: "monospace", color: "#888",
      marginBottom: 16, flexWrap: "wrap",
    }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span style={{ color: "#ccc" }}>/</span>}
          {c.href
            ? <Link href={c.href} style={{ color: "#888", textDecoration: "none" }}>{c.label}</Link>
            : <span style={{ color: "#111", fontWeight: 600 }}>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  message = "Sin datos para este período.",
  hint,
}: {
  message?: string;
  hint?:    string;
}) {
  return (
    <div style={{
      padding: "20px 14px", fontSize: 12, color: "#aaa", background: "#fafafa",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>—</div>
      <div style={{ color: "#888", fontWeight: 600, marginBottom: hint ? 4 : 0 }}>{message}</div>
      {hint && <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>
      {children}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  badge,
  periodLabel,
  actions,
}: {
  title:        string;
  badge?:       string;
  periodLabel?: string;
  /** Optional action links rendered at the far right of the header row. */
  actions?:     ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "#111" }}>{title}</h1>
      {badge && (
        <span style={{
          fontSize: 11, background: "#111", color: "#fff",
          padding: "2px 10px", borderRadius: 4, fontWeight: 700, letterSpacing: "0.03em",
        }}>
          {badge}
        </span>
      )}
      {periodLabel && (
        <span style={{ fontSize: 11, color: "#888" }}>
          período: <b>{periodLabel}</b>
        </span>
      )}
      {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

// ── KPI grid ──────────────────────────────────────────────────────────────────

export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
      gap: 12,
      marginBottom: 24,
    }}>
      {children}
    </div>
  );
}

// ── Info bar ─────────────────────────────────────────────────────────────────
// Contextual notice for non-technical admins. Explains data source or next steps.

export function InfoBar({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?:  boolean;
}) {
  return (
    <div style={{
      fontSize:     12,
      color:        accent ? "#6d28d9" : "#666",
      background:   accent ? "#faf5ff" : "#f9fafb",
      border:       `1px solid ${accent ? "#c4b5fd" : "#e5e7eb"}`,
      borderRadius: 6,
      padding:      "10px 14px",
      marginBottom: 16,
      lineHeight:   1.5,
    }}>
      {children}
    </div>
  );
}

// ── Quick action link ─────────────────────────────────────────────────────────

export function ActionLink({
  href, children, variant = "default",
}: {
  href:      string;
  children:  ReactNode;
  variant?:  "default" | "primary" | "muted";
}) {
  const styles: Record<string, CSSProperties> = {
    default: { color: "#374151", background: "#f9fafb", border: "1px solid #d1d5db" },
    primary: { color: "#6d28d9", background: "#faf5ff", border: "1px solid #c4b5fd", fontWeight: 700 },
    muted:   { color: "#888",    background: "#fff",    border: "1px solid #e5e7eb" },
  };
  return (
    <Link href={href} style={{
      fontSize: 11, fontFamily: "monospace",
      padding: "4px 12px", borderRadius: 6,
      textDecoration: "none", whiteSpace: "nowrap",
      display: "inline-block",
      ...styles[variant],
    }}>
      {children}
    </Link>
  );
}

// ── Trend mini-table (shared between seller/line/customer/branch detail pages) ──

interface TrendRow { periodo: string; totalAmount: number; txCount: number | null }

export function TrendTable({
  rows,
  currentPeriod,
  fmtPeriodo,
}: {
  rows:          TrendRow[];
  currentPeriod: string;
  fmtPeriodo:    (p: string) => string;
}) {
  if (rows.length === 0) return <EmptyState />;

  // Compute MoM growth
  const active = rows.filter(r => r.totalAmount > 0);
  const withGrowth = active.map((r, i) => {
    const prev = active[i - 1];
    const growth = prev && prev.totalAmount > 0
      ? Math.round(((r.totalAmount - prev.totalAmount) / prev.totalAmount) * 10000) / 100
      : null;
    return { ...r, growth };
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={TABLE}>
        <thead>
          <tr style={THEAD_ROW}>
            <TH>Periodo</TH>
            <TH right>Ventas</TH>
            <TH right>Pedidos</TH>
            <TH right>Crecim. mensual</TH>
          </tr>
        </thead>
        <tbody>
          {withGrowth.map((r, i) => (
            <tr key={r.periodo} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <TD bold={r.periodo === currentPeriod}>{fmtPeriodo(r.periodo)}</TD>
              <TD right>{fmtCOP(r.totalAmount)}</TD>
              <TD right>{r.txCount != null ? fmtN(r.txCount) : "—"}</TD>
              <TD right><GrowthBadge pct={r.growth} /></TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
