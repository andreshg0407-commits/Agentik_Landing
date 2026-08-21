/**
 * app/api/orgs/[orgSlug]/copilot/reports/route.ts
 *
 * Copilot Core — Reports API Route
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Tenant-scoped. Stateless. Production hard-blocked.
 *
 * Route handler order:
 *   1. Production block (VERCEL_ENV=production -> 404)
 *   2. Feature flag (COPILOT_COMMERCIAL_PREVIEW_ENABLED -> 404)
 *   3. Body validation (reportType + optional format)
 *   4. buildCopilotEnvelope (auth + role gate + module check)
 *   5. Rate limit (organizationId:userId -> 429)
 *   6. executeCopilotCapability (authorize + fetch aggregated data)
 *   7. generateReport (CSV/JSON from redacted DTO)
 *   8. Return download response with Content-Disposition
 */

import { NextResponse } from "next/server";
import { buildCopilotEnvelope } from "@/lib/copilot-core/copilot-core-envelope-builder";
import { executeCopilotCapability } from "@/lib/copilot-core/copilot-core-gateway";
import { checkRateLimit } from "@/lib/copilot-core/copilot-core-rate-limiter";
import {
  generateReport,
  isValidReportType,
  isValidReportFormat,
  reportTypeToCapabilityId,
} from "@/lib/copilot-core/copilot-core-report-generator";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  // Step 1: Production hard block
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Step 2: Feature flag
  if (process.env.COPILOT_COMMERCIAL_PREVIEW_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Step 3: Body validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body == null || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { reportType, format: rawFormat } = body as Record<string, unknown>;

  if (!isValidReportType(reportType)) {
    return NextResponse.json(
      { error: "Invalid reportType. Must be: customer_summary, sales_performance, or orders_summary" },
      { status: 400 },
    );
  }

  const format = isValidReportFormat(rawFormat) ? rawFormat : "csv";

  const { orgSlug } = await params;

  // Step 4: Build envelope (auth + role gate + module check)
  let envelope;
  try {
    envelope = await buildCopilotEnvelope({
      orgSlug,
      serverSurface: "desktop",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      msg === "ACCESS_DENIED" ||
      msg === "COPILOT_ROLE_BLOCKED" ||
      msg === "ACCESS_DENIED_SELLER_CONFINED"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "ORG_NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      msg === "COPILOT_MODULE_NOT_ENABLED" ||
      msg === "ORG_INACTIVE"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Step 5: Rate limit
  const rateResult = checkRateLimit(envelope.organizationId, envelope.userId);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: rateResult.retryAfterMs
          ? { "Retry-After": String(Math.ceil(rateResult.retryAfterMs / 1000)) }
          : undefined,
      },
    );
  }

  // Step 6: Execute capability to get redacted data
  const capabilityId = reportTypeToCapabilityId(reportType);

  try {
    const result = await executeCopilotCapability({
      envelope,
      capabilityId,
      validatedArguments: {},
    });

    if (!result.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Step 7: Generate report from redacted DTO
    const report = generateReport(
      reportType,
      result.data,
      format,
      envelope.organizationId,
    );

    // Step 8: Return download response
    return new Response(report.content, {
      status: 200,
      headers: {
        "Content-Type": report.contentType,
        "Content-Disposition": `attachment; filename="${report.filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
