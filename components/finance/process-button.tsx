"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Statuses where any processing is blocked.
const BLOCKED_STATUSES = new Set(["REVIEWED", "PROCESSING"]);

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; summary: string; mode?: string }
  | { status: "error";   message: string };

interface Props {
  documentId:      string;
  organizationId:  string;
  documentStatus:  string;
  /** True when the document has at least one operator override stored.
   *  Controls whether a reprocess uses VALIDATION_ONLY vs FULL_REPROCESS. */
  hasOverrides?:   boolean;
}

export default function ProcessButton({
  documentId,
  organizationId,
  documentStatus,
  hasOverrides = false,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "idle" });

  if (BLOCKED_STATUSES.has(documentStatus)) return null;

  const isFirstProcess = documentStatus === "PENDING" || documentStatus === "ERROR";
  const isReprocess    = !isFirstProcess;

  async function handle() {
    setState({ status: "loading" });

    try {
      // First-time: POST /process  — full extraction, no prior data to lose.
      // Reprocess:  POST /reprocess — smart mode, preserves overrides.
      const endpoint = isReprocess
        ? `/api/documents/${documentId}/reprocess`
        : `/api/documents/${documentId}/process`;

      const body: Record<string, unknown> = { organizationId };
      if (isReprocess) body.hasOverrides = hasOverrides;

      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setState({ status: "error", message: data.error ?? `Request failed (${res.status})` });
        return;
      }

      const summary = data.result?.summary ?? data.newStatus ?? "done";
      const mode    = data.mode ?? data.result?.processingMode ?? undefined;
      setState({ status: "success", summary, mode });
      router.refresh();
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Unexpected error" });
    }
  }

  const loading = state.status === "loading";

  const label =
    loading                    ? "Processing…" :
    state.status === "success" ? "Done ✓"       :
    isReprocess                ? "Re-process"   :
                                 "Process";

  const btnColor =
    state.status === "success" ? "#060" :
    state.status === "error"   ? "#c00" :
                                 "#333";

  const modeHint: string | null =
    isReprocess && state.status === "idle"
      ? (hasOverrides ? "validate only" : "full re-extract")
      : null;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={handle}
          disabled={loading}
          style={{
            fontSize:     11,
            padding:      "2px 8px",
            cursor:       loading ? "default" : "pointer",
            opacity:      loading ? 0.6 : 1,
            color:        btnColor,
            border:       `1px solid ${btnColor}`,
            borderRadius: 3,
            background:   "transparent",
            whiteSpace:   "nowrap",
          }}
        >
          {label}
        </button>
        {modeHint && (
          <span style={{ fontSize: 10, color: "#aaa", whiteSpace: "nowrap" }}>
            ({modeHint})
          </span>
        )}
      </span>

      {state.status === "error" && (
        <span style={{ fontSize: 10, color: "#c00", maxWidth: 180 }}>
          {state.message}
        </span>
      )}

      {state.status === "success" && (
        <span style={{ fontSize: 10, color: "#060" }}>
          {state.mode ? `[${state.mode}]` : "done"}
        </span>
      )}
    </span>
  );
}
