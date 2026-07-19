/**
 * vendor-bag-ideal-route-service.ts
 *
 * GO-LIVE-MALETAS-DERROTERO-CONFIG-01
 * GO-LIVE-MALETAS-DERROTERO-HARDENING-01
 *
 * CRUD + effective-minimum resolver for VendorBagIdealRouteRule.
 * Fallback: DEFAULT_SUBGROUP_MINIMUM_REFS (3) when no manual rule exists.
 *
 * Delete = soft-delete (isActive=false). No physical deletes.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_SUBGROUP_MINIMUM_REFS } from "./vendor-sample-types";

const db = prisma as any;

// ── Types ────────────────────────────────────────────────────────────────────

export interface IdealRouteRule {
  id: string;
  vendorId: string;
  line: string;
  subgrupoSag: string;
  minimumRefs: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertIdealRouteInput {
  vendorId: string;
  line: string;
  subgrupoSag: string;
  minimumRefs: number;
  isActive?: boolean;
}

// ── Catalog: real subgroups from ProductEntity ───────────────────────────────

const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "5": "IMPORT" };

export interface CatalogSubgroup {
  line: string;
  subgrupoSag: string;
}

export async function loadCatalogSubgroups(
  orgId: string,
): Promise<CatalogSubgroup[]> {
  const rows: Array<{ productLine: string; subgrupoSag: string }> = await db.$queryRawUnsafe(`
    SELECT DISTINCT "productLine", "subgrupoSag"
    FROM "ProductEntity"
    WHERE "organizationId" = $1
      AND "productLine" IS NOT NULL
      AND "subgrupoSag" IS NOT NULL
      AND "subgrupoSag" != ''
    ORDER BY "productLine", "subgrupoSag"
  `, orgId);

  return rows
    .map((r) => ({
      line: LINE_MAP[r.productLine] ?? r.productLine,
      subgrupoSag: r.subgrupoSag,
    }))
    .filter((r) => r.line === "LT" || r.line === "CS" || r.line === "IMPORT");
}

// ── List rules for a vendor (all, including inactive for history) ────────────

export async function listIdealRouteRules(
  orgId: string,
  vendorId: string,
): Promise<IdealRouteRule[]> {
  const rows = await db.vendorBagIdealRouteRule.findMany({
    where: { organizationId: orgId, vendorId },
    orderBy: [{ line: "asc" }, { subgrupoSag: "asc" }],
  });
  return rows.map(toRule);
}

// ── Upsert a rule ────────────────────────────────────────────────────────────

export async function upsertIdealRouteRule(
  orgId: string,
  vendorId: string,
  input: UpsertIdealRouteInput,
): Promise<IdealRouteRule> {
  const row = await db.vendorBagIdealRouteRule.upsert({
    where: {
      organizationId_vendorId_line_subgrupoSag: {
        organizationId: orgId,
        vendorId,
        line: input.line,
        subgrupoSag: input.subgrupoSag,
      },
    },
    create: {
      organizationId: orgId,
      vendorId: input.vendorId,
      line: input.line,
      subgrupoSag: input.subgrupoSag,
      minimumRefs: input.minimumRefs,
      isActive: input.isActive ?? true,
    },
    update: {
      minimumRefs: input.minimumRefs,
      isActive: input.isActive ?? true,
    },
  });
  return toRule(row);
}

// ── Soft-delete a rule (isActive = false) ────────────────────────────────────

export async function deactivateIdealRouteRule(
  orgId: string,
  vendorId: string,
  ruleId: string,
): Promise<boolean> {
  try {
    await db.vendorBagIdealRouteRule.update({
      where: { id: ruleId, organizationId: orgId, vendorId },
      data: { isActive: false },
    });
    return true;
  } catch {
    return false;
  }
}

// ── Get effective minimum refs for a specific line + subgrupo ────────────────

export async function getEffectiveMinimumRefs(
  orgId: string,
  vendorId: string,
  line: string,
  subgrupoSag: string,
): Promise<number> {
  const rule = await db.vendorBagIdealRouteRule.findUnique({
    where: {
      organizationId_vendorId_line_subgrupoSag: {
        organizationId: orgId,
        vendorId,
        line,
        subgrupoSag,
      },
    },
    select: { minimumRefs: true, isActive: true },
  });
  if (rule && rule.isActive) return rule.minimumRefs;
  return DEFAULT_SUBGROUP_MINIMUM_REFS;
}

// ── Batch: load all active rules for a vendor (keyed by line|subgrupoSag) ───

export async function loadEffectiveMinimumRefsMap(
  orgId: string,
  vendorId: string,
): Promise<Map<string, number>> {
  const rows = await db.vendorBagIdealRouteRule.findMany({
    where: { organizationId: orgId, vendorId, isActive: true },
    select: { line: true, subgrupoSag: true, minimumRefs: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.line}|${r.subgrupoSag}`, r.minimumRefs);
  }
  return map;
}

// ── Vendor activation persistence ────────────────────────────────────────────
// Uses VendorBagIdealRouteRule with line="__ACTIVATION__" convention.
// minimumRefs=1 → active, minimumRefs=0 → inactive.

const ACTIVATION_LINE = "__ACTIVATION__";
const ACTIVATION_SUBGRUPO = "__STATE__";

export async function loadVendorActivationOverrides(
  orgId: string,
): Promise<Map<string, boolean>> {
  const rows = await db.vendorBagIdealRouteRule.findMany({
    where: { organizationId: orgId, line: ACTIVATION_LINE, subgrupoSag: ACTIVATION_SUBGRUPO },
    select: { vendorId: true, minimumRefs: true },
  });
  const map = new Map<string, boolean>();
  for (const r of rows) {
    map.set(r.vendorId, r.minimumRefs > 0);
  }
  return map;
}

export async function setVendorActivation(
  orgId: string,
  vendorId: string,
  active: boolean,
): Promise<void> {
  await db.vendorBagIdealRouteRule.upsert({
    where: {
      organizationId_vendorId_line_subgrupoSag: {
        organizationId: orgId,
        vendorId,
        line: ACTIVATION_LINE,
        subgrupoSag: ACTIVATION_SUBGRUPO,
      },
    },
    create: {
      organizationId: orgId,
      vendorId,
      line: ACTIVATION_LINE,
      subgrupoSag: ACTIVATION_SUBGRUPO,
      minimumRefs: active ? 1 : 0,
      isActive: true,
    },
    update: {
      minimumRefs: active ? 1 : 0,
    },
  });
}

// ── Helper ───────────────────────────────────────────────────────────────────

function toRule(row: any): IdealRouteRule {
  return {
    id: row.id,
    vendorId: row.vendorId,
    line: row.line,
    subgrupoSag: row.subgrupoSag,
    minimumRefs: row.minimumRefs,
    isActive: row.isActive,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}
