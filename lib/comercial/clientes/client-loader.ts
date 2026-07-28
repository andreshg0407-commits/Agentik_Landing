import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "./city-resolver";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClienteRow {
  id: string;
  name: string;
  legalName: string | null;
  nit: string | null;
  erpId: string | null;       // CODIGO_CLIENTE from SAG
  city: string | null;
  department: string | null;
  sellerName: string | null;
  status: string;
  customerType: string | null; // TIPO_CLIENTE from SAG
  segment: string | null;      // CANAL_CLIENTE from SAG
  lastPurchaseAt: string | null; // ISO — FECHA_ULTIMA_COMPRA from SAG
  totalReceivable: number;
  overdueReceivable: number;
}

export interface ClientesSummary {
  total: number;
  active: number;
  inactive: number;
  withSeller: number;
  withCartera: number;   // totalReceivable > 0 (SAG SALDO_CARTERA)
  withOverdue: number;   // overdueReceivable > 0 (denormalized from receivables sync)
  sinCompra90d: number;  // lastPurchaseAt > 90 days ago or null
  withCrm: number;       // crmId IS NOT NULL
  loadedAt: string;
}

export interface ClientesPageParams {
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: "todos" | "activos" | "inactivos" | "con_cartera" | "con_vendedor" | "sin_compra_90d" | "con_crm" | "sin_crm";
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
      with_seller: bigint;
      with_cartera: bigint;
      with_overdue: bigint;
      sin_compra_90d: bigint;
      with_crm: bigint;
    }
    const agg: AggRow[] = await db.$queryRawUnsafe(`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active,
        COUNT(*) FILTER (WHERE status = 'INACTIVE')::bigint AS inactive,
        COUNT(*) FILTER (WHERE "sellerName" IS NOT NULL AND "sellerName" <> '')::bigint AS with_seller,
        COUNT(*) FILTER (WHERE "totalReceivable" > 0)::bigint AS with_cartera,
        COUNT(*) FILTER (WHERE "overdueReceivable" > 0)::bigint AS with_overdue,
        COUNT(*) FILTER (WHERE "lastPurchaseAt" IS NULL OR "lastPurchaseAt" < NOW() - INTERVAL '90 days')::bigint AS sin_compra_90d,
        COUNT(*) FILTER (WHERE "crmId" IS NOT NULL)::bigint AS with_crm
      FROM "CustomerProfile"
      WHERE "organizationId" = $1
    `, organizationId);

    const row = agg[0];
    const total = Number(row.total);
    const active = Number(row.active);
    const withSeller = Number(row.with_seller);

    const ms = (performance.now() - t0).toFixed(1);
    console.log(`[PERF][CLIENTES] summary ${ms}ms — total=${total} active=${active} withSeller=${withSeller}`);

    return {
      total,
      active,
      inactive: Number(row.inactive),
      withSeller,
      withCartera: Number(row.with_cartera),
      withOverdue: Number(row.with_overdue),
      sinCompra90d: Number(row.sin_compra_90d),
      withCrm: Number(row.with_crm),
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[PERF][CLIENTES][ERROR] summary failed:", err);
    return {
      total: 0, active: 0, inactive: 0,
      withSeller: 0, withCartera: 0, withOverdue: 0, sinCompra90d: 0, withCrm: 0,
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
    } else if (filter === "inactivos") {
      conditions.push(`status = 'INACTIVE'`);
    } else if (filter === "con_cartera") {
      conditions.push(`"totalReceivable" > 0`);
    } else if (filter === "con_vendedor") {
      conditions.push(`"sellerName" IS NOT NULL AND "sellerName" <> ''`);
    } else if (filter === "sin_compra_90d") {
      conditions.push(`("lastPurchaseAt" IS NULL OR "lastPurchaseAt" < NOW() - INTERVAL '90 days')`);
    } else if (filter === "con_crm") {
      conditions.push(`"crmId" IS NOT NULL`);
    } else if (filter === "sin_crm") {
      conditions.push(`"crmId" IS NULL`);
    }

    // Search (name, NIT, erpId, email, phone — DB-level ILIKE)
    if (search) {
      conditions.push(`(name ILIKE $${paramIdx} OR COALESCE(nit, '') ILIKE $${paramIdx} OR COALESCE("erpId", '') ILIKE $${paramIdx} OR COALESCE(email, '') ILIKE $${paramIdx} OR COALESCE(phone, '') ILIKE $${paramIdx})`);
      queryParams.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    // ── Count total matching rows ───────────────────────────────────────
    interface CountRow { count: bigint }

    const countRows: CountRow[] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "CustomerProfile" WHERE ${whereClause}`,
      ...queryParams,
    );
    const totalFiltered = Number(countRows[0]?.count ?? 0);

    const totalPages = Math.max(Math.ceil(totalFiltered / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * pageSize;

    // ── Fetch page rows ─────────────────────────────────────────────────
    // City and sellerName are now populated directly from SAG vw_agentik_clientes.
    // No CRM quote JOINs needed — all data lives on CustomerProfile.
    const profiles = await db.customerProfile.findMany({
      where: buildPrismaWhere(organizationId, filter, search),
      select: {
        id: true, name: true, legalName: true, nit: true, erpId: true,
        city: true, department: true,
        sellerName: true, status: true, customerType: true, segment: true,
        lastPurchaseAt: true, totalReceivable: true, overdueReceivable: true,
      },
      orderBy: { name: "asc" },
      take: pageSize,
      skip,
    });

    // ── Map to ClienteRow ───────────────────────────────────────────────
    const clients: ClienteRow[] = profiles.map((p: any) => {
      const resolvedCity = p.city ? resolveCity(p.city) : null;
      return {
        id: p.id,
        name: p.name,
        legalName: p.legalName ?? null,
        nit: p.nit,
        erpId: p.erpId ?? null,
        city: resolvedCity ?? p.city,
        department: p.department ?? null,
        sellerName: p.sellerName ?? null,
        status: p.status,
        customerType: p.customerType ?? null,
        segment: p.segment,
        lastPurchaseAt: p.lastPurchaseAt instanceof Date
          ? p.lastPurchaseAt.toISOString()
          : (p.lastPurchaseAt ?? null),
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

// ── Prisma WHERE builder ──────────────────────────────────────────────────────

function buildPrismaWhere(
  organizationId: string,
  filter: string,
  search: string,
) {
  const where: any = { organizationId };

  if (filter === "activos") {
    where.status = "ACTIVE";
  } else if (filter === "inactivos") {
    where.status = "INACTIVE";
  } else if (filter === "con_cartera") {
    where.totalReceivable = { gt: 0 };
  } else if (filter === "con_vendedor") {
    where.sellerName = { not: null };
  } else if (filter === "sin_compra_90d") {
    const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    where.OR = [
      { lastPurchaseAt: null },
      { lastPurchaseAt: { lt: d90 } },
    ];
  } else if (filter === "con_crm") {
    where.crmId = { not: null };
  } else if (filter === "sin_crm") {
    where.crmId = null;
  }

  if (search) {
    const searchOr = [
      { name: { contains: search, mode: "insensitive" } },
      { nit: { contains: search, mode: "insensitive" } },
      { erpId: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
    // Merge with existing OR from filter (sin_compra_90d)
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  return where;
}
