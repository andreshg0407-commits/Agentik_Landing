"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-action-button.tsx
 *
 * MS-18 — Execution Actions: Reusable action button
 *
 * States: idle → loading → success / error
 * No optimistic fake success. Error always surfaced.
 */

import { useState }                      from "react";
import { C, T, S, R }                   from "@/lib/ui/tokens";
import type { OrchestratorActionType }  from "@/lib/marketing-studio/orchestrator/orchestrator-actions";

interface Props {
  orgSlug:     string;
  actionType:  OrchestratorActionType;
  planId?:     string | null;
  stageId?:    string | null;
  jobId?:      string | null;
  payload?:    Record<string, unknown>;
  label:       string;
  variant?:    "primary" | "secondary" | "ghost" | "danger";
  disabled?:   boolean;
  onSuccess?:  (result: ActionResult) => void;
}

interface ActionResult {
  success:       boolean;
  message:       string;
  executionJobId: string | null;
  newPlanStatus:  string | null;
  newStageStatus: string | null;
  error?:         { code: string; message: string } | null;
}

type ButtonState = "idle" | "loading" | "success" | "error";

export function OrchestratorActionButton({
  orgSlug,
  actionType,
  planId   = null,
  stageId  = null,
  jobId    = null,
  payload  = {},
  label,
  variant  = "primary",
  disabled = false,
  onSuccess,
}: Props) {
  const [state,   setState]   = useState<ButtonState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    if (state === "loading") return;
    setState("loading");
    setMessage(null);

    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/orchestrator/action`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ actionType, planId, stageId, jobId, payload }),
        },
      );

      const data = await res.json() as ActionResult & { error?: { code: string; message: string } | null };

      if (!res.ok || !data.success) {
        setState("error");
        setMessage(data.error?.message ?? data.message ?? "Error desconocido");
        return;
      }

      setState("success");
      setMessage(data.message);
      onSuccess?.(data);

      // Auto-reset to idle after 3s
      setTimeout(() => { setState("idle"); setMessage(null); }, 3000);

    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Error de red");
    }
  }

  const className =
    variant === "primary"   ? "ag-action-primary" :
    variant === "secondary" ? "ag-action-secondary" :
    variant === "danger"    ? "ag-action-ghost" :
    "ag-action-ghost";

  const stateLabel =
    state === "loading" ? "…" :
    state === "success" ? "✓" :
    state === "error"   ? "✗" :
    label;

  const stateColor =
    state === "success" ? C.green :
    state === "error"   ? C.red :
    undefined;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: S[1] }}>
      <button
        className={className}
        onClick={handleClick}
        disabled={disabled || state === "loading"}
        style={{
          opacity:    (disabled || state === "loading") ? 0.6 : 1,
          color:      stateColor,
          transition: "all 0.15s ease",
          minWidth:   80,
        }}
        title={message ?? label}
      >
        {stateLabel}
      </button>

      {message && state !== "idle" && (
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          color:        state === "error" ? C.red : C.green,
          background:   state === "error" ? C.redLight : C.greenLight,
          border:       `1px solid ${state === "error" ? C.redBorder : C.greenBorder}`,
          borderRadius: R.xs,
          padding:      "1px 6px",
          maxWidth:     200,
          whiteSpace:   "nowrap",
          overflow:     "hidden",
          textOverflow: "ellipsis",
        }}>
          {message}
        </span>
      )}
    </div>
  );
}
