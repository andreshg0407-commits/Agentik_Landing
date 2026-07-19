"use client";

/**
 * components/marketing-studio/orchestration/execution-action-button.tsx
 *
 * MS-13 — Execution Runtime: Reusable action button
 *
 * Posts to the execution API (dispatch / run / retry) and reflects
 * pending → running → succeeded / failed state locally.
 *
 * Never sends tokens or secrets. orgSlug from props only.
 */

import { useState } from "react";
import { C, T, S } from "@/lib/ui/tokens";

export type ExecutionAction =
  | { type: "run";     jobId: string }
  | { type: "retry";   jobId: string }
  | { type: "dispatch"; jobType: string; destination: string; productId?: string; catalogId?: string; idempotencyKey?: string };

interface ExecutionActionButtonProps {
  orgSlug: string;
  action:  ExecutionAction;
  label:   string;
  variant?: "primary" | "secondary" | "ghost";
  size?:   "sm" | "xs";
}

type BtnState = "idle" | "loading" | "succeeded" | "failed";

const STATE_LABELS: Record<BtnState, string> = {
  idle:      "",
  loading:   "...",
  succeeded: "✓",
  failed:    "✗",
};

export function ExecutionActionButton({
  orgSlug,
  action,
  label,
  variant = "secondary",
  size    = "sm",
}: ExecutionActionButtonProps) {
  const [btnState, setBtnState]   = useState<BtnState>("idle");
  const [errMsg,   setErrMsg]     = useState<string | null>(null);

  async function handleClick() {
    if (btnState === "loading") return;
    setBtnState("loading");
    setErrMsg(null);

    try {
      let url: string;
      let body: Record<string, unknown>;

      if (action.type === "run") {
        url  = `/api/orgs/${orgSlug}/marketing-studio/execution/run`;
        body = { jobId: action.jobId };
      } else if (action.type === "retry") {
        url  = `/api/orgs/${orgSlug}/marketing-studio/execution/retry`;
        body = { jobId: action.jobId };
      } else {
        url  = `/api/orgs/${orgSlug}/marketing-studio/execution/dispatch`;
        body = {
          jobType:        action.jobType,
          destination:    action.destination,
          productId:      action.productId  ?? null,
          catalogId:      action.catalogId  ?? null,
          idempotencyKey: action.idempotencyKey,
        };
      }

      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      setBtnState("succeeded");
      setTimeout(() => setBtnState("idle"), 2500);

    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Error");
      setBtnState("failed");
      setTimeout(() => { setBtnState("idle"); setErrMsg(null); }, 4000);
    }
  }

  const isLoading = btnState === "loading";

  const baseStyle: React.CSSProperties = {
    fontFamily:    T.mono,
    fontSize:      size === "xs" ? T.sz["2xs"] : T.sz.xs,
    cursor:        isLoading ? "not-allowed" : "pointer",
    border:        "1px solid",
    borderRadius:  3,
    padding:       size === "xs" ? `1px ${S[2]}px` : `3px ${S[3]}px`,
    transition:    "all 0.15s",
    opacity:       isLoading ? 0.6 : 1,
    display:       "inline-flex",
    alignItems:    "center",
    gap:           S[1],
    whiteSpace:    "nowrap" as const,
  };

  const variantStyle: React.CSSProperties =
    btnState === "succeeded" ? {
      background:   C.greenLight,
      borderColor:  C.green,
      color:        C.green,
    } :
    btnState === "failed" ? {
      background:   C.redLight,
      borderColor:  C.red,
      color:        C.red,
    } :
    variant === "primary" ? {
      background:   C.blueDark,
      borderColor:  C.blueDark,
      color:        "#fff",
    } :
    variant === "secondary" ? {
      background:   C.surfaceAlt,
      borderColor:  C.line,
      color:        C.inkMid,
    } : {
      background:   "transparent",
      borderColor:  "transparent",
      color:        C.inkLight,
    };

  const displayLabel =
    btnState === "idle"      ? label :
    btnState === "loading"   ? STATE_LABELS.loading :
    btnState === "succeeded" ? STATE_LABELS.succeeded :
    STATE_LABELS.failed;

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      title={errMsg ?? label}
      style={{ ...baseStyle, ...variantStyle }}
      aria-label={label}
    >
      {displayLabel}
    </button>
  );
}
