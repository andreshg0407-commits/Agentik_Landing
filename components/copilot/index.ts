/**
 * components/copilot/index.ts
 *
 * Agentik Copilot — Component Export Index
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * Single import point for all Copilot UI components.
 * These components depend only on CopilotViewModel — never on engine internals.
 */

// ── Panel (main entry point) ──────────────────────────────────────────────────
export { CopilotPanel }             from "./copilot-panel";
export type { CopilotPanelVariant } from "./copilot-panel";

// ── Agent Office components (AGENTIK-COPILOT-EXPERIENCE-01 / AGENT-OFFICE-01) ─
export { CopilotOfficeHeader }      from "./copilot-office-header";
export { CopilotExecutiveBrief }    from "./copilot-executive-brief";
export { CopilotWorkBoard }         from "./copilot-work-board";
export { CopilotAgentChat }         from "./copilot-agent-chat";
export { CopilotAgentStatus }       from "./copilot-agent-status";
export { CopilotMemoryTimeline }    from "./copilot-memory-timeline";
export { CopilotNextAction }        from "./copilot-next-action";
export { CopilotAgentPresence }     from "./copilot-agent-presence";

// ── Drawer overlay (AGENTIK-COPILOT-WORKSPACE-CARDS-01) ──────────────────────
export { CopilotDrawer }            from "./copilot-drawer";
export type { DrawerCategory }      from "./copilot-drawer";

// ── Workspace components (AGENTIK-COPILOT-WORKSPACE-01) ──────────────────────
export { CopilotActiveWork }        from "./copilot-active-work";
export { CopilotPendingApprovals }  from "./copilot-pending-approvals";
export { CopilotCompletedWork }     from "./copilot-completed-work";
export { CopilotFollowups }         from "./copilot-followups";
export { CopilotRequestInbox }      from "./copilot-request-inbox";

// ── Sub-components ────────────────────────────────────────────────────────────
export { CopilotAgentHeader }       from "./copilot-agent-header";
export { CopilotSummaryStrip }      from "./copilot-summary-strip";
export { CopilotSuggestionsList }   from "./copilot-suggestions-list";
export { CopilotInsightsList }      from "./copilot-insights-list";
export { CopilotAttentionList }     from "./copilot-attention-list";
export { CopilotOpportunitiesList } from "./copilot-opportunities-list";

// ── Legacy (V1 copilot system — kept for backward compatibility) ──────────────
export { CopilotSlot }              from "./copilot-slot";
export { CopilotAgentCard }         from "./copilot-agent-card";
