"use client";

/**
 * components/work-executions/work-execution-detail-drawer.tsx
 *
 * Agentik — Ejecución Detail Drawer
 * Sprint: AGENTIK-WORK-EXECUTION-OBSERVABILITY-01
 *
 * Slide-in right drawer with full execution details.
 * Read-only. No retry. No mutations.
 */

import { useState, useTransition } from "react";
import { useRouter }               from "next/navigation";
import { C, T, S, R, E }          from "@/lib/ui/tokens";
import { retryWorkExecutionAction } from "@/app/(app)/[orgSlug]/ejecuciones/actions";
import type { WorkExecutionCard }  from "@/lib/work/live/viewmodel/work-execution-viewmodel";

// ── Status colors ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  COMPLETED: { bg: C.greenLight,  border: C.greenBorder,  text: C.green    },
  FAILED:    { bg: C.redLight,    border: C.redBorder,    text: C.red      },
  RUNNING:   { bg: C.amberLight,  border: C.amberBorder,  text: C.amber    },
  PENDING:   { bg: C.surface,     border: C.line,         text: C.inkLight },
  QUEUED:    { bg: C.surface,     border: C.line,         text: C.inkLight },
  CANCELLED: { bg: C.surface,     border: C.line,         text: C.inkFaint },
};

// ── Section toggle ─────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  accent,
}: {
  title:        string;
  children:     React.ReactNode;
  defaultOpen?: boolean;
  accent?:      string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: S[4] }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width:          "100%",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          background:     "none",
          border:         "none",
          borderBottom:   `1px solid ${C.line}`,
          padding:        `${S[2]}px 0`,
          cursor:         "pointer",
          marginBottom:   open ? S[3] : 0,
        }}
      >
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         accent ?? C.inkLight,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          {title}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && children}
    </div>
  );
}

// ── Meta row ─────────────────────────────────────────────────────────────────

function MetaRow({ label, value, accent }: { label: string; value: string | null | undefined; accent?: string }) {
  if (!value) return null;
  return (
    <div style={{
      display:       "flex",
      gap:           S[3],
      paddingBottom: S[2],
      marginBottom:  S[2],
      borderBottom:  `1px solid ${C.lineSubtle}`,
      alignItems:    "flex-start",
    }}>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.inkFaint,
        fontWeight:    T.wt.medium,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        width:         110,
        flexShrink:    0,
        paddingTop:    2,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.sm,
        color:      accent ?? C.ink,
        flex:       1,
        wordBreak:  "break-word",
      }}>
        {value}
      </span>
    </div>
  );
}

// ── JSON block ────────────────────────────────────────────────────────────────

function JsonBlock({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return (
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>—</span>
    );
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const entries = Object.entries(obj);
    if (entries.length === 0) return (
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Vacío</span>
    );
    return (
      <div style={{
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        padding:      `${S[3]}px`,
        maxHeight:    240,
        overflowY:    "auto",
      }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{
            display:      "flex",
            gap:          S[2],
            marginBottom: S[1],
            flexWrap:     "wrap",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, minWidth: 80 }}>
              {k}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, flex: 1, wordBreak: "break-all" }}>
              {v === null ? "null" : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (Array.isArray(data)) {
    const arr = data as unknown[];
    if (arr.length === 0) return (
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Sin entradas</span>
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {arr.slice(0, 20).map((item, i) => (
          <div key={i} style={{
            background:   C.surface,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
          }}>
            {typeof item === "object" && item !== null ? (
              Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: S[2], marginBottom: 2 }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, minWidth: 70 }}>{k}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, flex: 1, wordBreak: "break-all" }}>{v === null ? "null" : String(v)}</span>
                </div>
              ))
            ) : (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{String(item)}</span>
            )}
          </div>
        ))}
        {arr.length > 20 && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            …y {arr.length - 20} entradas más
          </span>
        )}
      </div>
    );
  }
  return (
    <pre style={{
      fontFamily:  T.mono,
      fontSize:    T.sz.xs,
      color:       C.inkMid,
      background:  C.surface,
      border:      `1px solid ${C.line}`,
      borderRadius: R.md,
      padding:     `${S[3]}px`,
      overflow:    "auto",
      maxHeight:   200,
      margin:      0,
      whiteSpace:  "pre-wrap",
      wordBreak:   "break-all",
    }}>
      {String(data)}
    </pre>
  );
}

// ── Errors block ──────────────────────────────────────────────────────────────

