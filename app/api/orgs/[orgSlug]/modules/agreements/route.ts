/**
 * API: /api/orgs/[orgSlug]/modules/agreements
 *
 *   GET    — List agreements (all or active only). SUPER_ADMIN / AGENTIK_ADMIN.
 *   POST   — Create new agreement. SUPER_ADMIN / AGENTIK_ADMIN.
 *   PUT    — Supersede existing agreement. SUPER_ADMIN / AGENTIK_ADMIN.
 *   DELETE — Expire agreement. SUPER_ADMIN / AGENTIK_ADMIN.
 *
 * Sprint: AGENTIK-CUSTOM-COMMERCIAL-AGREEMENTS-01
 *
 * ORG_ADMIN / MANAGER cannot access this endpoint.
 * Does NOT grant module access — TenantModule.enabled is unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import { MembershipStatus } from "@prisma/client";
import {
  listAgreements,
  getActiveAgreement,
  createAgreement,
  supersededAgreement,
  expireAgreement,
} from "@/lib/tenant/commercial-agreement-service";
import type { ModuleKey } from "@/lib/tenant/modules";
import { MODULE_KEYS } from "@/lib/tenant/modules";
import type {
  AgreementType,
  UsageLimitMetricKey,
  UsageLimitPolicy,
  CreateUsageLimitInput,
} from "@/lib/tenant/commercial-agreement-types";

type RouteParams = { params: Promise<{ orgSlug: string }> };

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "AGENTIK_ADMIN"]);

async function resolveAdminCtx(orgSlug: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!org) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, organizationId: org.id, status: MembershipStatus.ACTIVE },
    select: { role: true },
  });
  if (!membership || !ADMIN_ROLES.has(membership.role)) return null;

  return { orgId: org.id, role: membership.role };
}

// ── GET — list or get active ────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveAdminCtx(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const active = req.nextUrl.searchParams.get("active") === "true";

  if (active) {
    const agreement = await getActiveAgreement(ctx.orgId);
    return NextResponse.json({ agreement });
  }

  const agreements = await listAgreements(ctx.orgId);
  return NextResponse.json({ agreements });
}

// ── POST — create agreement ─────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveAdminCtx(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  const validation = validateCreateInput(body, ctx.orgId);
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const agreement = await createAgreement(validation.input!);
  return NextResponse.json({ agreement }, { status: 201 });
}

// ── PUT — supersede existing agreement ──────────────────────────────────────

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveAdminCtx(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { existingAgreementId, ...rest } = body as { existingAgreementId?: string };

  if (!existingAgreementId || typeof existingAgreementId !== "string") {
    return NextResponse.json(
      { error: "existingAgreementId is required for supersede" },
      { status: 400 },
    );
  }

  const validation = validateCreateInput(rest, ctx.orgId);
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const agreement = await supersededAgreement(existingAgreementId, validation.input!);
  return NextResponse.json({ agreement });
}

// ── DELETE — expire agreement ───────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveAdminCtx(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { agreementId } = body as { agreementId?: string };

  if (!agreementId || typeof agreementId !== "string") {
    return NextResponse.json({ error: "agreementId is required" }, { status: 400 });
  }

  const agreement = await expireAgreement(agreementId);
  return NextResponse.json({ agreement });
}

// ── Input validation ────────────────────────────────────────────────────────

const VALID_AGREEMENT_TYPES = new Set(["CUSTOM_BUNDLE"]);
const VALID_POLICIES = new Set(["HARD_CAP", "SOFT_CAP", "ADVISORY"]);

function validateCreateInput(
  body: any,
  orgId: string,
): { input: Parameters<typeof createAgreement>[0] | null; error: string | null } {
  const {
    agreementType,
    monthlyPriceCents,
    currency,
    effectiveFrom,
    effectiveTo,
    note,
    includedModuleKeys,
    usageLimits,
  } = body ?? {};

  if (!agreementType || !VALID_AGREEMENT_TYPES.has(agreementType)) {
    return { input: null, error: `Invalid agreementType. Valid: ${[...VALID_AGREEMENT_TYPES].join(", ")}` };
  }

  if (typeof monthlyPriceCents !== "number" || monthlyPriceCents < 0) {
    return { input: null, error: "monthlyPriceCents must be a non-negative integer" };
  }

  if (!currency || typeof currency !== "string") {
    return { input: null, error: "currency is required" };
  }

  if (!effectiveFrom) {
    return { input: null, error: "effectiveFrom is required (ISO date string)" };
  }

  if (!Array.isArray(includedModuleKeys) || includedModuleKeys.length === 0) {
    return { input: null, error: "includedModuleKeys must be a non-empty array of module keys" };
  }

  for (const key of includedModuleKeys) {
    if (!MODULE_KEYS.includes(key as ModuleKey)) {
      return { input: null, error: `Invalid moduleKey: ${key}` };
    }
  }

  let parsedUsageLimits: CreateUsageLimitInput[] | undefined;
  if (usageLimits) {
    if (!Array.isArray(usageLimits)) {
      return { input: null, error: "usageLimits must be an array" };
    }
    parsedUsageLimits = [];
    for (const ul of usageLimits) {
      if (!ul.metricKey || typeof ul.includedQuantity !== "number") {
        return { input: null, error: "Each usage limit requires metricKey and includedQuantity" };
      }
      if (ul.policy && !VALID_POLICIES.has(ul.policy)) {
        return { input: null, error: `Invalid policy: ${ul.policy}` };
      }
      parsedUsageLimits.push({
        metricKey: ul.metricKey as UsageLimitMetricKey,
        includedQuantity: ul.includedQuantity,
        policy: (ul.policy ?? "SOFT_CAP") as UsageLimitPolicy,
        overagePriceCents: ul.overagePriceCents ?? null,
        overageCurrency: ul.overageCurrency ?? null,
      });
    }
  }

  return {
    error: null,
    input: {
      organizationId: orgId,
      agreementType: agreementType as AgreementType,
      monthlyPriceCents,
      currency,
      effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      note: note ?? undefined,
      includedModuleKeys: includedModuleKeys as ModuleKey[],
      usageLimits: parsedUsageLimits,
    },
  };
}
