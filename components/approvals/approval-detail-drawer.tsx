"use client";

/**
 * components/approvals/approval-detail-drawer.tsx
 *
 * Agentik — Approval Detail Drawer
 * Sprint: AGENTIK-APPROVAL-INBOX-01
 *
 * Slide-in drawer showing full approval detail and decision actions.
 */

import { useState, useTransition } from "react";
import { useRouter }               from "next/navigation";
import { C, T, S, R }              from "@/lib/ui/tokens";
import type { ApprovalInboxCard }  from "@/lib/approvals/viewmodel/approval-inbox-viewmodel";
import {
  STATUS_LABEL,
  CATEGORY_LABEL,
  SOURCE_LABEL,
} from "@/lib/approvals/viewmodel/approval-inbox-viewmodel";
import type { ApprovalStatus } from "@/lib/approvals/approval-types";
import {
  approveApprovalAction,
  rejectApprovalAction,
  cancelApprovalAction,
} from "@/app/(app)/[orgSlug]/aprobaciones/actions";

// ── Visual maps ───────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: C.red,
  HIGH:     C.amber,
  MEDIUM:   C.blueDark,
  LOW:      C.inkLight,
};

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING:   C.amber,
  APPROVED:  C.green,
  REJECTED:  C.red,
  CANCELLED: C.inkFaint,
  EXPIRED:   C.inkLight,
};

// ── Field helper ──────────────────────────────────────────────────────────────

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
      <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>
        {value}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  card:    ApprovalInboxCard | null;
  orgSlug: string;
  onClose: () => void;
}

// ── Drawer ────────────────────────────────────────────────────────────────────

