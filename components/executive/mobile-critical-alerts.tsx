/**
 * components/executive/mobile-critical-alerts.tsx
 *
 * Mobile-only Critical Alerts panel — Torre de Control.
 *
 * Shows up to 3 critical alerts above the fold so executives see the most
 * urgent items immediately on mobile without scrolling.
 *
 * Receives pre-extracted alert data from the page; no new queries.
 */

import Link from "next/link";

export interface MobileCriticalAlert {
  title:   string;
  message: string | null;
  type:    string;
}

export interface MobileCriticalAlertsProps {
  alerts:  MobileCriticalAlert[];
  orgSlug: string;
}

export default function MobileCriticalAlerts({ alerts, orgSlug }: MobileCriticalAlertsProps) {
  if (alerts.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "#f0fdf4", border: "1px solid #bbf7d0",
        borderRadius: 8, padding: "10px 14px", marginBottom: 16,
      }}>
        <span style={{ fontSize: 14 }}>✓</span>
        <span style={{ fontSize: 12, color: "#14532d", fontWeight: 600 }}>
          Sin alertas críticas activas
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#dc2626",
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
      }}>
        ⚠ Alertas críticas
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {alerts.map((alert, i) => (
          <div key={i} style={{
            borderLeft: "3px solid #dc2626",
            background: "#fef2f2",
            borderRadius: "0 8px 8px 0",
            padding: "10px 14px",
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: "#991b1b",
              marginBottom: alert.message ? 3 : 0,
              lineHeight: 1.3,
            }}>
              {alert.title}
            </div>
            {alert.message && (
              <div style={{
                fontSize: 11, color: "#b91c1c",
                lineHeight: 1.4,
                // Truncate to 2 lines on mobile
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }}>
                {alert.message}
              </div>
            )}
          </div>
        ))}
      </div>

      <Link href={`/${orgSlug}/alerts`} style={{
        display: "block", textAlign: "center",
        marginTop: 8, fontSize: 11, color: "#dc2626",
        fontWeight: 700, textDecoration: "none",
        padding: "8px", background: "#fef2f2",
        border: "1px solid #fecaca", borderRadius: 8,
      }}>
        Ver todas las alertas →
      </Link>
    </div>
  );
}
