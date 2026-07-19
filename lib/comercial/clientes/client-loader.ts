import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity, resolveCrmCity } from "./city-resolver";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClienteRow {
  id: string;
  name: string;
  nit: string | null;
  city: string | null;
  sellerName: string | null;
  sellerConfidence: number; // 0-100, from CRM quote history
  status: string;
  segment: string | null;
  lastPurchaseAt: string | null; // ISO
  totalSalesL12: number;
  totalReceivable: number;
  overdueReceivable: number;
}

export interface ClientesSummary {
  total: number;
  active: number;
  inactive: number;
  prospect: number;
  withSeller: number;
  withOverdue: number;
  loadedAt: string;
}

export interface ClientesPageParams {
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: "todos" | "activos" | "con_cartera" | "con_vendedor";
}

export interface ClientesPageResult {
  clients: ClienteRow[];
  totalFiltered: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Summary loader (KPIs only, no rows) ──────────────────────────────────────

export async function loadClientesSummary(organizationId: string): Promise<ClientesSummary> {
  const db = prisma as any;
  const t0 = performance.now();

  try {
    interface AggRow {
      total: bigint;
      active: bigint;
      inactive: bigint;
      prospect: bigint;
      with_overdue: bigint;
    }
    const agg: AggRow[] = await db.$queryRawUnsafe(`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active,
        COUNT(*) FILTER (WHERE status = 'INACTIVE')::bigint AS inactive,
        COUNT(*) FILTER (WHERE status = 'PROSPECT')::bigint AS prospect,
        COUNT(*) FILTER (WHERE "overdueReceivable" > 0)::bigint AS with_overdue
      FROM "CustomerProfile"
      WHERE "organizationId" = $1
    `, organizationId);

    const row = agg[0];
    const total = Number(row.total);
    const active = Number(row.active);

    // withSeller: count profiles that have a seller resolved via CRM quotes
    // This is lightweight — count distinct billing_account_ids in CRM quotes
    // that match profile crmIds and have a seller with confidence >= 60%
    // For summary KPI, we approximate: profiles with crmId that have any CRM quote
    let withSeller = 0;
    try {
      interface SellerRow { count: bigint }
      const sellerAgg: SellerRow[] = await db.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT cp."id")::bigint AS count
        FROM "CustomerProfile" cp
        WHERE cp."organizationId" = $1
          AND cp."crmId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "CRMQuote" cq
            WHERE cq."organizationId" = $1
              AND cq."sellerName" IS NOT NULL
              AND cq."rawCrmJson"->'raw'->>'billing_account_id' = cp."crmId"
          )
      `, organizationId);
      withSeller = Number(sellerAgg[0]?.count ?? 0);
    } catch {
      // Non-fatal — KPI will show 0
    }

    const ms = (performance.now() - t0).toFixed(1);
    console.log(`[PERF][CLIENTES] summary ${ms}ms — total=${total} active=${active} withSeller=${withSeller} rawJsonLoaded=false`);

    return {
      total,
      active,
      inactive: Number(row.inactive),
      prospect: Number(row.prospect),
      withSeller,
      withOverdue: Number(row.with_overdue),
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[PERF][CLIENTES][ERROR] summary failed:", err);
    return {
      total: 0, active: 0, inactive: 0, prospect: 0,
      withSeller: 0, withOverdue: 0,
      loadedAt: new Date().toISOString(),
    };
  }
}

// ── Paginated page loader ────────────────────────────────────────────────────

export async function loadClientesPage(
  organizationId: string,
  params: ClientesPageParams = {},
): Promise<ClientesPageResult> {
  const db = prisma as any;
  const t0 = performance.now();

  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);
  const search = (params.search ?? "").trim();
  const filter = params.filter ?? "todos";

  try {
    // ── Build WHERE conditions ──────────────────────────────────────────
    const conditions: string[] = ['"organizationId" = $1'];
    const queryParams: any[] = [organizationId];
    let paramIdx = 2;

    // Filter
    if (filter === "activos") {
      conditions.push(`status = 'ACTIVE'`);
    } else if (filter === "con_cartera") {
      conditions.push(`"overdueReceivable" > 0`);
    }
    // con_vendedor handled after join below

    // Search (name or NIT — DB-level ILIKE)
    if (search) {
      conditions.push(`(name ILIKE $${paramIdx} OR COALESCE(nit, '') ILIKE $${paramIdx})`);
      queryParams.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    // ── Count total matching rows ───────────────────────────────────────
    interface CountRow { count: bigint }

    let totalFiltered: number;
    if (filter === "con_vendedor") {
      // Special case: need CRM quote join for seller filter
      const countRows: CountRow[] = await db.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT cp.id)::bigint AS count
        FROM "CustomerProfile" cp
        WHERE ${whereClause}
          AND cp."crmId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "CRMQuote" cq
            WHERE cq."organizationId" = $1
              AND cq."sellerName" IS NOT NULL
              AND cq."rawCrmJson"->'raw'->>'billing_account_id' = cp."crmId"
          )
      `, ...queryParams);
      totalFiltered = Number(countRows[0]?.count ?? 0);
    } else {
      const countRows: CountRow[] = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS count FROM "CustomerProfile" WHERE ${whereClause}`,
        ...queryParams,
      );
      totalFiltered = Number(countRows[0]?.count ?? 0);
    }

    const totalPages = Math.max(Math.ceil(totalFiltered / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * pageSize;

    // ── Fetch page rows (NO rawCrmJson) ─────────────────────────────────
    let profiles: any[];

    if (filter === "con_vendedor") {
      // Fetch profiles that have seller via CRM quote join
      interface ProfileRow {
        id: string; name: string; nit: string | null; city: string | null;
        crmId: string | null; sellerName: string | null; status: string;
        segment: string | null; lastPurchaseAt: Date | null;
        totalSalesL12: any; totalReceivable: any; overdueReceivable: any;
      }
      profiles = await db.$queryRawUnsafe(`
        SELECT cp.id, cp.name, cp.nit, cp.city, cp."crmId", cp."sellerName",
               cp.status, cp.segment, cp."lastPurchaseAt",
               cp."totalSalesL12", cp."totalReceivable", cp."overdueReceivable"
        FROM "CustomerProfile" cp
        WHERE ${whereClause}
          AND cp."crmId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "CRMQuote" cq
            WHERE cq."organizationId" = $1
              AND cq."sellerName" IS NOT NULL
              AND cq."rawCrmJson"->'raw'->>'billing_account_id' = cp."crmId"
          )
        ORDER BY cp.name ASC
        LIMIT ${pageSize} OFFSET ${skip}
      `, ...queryParams);
    } else {
      profiles = await db.customerProfile.findMany({
        where: buildPrismaWhere(organizationId, filter, search),
        select: {
          id: true, name: true, nit: true, city: true, crmId: true,
          sellerName: true, status: true, segment: true, lastPurchaseAt: true,
          totalSalesL12: true, totalReceivable: true, overdueReceivable: true,
          // NO rawCrmJson — this was causing the timeout (76 MB transfer)
        },
        orderBy: { name: "asc" },
        take: pageSize,
        skip,
      });
    }

    // ── CRM city resolution (targeted JSON path query, no full blob) ────
    const profileIds = profiles.map((p: any) => p.id);
    const crmCityMap = await loadCrmCities(db, organizationId, profileIds);

    // ── Seller linking (only for this page's crmIds) ────────────────────
    const pageCrmIds = profiles
      .filter((p: any) => p.crmId)
      .map((p: any) => p.crmId as string);
    const sellerMap = await loadSellerMap(db, organizationId, pageCrmIds);

    // ── Map to ClienteRow ───────────────────────────────────────────────
    const clients: ClienteRow[] = profiles.map((p: any) => {
      const resolvedCity = resolveCity(p.city) ?? resolveCrmCity(crmCityMap.get(p.id) ?? null);
      const sellerResult = resolveSeller(p.crmId, sellerMap);
      return {
        id: p.id,
        name: p.name,
        nit: p.nit,
        city: resolvedCity,
        sellerName: sellerResult.name,
        sellerConfidence: sellerResult.confidence,
        status: p.status,
        segment: p.segment,
        lastPurchaseAt: p.lastPurchaseAt instanceof Date
          ? p.lastPurchaseAt.toISOString()
          : (p.lastPurchaseAt ?? null),
        totalSalesL12: Number(p.totalSalesL12 ?? 0),
        totalReceivable: Number(p.totalReceivable ?? 0),
        overdueReceivable: Number(p.overdueReceivable ?? 0),
      };
    });

    const ms = (performance.now() - t0).toFixed(1);
    console.log(`[PERF][CLIENTES] page ${ms}ms — page=${safePage}/${totalPages} rows=${clients.length} totalFiltered=${totalFiltered} rawJsonLoaded=false`);

    return { clients, totalFiltered, page: safePage, pageSize, totalPages };
  } catch (err) {
    console.error("[PERF][CLIENTES][ERROR] page load failed:", err);
    return { clients: [], totalFiltered: 0, page: 1, pageSize, totalPages: 1 };
  }
}

// ── CRM city loader (targeted JSON path, NOT full rawCrmJson) ────────────────

async function loadCrmCities(
  db: any,
  organizationId: string,
  profileIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (profileIds.length === 0) return result;

  try {
    interface CityRow { id: string; crm_city: string | null }
    const rows: CityRow[] = await db.$queryRawUnsafe(`
      SELECT id,
             "rawCrmJson"->'raw'->>'billing_address_city' AS crm_city
      FROM "CustomerProfile"
      WHERE "organizationId" = $1
        AND id = ANY($2::text[])
        AND "rawCrmJson" IS NOT NULL
    `, organizationId, profileIds);

    for (const row of rows) {
      if (row.crm_city) result.set(row.id, row.crm_city);
    }
  } catch {
    // Non-fatal — city resolution will fall back to profile.city only
  }

  return result;
}

// ── Seller linking (scoped to page crmIds only) ──────────────────────────────

async function loadSellerMap(
  db: any,
  organizationId: string,
  crmIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (crmIds.length === 0) return result;

  try {
    interface QuoteRow { billing_id: string; seller: string }
    const rows: QuoteRow[] = await db.$queryRawUnsafe(`
      SELECT
        "rawCrmJson"->'raw'->>'billing_account_id' AS billing_id,
        "sellerName" AS seller
      FROM "CRMQuote"
      WHERE "organizationId" = $1
        AND "sellerName" IS NOT NULL
        AND "rawCrmJson"->'raw'->>'billing_account_id' = ANY($2::text[])
    `, organizationId, crmIds);

    for (const row of rows) {
      if (!row.billing_id || !row.seller) continue;
      const sellers = result.get(row.billing_id) ?? new Map<string, number>();
      sellers.set(row.seller, (sellers.get(row.seller) ?? 0) + 1);
      result.set(row.billing_id, sellers);
    }
  } catch {
    // Non-fatal — seller column will show "—"
  }

  return result;
}

function resolveSeller(
  crmId: string | null,
  sellerMap: Map<string, Map<string, number>>,
): { name: string | null; confidence: number } {
  if (!crmId) return { name: null, confidence: 0 };
  const sellers = sellerMap.get(crmId);
  if (!sellers || sellers.size === 0) return { name: null, confidence: 0 };
  const total = [...sellers.values()].reduce((a, b) => a + b, 0);
  const sorted = [...sellers.entries()].sort((a, b) => b[1] - a[1]);
  const [topSeller, topCount] = sorted[0];
  const confidence = Math.round((topCount / total) * 100);
  return confidence >= 60 ? { name: topSeller, confidence } : { name: null, confidence };
}

// ── Prisma WHERE builder (for non-con_vendedor filters) ──────────────────────

function buildPrismaWhere(
  organizationId: string,
  filter: string,
  search: string,
) {
  const where: any = { organizationId };

  if (filter === "activos") {
    where.status = "ACTIVE";
  } else if (filter === "con_cartera") {
    where.overdueReceivable = { gt: 0 };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { nit: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}
