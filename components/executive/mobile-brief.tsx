/**
 * components/executive/mobile-brief.tsx
 *
 * Mobile executive hero card — Torre de Control.
 *
 * Dark header with role-aware greeting + up to 3 live risk items ordered
 * by business impact. All data comes from the server page — no queries.
 *
 * Risk priority order:
 *   1. Critical alerts (most urgent — operational blocker)
 *   2. Overdue receivables (financial exposure, threshold-adjusted)
 *   3. Pending SAG approvals (ops friction)
 *   4. F2 conversion signal (data quality / revenue at risk)
 *
 * Timezone: greeting uses Colombia (UTC-5) hour, not server UTC, so the
 * time-of-day message is always correct regardless of deployment region.
 */

import Link from "next/link";

// ── Role display ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN:   "Administrador",
  MANAGER:     "Gerente",
  SUPER_ADMIN: "Super Admin",
  SALES_REP:   "Comercial",
  VIEWER:      "Analista",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MobileExecutiveBriefProps {
  orgName:          string;
  orgSlug:          string;
  firstName:        string;
  role:             string;
  periodLabel:      string;
  criticalCount:    number;
  totalOverdue:     number;   // COP — from fpaCashFlow.totalOverdue
  pendingApprovals: number;
  f2SharePct:       number;
  conversionRate:   number;
  hasSourceData:    boolean;
  count90Plus?:     number;  // customers with maxDpd > 90 days
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  if (n >= 1_000)         return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n;
}

// Colombia is always UTC-5 (no DST). Using UTC offset avoids wrong greetings
// when the server runs in a different timezone (e.g., Vercel UTC).
function colombiaHour(): number {
  return (new Date().getUTCHours() - 5 + 24) % 24;
}

