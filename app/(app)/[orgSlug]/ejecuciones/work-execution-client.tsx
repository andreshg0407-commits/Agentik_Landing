"use client";

/**
 * app/(app)/[orgSlug]/ejecuciones/work-execution-client.tsx
 *
 * Agentik — Ejecuciones Client Component
 * Sprint: AGENTIK-WORK-EXECUTION-OBSERVABILITY-01
 *
 * Manages selection state. Renders strip + list + drawer.
 * No business logic. No service calls. Props only.
 */

import { useState } from "react";
import { C, T, S }  from "@/lib/ui/tokens";
import {
  WorkExecutionSummaryStrip,
  WorkExecutionList,
  WorkExecutionDetailDrawer,
} from "@/components/work-executions";
import type {
  WorkExecutionViewModel,
  WorkExecutionCard,
} from "@/lib/work/live/viewmodel/work-execution-viewmodel";

interface Props {
  orgSlug:   string;
  viewModel: WorkExecutionViewModel;
}

export function WorkExecutionClient({ orgSlug, viewModel }: Props) {
  const [selected, setSelected] = useState<WorkExecutionCard | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleSelect(card: WorkExecutionCard) {
    setSelected(card);
    setDrawerOpen(true);
  }

  function handleClose() {
    setDrawerOpen(false);
    setSelected(null);
  }

  return (
    <div style={{ padding: `0 ${S[6]}px ${S[8]}px` }}>
      {/* Summary strip */}
      <WorkExecutionSummaryStrip summary={viewModel.summary} />

      {/* Section label */}
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontWeight:    T.wt.medium,
        marginBottom:  S[3],
      }}>
        {viewModel.cards.length} ejecución{viewModel.cards.length !== 1 ? "es" : ""}
      </div>

      {/* List */}
      <WorkExecutionList
        cards={viewModel.cards}
        onSelectExecution={handleSelect}
      />

      {/* Drawer */}
      {drawerOpen && (
        <WorkExecutionDetailDrawer
          card={selected}
          orgSlug={orgSlug}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
