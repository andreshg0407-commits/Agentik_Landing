"use server";

import { requireOrgMembership } from "@/lib/api/org-auth";
import {
  getExecutiveOverview,
  getOpenAlertsSummary,
  getRecentRunsSummary,
  getRecentEventsSummary,
  getRecentKnowledgeSummary,
  type ExecutiveOverview,
  type OpenAlertsSummary,
  type RecentRunsSummary,
  type RecentEventsSummary,
  type RecentKnowledgeSummary,
} from "@/lib/agentik/query-service";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function withOrgAuth<T>(
  organizationId: string,
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  const auth = await requireOrgMembership(organizationId);
  if (!auth) return { ok: false, error: "Unauthorized" };
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[agentik/action]", msg);
    return { ok: false, error: msg };
  }
}

export async function queryExecutiveOverview(
  organizationId: string
): Promise<ActionResult<ExecutiveOverview>> {
  return withOrgAuth(organizationId, () => getExecutiveOverview(organizationId));
}

export async function queryOpenAlerts(
  organizationId: string
): Promise<ActionResult<OpenAlertsSummary>> {
  return withOrgAuth(organizationId, () => getOpenAlertsSummary(organizationId));
}

export async function queryRecentRuns(
  organizationId: string
): Promise<ActionResult<RecentRunsSummary>> {
  return withOrgAuth(organizationId, () => getRecentRunsSummary(organizationId));
}

export async function queryRecentEvents(
  organizationId: string
): Promise<ActionResult<RecentEventsSummary>> {
  return withOrgAuth(organizationId, () => getRecentEventsSummary(organizationId));
}

export async function queryRecentKnowledge(
  organizationId: string
): Promise<ActionResult<RecentKnowledgeSummary>> {
  return withOrgAuth(organizationId, () => getRecentKnowledgeSummary(organizationId));
}
