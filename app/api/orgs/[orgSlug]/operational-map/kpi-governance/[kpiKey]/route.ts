/**
 * app/api/orgs/[orgSlug]/operational-map/kpi-governance/[kpiKey]/route.ts
 *
 * KPI Governance Record API — formula, dependency type, criticality,
 * SAG/Agentik contributions, source truth priorities, and governance timeline.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET   — returns full KpiGovernanceRecord (definition + sources + timeline)
 * PATCH — upserts governance fields (formula, dependencyType, criticality, contributions)
 *
 * Sprint: AGENTIK-OPS-CERTIFICATION-GOVERNANCE-01
 */

import { NextResponse }       from "next/server";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { isInternalRole }     from "@/lib/auth/module-access";
import {
  getKpiDefinition,
  updateKpiDefinition,
}                             from "@/lib/operational-map/certification/operational-kpi-definition-service";
import {
  getKpiSources,
}                             from "@/lib/operational-map/certification/operational-kpi-source-service";
import {
  getKpiTimeline,
  appendKpiEvent,
}                             from "@/lib/operational-map/certification/operational-kpi-event-service";
import { prisma }             from "@/lib/prisma";
import type {
  KpiGovernanceRecord,
  KpiGovernancePatchInput,
  GovernanceTimelineStage,
}                             from "@/lib/operational-map/certification/operational-kpi-governance-types";
import {
  GOVERNANCE_TIMELINE_STAGES,
}                             from "@/lib/operational-map/certification/operational-kpi-governance-types";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

// ─── Governance timeline builder ──────────────────────────────────────────────

function buildGovernanceTimeline(
  certificationStatus: string | null,
  businessApproved: boolean,
  sagApproved: boolean,
  productionReady: boolean,
  runtimeDetected: boolean,
): GovernanceTimelineStage[] {
  const done = (s: boolean) => s ? "done" : "pending" as const;

  const statusDone = (statuses: string[]) =>
    statuses.includes(certificationStatus ?? "") ? "done" : "pending" as const;

  return GOVERNANCE_TIMELINE_STAGES.map(stage => ({
    ...stage,
    completedAt: null,
    completedBy: null,
    status: ((): "pending" | "done" | "blocked" => {
      switch (stage.key) {
        case "runtime_detected":  return done(runtimeDetected);
        case "business_validated": return done(businessApproved);
        case "dba_validated":     return done(sagApproved);
        case "query_approved":    return statusDone(["technical_validated", "sag_validated", "certified", "production_ready"]);
        case "certified":         return statusDone(["certified", "production_ready"]);
        case "production":        return done(productionReady);
        default:                  return "pending";
      }
    })(),
  }));
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; kpiKey: string }> },
) {
  try {
    const { orgSlug, kpiKey } = await params;
    const { organization }    = await requireInternalAccess(orgSlug);

    // Load all three layers in parallel
    const [definition, sources, events, certification] = await Promise.all([
      getKpiDefinition(organization.id, kpiKey),
      getKpiSources(organization.id, kpiKey),
      getKpiTimeline(organization.id, kpiKey, 30),
      prisma.operationalKpiCertification.findUnique({
        where: { organizationId_kpiKey: { organizationId: organization.id, kpiKey } },
      }),
    ]);

    // Detect if Agentik has runtime data for this KPI
    const runtimeDetected = sources.some(s =>
      s.sourceOrigin === "runtime_detected" || s.runtimeRowCount != null
    );

    const record: KpiGovernanceRecord = {
      kpiKey,
      entityLabel:  definition?.entityLabel   ?? kpiKey,
      domain:       definition?.domain        ?? "unknown",

      formula: {
        formulaExpression:  definition?.formulaExpression  ?? null,
        formulaDescription: definition?.formulaDescription ?? null,
        businessDefinition: definition?.businessDefinition ?? null,
      },

      dependencyType:  (definition?.dependencyType  ?? null) as KpiGovernanceRecord["dependencyType"],
      criticality:     (definition?.criticality     ?? null) as KpiGovernanceRecord["criticality"],

      sagContributions:     definition?.sagContributions     ?? [],
      agentikContributions: definition?.agentikContributions ?? [],

      sources: sources.map(s => ({
        id:                  s.id,
        sourceName:          s.sourceName,
        sourceType:          s.sourceType,
        sourceRole:          s.sourceRole,
        provider:            s.provider,
        sourceOfTruth:       s.sourceOfTruth,
        validationStatus:    s.validationStatus,
        tableName:           s.tableName,
        approvedQuery:       s.approvedQuery,
        sagValidated:        s.sagValidated,
        businessValidated:   s.businessValidated,
        confidenceScore:     s.confidenceScore,
        sourceContribution:  s.sourceContribution,
        sourceTruthPriority: s.sourceTruthPriority,
        viewType:            s.viewType,
        notes:               s.notes,
      })),

      timeline: events.map(e => ({
        id:          e.id,
        eventType:   e.eventType,
        description: e.description,
        actorId:     e.actorId,
        actorName:   e.actorName,
        actorRole:   e.actorRole,
        createdAt:   e.createdAt,
      })),

      certificationStatus: certification?.certificationStatus ?? null,
      businessApproved:    certification?.businessApproved    ?? false,
      sagApproved:         certification?.sagApproved         ?? false,
      productionReady:     certification?.productionReady     ?? false,

      governanceStages: buildGovernanceTimeline(
        certification?.certificationStatus ?? null,
        certification?.businessApproved    ?? false,
        certification?.sagApproved         ?? false,
        certification?.productionReady     ?? false,
        runtimeDetected,
      ),
    };

    return NextResponse.json({ ok: true, record });
  } catch (err) {
    return handleError(err);
  }
}

// ─── PATCH — upsert governance fields ────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; kpiKey: string }> },
) {
  try {
    const { orgSlug, kpiKey } = await params;
    const { organization, user } = await requireInternalAccess(orgSlug);
    const body = await req.json() as KpiGovernancePatchInput;

    const updates: Parameters<typeof updateKpiDefinition>[2] = {};
    if (body.formulaExpression    !== undefined) updates.formulaExpression    = body.formulaExpression;
    if (body.formulaDescription   !== undefined) updates.formulaDescription   = body.formulaDescription;
    if (body.businessDefinition   !== undefined) updates.businessDefinition   = body.businessDefinition;
    if (body.dependencyType       !== undefined) updates.dependencyType       = body.dependencyType;
    if (body.criticality          !== undefined) updates.criticality          = body.criticality;
    if (body.sagContributions     !== undefined) updates.sagContributions     = body.sagContributions;
    if (body.agentikContributions !== undefined) updates.agentikContributions = body.agentikContributions;
    if (body.notes                !== undefined) updates.notes                = body.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const definition = await updateKpiDefinition(organization.id, kpiKey, updates);

    await appendKpiEvent({
      organizationId: organization.id,
      kpiKey,
      eventType:      "kpi_updated",
      actorId:        user.id,
      description:    `Gobernanza actualizada: ${Object.keys(updates).join(", ")}`,
      metadata:       { updatedFields: Object.keys(updates) },
    });

    return NextResponse.json({ ok: true, definition });
  } catch (err) {
    return handleError(err);
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND" ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
