"use client";

/**
 * components/tasks/task-detail-drawer.tsx
 *
 * Agentik — Task Detail Drawer
 * Sprint: AGENTIK-TASK-INBOX-01
 *
 * Slide-in drawer showing full task detail.
 * Read-only view with functional Complete / Cancel actions via Server Actions.
 */

import { useTransition }       from "react";
import { useRouter }           from "next/navigation";
import { C, T, S, R }    from "@/lib/ui/tokens";
import type { TaskInboxCard } from "@/lib/tasks/viewmodel/task-inbox-viewmodel";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  SOURCE_LABEL,
} from "@/lib/tasks/viewmodel/task-inbox-viewmodel";
import { completeTaskAction, cancelTaskAction } from "@/app/(app)/[orgSlug]/tareas/actions";

// ── Priority / status colors ───────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  critical: C.red,
  high:     C.amber,
  medium:   C.blueDark,
  low:      C.inkLight,
};

const STATUS_COLOR: Record<string, string> = {
  open:        C.blue,
  in_progress: C.amber,
  waiting:     C.inkLight,
  blocked:     C.red,
  completed:   C.green,
  cancelled:   C.inkFaint,
};

// ── Field row helper ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: S[3] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom:  2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz.md,
        color:      C.inkMid,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  card:    TaskInboxCard | null;
  orgSlug: string;
  onClose: () => void;
}

// ── Drawer ────────────────────────────────────────────────────────────────────

