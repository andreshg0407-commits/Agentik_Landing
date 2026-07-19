"use client";

/**
 * components/runtime/approval-queue-table.tsx
 * Operational action queue with approve / reject controls.
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import { useState } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import { RuntimeStatusBadge } from "./runtime-status-badge";
import type { ActionEnvelope } from "@/lib/agent-runtime/action-envelope";

// ── Priority badge ────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: C.red,
  HIGH:   C.amber,
  MEDIUM: C.inkMid,
  LOW:    C.inkFaint,
};

function PriorityDot({ priority }: { priority: string }) {
  return (
    <span style={{
      display:         "inline-block",
      width:           6,
      height:          6,
      borderRadius:    "50%",
      background:      PRIORITY_COLOR[priority] ?? C.inkFaint,
      flexShrink:      0,
    }} />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "Ahora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function agentLabel(agentId: string): string {
  const map: Record<string, string> = {
    david_commercial: "David",
    diego_finance:    "Diego",
    luca_marketing:   "Luca",
    mila_collections: "Mila",
    agentik_copilot:  "Agentik",
  };
  return map[agentId] ?? agentId;
}

// ── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  env:      ActionEnvelope;
  orgSlug:  string;
  onUpdate: (id: string, next: Partial<ActionEnvelope>) => void;
}

function ActionRow({ env, orgSlug, onUpdate }: RowProps) {
  const [approving,  setApproving]  = useState(false);
  const [rejecting,  setRejecting]  = useState(false);
  const [executing,  setExecuting]  = useState(false);
  const [execResult, setExecResult] = useState<{ status: string; error?: string } | null>(null);

  const isPending  = env.agentStatus === "pending_approval";
  const isApproved = env.agentStatus === "approved";
  const isTerminal = ["executed", "failed", "rejected", "dismissed", "expired"].includes(env.agentStatus);

  async function handleApprove() {
    const id = env.agentActionId ?? env.actionTaskId ?? "";
    if (!id || approving) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/agent/actions/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        onUpdate(env.id, { agentStatus: "approved", approvedAt: new Date().toISOString() });
      }
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    const id = env.agentActionId ?? env.actionTaskId ?? "";
    if (!id || rejecting) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/agent/actions/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        onUpdate(env.id, { agentStatus: "rejected", rejectedAt: new Date().toISOString() });
      }
    } finally {
      setRejecting(false);
    }
  }

  async function handleExecute() {
    const id = env.agentActionId ?? env.actionTaskId ?? "";
    if (!id || executing) return;
    setExecuting(true);
    setExecResult(null);
    try {
      onUpdate(env.id, { agentStatus: "executing" });
      const res = await fetch(`/api/orgs/${orgSlug}/agent/actions/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json() as { result?: { status: string; error?: { message: string } } };
      const status = j.result?.status ?? (res.ok ? "succeeded" : "failed");
      const errMsg = j.result?.error?.message;
      setExecResult({ status, error: errMsg });
      onUpdate(env.id, {
        agentStatus: status === "succeeded" ? "executed" : "failed",
      });
    } catch (err) {
      setExecResult({ status: "failed", error: (err as Error).message });
      onUpdate(env.id, { agentStatus: "failed" });
    } finally {
      setExecuting(false);
    }
  }

  const ref      = (env.payloadSummary.reference as string | null) ?? null;
  const qty      = (env.payloadSummary.qty as number | null) ?? null;
  const line     = (env.payloadSummary.line as string | null) ?? null;
  const reason   = (env.payloadSummary.reason as string | null) ?? null;

  return (
    <div style={{
      display:       "grid",
      gridTemplateColumns: "1fr 120px 90px 90px 100px 160px",
      alignItems:    "center",
      gap:           S[3],
      padding:       `${S[3]}px ${S[4]}px`,
      borderBottom:  `1px solid ${C.lineSubtle}`,
      background:    isPending ? "rgba(217,119,6,.018)" : C.white,
      transition:    "background 0.2s",
    }}>
      {/* Identity */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
          <PriorityDot priority={env.priority} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
            {env.title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" as const }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {agentLabel(env.sourceAgentId)} · {env.moduleKey}
          </span>
          {ref && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: R.xs, padding: "0 5px" }}>
              {ref}{qty ? ` · ${qty} uds` : ""}{line ? ` · ${line}` : ""}
            </span>
          )}
          {reason && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
              {reason.slice(0, 60)}{reason.length > 60 ? "…" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      <div>
        <RuntimeStatusBadge status={env.agentStatus} />
      </div>

      {/* Agent */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: T.wt.medium }}>
        {agentLabel(env.sourceAgentId)}
      </div>

      {/* Priority */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: PRIORITY_COLOR[env.priority] ?? C.inkFaint }}>
        {env.priority}
      </div>

      {/* Timestamp */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
        <div>{fmtRelative(env.createdAt)}</div>
        {env.proposedBy && (
          <div style={{ color: C.inkGhost, marginTop: 1 }}>
            {env.proposedBy.split("@")[0]}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: S[2], justifyContent: "flex-end" }}>
        {isPending ? (
          <>
            <button
              disabled={approving}
              onClick={handleApprove}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   T.wt.semibold,
                color:        "#fff",
                background:   approving ? "rgba(0,74,173,.55)" : C.blueDark,
                border:       "none",
                borderRadius: R.sm,
                padding:      `3px ${S[2]}px`,
                cursor:       approving ? "not-allowed" : "pointer",
                opacity:      approving ? 0.7 : 1,
                transition:   "opacity 0.15s",
              }}
            >
              {approving ? "…" : "Aprobar"}
            </button>
            <button
              disabled={rejecting}
              onClick={handleReject}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   T.wt.semibold,
                color:        C.red,
                background:   C.redLight,
                border:       `1px solid ${C.redBorder}`,
                borderRadius: R.sm,
                padding:      `3px ${S[2]}px`,
                cursor:       rejecting ? "not-allowed" : "pointer",
                opacity:      rejecting ? 0.7 : 1,
                transition:   "opacity 0.15s",
              }}
            >
              {rejecting ? "…" : "Rechazar"}
            </button>
          </>
        ) : isApproved ? (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, alignItems: "flex-end" }}>
            <button
              disabled={executing}
              onClick={handleExecute}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   T.wt.semibold,
                color:        executing ? "rgba(0,74,173,.5)" : "#fff",
                background:   executing ? "rgba(0,74,173,.12)" : C.blueDark,
                border:       executing ? `1px solid rgba(0,74,173,.3)` : "none",
                borderRadius: R.sm,
                padding:      `3px ${S[2]}px`,
                cursor:       executing ? "not-allowed" : "pointer",
                transition:   "all 0.15s",
              }}
            >
              {executing ? "Ejecutando…" : "▶ Ejecutar tool"}
            </button>
            {execResult && (
              <span style={{
                fontFamily: T.mono, fontSize: 9,
                color: execResult.status === "succeeded" ? "#16a34a" : "#dc2626",
              }}>
                {execResult.status === "succeeded" ? "✓ Ejecutado" : `✗ ${execResult.error?.slice(0, 40) ?? "Error"}`}
              </span>
            )}
          </div>
        ) : isTerminal ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
            {env.approvedBy ?? env.rejectedBy ?? "—"}
          </span>
        ) : (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            En curso
          </span>
        )}
      </div>
    </div>
  );
}

