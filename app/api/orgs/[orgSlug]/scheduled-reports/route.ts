/**
 * GET  /api/orgs/[orgSlug]/scheduled-reports           — list scheduled reports
 * POST /api/orgs/[orgSlug]/scheduled-reports           — create scheduled report
 */

import { NextResponse }          from "next/server";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import {
  createScheduledReport,
  listScheduledReports,
  ScheduleFrequency,
  type CreateScheduledReportInput,
}                                from "@/lib/scheduled-reports/service";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[scheduled-reports]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req:      Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url        = new URL(req.url);
    const activeOnly = url.searchParams.get("active") === "1";
    const limit      = Math.min(100, Number(url.searchParams.get("limit") ?? "50"));

    const reports = await listScheduledReports(organization.id, { activeOnly, limit });
    return NextResponse.json({ reports });
  } catch (err) {
    return handleError(err);
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req:      Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as Partial<CreateScheduledReportInput & { frequency: string; firstRunAt: string; recipients: string; reportType: string }>;

    if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!body.query?.trim()) return NextResponse.json({ error: "query is required" }, { status: 400 });

    const frequency = (body.frequency ?? ScheduleFrequency.ONCE) as ScheduleFrequency;
    const validFreq = Object.values(ScheduleFrequency) as string[];
    if (!validFreq.includes(frequency)) {
      return NextResponse.json({ error: `Invalid frequency: ${frequency}` }, { status: 400 });
    }

    const report = await createScheduledReport(
      organization.id,
      user.email ?? user.id,
      {
        title:        body.title.trim(),
        query:        body.query.trim(),
        frequency,
        recipients:   body.recipients?.trim() || undefined,
        reportType:   body.reportType?.trim() || undefined,
        actionTaskId: body.actionTaskId,
        firstRunAt:   body.firstRunAt ? new Date(body.firstRunAt) : undefined,
      },
    );

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
