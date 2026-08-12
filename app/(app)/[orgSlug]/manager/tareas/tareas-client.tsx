/**
 * Tareas Client — executive task list.
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A
 *
 * Read-only presentation. No operational mutations.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerTareasPA } from "@/lib/comercial/manager/manager-commercial-types";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high:     "#d97706",
  medium:   "#2563eb",
  low:      "#9ca3af",
};

const STATUS_LABELS: Record<string, string> = {
  pending:     "Pendiente",
  in_progress: "En progreso",
  completed:   "Completada",
  cancelled:   "Cancelada",
};

export function TareasClient({ tareasPA }: { tareasPA: ManagerTareasPA }) {
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
        Tareas
      </div>

      {tareasPA.sourceStatus === "SOURCE_UNAVAILABLE" ? (
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
          {tareasPA.sourceDetail && (
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      C.inkLight,
              marginTop:  4,
            }}>
              {tareasPA.sourceDetail}
            </div>
          )}
        </div>
      ) : tareasPA.tasks.length === 0 ? (
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
            Sin tareas pendientes
          </div>
        </div>
      ) : (
        <div style={{
          background:   "#fff",
          border:       `1px solid ${C.line}`,
          borderRadius: R.md,
          overflow:     "hidden",
        }}>
          {tareasPA.tasks.map((task, i) => (
            <div
              key={task.id}
              style={{
                padding:      `${S[3]}px ${S[3]}px`,
                borderBottom: i < tareasPA.tasks.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                display:      "flex",
                alignItems:   "flex-start",
                gap:          S[2],
              }}
            >
              <div style={{
                width:        8,
                height:       8,
                borderRadius: "50%",
                background:   PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low,
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
                  {task.title}
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz["2xs"],
                  color:      C.inkLight,
                  marginTop:  4,
                }}>
                  {STATUS_LABELS[task.status] ?? task.status}
                  {task.module && ` · ${task.module}`}
                  {" · "}
                  {new Date(task.createdAt).toLocaleDateString("es-CO")}
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
        Datos al {new Date(tareasPA.asOf).toLocaleString("es-CO")}
      </div>
    </div>
  );
}
