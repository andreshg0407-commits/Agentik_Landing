/**
 * /[orgSlug]/manager/comercial/tiendas/[storeId] — Store Detail (Level 2).
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Route identity: storeId (= warehouse kaNlBodega, stable canonical ID).
 * Consumes StoreNetworkSnapshot for per-store truth.
 * No fuzzy name lookup. No name-based authorization.
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildStoreNetworkSnapshot } from "@/lib/comercial/tiendas/store-network-inventory";
import { assembleStoreDetailPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { StoreDetailClient } from "./store-detail-client";

export default async function ManagerStoreDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; storeId: string }>;
}) {
  const { orgSlug, storeId } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const networkSnapshot = await buildStoreNetworkSnapshot(orgId).catch(() => null);
  if (!networkSnapshot) {
    redirect(`/${orgSlug}/manager/comercial/tiendas`);
  }

  const detailPA = assembleStoreDetailPA({ networkSnapshot, storeId });
  if (!detailPA) {
    redirect(`/${orgSlug}/manager/comercial/tiendas`);
  }

  return <StoreDetailClient detailPA={detailPA} />;
}