function timeGreeting(): string {
  const h = colombiaHour();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

// ── Risk synthesis ────────────────────────────────────────────────────────────

interface RiskItem {
  level:     "critical" | "warn" | "ok";
  dot:       string;
  text:      string;
  href:      string;
  linkLabel: string;
}

function buildRisks(p: MobileExecutiveBriefProps): RiskItem[] {
  const {
    orgSlug, criticalCount, totalOverdue, pendingApprovals,
    f2SharePct, conversionRate, hasSourceData, count90Plus,
  } = p;
  const items: RiskItem[] = [];

  // 1 — Critical alerts (highest urgency)
  if (criticalCount > 0) {
    items.push({
      level:     "critical",
      dot:       "#dc2626",
      text:      `${criticalCount} alerta${criticalCount > 1 ? "s" : ""} crítica${criticalCount > 1 ? "s" : ""} activa${criticalCount > 1 ? "s" : ""}`,
      href:      `/${orgSlug}/alerts`,
      linkLabel: "Ver alertas →",
    });
  }

  // 2 — Overdue receivables (threshold: >$10M = critical exposure)
  if (totalOverdue > 0) {
    items.push({
      level:     totalOverdue > 10_000_000 ? "critical" : "warn",
      dot:       totalOverdue > 10_000_000 ? "#dc2626"  : "#d97706",
      text:      `${fmtShort(totalOverdue)} de cartera vencida sin cobrar`,
      href:      `/${orgSlug}/customer-360`,
      linkLabel: "Ver cartera →",
    });
  }

  // 2b — +90 DPD customers (critical credit risk)
  if ((count90Plus ?? 0) > 0) {
    items.push({
      level:     "critical",
      dot:       "#dc2626",
      text:      `${count90Plus} cliente${(count90Plus ?? 0) > 1 ? "s" : ""} con mora superior a 90 días`,
      href:      `/${orgSlug}/customer-360?hasOverdue=true`,
      linkLabel: "Ver deudores →",
    });
  }

  // 3 — Pending SAG approvals (ops friction)
  if (pendingApprovals > 0) {
    items.push({
      level:     "warn",
      dot:       "#d97706",
      text:      `${pendingApprovals} operación${pendingApprovals > 1 ? "es" : ""} SAG pendiente${pendingApprovals > 1 ? "s" : ""} de aprobación`,
      href:      `/${orgSlug}/sag/write`,
      linkLabel: "Aprobar →",
    });
  }

  // 4 — F2 conversion signal (fill remaining slots, threshold: ≥25%)
  if (items.length < 3 && hasSourceData && f2SharePct >= 25) {
    items.push({
      level:     f2SharePct >= 40 ? "warn" : "ok",
      dot:       f2SharePct >= 40 ? "#d97706" : "#ca8a04",
      text:      `F2 representa el ${f2SharePct.toFixed(0)}% — conversión en ${conversionRate.toFixed(0)}%`,
      href:      `/${orgSlug}/sales`,
      linkLabel: "Ver mix →",
    });
  }

  // 5 — All clear: premium empty state (never show a blank card)
  if (items.length === 0) {
    items.push({
      level:     "ok",
      dot:       "#16a34a",
      text:      "Indicadores dentro del umbral esperado. Operación saludable.",
      href:      `/${orgSlug}/executive`,
      linkLabel: "Ver análisis →",
    });
  }

  return items.slice(0, 3);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MobileExecutiveBrief(props: MobileExecutiveBriefProps) {
  const { orgName, firstName, role, periodLabel, criticalCount } = props;
  const risks     = buildRisks(props);
  const topLevel  = risks[0]?.level ?? "ok";
  const roleLabel = ROLE_LABELS[role] ?? role;

  // Dark header tinted by urgency — communicates risk at a glance
  const headerBg    = topLevel === "critical" ? "#1a0a0a" : topLevel === "warn" ? "#1a1200" : "#0a1a0f";
  const accentColor = topLevel === "critical" ? "#dc2626" : topLevel === "warn" ? "#d97706" : "#16a34a";

  // Urgency subtitle — specific and actionable, not passive
  const urgencySubtitle = criticalCount > 0
    ? `${criticalCount} señal${criticalCount > 1 ? "es" : ""} de alta prioridad — acción requerida.`
    : topLevel === "warn"
    ? "Situación a monitorear. Revisa las señales."
    : "Indicadores saludables. Sin alertas críticas.";

  return (
    <div style={{ marginBottom: 16 }}>

      {/* ── Dark header ── */}
      <div style={{
        background:     headerBg,
        borderRadius:   "12px 12px 0 0",
        padding:        "16px 16px 14px",
        display:        "flex",
        alignItems:     "flex-start",
        justifyContent: "space-between",
        gap:            8,
      }}>
        <div>
          {/* Module label + period */}
          <div style={{
            fontSize: 9, color: "#666", fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6,
          }}>
            Torre de Control · {periodLabel}
          </div>

          {/* Role-aware greeting */}
          <div style={{
            fontSize: 20, fontWeight: 900, color: "#fff",
            letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 4,
          }}>
            {timeGreeting()}, {firstName}.
          </div>

          {/* Urgency subtitle — specific, not passive */}
          <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.4 }}>
            {urgencySubtitle}
          </div>
        </div>

        {/* Right side: role badge + org name */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          {/* Role badge */}
          <div style={{
            fontSize: 9, fontWeight: 700, color: accentColor,
            background: `${accentColor}20`, border: `1px solid ${accentColor}40`,
            borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
          }}>
            {roleLabel}
          </div>
          {/* Org name — dimmer, secondary */}
          <div style={{
            fontSize: 9, color: "#555", fontWeight: 600,
            whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {orgName}
          </div>
        </div>
      </div>

      {/* ── Risk items ── */}
      <div style={{
        background:   "#fff",
        border:       "1px solid #e5e7eb",
        borderTop:    "none",
        borderRadius: "0 0 12px 12px",
        overflow:     "hidden",
      }}>
        {risks.map((risk, i) => (
          <div
            key={i}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          12,
              padding:      "11px 16px",
              borderBottom: i < risks.length - 1 ? "1px solid #f0f0f0" : "none",
              // Highlight critical rows with a subtle left accent
              borderLeft:   risk.level === "critical" ? `3px solid ${risk.dot}` : "3px solid transparent",
            }}
          >
            {/* Status dot */}
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: risk.dot, flexShrink: 0,
            }} />

            {/* Risk text */}
            <div style={{
              flex:       1,
              fontSize:   13,
              lineHeight: 1.3,
              color:      risk.level === "critical" ? "#991b1b"
                        : risk.level === "warn"     ? "#92400e"
                        : "#14532d",
              fontWeight: 600,
            }}>
              {risk.text}
            </div>

            {/* Module link */}
            <Link href={risk.href} style={{
              fontSize:       10,
              fontWeight:     700,
              color:          risk.dot,
              textDecoration: "none",
              whiteSpace:     "nowrap",
              flexShrink:     0,
            }}>
              {risk.linkLabel}
            </Link>
          </div>
        ))}
      </div>

    </div>
  );
}
