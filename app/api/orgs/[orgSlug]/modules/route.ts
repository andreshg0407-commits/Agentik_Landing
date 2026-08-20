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
import { getAgreementForMonth } from "@/lib/tenant/commercial-agreement-service";
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

  // Read platform authority from User table (backward-compatible).
  // Only suppress P2022 (column not found). All other errors propagate.
  let platformRole: "SUPER_ADMIN" | "AGENTIK_ADMIN" | null = null;
  try {
    const u = await (prisma as any).user.findUnique({
      where: { id: user.id },
      select: { platformRole: true },
    });
    const pr = u?.platformRole as string | null | undefined;
    if (pr === "SUPER_ADMIN" || pr === "AGENTIK_ADMIN") platformRole = pr;
  } catch (err: unknown) {
    const isColumnMissing =
      (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2022") ||
      (typeof err === "object" && err !== null && "message" in err &&
        String((err as { message: string }).message).includes("platformRole") &&
        String((err as { message: string }).message).includes("does not exist"));
    if (!isColumnMissing) throw err;
  }

  return { userId: user.id, orgId: org.id, role: membership.role, platformRole };
}

// ── GET — entitlements + billing preview ─────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveOrg(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only platform users can view entitlements (User.platformRole, NOT Membership.role)
  if (ctx.platformRole !== "SUPER_ADMIN" && ctx.platformRole !== "AGENTIK_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") ?? undefined;
  const [entitlements, agreement] = await Promise.all([
    getEntitlements(ctx.orgId),
    getAgreementForMonth(ctx.orgId, period ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`),
  ]);
  const billingPreview = buildPreviewFromEntitlements(ctx.orgId, entitlements, period, agreement);

  return NextResponse.json({ entitlements, billingPreview });
}

// ── PATCH — activate / deactivate / update price ─────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;
  const ctx = await resolveOrg(orgSlug);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only platform users can modify entitlements (User.platformRole, NOT Membership.role)
  if (ctx.platformRole !== "SUPER_ADMIN" && ctx.platformRole !== "AGENTIK_ADMIN") {
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
