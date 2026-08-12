/**
 * Alertas Client — executive alert list.
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A
 *
 * Read-only presentation. No operational mutations.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerAlertasPA } from "@/lib/comercial/manager/manager-commercial-types";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  warning:  "#d97706",
  info:     "#2563eb",
};

export function AlertasClient({ alertasPA }: { alertasPA: ManagerAlertasPA }) {
  return (
    <div style={{
      padding:    `${S[4]}px ${S[4]}px ${S[8]}px`,
      maxWidth:   640,
      margin:     "0 auto",
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        marginBottom:  S[3],
      }}>
        Alertas
      </div>

      {alertasPA.sourceStatus === "SOURCE_UNAVAILABLE" ? (
        <div style={{
          padding:      `${S[6]}px ${S[4]}px`,
          background:   "#fff",
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          textAlign:    "center" as const,
        }}>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            color:      "#d97706",
          }}>
            Fuente no disponible
          </div>
          {alertasPA.sourceDetail && (
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      C.inkLight,
              marginTop:  4,
            }}>
              {alertasPA.sourceDetail}
            </div>
          )}
        </div>
      ) : alertasPA.alerts.length === 0 ? (
        <div style={{
          padding:      `${S[6]}px ${S[4]}px`,
          background:   "#fff",
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          textAlign:    "center" as const,
        }}>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            color:      C.inkLight,
          }}>
            Sin alertas pendientes
          </div>
        </div>
      ) : (
        <div style={{
          background:   "#fff",
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          overflow:     "hidden",
        }}>
          {alertasPA.alerts.map((alert, i) => (
            <div
              key={alert.id}
              style={{
                padding:      `${S[3]}px ${S[3]}px`,
                borderBottom: i < alertasPA.alerts.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                display:      "flex",
                alignItems:   "flex-start",
                gap:          S[2],
              }}
            >
              <div style={{
                width:        8,
                height:       8,
                borderRadius: "50%",
                background:   SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.info,
                marginTop:    5,
                flexShrink:   0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  fontWeight: T.wt.semibold,
                  color:      C.ink,
                }}>
                  {alert.title}
                </div>
                {alert.message && (
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz["2xs"],
                    color:      C.inkLight,
                    marginTop:  2,
                  }}>
                    {alert.message}
                  </div>
                )}
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz["2xs"],
                  color:      C.inkGhost,
                  marginTop:  4,
                }}>
                  {alert.module} · {new Date(alert.createdAt).toLocaleDateString("es-CO")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        letterSpacing: "0.04em",
        textAlign:     "center" as const,
        marginTop:     S[3],
      }}>
        Datos al {new Date(alertasPA.asOf).toLocaleString("es-CO")}
      </div>
    </div>
  );
}
