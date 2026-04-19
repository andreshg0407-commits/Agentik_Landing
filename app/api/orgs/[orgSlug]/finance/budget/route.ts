/**
 * GET  /api/orgs/[orgSlug]/finance/budget?year=2026
 *   → list all Budget rows for the org + year
 *
 * POST /api/orgs/[orgSlug]/finance/budget
 *   body: { year, month?, quarter?, periodType, dimension, dimensionKey,
 *            dimensionLabel, category, amount, currency?, notes? }
 *   → upsert (create or replace) a budget target
 *
 * DELETE /api/orgs/[orgSlug]/finance/budget/:id  (handled by [budgetId]/route.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { BudgetPeriod, BudgetDimension } from "@prisma/client";

const VALID_PERIODS:    Set<string> = new Set(Object.values(BudgetPeriod));
const VALID_DIMENSIONS: Set<string> = new Set(Object.values(BudgetDimension));
const VALID_CATEGORIES = new Set(["revenue", "cogs", "opex", "payroll", "capex", "marketing"]);

export async function GET(
  req: NextRequest,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const year = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()), 10);
    if (!isFinite(year)) return NextResponse.json({ error: "Invalid year" }, { status: 400 });

    const rows = await prisma.budget.findMany({
      where: { organizationId: organization.id, year },
      orderBy: [{ dimension: "asc" }, { dimensionKey: "asc" }, { category: "asc" }],
    });

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireOrgAccess(params.orgSlug);
    const body = await req.json();

    const {
      year, month = null, quarter = null,
      periodType, dimension, dimensionKey = "total",
      dimensionLabel = "Total",
      category = "revenue",
      amount, currency = "COP", notes = null,
    } = body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!year || typeof year !== "number")               return NextResponse.json({ error: "year required" },        { status: 400 });
    if (!VALID_PERIODS.has(periodType))                  return NextResponse.json({ error: "invalid periodType" },   { status: 400 });
    if (!VALID_DIMENSIONS.has(dimension))                return NextResponse.json({ error: "invalid dimension" },    { status: 400 });
    if (!VALID_CATEGORIES.has(category))                 return NextResponse.json({ error: "invalid category" },     { status: 400 });
    if (typeof amount !== "number" || !isFinite(amount)) return NextResponse.json({ error: "invalid amount" },       { status: 400 });
    if (amount < 0)                                       return NextResponse.json({ error: "amount must be >= 0" }, { status: 400 });

    const row = await prisma.budget.upsert({
      where: {
        organizationId_year_month_quarter_periodType_dimension_dimensionKey_category: {
          organizationId: organization.id,
          year,
          month,
          quarter,
          periodType,
          dimension,
          dimensionKey,
          category,
        },
      },
      create: {
        organizationId: organization.id,
        year, month, quarter, periodType,
        dimension, dimensionKey, dimensionLabel,
        category, amount, currency,
        notes, createdBy: user.email ?? "",
      },
      update: {
        dimensionLabel, amount, currency, notes,
      },
    });

    return NextResponse.json({ ok: true, data: row }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
