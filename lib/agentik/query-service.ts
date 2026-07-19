import { prisma } from "@/lib/prisma";
import { getOrganizationBusinessStatus } from "./org-activity-engine";
import { generateOrganizationDailyBriefing } from "./daily-briefing";
import { listAlerts } from "@/lib/alerts/queries";
import { listRuns } from "@/lib/runs/queries";
import { listEvents } from "@/lib/events/queries";
import { listKnowledgeItems, extractTraceability } from "@/lib/knowledge/queries";

// ── Executive Overview ──────────────────────────────────────────────────────

export interface ExecutiveOverview {
  status: string;
  reason: string;
  headline: string;
  message: string;
  summary: {
    runs: { total: number; failed: number; running: number };
    alerts: { total: number; open: number; critical: number; warning: number };
    events: { total: number; failed: number };
  };
  generatedAt: string;
}

export async function getExecutiveOverview(
  organizationId: string
): Promise<ExecutiveOverview> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  const [{ summary, businessStatus }, briefing] = await Promise.all([
    getOrganizationBusinessStatus(organizationId),
    generateOrganizationDailyBriefing({
      organizationId,
      organizationName: org?.name ?? organizationId,
    }),
  ]);

  return {
    status: businessStatus.status,
    reason: businessStatus.reason,
    headline: briefing.headline,
    message: briefing.message,
    summary: {
      runs:   { total: summary.runs.total,   failed: summary.runs.failed,   running: summary.runs.running },
      alerts: { total: summary.alerts.total, open: summary.alerts.open,     critical: summary.alerts.critical, warning: summary.alerts.warning },
      events: { total: summary.events.total, failed: summary.events.failed },
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Open Alerts ─────────────────────────────────────────────────────────────

export interface OpenAlertsSummary {
  totalOpen: number;
  critical: number;
  warning: number;
  info: number;
  recentAlerts: Array<{
    id: string;
    title: string;
    severity: string;
    type: string;
    createdAt: string;
  }>;
}

export async function getOpenAlertsSummary(
  organizationId: string
): Promise<OpenAlertsSummary> {
  const alerts = await listAlerts(organizationId, { status: "OPEN" });

  return {
    totalOpen: alerts.length,
    critical: alerts.filter((a) => a.severity === "CRITICAL").length,
    warning:  alerts.filter((a) => a.severity === "WARNING").length,
    info:     alerts.filter((a) => a.severity === "INFO").length,
    recentAlerts: alerts.slice(0, 5).map((a) => ({
      id:        a.id,
      title:     a.title,
      severity:  a.severity,
      type:      a.type,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

// ── Recent Runs ─────────────────────────────────────────────────────────────

export interface RecentRunsSummary {
  totalRecent: number;
  failed: number;
  running: number;
  queued: number;
  recentRuns: Array<{
    id: string;
    type: string;
    status: string;
    project: string | null;
    startedAt: string | null;
    createdAt: string;
  }>;
}

export async function getRecentRunsSummary(
  organizationId: string
): Promise<RecentRunsSummary> {
  const runs = await listRuns(organizationId);

  return {
    totalRecent: runs.length,
    failed:  runs.filter((r) => r.status === "FAILED").length,
    running: runs.filter((r) => r.status === "RUNNING").length,
    queued:  runs.filter((r) => r.status === "QUEUED").length,
    recentRuns: runs.slice(0, 5).map((r) => ({
      id:        r.id,
      type:      r.type,
      status:    r.status,
      project:   r.project?.name ?? null,
      startedAt: r.startedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ── Recent Events ───────────────────────────────────────────────────────────

export interface RecentEventsSummary {
  events: Array<{
    id: string;
    type: string;
    status: string;
    sourceType: string | null;
    createdAt: string;
  }>;
}

export async function getRecentEventsSummary(
  organizationId: string
): Promise<RecentEventsSummary> {
  const events = await listEvents(organizationId);

  return {
    events: events.slice(0, 10).map((e) => ({
      id:         e.id,
      type:       e.type,
      status:     e.status,
      sourceType: e.sourceType ?? null,
      createdAt:  e.createdAt.toISOString(),
    })),
  };
}

// ── Recent Knowledge ────────────────────────────────────────────────────────

export interface RecentKnowledgeSummary {
  items: Array<{
    id: string;
    title: string;
    preview: string | null;
    sourceDocumentId: string | null;
    createdAt: string;
  }>;
}

export async function getRecentKnowledgeSummary(
  organizationId: string
): Promise<RecentKnowledgeSummary> {
  const items = await listKnowledgeItems(organizationId);

  return {
    items: items.slice(0, 5).map((item) => {
      const trace = extractTraceability(item.contentJson);
      const preview = item.content
        ? item.content.slice(0, 100) + (item.content.length > 100 ? "…" : "")
        : null;
      return {
        id:               item.id,
        title:            item.title,
        preview,
        sourceDocumentId: trace.sourceId,
        createdAt:        item.createdAt.toISOString(),
      };
    }),
  };
}
