"use client";

/**
 * components/copilot/copilot-tasks.tsx
 *
 * Active task list in the right rail.
 */

import Link from "next/link";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { CopilotTask } from "@/types/copilot/copilot-types";

interface CopilotTasksProps {
  tasks:   CopilotTask[];
  orgSlug: string;
}

const URGENCY_DOT: Record<string, string> = {
  critical: "#ef4444",
  elevated: "#f59e0b",
  normal:   "#94a3b8",
};

const URGENCY_TEXT: Record<string, string> = {
  critical: "#ef4444",
  elevated: C.inkMid,
  normal:   C.inkMid,
};

export function CopilotTasks({ tasks, orgSlug }: CopilotTasksProps) {
  if (tasks.length === 0) return null;

  return (
    <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
      <div
        style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkLight,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom:  S[2],
        }}
      >
        Tareas activas
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
        {tasks.map((task) => (
          <Link
            key={task.id}
            href={`/${orgSlug}/${task.href}`}
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[2]}px ${S[3]}px`,
                borderRadius: R.md,
                cursor:       "pointer",
              }}
            >
              {/* Priority dot */}
              <span
                style={{
                  width:        6,
                  height:       6,
                  borderRadius: "50%",
                  background:   URGENCY_DOT[task.priority] ?? "#94a3b8",
                  flexShrink:   0,
                }}
              />
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      URGENCY_TEXT[task.priority] ?? C.inkMid,
                  flex:       1,
                }}
              >
                {task.label}
              </span>
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkLight,
                }}
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
