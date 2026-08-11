/**
 * API: GET /api/orgs/[orgSlug]/modules
 *       — Returns module entitlements + billing preview for the org.
 *
 * API: PATCH /api/orgs/[orgSlug]/modules
 *       — Activate, deactivate, or update price. SUPER_ADMIN / AGENTIK_ADMIN only.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import { MembershipStatus } from "@prisma/client";
import { getEntitlements, activateModule, deactivateModule, updateModulePrice } from "@/lib/tenant/module-entitlements";
import { buildPreviewFromEntitlements } from "@/lib/tenant/billing-preview";
import type { ModuleKey } from "@/lib/tenant/modules";
import { MODULE_KEYS } from "@/lib/tenant/modules";

type RouteParams = { params: Promise<{ orgSlug: string }> };

async function resolveOrg(orgSlug: string) {
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
  if (!membership) return null;

  return { userId: user.id, orgId: org.id, role: membership.role };
}

// ── GET — entitlements + billing preview ─────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveOrg(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only SUPER_ADMIN and AGENTIK_ADMIN can view entitlements
  if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "AGENTIK_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") ?? undefined;
  const entitlements = await getEntitlements(ctx.orgId);
  const billingPreview = buildPreviewFromEntitlements(ctx.orgId, entitlements, period);

  return NextResponse.json({ entitlements, billingPreview });
}

// ── PATCH — activate / deactivate / update price ─────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveOrg(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only SUPER_ADMIN and AGENTIK_ADMIN can modify entitlements
  if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "AGENTIK_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { moduleKey, action, monthlyPriceCents, currency, note } = body as {
    moduleKey: string;
    action: "activate" | "deactivate" | "update_price";
    monthlyPriceCents?: number;
    currency?: string;
    note?: string;
  };

  // Validate moduleKey
  if (!MODULE_KEYS.includes(moduleKey as ModuleKey)) {
    return NextResponse.json({ error: `Invalid moduleKey: ${moduleKey}` }, { status: 400 });
  }

  const key = moduleKey as ModuleKey;

  if (action === "activate") {
    if (monthlyPriceCents == null || !currency) {
      return NextResponse.json(
        { error: "activate requires monthlyPriceCents and currency" },
        { status: 400 },
      );
    }
    const ent = await activateModule(ctx.orgId, key, {
      monthlyPriceCents,
      currency,
      note,
    });
    return NextResponse.json({ entitlement: ent });
  }

  if (action === "deactivate") {
    const ent = await deactivateModule(ctx.orgId, key);
    return NextResponse.json({ entitlement: ent });
  }

  if (action === "update_price") {
    if (monthlyPriceCents == null || !currency) {
      return NextResponse.json(
        { error: "update_price requires monthlyPriceCents and currency" },
        { status: 400 },
      );
    }
    const ent = await updateModulePrice(ctx.orgId, key, {
      monthlyPriceCents,
      currency,
      note,
    });
    return NextResponse.json({ entitlement: ent });
  }

  return NextResponse.json({ error: "Invalid action. Use: activate, deactivate, update_price" }, { status: 400 });
}