export function ApprovalDetailDrawer({ card, orgSlug, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [rejectComment, setRejectComment] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  if (!card) return null;

  function handleApprove() {
    if (!card) return;
    setActionError(null);
    startTransition(async () => {
      const result = await approveApprovalAction(card.id, orgSlug);
      if (result.success) {
        onClose();
      } else {
        setActionError(result.message);
      }
    });
  }

  function handleRejectSubmit() {
    if (!card) return;
    if (!rejectComment.trim()) {
      setActionError("Se requiere un comentario para rechazar.");
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await rejectApprovalAction(card.id, orgSlug, rejectComment.trim());
      if (result.success) {
        onClose();
      } else {
        setActionError(result.message);
      }
    });
  }

  function handleCancel() {
    if (!card) return;
    setActionError(null);
    startTransition(async () => {
      const result = await cancelApprovalAction(card.id, orgSlug);
      if (result.success) {
        onClose();
      } else {
        setActionError(result.message);
      }
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

      {/* Drawer panel */}
      <div style={{
        position:      "fixed",
        top:           0,
        right:         0,
        bottom:        0,
        width:         460,
        background:    C.white,
        zIndex:        50,
        display:       "flex",
        flexDirection: "column",
        borderLeft:    `1px solid ${C.line}`,
        boxShadow:     "-4px 0 24px rgba(15,15,26,0.08)",
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
              fontFamily: T.mono,
              fontSize:   T.sz.lg,
              fontWeight: T.wt.semibold,
              color:      C.ink,
              lineHeight: 1.3,
            }}>
              {card.title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border:     "none",
              color:      C.inkLight,
              cursor:     "pointer",
              fontSize:   T.sz.xl,
              lineHeight: 1,
              padding:    S[1],
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: `${S[5]}px ${S[6]}px` }}>

          {/* Impact banner — shown when impact exists */}
          {(card.impactSummary || card.recommendation) && (
            <div style={{
              marginBottom: S[4],
              padding:      `${S[3]}px ${S[4]}px`,
              background:   "#f0f5ff",
              borderRadius: R.md,
              border:       `1px solid #c7d9f8`,
              borderLeft:   `3px solid ${C.blueDark}`,
            }}>
              {card.impactSummary && (
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.sm,
                  color:      C.inkMid,
                  marginBottom: card.recommendation ? S[1] : 0,
                }}>
                  Impacto estimado: <strong style={{ color: C.ink }}>{card.impactSummary}</strong>
                </div>
              )}
              {card.recommendation && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
                  Recomendación: <strong style={{ color: C.ink }}>{card.recommendation}</strong>
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

          {/* Classification grid */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 S[3],
            marginBottom:        S[4],
            paddingBottom:       S[4],
            borderBottom:        `1px solid ${C.lineSubtle}`,
          }}>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Prioridad</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: PRIORITY_COLOR[card.priority] ?? C.inkMid, fontWeight: T.wt.semibold }}>
                {card.priorityLabel}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Estado</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: STATUS_COLOR[card.status] ?? C.inkMid, fontWeight: T.wt.medium }}>
                {card.statusLabel}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Categoría</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>
                {CATEGORY_LABEL[card.category] ?? card.category}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Origen</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>
                {SOURCE_LABEL[card.source] ?? card.source}
              </div>
            </div>
          </div>

          {/* Actors */}
          <Field label="Solicitante" value={card.requestorLabel} />
          <Field label="Aprobador"   value={card.approverLabel} />
          <Field label="Módulo"      value={card.module} />

          {/* Context card */}
          {(card.entityType || card.entityId || card.impactSummary) && (
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
                Contexto empresarial
              </div>
              <div style={{
                background:    C.surface,
                border:        `1px solid ${C.line}`,
                borderRadius:  R.md,
                padding:       `${S[4]}px`,
                display:       "flex",
                flexDirection: "column",
                gap:           S[3],
              }}>
                {card.entityType && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Entidad relacionada</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkMid }}>{card.entityType}{card.entityId ? ` · ${card.entityId}` : ""}</div>
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

          {/* Decision (if terminal) */}
          {card.decision && (
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
                Decisión
              </div>
              <div style={{
                background:    C.surface,
                border:        `1px solid ${C.line}`,
                borderRadius:  R.md,
                padding:       `${S[4]}px`,
                display:       "flex",
                flexDirection: "column",
                gap:           S[2],
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.md, color: STATUS_COLOR[card.decision.status] ?? C.inkMid, fontWeight: T.wt.semibold }}>
                  {STATUS_LABEL[card.decision.status] ?? card.decision.status}
                </div>
                {card.decision.comment && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
                    "{card.decision.comment}"
                  </div>
                )}
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  {card.decision.decidedBy.name} · {new Date(card.decision.decidedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              </div>
            </div>
          )}

          {/* Relationships */}
          {card.relationships.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.lineSubtle}`, marginTop: S[4], paddingTop: S[4] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S[2] }}>
                Relaciones
              </div>
              {card.relationships.map((rel, i) => (
                <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[1] }}>
                  {rel.entityType} · {rel.entityId}
                </div>
              ))}
            </div>
          )}

          {/* Audit trail */}
          {card.auditTrail.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.lineSubtle}`, marginTop: S[4], paddingTop: S[4] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S[2] }}>
                Historial
              </div>
              {card.auditTrail.map((event, i) => (
                <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[1], display: "flex", gap: S[2] }}>
                  <span style={{ color: C.inkFaint }}>
                    {new Date(event.occurredAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                  </span>
                  <span>{event.type}</span>
                  <span style={{ color: C.inkFaint }}>— {event.actorId}</span>
                </div>
              ))}
            </div>
          )}

          {/* Dates */}
          <div style={{ borderTop: `1px solid ${C.lineSubtle}`, marginTop: S[4], paddingTop: S[4] }}>
            <Field label="Creada" value={new Date(card.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} />
            {card.decidedAt && (
              <Field label="Decidida" value={new Date(card.decidedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} />
            )}
            {card.expiresAt && (
              <Field label="Vence" value={new Date(card.expiresAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} />
            )}
          </div>

          {/* Reject comment input — shown when user clicks Rechazar */}
          {showRejectInput && card.isPending && (
            <div style={{
              marginTop:    S[4],
              padding:      `${S[4]}px`,
              background:   C.redLight,
              borderRadius: R.md,
              border:       `1px solid ${C.redBorder}`,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S[2] }}>
                Motivo de rechazo
              </div>
              <textarea
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="Explica el motivo del rechazo…"
                rows={3}
                style={{
                  width:        "100%",
                  fontFamily:   T.mono,
                  fontSize:     T.sz.sm,
                  color:        C.ink,
                  background:   C.white,
                  border:       `1px solid ${C.redBorder}`,
                  borderRadius: R.md,
                  padding:      `${S[2]}px ${S[3]}px`,
                  resize:       "vertical",
                  outline:      "none",
                  boxSizing:    "border-box",
                }}
              />
              <div style={{ display: "flex", gap: S[2], marginTop: S[2] }}>
                <button
                  onClick={handleRejectSubmit}
                  disabled={isPending || !rejectComment.trim()}
                  className="ag-action-primary"
                  style={{ flex: 1, background: C.red, borderColor: C.red }}
                >
                  {isPending ? "Procesando…" : "Confirmar rechazo"}
                </button>
                <button
                  onClick={() => { setShowRejectInput(false); setRejectComment(""); setActionError(null); }}
                  className="ag-action-ghost"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Action error */}
          {actionError && (
            <div style={{
              marginTop:    S[3],
              padding:      `${S[3]}px ${S[4]}px`,
              background:   C.redLight,
              border:       `1px solid ${C.redBorder}`,
              borderRadius: R.md,
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              color:        C.red,
            }}>
              {actionError}
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
          {/* Navigate to module */}
          {card.navigationTarget && (
            <button
              onClick={() => { router.push(card.navigationTarget!); onClose(); }}
              className="ag-action-primary"
            >
              Ir al módulo →
            </button>
          )}

          {/* Decision actions — only for PENDING */}
          {card.isPending && !showRejectInput && (
            <div style={{ display: "flex", gap: S[2] }}>
              <button
                onClick={handleApprove}
                disabled={isPending}
                className="ag-action-secondary"
                style={{ flex: 1 }}
              >
                {isPending ? "Procesando…" : "Aprobar"}
              </button>
              <button
                onClick={() => { setShowRejectInput(true); setActionError(null); }}
                disabled={isPending}
                className="ag-action-ghost"
                style={{ flex: 1, color: C.red }}
              >
                Rechazar
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="ag-action-ghost"
              >
                Cancelar
              </button>
            </div>
          )}

          <button onClick={onClose} className="ag-action-ghost">
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
