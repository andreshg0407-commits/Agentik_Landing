"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; processed: number; failed: number; total: number }
  | { status: "error"; message: string };

interface Props {
  organizationId: string;
}

export default function ProcessAllButton({ organizationId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "idle" });

  const loading = state.status === "loading";

  async function handleClick() {
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/documents/process-all", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ organizationId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setState({
          status:  "error",
          message: data.error ?? `Request failed (${res.status})`,
        });
        return;
      }

      const { total, processed, failed } = data.result;
      setState({ status: "success", total, processed, failed });
      router.refresh();
    } catch (e) {
      setState({
        status:  "error",
        message: e instanceof Error ? e.message : "Unexpected error",
      });
    }
  }

  const label =
    state.status === "loading" ? "Processing…" :
    state.status === "success" ? `Done ✓ (${state.processed} processed${state.failed > 0 ? `, ${state.failed} failed` : ""})` :
    "Process all pending";

  const btnColor =
    state.status === "success" ? "#060" :
    state.status === "error"   ? "#c00" :
    "#333";

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          fontSize:     12,
          padding:      "4px 12px",
          cursor:       loading ? "default" : "pointer",
          opacity:      loading ? 0.6 : 1,
          color:        btnColor,
          border:       `1px solid ${btnColor}`,
          borderRadius: 4,
          background:   "transparent",
          whiteSpace:   "nowrap",
        }}
      >
        {label}
      </button>

      {state.status === "error" && (
        <span style={{ fontSize: 11, color: "#c00" }}>
          {state.message}
        </span>
      )}

      {state.status === "success" && state.failed > 0 && (
        <span style={{ fontSize: 11, color: "#a60" }}>
          {state.failed} document{state.failed !== 1 ? "s" : ""} could not be processed — check alerts.
        </span>
      )}
    </span>
  );
}
