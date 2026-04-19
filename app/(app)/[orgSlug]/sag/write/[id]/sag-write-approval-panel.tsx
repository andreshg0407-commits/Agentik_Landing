"use client";

/**
 * Approval action bar for the SAG write operation detail page.
 *
 * Renders: Aprobar / Rechazar / Reintentar buttons with:
 *  - Warning box before approval ("Esta acción enviará información al ERP SAG.")
 *  - Inline reason textarea for rejection
 *  - Live result feedback (SAG response / error)
 *  - router.refresh() on success to re-render server component with updated data
 */

import { useState }  from "react";
import { useRouter } from "next/navigation";

interface Props {
  orgSlug:     string;
  operationId: string;
  status:      string;
  canApprove?: boolean;
}

type Phase =
  | "idle"
  | "confirm-approve"   // warning shown, waiting for final click
  | "loading"
  | "rejecting"         // textarea open
  | "success"
  | "sag-error"         // executed but SAG returned ok=false
  | "error";

export default function SagWriteApprovalPanel({ orgSlug, operationId, status, canApprove = false }: Props) {
  const router = useRouter();

  const [phase,     setPhase]     = useState<Phase>("idle");
  const [reason,    setReason]    = useState("");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [sagMsg,    setSagMsg]    = useState<string | null>(null);

  const base = `/api/orgs/${orgSlug}/sag/write/${operationId}`;

  async function callAction(path: string, body?: object) {
    setPhase("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase("error");
        setErrorMsg(data?.error ?? "Error desconocido.");
        return;
      }
      if (data.ok === false && data.error) {
        setPhase("sag-error");
        setSagMsg(data.error);
        router.refresh();
        return;
      }
      setPhase("success");
      router.refresh();
    } catch (e) {
      setPhase("error");
      setErrorMsg((e as Error).message);
    }
  }

  // ── Nothing to show for terminal / in-flight states ────────────────────────

  if (!["PENDING", "FAILED"].includes(status) && phase === "idle") {
    return null;
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (phase === "success") {
    return (
      <div style={{
        padding: "14px 18px", borderRadius: 8,
        background: "#f0fdf4", border: "1px solid #bbf7d0",
        color: "#15803d", fontSize: 13, fontWeight: 600,
      }}>
        ✓ Operación procesada. Actualizando estado…
      </div>
    );
  }

  // ── SAG-level error ────────────────────────────────────────────────────────

  if (phase === "sag-error") {
    return (
      <div style={{
        padding: "14px 18px", borderRadius: 8,
        background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>
          SAG rechazó la operación
        </div>
        <div style={{ color: "#7f1d1d", fontFamily: "monospace" }}>{sagMsg}</div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          La operación quedó en estado FAILED. Puede revisarla y reintentar si procede.
        </div>
      </div>
    );
  }

  // ── Generic error ──────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div style={{
        padding: "14px 18px", borderRadius: 8,
        background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Error</div>
        <div style={{ color: "#7f1d1d" }}>{errorMsg}</div>
        <button
          onClick={() => { setPhase("idle"); setErrorMsg(null); }}
          style={{
            marginTop: 10, fontSize: 12, cursor: "pointer",
            background: "none", border: "1px solid #d1d5db", borderRadius: 4,
            padding: "3px 10px", color: "#374151",
          }}
        >
          Cerrar
        </button>
      </div>
    );
  }

  const isLoading = phase === "loading";

  // ── No permission — show informational notice, no action buttons ──────────

  if (!canApprove) {
    return (
      <div style={{
        padding: "12px 16px", borderRadius: 6,
        background: "#f9fafb", border: "1px solid #e5e7eb",
        fontSize: 12, color: "#6b7280",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>🔒</span>
        Se requiere rol <b>Gerente</b> o superior para aprobar, rechazar o reintentar operaciones SAG.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── APPROVE: warning box + confirm step ─────────────────────────────── */}
      {status === "PENDING" && phase !== "rejecting" && (
        <>
          {phase === "confirm-approve" ? (
            <div style={{
              padding: "14px 18px", borderRadius: 8,
              background: "#fffbeb", border: "1px solid #fde68a",
            }}>
              <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13, marginBottom: 6 }}>
                ⚠ Esta acción enviará información al ERP SAG.
              </div>
              <div style={{ fontSize: 12, color: "#78350f", marginBottom: 14 }}>
                Una vez aprobada, la operación se ejecutará de inmediato y no se puede deshacer.
                Verifique el XML generado antes de continuar.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={isLoading}
                  onClick={() => callAction("/approve")}
                  style={{
                    fontSize: 13, fontWeight: 700, padding: "6px 18px", borderRadius: 6,
                    border: "2px solid #15803d", background: "#15803d", color: "#fff",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  {isLoading ? "Enviando…" : "Confirmar y enviar a SAG"}
                </button>
                <button
                  disabled={isLoading}
                  onClick={() => setPhase("idle")}
                  style={{
                    fontSize: 12, padding: "6px 14px", borderRadius: 6,
                    border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151",
                    cursor: isLoading ? "not-allowed" : "pointer",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPhase("confirm-approve")}
              style={{
                alignSelf: "flex-start",
                fontSize: 13, fontWeight: 700, padding: "8px 20px", borderRadius: 6,
                border: "2px solid #15803d", background: "#f0fdf4", color: "#15803d",
                cursor: "pointer",
              }}
            >
              Aprobar operación
            </button>
          )}
        </>
      )}

      {/* ── REJECT: inline form ────────────────────────────────────────────── */}
      {status === "PENDING" && (
        <>
          {phase === "rejecting" ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                Motivo del rechazo
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Explique el motivo del rechazo para el historial de auditoría…"
                rows={3}
                style={{
                  width: "100%", maxWidth: 480,
                  fontSize: 13, padding: "8px 10px",
                  border: "1px solid #d1d5db", borderRadius: 6,
                  fontFamily: "inherit", resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  disabled={isLoading}
                  onClick={() => callAction("/reject", { reason: reason || "Sin motivo indicado." })}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: "6px 18px", borderRadius: 6,
                    border: "2px solid #ef4444", background: "#fef2f2", color: "#b91c1c",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  {isLoading ? "…" : "Confirmar rechazo"}
                </button>
                <button
                  disabled={isLoading}
                  onClick={() => { setPhase("idle"); setReason(""); }}
                  style={{
                    fontSize: 12, padding: "6px 14px", borderRadius: 6,
                    border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151",
                    cursor: isLoading ? "not-allowed" : "pointer",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPhase("rejecting")}
              style={{
                alignSelf: "flex-start",
                fontSize: 13, fontWeight: 600, padding: "6px 16px", borderRadius: 6,
                border: "1px solid #ef4444", background: "#fef2f2", color: "#b91c1c",
                cursor: "pointer",
              }}
            >
              Rechazar operación
            </button>
          )}
        </>
      )}

      {/* ── RETRY ─────────────────────────────────────────────────────────── */}
      {status === "FAILED" && (
        <div>
          <div style={{
            padding: "12px 16px", borderRadius: 8, marginBottom: 12,
            background: "#fffbeb", border: "1px solid #fde68a",
            fontSize: 12, color: "#92400e",
          }}>
            ⚠ Esta acción reintentará el envío al ERP SAG con el mismo XML generado originalmente.
          </div>
          <button
            disabled={isLoading}
            onClick={() => {
              if (confirm("¿Reintentar esta operación fallida en SAG?")) {
                callAction("/retry");
              }
            }}
            style={{
              fontSize: 13, fontWeight: 700, padding: "8px 20px", borderRadius: 6,
              border: "2px solid #b45309", background: "#fffbeb", color: "#b45309",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {isLoading ? "Reintentando…" : "Reintentar envío a SAG"}
          </button>
        </div>
      )}
    </div>
  );
}
