import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "./city-resolver";
import { isReceivableDataCertified, warmTruthStatusCache } from "@/lib/comercial/frontline/receivable-truth-status";
import { fetchCertifiedArSnapshot } from "@/lib/comercial/frontline/canonical-ar-service";
import type { CertifiedCustomerReceivableSnapshot, CertifiedArSnapshot } from "@/lib/comercial/frontline/canonical-ar-types";
import { resolveRowCartera, loadArContextCore } from "./clientes-pure";
import type { ArDataState, ClienteCarteraState } from "./clientes-pure";

// Re-export pure types and functions for consumers
export { resolveRowCartera } from "./clientes-pure";
export type { ArDataState, ClienteCarteraState } from "./clientes-pure";

// ── Types ────────────────────────────────────────────────────────────────────

/** Pre-loaded AR context — call loadArContext() once, pass to both loaders */
export interface ArContext {
  dataState: ArDataState;
  snapshot: CertifiedArSnapshot | null;
  arLookup: Map<number, CertifiedCustomerReceivableSnapshot>;
  arCustomerIds: Set<number>;
  /** IDs of customers with overdue balances (totalVencido > 0) */
  overdueCustomerIds: Set<number>;
  asOf: string;
  reason: string;
}

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
  /** Null when UNVERIFIED — certified 0 when CERTIFIED_ZERO */
  totalReceivable: number | null;
  /** Null when UNVERIFIED — certified 0 when CERTIFIED_ZERO */
  overdueReceivable: number | null;
  /** Truth state from canonical AR snapshot */
  carteraState: ClienteCarteraState;
}

export interface ClientesSummary {
  total: number;
  active: number;
  inactive: number;
  withSeller: number;
  /** Null when UNAVAILABLE/UNVERIFIED — reconciled count of profiles with open AR */
  withCartera: number | null;
  /** Null when UNAVAILABLE/UNVERIFIED — reconciled count of profiles with overdue AR */
  withOverdue: number | null;
  sinCompra90d: number;  // lastPurchaseAt > 90 days ago
  withCrm: number;       // crmId IS NOT NULL
  /** AR data availability state */
  dataState: ArDataState;
  /** Timestamp of the AR snapshot (null when unavailable) */
  arAsOf: string | null;
  /** True when the entire loader failed (DB down) — all KPIs unreliable */
  loadFailed: boolean;
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
  /** AR data state — propagated so the UI can disable cartera filter when unavailable */
  dataState: ArDataState;
}

// ── AR Context loader (call once, share between summary + page) ─────────────

export async function loadArContext(organizationId: string): Promise<ArContext> {
  await warmTruthStatusCache();
  // Delegate to testable core logic with real infra deps
  const ctx = await loadArContextCore(organizationId, {
    isCertified: (orgId) => isReceivableDataCertified(orgId),
    fetchSnapshot: () => fetchCertifiedArSnapshot() as any,
  });
  // Cast to ArContext (full snapshot type is compatible)
  return ctx as ArContext;
}

// ── Summary loader (KPIs only, no rows) ──────────────────────────────────────

export async function loadClientesSummary(
  organizationId: string,
  arCtx: ArContext,
): Promise<ClientesSummary> {
  const db = prisma as any;
  const t0 = performance.now();

  try {
    // Base profile counts (NO receivable fields — those come from canonical AR)
    interface AggRow {
      total: bigint;
      active: bigint;
      inactive: bigint;
      with_seller: bigint;
      sin_compra_90d: bigint;
      with_crm: bigint;
    }
    const agg: AggRow[] = await db.$queryRawUnsafe(`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active,
        COUNT(*) FILTER (WHERE status = 'INACTIVE')::bigint AS inactive,
        COUNT(*) FILTER (WHERE "sellerName" IS NOT NULL AND "sellerName" <> '')::bigint AS with_seller,
        COUNT(*) FILTER (WHERE "lastPurchaseAt" IS NOT NULL AND "lastPurchaseAt" < NOW() - INTERVAL '90 days')::bigint AS sin_compra_90d,
        COUNT(*) FILTER (WHERE "crmId" IS NOT NULL)::bigint AS with_crm
      FROM "CustomerProfile"
      WHERE "organizationId" = $1
    `, organizationId);

    const row = agg[0];
    const total = Number(row.total);
    const active = Number(row.active);
    const withSeller = Number(row.with_seller);

    // Cartera KPIs — reconciled intersection of AR snapshot with CustomerProfile
    let withCartera: number | null = null;
    let withOverdue: number | null = null;

    if (arCtx.dataState === "CERTIFIED" && arCtx.arCustomerIds.size > 0) {
      // Count CustomerProfile rows whose sagTerceroId appears in the AR snapshot
      // This ensures summary.withCartera === totalFiltered for con_cartera filter
      const carteraIds = [...arCtx.arCustomerIds];
      const overdueIds = [...arCtx.overdueCustomerIds];

      // Use COUNT(DISTINCT sagTerceroId) to avoid inflating KPIs from duplicate profiles
      const [carteraAgg, overdueAgg] = await Promise.all([
        db.$queryRawUnsafe(`
          SELECT COUNT(DISTINCT "sagTerceroId")::bigint AS cnt
          FROM "CustomerProfile"
          WHERE "organizationId" = $1
            AND "sagTerceroId" = ANY($2::int[])
        `, organizationId, carteraIds) as Promise<{ cnt: bigint }[]>,
        overdueIds.length > 0
          ? db.$queryRawUnsafe(`
              SELECT COUNT(DISTINCT "sagTerceroId")::bigint AS cnt
              FROM "CustomerProfile"
              WHERE "organizationId" = $1
                AND "sagTerceroId" = ANY($2::int[])
            `, organizationId, overdueIds) as Promise<{ cnt: bigint }[]>
          : Promise.resolve([{ cnt: BigInt(0) }] as { cnt: bigint }[]),
      ]);

      withCartera = Number(carteraAgg[0].cnt);
      withOverdue = Number(overdueAgg[0].cnt);
    } else if (arCtx.dataState === "CERTIFIED") {
      // Certified but zero customers with open AR
      withCartera = 0;
      withOverdue = 0;
    }
    // UNVERIFIED/UNAVAILABLE → withCartera/withOverdue stay null

    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`[PERF][CLIENTES] summary ${elapsed}ms — total=${total} active=${active} withSeller=${withSeller} dataState=${arCtx.dataState} withCartera=${withCartera} withOverdue=${withOverdue}`);

    return {
      total,
      active,
      inactive: Number(row.inactive),
      withSeller,
      withCartera,
      withOverdue,
      sinCompra90d: Number(row.sin_compra_90d),
      withCrm: Number(row.with_crm),
      dataState: arCtx.dataState,
      arAsOf: arCtx.dataState === "CERTIFIED" ? arCtx.asOf : null,
      loadFailed: false,
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[PERF][CLIENTES][ERROR] summary failed:", err);
    return {
      total: 0, active: 0, inactive: 0,
      withSeller: 0, withCartera: null, withOverdue: null, sinCompra90d: 0, withCrm: 0,
      dataState: "UNAVAILABLE",
      arAsOf: null,
      loadFailed: true,
      loadedAt: new Date().toISOString(),
    };
  }
}

