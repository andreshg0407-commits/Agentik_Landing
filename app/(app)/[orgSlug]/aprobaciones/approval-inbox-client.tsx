"use client";

/**
 * app/(app)/[orgSlug]/aprobaciones/approval-inbox-client.tsx
 *
 * Agentik — Approval Inbox Client Component
 * Sprint: AGENTIK-APPROVAL-INBOX-01
 *
 * Manages local selection state.
 * Renders: ApprovalSummaryStrip + ApprovalList + ApprovalDetailDrawer.
 * No business logic. No persistence. Calls Server Actions only through the drawer.
 */

import { useState }                  from "react";
import { C, T, S }                   from "@/lib/ui/tokens";
import { ApprovalSummaryStrip }      from "@/components/approvals/approval-summary-strip";
import { ApprovalList }              from "@/components/approvals/approval-list";
import { ApprovalDetailDrawer }      from "@/components/approvals/approval-detail-drawer";
import type {
  ApprovalInboxViewModel,
  ApprovalInboxCard,
} from "@/lib/approvals/viewmodel/approval-inbox-viewmodel";

interface Props {
  orgSlug:   string;
  viewModel: ApprovalInboxViewModel;
}

export function ApprovalInboxClient({ orgSlug, viewModel }: Props) {
  const [selectedApproval, setSelectedApproval] = useState<ApprovalInboxCard | null>(null);
  const [drawerOpen, setDrawerOpen]             = useState(false);

  function handleSelectApproval(card: ApprovalInboxCard) {
    setSelectedApproval(card);
    setDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
    setSelectedApproval(null);
  }

  return (
    <div style={{ padding: `0 ${S[6]}px ${S[8]}px` }}>
      {/* Summary strip */}
      <ApprovalSummaryStrip summary={viewModel.summary} />

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
        {viewModel.cards.length} solicitud{viewModel.cards.length !== 1 ? "es" : ""}
      </div>

      {/* Approval list */}
      <ApprovalList
        cards={viewModel.cards}
        onSelectApproval={handleSelectApproval}
      />

      {/* Detail drawer */}
      {drawerOpen && (
        <ApprovalDetailDrawer
          card={selectedApproval}
          orgSlug={orgSlug}
          onClose={handleCloseDrawer}
        />
      )}
    </div>
  );
}
