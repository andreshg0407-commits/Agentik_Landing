/**
 * Informes Client — scheduled report list.
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A
 *
 * Read-only presentation. No operational mutations.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerInformesPA } from "@/lib/comercial/manager/manager-commercial-types";

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY:   "Diario",
  WEEKLY:  "Semanal",
  MONTHLY: "Mensual",
};

export function InformesClient({ informesPA }: { informesPA: ManagerInformesPA }) {
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
        Informes programados
      </div>

      {informesPA.sourceStatus === "SOURCE_UNAVAILABLE" ? (
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
          {informesPA.sourceDetail && (
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      C.inkLight,
              marginTop:  4,
            }}>
              {informesPA.sourceDetail}
            </div>
          )}
        </div>
      ) : informesPA.reports.length === 0 ? (
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
            Sin informes programados
          </div>
        </div>
      ) : (
        <div style={{
          background:   "#fff",
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          overflow:     "hidden",
        }}>
          {informesPA.reports.map((report, i) => (
            <div
              key={report.id}
              style={{
                padding:      `${S[3]}px ${S[3]}px`,
                borderBottom: i < informesPA.reports.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                display:      "flex",
                alignItems:   "flex-start",
                gap:          S[2],
              }}
            >
              <div style={{
                width:        8,
                height:       8,
                borderRadius: "50%",
                background:   report.isActive ? "#16a34a" : "#9ca3af",
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
                  {report.title}
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz["2xs"],
                  color:      C.inkLight,
                  marginTop:  4,
                }}>
                  {FREQUENCY_LABELS[report.frequency] ?? report.frequency}
                  {report.isActive ? " · Activo" : " · Inactivo"}
                  {report.nextRunAt && ` · Proximo: ${new Date(report.nextRunAt).toLocaleDateString("es-CO")}`}
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
        Datos al {new Date(informesPA.asOf).toLocaleString("es-CO")}
      </div>
    </div>
  );
}