export function TaskDetailDrawer({ card, orgSlug, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!card) return null;

  const isTerminal = card.status === "completed" || card.status === "cancelled";

  function handleComplete() {
    if (!card) return;
    startTransition(async () => {
      await completeTaskAction(card.id, orgSlug);
      onClose();
    });
  }

  function handleCancel() {
    if (!card) return;
    startTransition(async () => {
      await cancelTaskAction(card.id, orgSlug);
      onClose();
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   "fixed",
          inset:      0,
          background: "rgba(15,15,26,0.4)",
          zIndex:     40,
        }}
      />

      {/* Drawer */}
      <div style={{
        position:    "fixed",
        top:         0,
        right:       0,
        bottom:      0,
        width:       420,
        background:  C.white,
        zIndex:      50,
        display:     "flex",
        flexDirection: "column",
        borderLeft:  `1px solid ${C.line}`,
        boxShadow:   "-4px 0 24px rgba(15,15,26,0.08)",
      }}>

        {/* Header */}
        <div style={{
          padding:      `${S[5]}px ${S[6]}px`,
          borderBottom: `1px solid ${C.line}`,
          display:      "flex",
          alignItems:   "flex-start",
          gap:          S[3],
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Status */}
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        STATUS_COLOR[card.status] ?? C.inkLight,
              fontWeight:   T.wt.medium,
              marginBottom: S[1],
            }}>
              ● {STATUS_LABEL[card.status] ?? card.status}
            </div>
            <div style={{
              fontFamily:  T.mono,
              fontSize:    T.sz.lg,
              fontWeight:  T.wt.semibold,
              color:       C.ink,
              lineHeight:  1.3,
            }}>
              {card.title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background:  "none",
              border:      "none",
              color:       C.inkLight,
              cursor:      "pointer",
              fontSize:    T.sz.xl,
              lineHeight:  1,
              padding:     S[1],
              flexShrink:  0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex:       1,
          overflowY:  "auto",
          padding:    `${S[5]}px ${S[6]}px`,
        }}>
          {/* Phase 8 — Quick Context Banner */}
          {card.sourceAgentName && (
            <div style={{
              marginBottom:  S[4],
              padding:       `${S[3]}px ${S[4]}px`,
              background:    "#f0f5ff",
              borderRadius:  R.md,
              border:        `1px solid #c7d9f8`,
              borderLeft:    `3px solid ${C.blueDark}`,
            }}>
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                color:        C.blueDark,
                lineHeight:   1.6,
              }}>
                <strong>{card.sourceAgentName}</strong> creó esta tarea
                {card.module ? ` desde ${card.module.charAt(0).toUpperCase()}${card.module.slice(1)}` : ""}.
              </div>
              {card.impactSummary && (
                <div style={{
                  fontFamily:  T.mono,
                  fontSize:    T.sz.sm,
                  color:       C.inkMid,
                  marginTop:   S[1],
                }}>
                  Impacto estimado: <strong style={{ color: C.ink }}>{card.impactSummary}</strong>
                </div>
              )}
              {card.recommendation && (
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.sm,
                  color:      C.inkMid,
                  marginTop:  S[1],
                }}>
                  Acción recomendada: <strong style={{ color: C.ink }}>{card.recommendation}</strong>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {card.description && (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.base,
              color:        C.inkMid,
              lineHeight:   1.6,
              marginBottom: S[5],
              padding:      `${S[3]}px ${S[4]}px`,
              background:   C.surface,
              borderRadius: R.md,
              border:       `1px solid ${C.line}`,
            }}>
              {card.description}
            </div>
          )}

          {/* Classification */}
          <div style={{
            borderBottom:  `1px solid ${C.lineSubtle}`,
            marginBottom:  S[4],
            paddingBottom: S[4],
          }}>
            <div style={{
              display:             "grid",
              gridTemplateColumns: "1fr 1fr",
              gap:                 S[3],
            }}>
              <div>
                <div style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xs,
                  color:         C.inkFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom:  2,
                }}>
                  Prioridad
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.md,
                  color:      PRIORITY_COLOR[card.priority] ?? C.inkMid,
                  fontWeight: T.wt.semibold,
                }}>
                  {PRIORITY_LABEL[card.priority] ?? card.priority}
                </div>
              </div>
              <div>
                <div style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xs,
                  color:         C.inkFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom:  2,
                }}>
                  Origen
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.md,
                  color:      C.inkMid,
                }}>
                  {SOURCE_LABEL[card.source] ?? card.source}
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <Field label="Responsable"   value={card.ownerLabel} />
          <Field label="Asignado a"    value={card.assignedLabel} />
          <Field label="Módulo"        value={card.module} />
          <Field label="Categoría"     value={card.category} />
          {card.dueAt && (
            <Field
              label="Vencimiento"
              value={new Date(card.dueAt).toLocaleDateString("es-MX", {
                day: "2-digit", month: "long", year: "numeric",
              })}
            />
          )}

          {/* Phase 6 — Agent Context Card */}
          {(card.sourceAgentName || card.entityType || card.impactSummary) && (
            <div style={{
              borderTop:    `1px solid ${C.lineSubtle}`,
              marginTop:    S[4],
              paddingTop:   S[4],
              marginBottom: S[4],
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                color:         C.inkFaint,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom:  S[3],
              }}>
                Contexto del Agente
              </div>
              <div style={{
                background:   C.surface,
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[4]}px`,
                display:      "flex",
                flexDirection: "column",
                gap:          S[3],
              }}>
                {card.sourceAgentName && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Agente</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.ink }}>{card.sourceAgentName}</div>
                  </div>
                )}
                {card.module && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Origen</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>{card.module.charAt(0).toUpperCase()}{card.module.slice(1)}</div>
                  </div>
                )}
                {card.sourceLabel && card.source === "copilot" && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Categoría</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>{card.category.charAt(0).toUpperCase()}{card.category.slice(1)}</div>
                  </div>
                )}
                {card.entityType && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Entidad</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>{card.entityType}</div>
                  </div>
                )}
                {card.impactSummary && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Impacto</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>{card.impactSummary}</div>
                  </div>
                )}
                {card.recommendation && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Recomendación</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>{card.recommendation}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          <div style={{
            borderTop:   `1px solid ${C.lineSubtle}`,
            marginTop:   S[4],
            paddingTop:  S[4],
          }}>
            <Field
              label="Creada"
              value={new Date(card.createdAt).toLocaleDateString("es-MX", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            />
            {card.completedAt && (
              <Field
                label="Completada"
                value={new Date(card.completedAt).toLocaleDateString("es-MX", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              />
            )}
            {card.cancelledAt && (
              <Field
                label="Cancelada"
                value={new Date(card.cancelledAt).toLocaleDateString("es-MX", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              />
            )}
          </div>

          {/* Relationships */}
          {card.relationships.length > 0 && (
            <div style={{
              borderTop:   `1px solid ${C.lineSubtle}`,
              marginTop:   S[4],
              paddingTop:  S[4],
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                color:         C.inkFaint,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom:  S[2],
              }}>
                Relaciones
              </div>
              {card.relationships.map((rel, i) => (
                <div key={i} style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.sm,
                  color:        C.inkMid,
                  marginBottom: S[1],
                }}>
                  {rel.entityType} · {rel.entityId}
                </div>
              ))}
            </div>
          )}

          {/* Audit trail */}
          {card.auditTrail.length > 0 && (
            <div style={{
              borderTop:   `1px solid ${C.lineSubtle}`,
              marginTop:   S[4],
              paddingTop:  S[4],
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                color:         C.inkFaint,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom:  S[2],
              }}>
                Historial
              </div>
              {card.auditTrail.map((event, i) => (
                <div key={i} style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.sm,
                  color:        C.inkMid,
                  marginBottom: S[1],
                  display:      "flex",
                  gap:          S[2],
                }}>
                  <span style={{ color: C.inkFaint }}>
                    {new Date(event.occurredAt).toLocaleDateString("es-MX", {
                      day: "2-digit", month: "short",
                    })}
                  </span>
                  <span>{event.type}</span>
                  <span style={{ color: C.inkFaint }}>— {event.actorId}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding:       `${S[4]}px ${S[6]}px`,
          borderTop:     `1px solid ${C.line}`,
          display:       "flex",
          flexDirection: "column",
          gap:           S[2],
        }}>
          {/* Phase 7 — Navigate to module CTA */}
          {card.navigationTarget && (
            <button
              onClick={() => { router.push(card.navigationTarget!); onClose(); }}
              className="ag-action-primary"
            >
              Ir al módulo →
            </button>
          )}
          <div style={{ display: "flex", gap: S[3] }}>
            {!isTerminal && (
              <>
                <button
                  onClick={handleComplete}
                  disabled={isPending}
                  className="ag-action-secondary"
                  style={{ flex: 1 }}
                >
                  {isPending ? "Procesando…" : "Completar"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isPending}
                  className="ag-action-ghost"
                  style={{ flex: 1 }}
                >
                  Cancelar tarea
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="ag-action-ghost"
              style={{ flex: isTerminal ? 2 : 0 }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
