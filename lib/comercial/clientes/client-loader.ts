import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "./city-resolver";
import { isReceivableDataCertified, warmTruthStatusCache } from "@/lib/comercial/frontline/receivable-truth-status";
import { fetchCertifiedArSnapshot } from "@/lib/comercial/frontline/canonical-ar-service";
import type { CertifiedCustomerReceivableSnapshot, CertifiedArSnapshot } from "@/lib/comercial/frontline/canonical-ar-types";
import { resolveRowCartera, loadArContextCore, loadClientesSummaryCoreLogic, resolveConCarteraFilter } from "./clientes-pure";
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
  /** True when the page loader failed (DB down) — rows unreliable */
  loadFailed: boolean;
}

// ── AR Context loader (call once, share between summary + page) ─────────────

export async function loadArContext(organizationId: string): Promise<ArContext> {
  // warmTruthStatusCache may throw (e.g. Prisma connection down) — fail-closed
  try {
    await warmTruthStatusCache();
  } catch (err: any) {
    console.error("[CLIENTES] warmTruthStatusCache failed:", err?.message);
    return {
      dataState: "UNAVAILABLE",
      snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set(),
      overdueCustomerIds: new Set(),
      asOf: new Date().toISOString(),
      reason: `WARM_CACHE_FAILED: ${err?.message ?? "UNKNOWN"}`,
    };
  }
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

  // Delegate ALL decision logic to the tested core function
  const coreResult = await loadClientesSummaryCoreLogic(organizationId, arCtx as any, {
    queryProfileAgg: async (orgId) => {
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
      `, orgId);
      const row = agg[0];
      return {
        total: Number(row.total),
        active: Number(row.active),
        inactive: Number(row.inactive),
        withSeller: Number(row.with_seller),
        sinCompra90d: Number(row.sin_compra_90d),
        withCrm: Number(row.with_crm),
      };
    },
    countDistinctProfiles: async (orgId, sagIds) => {
      const result: { cnt: bigint }[] = await db.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT "sagTerceroId")::bigint AS cnt
        FROM "CustomerProfile"
        WHERE "organizationId" = $1
          AND "sagTerceroId" = ANY($2::int[])
      `, orgId, sagIds);
      return Number(result[0].cnt);
    },
  });

  const elapsed = (performance.now() - t0).toFixed(1);
  console.log(`[PERF][CLIENTES] summary ${elapsed}ms — total=${coreResult.total} active=${coreResult.active} withSeller=${coreResult.withSeller} dataState=${coreResult.dataState} withCartera=${coreResult.withCartera} withOverdue=${coreResult.withOverdue}`);

  return {
    ...coreResult,
    loadedAt: new Date().toISOString(),
  };
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
    // ── For con_cartera filter: delegate to tested guard ────────────────
    let carteraSagIds: number[] | null = null;
    if (filter === "con_cartera") {
      const carteraGuard = resolveConCarteraFilter(arCtx);
      if (!carteraGuard.allowed) {
        // Not certified or empty snapshot — explicit state, not certified-empty
        return { clients: [], totalFiltered: 0, page: 1, pageSize, totalPages: 1, dataState: carteraGuard.dataState, loadFailed: false };
      }
      carteraSagIds = carteraGuard.sagIds;
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

    return { clients, totalFiltered, page: safePage, pageSize, totalPages, dataState: arCtx.dataState, loadFailed: false };
  } catch (err) {
    console.error("[PERF][CLIENTES][ERROR] page load failed:", err);
    return { clients: [], totalFiltered: 0, page: 1, pageSize, totalPages: 1, dataState: "UNAVAILABLE", loadFailed: true };
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
