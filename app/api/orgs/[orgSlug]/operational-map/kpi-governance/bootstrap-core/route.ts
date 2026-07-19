/**
 * app/api/orgs/[orgSlug]/operational-map/kpi-governance/bootstrap-core/route.ts
 *
 * Bootstrap Core KPI Governance — seeds the 10 certified KPI presets
 * into OperationalKpiDefinition for the given org.
 *
 * POST  — upserts all 10 core KPI governance presets to DB.
 *         Idempotent: safe to run multiple times.
 *         Existing records are updated; missing records are created.
 *
 * GET   — returns the current DB state for the 10 core KPIs (preset + DB overlay).
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * Sprint: AGENTIK-OPS-CERTIFICATION-CORE-10KPIS-01
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole }   from "@/lib/auth/module-access";
import { prisma }           from "@/lib/prisma";
import {
  CORE_KPI_GOVERNANCE_PRESETS,
}                           from "@/lib/operational-map/certification/core-kpi-governance-presets";
import {
  appendKpiEvent,
}                           from "@/lib/operational-map/certification/operational-kpi-event-service";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

// ─── GET — current state ──────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }      = await params;
    const { organization } = await requireInternalAccess(orgSlug);

    const coreKeys = CORE_KPI_GOVERNANCE_PRESETS.map(p => p.kpiKey);

    const existing = await prisma.operationalKpiDefinition.findMany({
      where: {
        organizationId: organization.id,
        kpiKey:         { in: coreKeys },
      },
    });

    const existingMap = Object.fromEntries(existing.map(r => [r.kpiKey, r]));

    const state = CORE_KPI_GOVERNANCE_PRESETS.map(preset => ({
      kpiKey:         preset.kpiKey,
      entityLabel:    preset.entityLabel,
      domain:         preset.domain,
      criticality:    preset.criticality,
      certificationStatus: preset.certificationStatus,
      seeded:         Boolean(existingMap[preset.kpiKey]),
      dbRecord:       existingMap[preset.kpiKey] ?? null,
    }));

    return NextResponse.json({
      ok:    true,
      state,
      total: coreKeys.length,
      seeded: existing.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — bootstrap ─────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }          = await params;
    const { organization, user } = await requireInternalAccess(orgSlug);

    const results: { kpiKey: string; action: "created" | "updated" }[] = [];

    for (const preset of CORE_KPI_GOVERNANCE_PRESETS) {
      const existing = await prisma.operationalKpiDefinition.findUnique({
        where: {
          organizationId_kpiKey: {
            organizationId: organization.id,
            kpiKey:         preset.kpiKey,
          },
        },
      });

      const data = {
        domain:               preset.domain,
        entityLabel:          preset.entityLabel,
        kpiDefinition:        preset.kpiDefinition,
        priority:             preset.priority,
        frequency:            preset.frequency,
        formulaExpression:    preset.formulaExpression,
        formulaDescription:   preset.formulaDescription,
        businessDefinition:   preset.businessDefinition,
        dependencyType:       preset.dependencyType,
        criticality:          preset.criticality,
        sagContributions:     preset.sagContributions,
        agentikContributions: preset.agentikContributions,
        ownerBusiness:        preset.ownerBusiness,
        ownerTechnical:       preset.ownerTechnical,
        ownerSag:             preset.ownerSag,
        notes:                preset.dbaPendingItems.length > 0
          ? `Pendiente DBA: ${preset.dbaPendingItems.join(" | ")}`
          : null,
      };

      if (existing) {
        await prisma.operationalKpiDefinition.update({
          where: { organizationId_kpiKey: { organizationId: organization.id, kpiKey: preset.kpiKey } },
          data,
        });
        results.push({ kpiKey: preset.kpiKey, action: "updated" });
      } else {
        await prisma.operationalKpiDefinition.create({
          data: {
            ...data,
            organizationId: organization.id,
            kpiKey:         preset.kpiKey,
            createdBy:      user.id,
          },
        });

        // Emit creation event for new records only
        await appendKpiEvent({
          organizationId: organization.id,
          kpiKey:         preset.kpiKey,
          eventType:      "kpi_created",
          actorId:        user.id,
          actorRole:      "AGENTIK_ADMIN",
          description:    `KPI base "${preset.entityLabel}" sembrado desde presets núcleo v1`,
          metadata: {
            domain:         preset.domain,
            criticality:    preset.criticality,
            dependencyType: preset.dependencyType,
            formulaStatus:  preset.formulaStatus,
          },
        });

        results.push({ kpiKey: preset.kpiKey, action: "created" });
      }
    }

    const created = results.filter(r => r.action === "created").length;
    const updated = results.filter(r => r.action === "updated").length;

    return NextResponse.json({
      ok:      true,
      message: `Bootstrap completo: ${created} creados, ${updated} actualizados`,
      created,
      updated,
      results,
    }, { status: 201 });
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
