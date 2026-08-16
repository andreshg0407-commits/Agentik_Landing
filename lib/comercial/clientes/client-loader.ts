import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "./city-resolver";
import { isReceivableDataCertified, warmTruthStatusCache } from "@/lib/comercial/frontline/receivable-truth-status";
import { fetchCertifiedArSnapshot } from "@/lib/comercial/frontline/canonical-ar-service";
import type { CertifiedCustomerReceivableSnapshot } from "@/lib/comercial/frontline/canonical-ar-types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ClienteCarteraState = "HAS_OPEN_AR" | "CERTIFIED_ZERO" | "UNVERIFIED";

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
  /** Count from canonical AR snapshot — 0 when UNVERIFIED */
  withCartera: number;
  /** Count from canonical AR snapshot — 0 when UNVERIFIED */
  withOverdue: number;
  sinCompra90d: number;  // lastPurchaseAt > 90 days ago
  withCrm: number;       // crmId IS NOT NULL
  /** Whether canonical AR data is available */
  arCertified: boolean;
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

  await warmTruthStatusCache();
  const arCertified = isReceivableDataCertified(organizationId);

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

    // Cartera KPIs from canonical AR snapshot (SAG vw_agentik_cartera)
    let withCartera = 0;
    let withOverdue = 0;
    if (arCertified) {
      const arResult = await fetchCertifiedArSnapshot();
      if (arResult.ok) {
        withCartera = arResult.snapshot.totalOpenCustomers;
        withOverdue = arResult.snapshot.totalOverdueCustomers;
      }
    }

    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`[PERF][CLIENTES] summary ${elapsed}ms — total=${total} active=${active} withSeller=${withSeller} arCertified=${arCertified} withCartera=${withCartera} withOverdue=${withOverdue}`);

    return {
      total,
      active,
      inactive: Number(row.inactive),
      withSeller,
      withCartera,
      withOverdue,
      sinCompra90d: Number(row.sin_compra_90d),
      withCrm: Number(row.with_crm),
      arCertified,
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[PERF][CLIENTES][ERROR] summary failed:", err);
    return {
      total: 0, active: 0, inactive: 0,
      withSeller: 0, withCartera: 0, withOverdue: 0, sinCompra90d: 0, withCrm: 0,
      arCertified: false,
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

  await warmTruthStatusCache();
  const arCertified = isReceivableDataCertified(organizationId);

  // Load canonical AR snapshot once (used for row-level cartera + filter)
  let arLookup: Map<number, CertifiedCustomerReceivableSnapshot> | null = null;
  let arCustomerIds: Set<number> | null = null;
  if (arCertified) {
    const arResult = await fetchCertifiedArSnapshot();
    if (arResult.ok) {
      arLookup = new Map();
      arCustomerIds = new Set();
      for (const c of arResult.snapshot.customers) {
        arLookup.set(c.clienteId, c);
        arCustomerIds.add(c.clienteId);
      }
    }
  }

  try {
    // ── For con_cartera filter: get sagTerceroIds that have open AR ────
    let carteraSagIds: number[] | null = null;
    if (filter === "con_cartera") {
      if (!arCustomerIds || arCustomerIds.size === 0) {
        // No certified AR data → empty results
        return { clients: [], totalFiltered: 0, page: 1, pageSize, totalPages: 1 };
      }
      carteraSagIds = [...arCustomerIds];
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
      // Resolve cartera from canonical AR snapshot by sagTerceroId
      let totalReceivable: number | null = null;
      let overdueReceivable: number | null = null;
      let carteraState: ClienteCarteraState = "UNVERIFIED";

      if (arLookup && p.sagTerceroId != null && p.sagTerceroId > 0) {
        const arSnap = arLookup.get(p.sagTerceroId);
        if (arSnap) {
          totalReceivable = arSnap.totalPendiente;
          overdueReceivable = arSnap.totalVencido;
          carteraState = "HAS_OPEN_AR";
        } else {
          // Customer exists in SAG but not in cartera → CERTIFIED_ZERO
          totalReceivable = 0;
          overdueReceivable = 0;
          carteraState = "CERTIFIED_ZERO";
        }
      }
      // If arLookup is null (AR failed or uncertified), stays UNVERIFIED with null amounts

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
        totalReceivable,
        overdueReceivable,
        carteraState,
      };
    });

    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`[PERF][CLIENTES] page ${elapsed}ms — page=${safePage}/${totalPages} rows=${clients.length} totalFiltered=${totalFiltered} arCertified=${arCertified}`);

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
