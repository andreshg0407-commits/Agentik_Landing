/**
 * components/executive/mobile-signal-strip.tsx
 *
 * Three critical signal cards — Torre de Control mobile.
 *
 * Overdue exposure | SAG pending | Critical alerts
 *
 * Each card is a tap target that navigates to the relevant module.
 * Color-coded by urgency. Always rendered — shows "✓" when signal is clear.
 *
 * Server component — no state, no effects.
 */

import Link from "next/link";

export interface MobileSignalStripProps {
  orgSlug:           string;
  totalOverdue:      number;   // 0 = none
  hasOverdueData:    boolean;  // false = data not available
  pendingApprovals:  number;
  criticalAlertCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(0) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MobileSignalStrip({
  orgSlug,
  totalOverdue,
  hasOverdueData,
  pendingApprovals,
  criticalAlertCount,
}: MobileSignalStripProps) {
  const hasOverdue = hasOverdueData && totalOverdue > 0;

  const signals: {
    label:  string;
    value:  string;
    sub:    string;
    urgent: boolean;
    color:  string;
    bg:     string;
    border: string;
    href:   string;
  }[] = [
    {
      label:  "Cartera vencida",
      value:  !hasOverdueData
        ? "—"
        : hasOverdue
        ? "$" + fmtShort(totalOverdue)
        : "✓",
      sub:    !hasOverdueData ? "sin datos" : hasOverdue ? "saldo vencido" : "al día",
      urgent: hasOverdue,
      color:  !hasOverdueData ? "#9ca3af" : hasOverdue ? "#dc2626" : "#16a34a",
      bg:     !hasOverdueData ? "#f8f9fb" : hasOverdue ? "#fff0f0" : "#f0fdf4",
      border: !hasOverdueData ? "#e5e7eb" : hasOverdue ? "#fca5a5" : "#bbf7d0",
      href:   `/${orgSlug}/customer-360`,
    },
    {
      label:  "SAG pendiente",
      value:  pendingApprovals > 0 ? String(pendingApprovals) : "✓",
      sub:    pendingApprovals > 0 ? "por aprobar" : "al día",
      urgent: pendingApprovals > 0,
      color:  pendingApprovals > 0 ? "#d97706" : "#16a34a",
      bg:     pendingApprovals > 0 ? "#fffbeb" : "#f0fdf4",
      border: pendingApprovals > 0 ? "#fde68a" : "#bbf7d0",
      href:   `/${orgSlug}/sag/write`,
    },
    {
      label:  "Alertas Críticas",
      value:  criticalAlertCount > 0 ? String(criticalAlertCount) : "✓",
      sub:    criticalAlertCount > 0 ? "activas" : "sin alertas",
      urgent: criticalAlertCount > 0,
      color:  criticalAlertCount > 0 ? "#dc2626" : "#16a34a",
      bg:     criticalAlertCount > 0 ? "#fff0f0" : "#f0fdf4",
      border: criticalAlertCount > 0 ? "#fca5a5" : "#bbf7d0",
      href:   `/${orgSlug}/alerts`,
    },
  ];

  return (
    <div style={{
      display:              "grid",
      gridTemplateColumns:  "1fr 1fr 1fr",
      gap:                  8,
      marginBottom:         16,
    }}>
      {signals.map(s => (
        <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
          <div style={{
            background:   s.bg,
            border:       `1px solid ${s.border}`,
            borderRadius: 10,
            padding:      "12px 8px",
            textAlign:    "center",
          }}>
            {/* Primary value */}
            <div style={{
              fontSize:      s.value.length > 4 ? 17 : 22,
              fontWeight:    900,
              color:         s.color,
              lineHeight:    1,
              letterSpacing: "-0.02em",
              marginBottom:  3,
            }}>
              {s.value}
            </div>

            {/* Sub-label (urgency description) */}
            <div style={{
              fontSize:      9,
              fontWeight:    700,
              color:         s.color,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom:  2,
            }}>
              {s.sub}
            </div>

            {/* Signal label */}
            <div style={{
              fontSize:   9,
              color:      "#9ca3af",
              lineHeight: 1.2,
            }}>
              {s.label}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
