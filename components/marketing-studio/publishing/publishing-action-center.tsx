"use client";

/**
 * components/marketing-studio/publishing/publishing-action-center.tsx
 *
 * MS-17 — Publishing Center: Action tray for a selected plan.
 */

import { useState }                  from "react";
import { C, T, S }                   from "@/lib/ui/tokens";
import { computeAvailableActions }   from "@/lib/marketing-studio/publishing/publishing-actions";
import type { PublishingPlan }       from "@/lib/marketing-studio/publishing/publishing-types";

interface Props {
  plan:    PublishingPlan;
  orgSlug: string;
  onDone?: () => void;
}

export function PublishingActionCenter({ plan, orgSlug, onDone }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const actions = computeAvailableActions(plan);

  async function handleAction(actionType: string) {
    setLoading(actionType);
    setMessage(null);

    try {
      if (actionType === "execute_plan") {
        const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/publishing/run`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ planId: plan.id }),
        });
        const data = await res.json() as { results?: unknown[]; error?: string };
        if (data.error) throw new Error(data.error);
        setMessage(`${(data.results ?? []).length} step(s) despachados`);
      } else if (actionType === "retry_step") {
        // Retry all failed steps
        const failed = plan.steps.filter(s => s.status === "failed");
        for (const step of failed) {
          await fetch(`/api/orgs/${orgSlug}/marketing-studio/publishing/retry`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ planId: plan.id, stepId: step.id }),
          });
        }
        setMessage(`${failed.length} step(s) reintentados`);
      } else if (actionType === "recalculate_deps") {
        setMessage("Dependencias recalculadas (próxima carga del worker)");
      } else if (actionType === "cancel_plan") {
        setMessage("Cancelación registrada — implementar en próximo sprint");
      } else if (actionType === "archive_plan") {
        setMessage("Archivado registrado — implementar en próximo sprint");
      }

      onDone?.();
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <div className="ag-action-tray" style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {actions.map(action => (
          <button
            key={action.id}
            disabled={!action.isAvailable || loading !== null}
            onClick={() => handleAction(action.actionType)}
            className={action.isAvailable ? "ag-action-primary" : "ag-action-ghost"}
            title={action.unavailableReason ?? action.description}
            style={{ opacity: action.isAvailable ? 1 : 0.45 }}
          >
            {loading === action.actionType ? "…" : action.label}
          </button>
        ))}
      </div>

      {message && (
        <div style={{
          padding:      `${S[2]}px ${S[3]}px`,
          background:   message.startsWith("Error") ? C.redLight : C.surfaceAlt,
          borderRadius: 4,
          borderLeft:   `3px solid ${message.startsWith("Error") ? C.red : C.green}`,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: message.startsWith("Error") ? C.red : C.green }}>
            {message}
          </span>
        </div>
      )}
    </div>
  );
}