// ── Paginated page loader ────────────────────────────────────────────────────

export async function loadClientesPage(
  organizationId: string,
  params: ClientesPageParams = {},
  arCtx: ArContext,
): Promise<ClientesPageResult> {
  const db = prisma as any;
  const t0 = performance.now();

  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);
  const search = (params.search ?? "").trim();
  const filter = params.filter ?? "todos";

  try {
    // ── For con_cartera filter: get sagTerceroIds that have open AR ────
    let carteraSagIds: number[] | null = null;
    if (filter === "con_cartera") {
      if (arCtx.dataState !== "CERTIFIED" || arCtx.arCustomerIds.size === 0) {
        // No certified AR data → empty results (not a false certified-empty)
        return { clients: [], totalFiltered: 0, page: 1, pageSize, totalPages: 1, dataState: arCtx.dataState };
      }
      carteraSagIds = [...arCtx.arCustomerIds];
    }

    // ── Build Prisma WHERE ─────────────────────────────────────────────
    const where = buildPrismaWhere(organizationId, filter, search, carteraSagIds);

    // ── Count total matching rows ───────────────────────────────────────
    const totalFiltered = await db.customerProfile.count({ where });
    const totalPages = Math.max(Math.ceil(totalFiltered / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * pageSize;

    // ── Fetch page rows ─────────────────────────────────────────────────
    const profiles = await db.customerProfile.findMany({
      where,
      select: {
        id: true, name: true, legalName: true, nit: true, erpId: true,
        city: true, department: true,
        sellerName: true, status: true, customerType: true, segment: true,
        lastPurchaseAt: true, sagTerceroId: true,
      },
      orderBy: { name: "asc" },
      take: pageSize,
      skip,
    });

    // ── Map to ClienteRow with canonical AR ───────────────────────────
    const clients: ClienteRow[] = profiles.map((p: any) => {
      const resolvedCity = p.city ? resolveCity(p.city) : null;
      const cartera = resolveRowCartera(arCtx, p.sagTerceroId);

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
        ...cartera,
      };
    });

    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`[PERF][CLIENTES] page ${elapsed}ms — page=${safePage}/${totalPages} rows=${clients.length} totalFiltered=${totalFiltered} dataState=${arCtx.dataState}`);

    return { clients, totalFiltered, page: safePage, pageSize, totalPages, dataState: arCtx.dataState };
  } catch (err) {
    console.error("[PERF][CLIENTES][ERROR] page load failed:", err);
    return { clients: [], totalFiltered: 0, page: 1, pageSize, totalPages: 1, dataState: arCtx.dataState };
  }
}

// ── Row-level cartera resolution ─────────────────────────────────────────────
// resolveRowCartera is imported from and re-exported via ./clientes-pure.ts

// ── Prisma WHERE builder ──────────────────────────────────────────────────────

function buildPrismaWhere(
  organizationId: string,
  filter: string,
  search: string,
  /** For con_cartera: sagTerceroIds from canonical AR snapshot. Null = filter not active. */
  carteraSagIds: number[] | null = null,
) {
  const where: any = { organizationId };

  if (filter === "activos") {
    where.status = "ACTIVE";
  } else if (filter === "inactivos") {
    where.status = "INACTIVE";
  } else if (filter === "con_cartera") {
    // Filter by canonical AR: only show customers whose sagTerceroId is in the AR snapshot
    if (carteraSagIds && carteraSagIds.length > 0) {
      where.sagTerceroId = { in: carteraSagIds };
    } else {
      where.id = "___IMPOSSIBLE___";
    }
  } else if (filter === "con_vendedor") {
    where.sellerName = { not: null };
  } else if (filter === "sin_compra_90d") {
    const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    // Only customers WITH a lastPurchaseAt that is older than 90d
    // lastPurchaseAt=null means unknown purchase date, not "no purchase in 90d"
    where.lastPurchaseAt = { not: null, lt: d90 };
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
    where.AND = [...(where.AND ?? []), { OR: searchOr }];
  }

  return where;
}