// ── Column headers ────────────────────────────────────────────────────────────

function TableHeader() {
  const cols = ["Acción / Propuesta", "Estado", "Agente", "Prioridad", "Solicitado", "Decisión"];
  const widths = ["1fr", "120px", "90px", "90px", "100px", "160px"];
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: widths.join(" "),
      gap:                 S[3],
      padding:             `${S[2]}px ${S[4]}px`,
      background:          C.surface,
      borderBottom:        `1px solid ${C.line}`,
      borderTopLeftRadius:  R.xl,
      borderTopRightRadius: R.xl,
    }}>
      {cols.map(col => (
        <div key={col} style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkFaint,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
          fontWeight:    T.wt.semibold,
        }}>
          {col}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  envelopes: ActionEnvelope[];
  orgSlug:   string;
  loading:   boolean;
}

export function ApprovalQueueTable({ envelopes, orgSlug, loading }: Props) {
  const [localEnvelopes, setLocalEnvelopes] = useState<ActionEnvelope[] | null>(null);

  // Use local state after first mutation so UI updates instantly
  const displayed = localEnvelopes ?? envelopes;

  function handleUpdate(id: string, next: Partial<ActionEnvelope>) {
    setLocalEnvelopes(prev => {
      const base = prev ?? envelopes;
      return base.map(e => e.id === id ? { ...e, ...next } : e);
    });
  }

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      overflow:     "hidden",
      boxShadow:    "0 1px 4px rgba(0,18,60,.06)",
      marginBottom: 24,
    }}>
      <TableHeader />

      {loading && displayed.length === 0 ? (
        <div style={{ padding: `${32}px ${24}px`, textAlign: "center" as const }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
            Cargando acciones del runtime…
          </span>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ padding: `${40}px ${24}px`, textAlign: "center" as const }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkMid, marginBottom: S[2] }}>
            Sin acciones en cola
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Los agentes propondrán acciones cuando detecten señales operacionales.
          </div>
        </div>
      ) : (
        displayed.map(env => (
          <ActionRow
            key={env.id}
            env={env}
            orgSlug={orgSlug}
            onUpdate={handleUpdate}
          />
        ))
      )}
    </div>
  );
}
