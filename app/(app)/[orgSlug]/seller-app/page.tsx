/**
 * /[orgSlug]/seller-app
 *
 * Seller App V1 — Mobile-first operational surface for field sellers.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-01
 * Sprint: AGENTIK-SELLER-APP-UI-03 (Block 3: portfolio + orders)
 *
 * Server component:
 *   - Authenticates user → org → membership
 *   - Resolves seller identity via certified frontline mapping
 *   - Loads seller-scoped data (attention, customers, inactive, portfolio, orders)
 *   - Passes to client as flat props
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";
import { getSellerAttention } from "@/lib/comercial/frontline/frontline-attention-service";
import { getSellerInactiveCustomers } from "@/lib/comercial/frontline/seller-inactive-customers";
import { getSellerAppFeatureFlags } from "@/lib/comercial/frontline/seller-app-features";
import { deriveStrictFulfillmentStages } from "@/lib/comercial/frontline/order-fulfillment-timeline";
import { getSalesPortfolio, getSalesPortfolioReferences, getSalesPortfolioWithdrawalItems, getSalesPortfolioSupplyPlanForVendor } from "@/lib/comercial/maletas/portfolio-copilot-domain-tools";
import { prisma } from "@/lib/prisma";
import { SellerAppShell } from "./seller-app-shell";
import type { SerializedPortfolio, SerializedPortfolioRef, SerializedSupplyNeed, SerializedOrderCard } from "./views/seller-app-shared";

const db = prisma as any;

export default async function SellerAppPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { user, organization, membership } = await requireOrgAccess(orgSlug);

  // Resolve seller identity
  const sellerIdentity = await resolveCurrentSeller({
    organizationId: organization.id,
    userId: user.id,
  });

  const scope = deriveSellerScope(sellerIdentity);

  // Load seller-scoped attention
  const attention = await getSellerAttention(
    organization.id,
    sellerIdentity.sellerId,
    orgSlug,
  );

  // Load seller-scoped customers
  const customerFilter = scope.canAccessAllCustomers
    ? { organizationId: organization.id }
    : { organizationId: organization.id, sellerSlug: sellerIdentity.sellerSlug };

  const customers = await db.customerProfile.findMany({
    where: customerFilter,
    select: {
      id: true,
      name: true,
      legalName: true,
      nit: true,
      nitNormalized: true,
      city: true,
      sellerSlug: true,
      sellerName: true,
      totalReceivable: true,
      overdueReceivable: true,
      maxDpd: true,
      sagTerceroId: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  // Load inactive customers
  const inactiveResult = sellerIdentity.sellerId
    ? await getSellerInactiveCustomers(organization.id, sellerIdentity.sellerId, { inactiveDays: 90 })
    : { items: [], totalCount: 0, provenance: { source: "n/a", asOf: new Date().toISOString() } };

  // Get last purchase dates for all customers (batch)
  const nitKeys = customers
    .filter((c: any) => c.sagTerceroId != null)
    .map((c: any) => String(c.sagTerceroId));

  const lastOrders = nitKeys.length > 0
    ? await db.customerOrderRecord.groupBy({
        by: ["customerNit"],
        where: {
          organizationId: organization.id,
          customerNit: { in: nitKeys },
          status: "FACTURADO",
        },
        _max: { orderDate: true },
      })
    : [];

  const lastOrderMap: Record<string, string> = {};
  for (const row of lastOrders) {
    if (row._max.orderDate) {
      lastOrderMap[row.customerNit] = row._max.orderDate.toISOString();
    }
  }

  // Serialize customers for client
  const serializedCustomers = customers.map((c: any) => {
    const nitKey = c.sagTerceroId != null ? String(c.sagTerceroId) : null;
    const lastPurchase = nitKey ? lastOrderMap[nitKey] ?? null : null;

    return {
      id: c.id,
      name: c.legalName ?? c.name ?? "",
      nit: c.nitNormalized ?? c.nit ?? null,
      city: c.city ?? null,
      sellerSlug: c.sellerSlug ?? null,
      totalReceivable: Number(c.totalReceivable ?? 0),
      overdueReceivable: Number(c.overdueReceivable ?? 0),
      maxDpd: c.maxDpd ?? 0,
      lastPurchaseDate: lastPurchase,
    };
  });

  // Inactive customer IDs for filter
  const inactiveIds = new Set(inactiveResult.items.map(i => i.customerId));

  // Feature flags
  const features = getSellerAppFeatureFlags(organization.id);

  // ── Load portfolio (seller-scoped) ────────────────────────────────────────
  let serializedPortfolio: SerializedPortfolio | null = null;
  const supplyNeeds: SerializedSupplyNeed[] = [];

  if (sellerIdentity.sellerId) {
    try {
      const [portfolioDetail, portfolioRefs, supplyResult] = await Promise.all([
        getSalesPortfolio(organization.id, sellerIdentity.sellerId),
        getSalesPortfolioReferences(organization.id, sellerIdentity.sellerId),
        getSalesPortfolioSupplyPlanForVendor(organization.id, sellerIdentity.sellerId),
      ]);

      if (portfolioDetail) {
        const refs: SerializedPortfolioRef[] = (portfolioRefs?.references ?? []).map(r => ({
          reference: r.reference,
          description: r.description,
          line: r.line,
          sizeClass: r.sizeClass,
          centralAvailable: r.centralAvailable,
          commercialHealth: r.commercialHealth,
          suggestedAction: r.suggestedAction ?? "",
          imageUrl: r.imageUrl,
          state: r.sampleState,
        }));

        // Also include retiro refs (getSalesPortfolioReferences excludes them)
        const withdrawalResult = await getSalesPortfolioWithdrawalItems(organization.id, sellerIdentity.sellerId);
        const retiroRefs: SerializedPortfolioRef[] = (withdrawalResult?.items ?? []).map(w => ({
          reference: w.reference,
          description: w.description,
          line: w.line,
          sizeClass: null,
          centralAvailable: w.centralAvailable,
          commercialHealth: "SIN_DATOS",
          suggestedAction: w.removalReason,
          imageUrl: w.imageUrl ?? null,
          state: "reemplazar",
        }));

        serializedPortfolio = {
          vendorId: portfolioDetail.vendorId,
          vendorName: portfolioDetail.vendorName,
          isActive: portfolioDetail.isActive,
          totalRefs: portfolioDetail.totalRefs,
          totalUnits: portfolioDetail.totalUnits,
          health: portfolioDetail.health,
          replaceRefs: portfolioDetail.replaceRefs,
          healthyRefs: portfolioDetail.healthyRefs,
          refs: [...refs, ...retiroRefs],
        };
      }

      if (supplyResult) {
        supplyNeeds.push(...supplyResult.needs.map(n => ({
          subgroupName: n.subgroupName,
          brand: n.brand,
          commercialWorld: n.commercialWorld,
          missingReferences: n.missingReferences,
          bestAction: n.bestAction,
          bestActionExplanation: n.bestActionExplanation,
          candidateCount: n.candidateCount,
        })));
      }
    } catch {
      // Portfolio not available — degrade silently
    }
  }

  // ── Load orders (deterministic seller identity at DB boundary) ────────────
  //
  // AGENTIK-SELLER-APP-UI-03-P0-FINAL: deterministic seller enforcement.
  // Uses sellerTerceroId (Int) for EXACT match — no name/slug/contains.
  // Resolution: sellerName → find matching sellerTerceroId → filter by integer.
  // If no deterministic ID can be resolved → return empty (SELLER_ORDER_IDENTITY_BLOCKER).
  // Manager/admin → canAccessAllOrders → no seller filter.
  // Fulfillment: canonical authority via deriveStrictFulfillmentStages().
  //
  let serializedOrders: SerializedOrderCard[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderWhere: Record<string, any> = { organizationId: organization.id };

    if (!scope.canAccessAllOrders && sellerIdentity.sagSellerCode) {
      // sagSellerCode is the stable sellerTerceroId resolved during identity
      // resolution (resolveSellerTerceroId). Integer authority — never name.
      orderWhere.sellerTerceroId = parseInt(sellerIdentity.sagSellerCode, 10);
    } else if (!scope.canAccessAllOrders) {
      // No stable seller identity resolved — return empty
      serializedOrders = [];
    }

    // Only query if we have a valid filter (or manager scope)
    if (scope.canAccessAllOrders || orderWhere.sellerTerceroId != null) {
      const orderRecords = await db.customerOrderRecord.findMany({
        where: orderWhere,
        orderBy: { orderDate: "desc" },
        take: 50,
        include: { _count: { select: { lines: true } } },
      });

      serializedOrders = orderRecords.map((r: any) => {
        const sagStatus = String(r.status ?? "");
        const status = sagStatus === "FACTURADO" || sagStatus === "CONFIRMADO" || sagStatus === "DESPACHADO"
          ? "sincronizado"
          : sagStatus === "CANCELADO" ? "cancelado" : "pendiente_sag";

        // Canonical fulfillment authority — deriveStrictFulfillmentStages
        const fulfillment = deriveStrictFulfillmentStages(sagStatus);

        const orderDate = r.orderDate instanceof Date ? r.orderDate.toISOString() : String(r.orderDate ?? "");

        return {
          id: r.id,
          consecutivo: r.orderNumber ? parseInt(r.orderNumber, 10) || 0 : 0,
          customerName: r.customerName ?? "",
          sellerName: r.sellerName ?? "",
          totalReferences: r.lineCount ?? r._count?.lines ?? 0,
          totalUnits: r.totalUnits != null ? Number(r.totalUnits) : 0,
          totalValue: r.amount != null ? Number(r.amount) : 0,
          status,
          origin: "SAG_HISTORICAL",
          syncState: "sincronizado",
          createdAt: orderDate,
          lastSyncAt: r.syncedAt instanceof Date ? r.syncedAt.toISOString() : r.syncedAt ? String(r.syncedAt) : null,
          fulfillmentStatus: fulfillment.invoice,
          fulfillmentPercent: null,
          channel: null as string | null,
        };
      });
    }
  } catch {
    // Orders not available — degrade silently
  }

  return (
    <SellerAppShell
      orgSlug={orgSlug}
      orgId={organization.id}
      sellerIdentity={{
        sellerId: sellerIdentity.sellerId,
        sellerName: sellerIdentity.sellerName,
        sellerSlug: sellerIdentity.sellerSlug,
        role: sellerIdentity.role,
        mappingSource: sellerIdentity.mappingSource,
        isSellerScoped: sellerIdentity.isSellerScoped,
        isManagerOrAbove: sellerIdentity.isManagerOrAbove,
      }}
      attention={attention}
      customers={serializedCustomers}
      inactiveCustomerIds={[...inactiveIds]}
      inactiveCustomers={inactiveResult.items.map(i => ({
        customerId: i.customerId,
        customerName: i.customerName,
        classification: i.classification,
        lastPurchaseDate: i.lastPurchaseDate,
        daysSinceLastPurchase: i.daysSinceLastPurchase,
        receivables: i.receivables,
      }))}
      features={features}
      portfolio={serializedPortfolio}
      supplyNeeds={supplyNeeds}
      orders={serializedOrders}
    />
  );
}
