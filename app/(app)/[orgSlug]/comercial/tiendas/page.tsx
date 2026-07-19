/**
 * /[orgSlug]/comercial/tiendas
 *
 * Tiendas — Server Component wrapper.
 * Loads workspace data via StoreInventoryProvider and passes to client.
 *
 * Only loads workspace + signals for initial render.
 * Store details are loaded lazily on the client when user opens a drawer.
 *
 * Sprint: COMERCIAL-TIENDAS-DATA-CONTRACT-03
 * Hotfix: TIENDAS-DASHBOARD-LOAD-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getStoresWorkspaceWithSignals,
} from "@/lib/comercial/tiendas/store-replenishment-service";
import type { StoreCopilotSignal } from "@/lib/comercial/tiendas/store-replenishment-types";
import { TiendasClient } from "./tiendas-client";

export default async function TiendasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  // Single load: workspace + signals (1 resolveData call)
  let workspace;
  let metadata;
  let signals: StoreCopilotSignal[] = [];
  try {
    const result = await getStoresWorkspaceWithSignals(orgId);
    workspace = result.workspace;
    metadata  = result.metadata;
    signals   = result.signals;
  } catch {
    workspace = { stores: [], mainWarehouseCode: "", mainWarehouseName: "", lastSyncAt: null };
    metadata  = { kind: "sag_current" as const, label: "Error al cargar datos", connected: false, lastReadAt: null, variantSupport: false };
    signals   = [];
  }

  return (
    <TiendasClient
      orgSlug={orgSlug}
      orgId={orgId}
      workspace={workspace}
      signals={signals}
      providerMetadata={metadata}
    />
  );
}
