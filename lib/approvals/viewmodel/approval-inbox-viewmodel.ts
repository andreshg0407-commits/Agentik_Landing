/**
 * lib/approvals/viewmodel/approval-inbox-viewmodel.ts
 *
 * Agentik — Approval Inbox ViewModel
 * Sprint: AGENTIK-APPROVAL-INBOX-01
 *
 * Converts ApprovalRequest[] into a serialisable ViewModel for the UI layer.
 * No React. No Prisma. No side effects.
 */

import type {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalPriority,
  ApprovalCategory,
  ApprovalSource,
  ApprovalAuditEvent,
  ApprovalRelationship,
  ApprovalDecision,
} from "../approval-types";
import {
  getApprovalPriorityLabel,
  getApprovalPriorityWeight,
} from "../approval-priority";
import { isTerminalApproval, isPendingApproval } from "../approval-status";

// ── Labels ────────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING:   "Pendiente",
  APPROVED:  "Aprobada",
  REJECTED:  "Rechazada",
  CANCELLED: "Cancelada",
  EXPIRED:   "Vencida",
};

export const CATEGORY_LABEL: Record<ApprovalCategory, string> = {
  FINANCIAL:   "Financiero",
  COLLECTIONS: "Cobranza",
  COMMERCIAL:  "Comercial",
  INVENTORY:   "Inventario",
  MARKETING:   "Marketing",
  OPERATIONS:  "Operaciones",
  COMPLIANCE:  "Cumplimiento",
  CUSTOM:      "Personalizado",
};

export const SOURCE_LABEL: Record<ApprovalSource, string> = {
  COPILOT: "Copilot",
  AGENT:   "Agente",
  MODULE:  "Módulo",
  USER:    "Usuario",
  SYSTEM:  "Sistema",
};

// ── Card type ─────────────────────────────────────────────────────────────────

export interface ApprovalInboxCard {
  id:             string;
  title:          string;
  description:    string | undefined;
  status:         ApprovalStatus;
  statusLabel:    string;
  priority:       ApprovalPriority;
  priorityLabel:  string;
  category:       ApprovalCategory;
  categoryLabel:  string;
  source:         ApprovalSource;
  sourceLabel:    string;
  requestorLabel: string;
  approverLabel:  string;
  module:         string | undefined;
  entityType:     string | undefined;
  entityId:       string | undefined;
  navigationTarget: string | undefined;
  impactSummary:  string | undefined;
  recommendation: string | undefined;
  createdAt:      string;
  updatedAt:      string;
  decidedAt:      string | undefined;
  expiresAt:      string | undefined;
  isExpired:      boolean;
  isPending:      boolean;
  isTerminal:     boolean;
  auditTrail:     ApprovalAuditEvent[];
  relationships:  ApprovalRelationship[];
  decision:       ApprovalDecision | undefined;
  metadata:       Record<string, unknown>;
}

// ── Summary type ──────────────────────────────────────────────────────────────

export interface ApprovalInboxSummary {
  total:        number;
  pending:      number;
  approved:     number;
  rejected:     number;
  cancelled:    number;
  expired:      number;
  critical:     number;
  highPriority: number;
  overdue:      number;
}

// ── ViewModel ─────────────────────────────────────────────────────────────────

export interface ApprovalInboxViewModel {
  summary:     ApprovalInboxSummary;
  cards:       ApprovalInboxCard[];
  generatedAt: string;
}

// ── Builder helpers ───────────────────────────────────────────────────────────

function isOverdue(expiresAt: string | undefined, status: ApprovalStatus): boolean {
  if (!expiresAt) return false;
  if (isTerminalApproval(status)) return false;
  return new Date(expiresAt) < new Date();
}

function toCard(request: ApprovalRequest): ApprovalInboxCard {
  const ctx = request.context;
  return {
    id:             request.id,
    title:          request.title,
    description:    request.description,
    status:         request.status,
    statusLabel:    STATUS_LABEL[request.status] ?? request.status,
    priority:       request.priority,
    priorityLabel:  getApprovalPriorityLabel(request.priority),
    category:       request.category,
    categoryLabel:  CATEGORY_LABEL[request.category] ?? request.category,
    source:         request.source,
    sourceLabel:    SOURCE_LABEL[request.source] ?? request.source,
    requestorLabel: request.requestor.name,
    approverLabel:  request.approver.name,
    module:         ctx.module,
    entityType:     ctx.entityType,
    entityId:       ctx.entityId,
    navigationTarget: ctx.navigationTarget,
    impactSummary:  ctx.impactSummary,
    recommendation: ctx.recommendation,
    createdAt:      request.createdAt,
    updatedAt:      request.updatedAt,
    decidedAt:      request.decision?.decidedAt,
    expiresAt:      request.expiresAt,
    isExpired:      isOverdue(request.expiresAt, request.status),
    isPending:      isPendingApproval(request.status),
    isTerminal:     isTerminalApproval(request.status),
    auditTrail:     request.auditTrail,
    relationships:  request.relationships,
    decision:       request.decision,
    metadata:       request.metadata ?? {},
  };
}

function sortCards(cards: ApprovalInboxCard[]): ApprovalInboxCard[] {
  // PENDING first, then by priority (CRITICAL→LOW), then newest first
  return [...cards].sort((a, b) => {
    // PENDING always before terminal
    if (a.isPending && !b.isPending) return -1;
    if (!a.isPending && b.isPending) return 1;
    // Higher priority first
    const pw = getApprovalPriorityWeight(b.priority) - getApprovalPriorityWeight(a.priority);
    if (pw !== 0) return pw;
    // Newest first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function buildSummary(cards: ApprovalInboxCard[]): ApprovalInboxSummary {
  return {
    total:        cards.length,
    pending:      cards.filter(c => c.status === "PENDING").length,
    approved:     cards.filter(c => c.status === "APPROVED").length,
    rejected:     cards.filter(c => c.status === "REJECTED").length,
    cancelled:    cards.filter(c => c.status === "CANCELLED").length,
    expired:      cards.filter(c => c.status === "EXPIRED").length,
    critical:     cards.filter(c => c.priority === "CRITICAL").length,
    highPriority: cards.filter(c => c.priority === "HIGH" || c.priority === "CRITICAL").length,
    overdue:      cards.filter(c => c.isExpired).length,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildApprovalInboxViewModel(
  requests: ApprovalRequest[],
): ApprovalInboxViewModel {
  const cards   = sortCards(requests.map(toCard));
  const summary = buildSummary(cards);
  return {
    summary,
    cards,
    generatedAt: new Date().toISOString(),
  };
}
