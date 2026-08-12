/**
 * Tiendas Surface Client (Level 1 — Store Network).
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * "Sin ventas en 28 dias" is a FACT, not Attention.
 */
"use client";

import { useRouter } from "next/navigation";
import type { ManagerTiendasPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient, type SurfaceListItem } from "../manager-surface-client";

export function TiendasSurfaceClient({ tiendasPA }: { tiendasPA: ManagerTiendasPA }) {
  const router = useRouter();

  const storeItems: SurfaceListItem[] = tiendasPA.stores.map(s => ({
    id:          s.storeId,
    primary:     s.storeName,
    secondary:   `${s.totalReferences} refs · ${s.referencesOutOfStock} agotadas`,
    href:        s.href,
    statusColor: s.referencesOutOfStock > 0 ? "#dc2626" : "#16a34a",
  }));

  return (
    <ManagerSurfaceClient
      title="Tiendas"
      facts={tiendasPA.facts}
      attentionStatus={tiendasPA.attentionStatus}
      listTitle="Red de tiendas"
      listItems={storeItems}
      onItemTap={(item) => {
        const store = tiendasPA.stores.find(s => s.storeId === item.id);
        if (store?.href) router.push(store.href);
      }}
      freshness={tiendasPA.asOf}
    />
  );
}
