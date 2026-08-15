/**
 * /[orgSlug]/manager/comercial/vendedores/[sellerId] — Seller Detail.
 *
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A (Phase 3)
 *
 * Route identity: sellerId — the persisted deterministic seller join key.
 * This value is `toSlug(sellerName)`, persisted at sync time across
 * SaleRecord.sellerSlug, VendorCommercialBag.salesRepId,
 * CustomerProfile.sellerSlug, and CRMQuote.sellerSlug.
 *
 * IDENTITY CONTRACT: IDENTITY_UNSTABLE
 * The current seller identity is name-derived (toSlug) and therefore MUTABLE.
 * No immutable seller PK exists in the current data model.
 * BLOCKED_BY_MISSING_CANONICAL_CONTRACT — documented in manager-commercial-types.ts.
 *
 * Resolves sellerTerceroId (SAG ka_nl_tercero_vend) server-side.
 * Loads real maletas data via vendor-bag-repository (org + seller scoped).
 * Provider failure is explicit via wrapProviderCall — not hidden.
 *
 * Authorization code path:
 *   1. requireOrgAccess(orgSlug) → authenticated + org exists + active membership
 *      + seller confinement gate (provisioned sellers denied)
 *   2. getSellerBySlug(orgId, sellerId) → org-scoped seller resolution
 *   3. All data loaders receive orgId → tenant isolation enforced
 *
 * PA assembled via adapter — no inline business logic.
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getSellerBySlug } from "@/lib/comercial/foundation/seller-directory";
import { buildSellerMetrics } from "@/lib/comercial/foundation/seller-metrics";
import { lookupSellerTerceroId } from "@/lib/comercial/frontline/seller-tercero-mapping";
import { listBags } from "@/lib/comercial/maletas/vendor-bag-repository";
import { assembleSellerDetailPA, assembleManagerMaletaSection, wrapProviderCall } from "@/lib/comercial/manager/manager-commercial-adapter";
import { SellerDetailClient } from "./seller-detail-client";

export default async function ManagerSellerDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; sellerId: string }>;
}) {
  const { orgSlug, sellerId } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  // Resolve seller by canonical ID — no fuzzy match, org-scoped
  const seller = await getSellerBySlug(orgId, sellerId);
  if (!seller) {
    redirect(`/${orgSlug}/manager/comercial/vendedores`);
  }

  // Load metrics, terceroId, and maletas in parallel — all org-scoped.
  // Each wrapped in provider envelope — failure is explicit, never hidden.
  const [metricsReport, sellerTerceroId, bagsResult] = await Promise.all([
    buildSellerMetrics(orgId),
    lookupSellerTerceroId(orgId, sellerId).catch(() => null),
    wrapProviderCall("maletas", () => listBags(orgId, sellerId)),
  ]);

  const metrics = metricsReport.sellers.find(m => m.sellerSlug === sellerId);

  // Maletas: use provider result. On provider error, maletaSection = null
  // (surface hidden) but failure is logged, not disguised as "no bags".
  // Only show bags with certified active status — fail closed.
  const activeBags = bagsResult.status === "OK"
    ? bagsResult.items.filter(b => b.status === "activa")
    : [];
  const maletaSection = bagsResult.status === "OK"
    ? assembleManagerMaletaSection(activeBags)
    : null;

  const detailPA = assembleSellerDetailPA({
    seller,
    metrics,
    sellerTerceroId,
    maletaSection,
    maletaQuerySucceeded: bagsResult.status === "OK",
  });

  return <SellerDetailClient detailPA={detailPA} />;
}
