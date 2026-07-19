"use client";

/**
 * app/(app)/[orgSlug]/tareas/task-inbox-client.tsx
 *
 * Agentik — Task Inbox Client Component
 * Sprint: AGENTIK-TASK-INBOX-01
 *
 * Manages local selection state.
 * Renders: SummaryStrip + TaskList + TaskDetailDrawer.
 * No business logic. No persistence. Calls Server Actions only through TaskDetailDrawer.
 */

import { useState }               from "react";
import { C, T, S }                from "@/lib/ui/tokens";
import { TaskSummaryStrip }       from "@/components/tasks/task-summary-strip";
import { TaskList }               from "@/components/tasks/task-list";
import { TaskDetailDrawer }       from "@/components/tasks/task-detail-drawer";
import type {
  TaskInboxViewModel,
  TaskInboxCard,
} from "@/lib/tasks/viewmodel/task-inbox-viewmodel";

interface Props {
  orgSlug:   string;
  viewModel: TaskInboxViewModel;
}

export function TaskInboxClient({ orgSlug, viewModel }: Props) {
  const [selectedTask, setSelectedTask] = useState<TaskInboxCard | null>(null);
  const [drawerOpen,   setDrawerOpen  ] = useState(false);

  function handleSelectTask(card: TaskInboxCard) {
    setSelectedTask(card);
    setDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
    setSelectedTask(null);
  }

  return (
    <div style={{ padding: `0 ${S[6]}px ${S[8]}px` }}>
      {/* Summary strip */}
      <TaskSummaryStrip summary={viewModel.summary} />

      {/* Section label */}
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontWeight:   T.wt.medium,
        marginBottom: S[3],
      }}>
        {viewModel.cards.length} tarea{viewModel.cards.length !== 1 ? "s" : ""}
      </div>

      {/* Task list */}
      <TaskList
        cards={viewModel.cards}
        onSelectTask={handleSelectTask}
      />

      {/* Detail drawer */}
      {drawerOpen && (
        <TaskDetailDrawer
          card={selectedTask}
          orgSlug={orgSlug}
          onClose={handleCloseDrawer}
        />
      )}
    </div>
  );
}