function ErrorsBlock({ errors }: { errors: unknown }) {
  if (!errors) return <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Sin errores.</span>;
  const arr = Array.isArray(errors) ? errors : [errors];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {arr.map((e, i) => {
        const err = typeof e === "object" && e !== null ? e as Record<string, unknown> : { message: String(e) };
        return (
          <div key={i} style={{
            background:   C.redLight,
            border:       `1px solid ${C.redBorder}`,
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: T.wt.semibold, marginBottom: 2 }}>
              {(err["code"] as string) ?? "ERROR"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {(err["message"] as string) ?? String(e)}
            </div>
            {err["detail"] ? (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                {String(err["detail"])}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  card:    WorkExecutionCard | null;
  orgSlug: string;
  onClose: () => void;
}

// ── Drawer ────────────────────────────────────────────────────────────────────

export function WorkExecutionDetailDrawer({ card, orgSlug, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [retryFeedback, setRetryFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  if (!card) return null;

  function handleRetry() {
    if (!card) return;
    setRetryFeedback(null);
    startTransition(async () => {
      const result = await retryWorkExecutionAction(card.id, orgSlug);
      setRetryFeedback({ success: result.success, message: result.message });
      if (result.success) {
        router.refresh();
      }
    });
  }

  const sc = STATUS_STYLE[card.status] ?? STATUS_STYLE.PENDING;

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-MX", {
      day:    "2-digit",
      month:  "short",
      year:   "numeric",
      hour:   "2-digit",
      minute: "2-digit",
      second: "2-digit",
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
          background: "rgba(0,0,0,0.3)",
          zIndex:     40,
        }}
      />

      {/* Drawer panel */}
      <div style={{
        position:   "fixed",
        top:        0,
        right:      0,
        bottom:     0,
        width:      460,
        background: C.white,
        boxShadow:  E.lg,
        zIndex:     50,
        display:    "flex",
        flexDirection: "column",
        overflow:   "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding:      `${S[5]}px ${S[6]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.line}`,
          flexShrink:   0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[2] }}>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.lg,
              fontWeight: T.wt.bold,
              color:      C.ink,
            }}>
              {card.executorLabel}
            </div>
            <button
              onClick={onClose}
              style={{
                background:   "none",
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[1]}px ${S[3]}px`,
                cursor:       "pointer",
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                color:        C.inkLight,
              }}
            >
              Cerrar
            </button>
          </div>

          {/* Status badge */}
          <span style={{
            display:      "inline-block",
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            fontWeight:   T.wt.semibold,
            color:        sc.text,
            background:   sc.bg,
            border:       `1px solid ${sc.border}`,
            borderRadius: R.pill,
            padding:      `2px ${S[3]}px`,
          }}>
            ● {card.statusLabel}
          </span>

          {!card.isLive && (
            <span style={{
              marginLeft:   S[2],
              display:      "inline-block",
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkFaint,
              background:   C.surface,
              border:       `1px solid ${C.line}`,
              borderRadius: R.pill,
              padding:      `1px ${S[2]}px`,
            }}>
              stub
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{
          flex:       1,
          overflowY:  "auto",
          padding:    `${S[5]}px ${S[6]}px`,
        }}>

          {/* Core details */}
          <CollapsibleSection title="Detalle" defaultOpen>
            {card.message && (
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                color:        C.inkMid,
                marginBottom: S[4],
                padding:      `${S[3]}px`,
                background:   C.surface,
                borderRadius: R.md,
                border:       `1px solid ${C.line}`,
              }}>
                {card.message}
              </div>
            )}
            <MetaRow label="Motor"       value={card.executorLabel} />
            <MetaRow label="Módulo"      value={card.module} />
            {card.actionTypeLabel && (
              <MetaRow label="Acción"    value={card.actionTypeLabel} />
            )}
            <MetaRow label="Origen"      value={card.triggerLabel} />
            <MetaRow label="Duración"    value={card.durationLabel} />
          </CollapsibleSection>

          {/* Approval origin */}
          {card.approvalTitle && card.approvalTitle !== "—" && (
            <CollapsibleSection title="Aprobación relacionada" defaultOpen>
              <MetaRow label="Título"  value={card.approvalTitle} />
              <MetaRow label="Estado"  value={card.approvalStatus} />
              <MetaRow label="ID"      value={card.approvalId} accent={C.inkFaint} />
            </CollapsibleSection>
          )}

          {/* Workflow chain context (only for chain step executions) */}
          {card.workflowMetadata && (
            <CollapsibleSection title="Flujo relacionado" defaultOpen accent={C.blueDark}>
              <MetaRow label="Run ID"       value={card.workflowMetadata.workflowRunId} accent={C.inkFaint} />
              <MetaRow label="Cadena"       value={card.workflowMetadata.chainId} />
              <MetaRow label="Step"         value={card.workflowMetadata.stepId} />
              <MetaRow label="Prev. job"    value={card.workflowMetadata.previousExecutionId} accent={C.inkFaint} />
            </CollapsibleSection>
          )}

          {/* Dates */}
          <CollapsibleSection title="Fechas">
            <MetaRow label="Creada"     value={formatDate(card.createdAt)} />
            <MetaRow label="Iniciada"   value={formatDate(card.startedAt)} />
            <MetaRow label="Completada" value={formatDate(card.completedAt)} />
            {card.failedAt && <MetaRow label="Fallida" value={formatDate(card.failedAt)} accent={C.red} />}
          </CollapsibleSection>

          {/* Errors (shown prominently if present) */}
          {card.status === "FAILED" && (
            <CollapsibleSection title="Errores" defaultOpen accent={C.red}>
              <ErrorsBlock errors={card.errors} />
            </CollapsibleSection>
          )}

          {/* Result */}
          <CollapsibleSection title="Resultado">
            <JsonBlock data={card.result} />
          </CollapsibleSection>

          {/* Audit trail */}
          <CollapsibleSection title="Historial de ejecución">
            <JsonBlock data={card.auditTrail} />
          </CollapsibleSection>

          {/* Payload / Entrada */}
          <CollapsibleSection title="Entrada">
            <JsonBlock data={card.payload} />
          </CollapsibleSection>

          {/* Retry details (only if this is itself a retry) */}
          {card.retryOfExecutionId && (
            <CollapsibleSection title="Reintento" defaultOpen accent={C.amber}>
              <MetaRow label="Intento"           value={`#${card.retryAttempt}`} />
              <MetaRow label="Ejecución original" value={card.retryOfExecutionId} accent={C.inkFaint} />
              {card.retryReason    && <MetaRow label="Motivo"         value={card.retryReason} />}
              {card.retriedByLabel && <MetaRow label="Reintentado por" value={card.retriedByLabel} />}
              {card.retriedAt      && <MetaRow label="Fecha reintento" value={formatDate(card.retriedAt)} />}
              <MetaRow
                label="Intentos"
                value={`${card.retryAttempt} / ${card.maxRetryAttempts}`}
              />
            </CollapsibleSection>
          )}

          {/* Retry feedback banner */}
          {retryFeedback && (
            <div style={{
              padding:      `${S[3]}px`,
              borderRadius: R.md,
              border:       `1px solid ${retryFeedback.success ? C.greenBorder : C.redBorder}`,
              background:   retryFeedback.success ? C.greenLight : C.redLight,
              marginBottom: S[4],
            }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.sm,
                color:      retryFeedback.success ? C.green : C.red,
                fontWeight: T.wt.semibold,
              }}>
                {retryFeedback.success ? "Reintento creado correctamente." : retryFeedback.message}
              </span>
            </div>
          )}

          {/* ID reference */}
          <div style={{ marginTop: S[4] }}>
            <MetaRow label="ID ejecución" value={card.id} accent={C.inkFaint} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding:     `${S[4]}px ${S[6]}px`,
          borderTop:   `1px solid ${C.line}`,
          flexShrink:  0,
          display:     "flex",
          flexDirection: "column",
          gap:         S[2],
          background:  C.surface,
        }}>
          {/* Reintentar — only for retryable failed executions */}
          {card.canRetry && (
            <button
              onClick={handleRetry}
              disabled={isPending}
              style={{
                width:        "100%",
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                fontWeight:   T.wt.semibold,
                color:        isPending ? C.inkLight : C.white,
                background:   isPending ? C.inkFaint : C.red,
                border:       "none",
                borderRadius: R.md,
                padding:      `${S[3]}px`,
                cursor:       isPending ? "not-allowed" : "pointer",
                transition:   "background 0.15s",
              }}
            >
              {isPending ? "Reintentando…" : `Reintentar ejecución (intento ${card.retryAttempt + 1}/${card.maxRetryAttempts})`}
            </button>
          )}

          <div style={{ display: "flex", gap: S[3] }}>
            {card.approvalId && (
              <button
                onClick={() => router.push(`/${orgSlug}/aprobaciones`)}
                style={{
                  flex:         1,
                  fontFamily:   T.mono,
                  fontSize:     T.sz.sm,
                  fontWeight:   T.wt.semibold,
                  color:        C.blueDark,
                  background:   C.blueLight,
                  border:       `1px solid ${C.blueBorder}`,
                  borderRadius: R.md,
                  padding:      `${S[2]}px`,
                  cursor:       "pointer",
                }}
              >
                Ver aprobación →
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                flex:         1,
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                color:        C.inkMid,
                background:   C.white,
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[2]}px`,
                cursor:       "pointer",
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
