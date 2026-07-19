/**
 * GET  /api/orgs/[orgSlug]/integrations/sag/catalog/articles/sync — diagnostic
 * POST /api/orgs/[orgSlug]/integrations/sag/catalog/articles/sync — trigger sync
 *
 * POST body: { dryRun?: boolean, limit?: number, activeOnly?: boolean }
 *
 * Resolves SAG config from the org's Connector record (adapter="sag-pya-soap").
 * Falls back to env vars (PYA_SOAP_TOKEN, PYA_SOAP_ENDPOINT, PYA_SAG_BD).
 *
 * Sprint: SAG-CATALOG-SYNC-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";
import { syncSagArticlesToProductEntity } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type { SagArticleSyncOptions } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types";

// ── Config resolution ───────────────────────────────────────────────────────

async function resolveSagConfig(orgId: string): Promise<PyaApiConfig | null> {
  // Try Connector record first
  try {
    const connector = await prisma.connector.findFirst({
      where: {
        organizationId: orgId,
        source: "sag_pya",
      },
      select: { config: true },
    });

    if (connector?.config && typeof connector.config === "object") {
      const cfg = connector.config as Record<string, unknown>;
      const token = typeof cfg.token === "string" ? cfg.token.trim() : null;
      if (token) {
        return {
          token,
          endpointUrl:
            typeof cfg.endpointUrl === "string"
              ? cfg.endpointUrl.trim()
              : process.env.PYA_SOAP_ENDPOINT ?? "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
          database:
            typeof cfg.database === "string" && cfg.database.trim()
              ? cfg.database.trim()
              : process.env.PYA_SAG_BD,
        };
      }
    }
  } catch {
    // Connector table might not have this record — fall through to env
  }

  // Fallback to env vars
  const token =
    process.env.PYA_SOAP_TOKEN?.trim() ||
    process.env.SAG_TEST_TOKEN?.trim();

  if (!token) return null;

  return {
    token,
    endpointUrl:
      process.env.PYA_SOAP_ENDPOINT ?? "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    database: process.env.PYA_SAG_BD,
  };
}

// ── GET: diagnostic ─────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const config = await resolveSagConfig(orgId);
  const hasConfig = !!config;

  // Count existing ProductEntity records from SAG
  let sagProductCount = 0;
  try {
    sagProductCount = await (prisma as any).productEntity.count({
      where: { organizationId: orgId, externalSource: "sag" },
    });
  } catch {
    // ProductEntity model might not exist yet
  }

  // Last ConnectorRun for articles
  let lastRun = null;
  try {
    lastRun = await prisma.connectorRun.findFirst({
      where: { organizationId: orgId, module: "articles" },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        rowsRead: true,
        rowsImported: true,
      },
    });
  } catch {
    // ConnectorRun might not exist
  }

  return NextResponse.json({
    orgId,
    orgSlug,
    hasConfig,
    sagProductCount,
    lastRun,
  });
}

// ── POST: trigger sync ──────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const config = await resolveSagConfig(orgId);
  if (!config) {
    return NextResponse.json(
      { error: "No SAG config found. Set PYA_SOAP_TOKEN or configure a sag-pya-soap Connector." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const options: SagArticleSyncOptions = {
    dryRun:     body.dryRun === true,
    limit:      typeof body.limit === "number" ? body.limit : undefined,
    activeOnly: body.activeOnly === true,
  };

  // eslint-disable-next-line no-console
  console.log("[SAG-CATALOG-SYNC] Starting sync for", orgSlug, "options:", options);

  // Create ConnectorRun audit record
  let runId: string | null = null;
  try {
    const connector = await prisma.connector.findFirst({
      where: { organizationId: orgId, source: "sag_pya" },
      select: { id: true },
    });

    if (connector) {
      const run = await prisma.connectorRun.create({
        data: {
          organizationId: orgId,
          connectorId:    connector.id,
          source:         "sag-pya-soap",
          module:         "articles",
          status:         "RUNNING",
          startedAt:      new Date(),
          rowsRead:       0,
          rowsImported:   0,
          rowsSkipped:    0,
          rowsErrored:    0,
        },
      });
      runId = run.id;
    }
  } catch {
    // ConnectorRun creation is best-effort — sync proceeds without it
  }

  const result = await syncSagArticlesToProductEntity(orgId, config, options);

  // Update ConnectorRun
  if (runId) {
    try {
      await prisma.connectorRun.update({
        where: { id: runId },
        data: {
          status:       result.status === "error" ? "FAILED" : result.invalidRows > 0 ? "PARTIAL" : "SUCCESS",
          finishedAt:   new Date(),
          rowsRead:     result.totalRows,
          rowsImported: result.created + result.updated,
          rowsSkipped:  result.skipped,
          rowsErrored:  result.invalidRows,
          meta:         { durationMs: result.durationMs, dryRun: result.dryRun },
        },
      });
    } catch {
      // Best-effort
    }
  }

  // eslint-disable-next-line no-console
  console.log("[SAG-CATALOG-SYNC] Result:", JSON.stringify(result));

  return NextResponse.json({ result });
}
