"use client";

/**
 * Inline action buttons rendered inside each row of the SAG write queue table.
 * Handles approve / reject / retry with optimistic UI feedback.
 * Calls router.refresh() after a successful action to re-run the server query.
 */

import { useState }        from "react";
import { useRouter }       from "next/navigation";

interface Props {
  orgSlug:     string;
  operationId: string;
  status:      string;
  canApprove?: boolean;
  onDone?:     () => void;
}

type Phase = "idle" | "loading" | "done" | "error" | "rejecting";

export default function SagWriteRowActions({ orgSlug, operationId, status, canApprove = false, onDone }: Props) {
  const router               = useRouter();
  const [phase,  setPhase]  = useState<Phase>("idle");
  const [reason, setReason] = useState("");
  const [error,  setError]  = useState<string | null>(null);

  const base = `/api/orgs/${orgSlug}/sag/write/${operationId}`;

  async function callAction(path: string, body?: object) {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:    body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase("error");
        setError(data?.error ?? "Error desconocido.");
        return;
      }
      // SAG-level failure (execute returned ok=false) — show message but don't crash
      if (data.ok === false && data.error) {
        setPhase("error");
        setError(`SAG respondió: ${data.error}`);
        return;
      }
      setPhase("done");
      onDone?.();
      router.refresh();
    } catch (e) {
      setPhase("error");
      setError((e as Error).message);
    }
  }

  const isLoading = phase === "loading";

  // ── Reject inline form ────────────────────────────────────────────────────

  if (phase === "rejecting") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Motivo del rechazo..."
          rows={2}
          style={{
            fontSize: 12, padding: "4px 8px", border: "1px solid #d1d5db",
            borderRadius: 4, resize: "vertical", fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => callAction("/reject", { reason: reason || "Sin motivo indicado." })}
            style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
              border: "1px solid #ef4444", background: "#fef2f2", color: "#b91c1c",
              cursor: "pointer",
            }}
          >
            Confirmar rechazo
          </button>
          <button
            onClick={() => { setPhase("idle"); setReason(""); }}
            style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 4,
              border: "1px solid #d1d5db", background: "#f9fafb", color: "#6b7280",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (phase === "error" && error) {
    return (
      <div style={{ fontSize: 11, color: "#b91c1c", maxWidth: 240 }}>
        {error}
        <button
          onClick={() => { setPhase("idle"); setError(null); }}
          style={{
            marginLeft: 6, fontSize: 11, cursor: "pointer",
            background: "none", border: "none", color: "#6b7280", textDecoration: "underline",
          }}
        >
          Cerrar
        </button>
      </div>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────

  if (phase === "done") {
    return <span style={{ fontSize: 11, color: "#059669" }}>✓ Hecho</span>;
  }

  // ── No permission — read-only ─────────────────────────────────────────────

  if (!canApprove) {
    return (
      <span style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
        Solo lectura
      </span>
    );
  }

  // ── Normal actions ─────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {status === "PENDING" && (
        <>
          <button
            disabled={isLoading}
            onClick={() => {
              if (confirm("¿Aprobar y enviar esta operación al ERP SAG ahora?")) {
                callAction("/approve");
              }
            }}
            style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
              border: "1px solid #22c55e", background: "#f0fdf4", color: "#15803d",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {isLoading ? "…" : "Aprobar"}
          </button>
          <button
            disabled={isLoading}
            onClick={() => setPhase("rejecting")}
            style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
              border: "1px solid #ef4444", background: "#fef2f2", color: "#b91c1c",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            Rechazar
          </button>
        </>
      )}

      {status === "FAILED" && (
        <button
          disabled={isLoading}
          onClick={() => {
            if (confirm("¿Reintentar esta operación fallida en SAG?")) {
              callAction("/retry");
            }
          }}
          style={{
            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
            border: "1px solid #f59e0b", background: "#fffbeb", color: "#b45309",
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          {isLoading ? "…" : "Reintentar"}
        </button>
      )}
    </div>
  );
}
