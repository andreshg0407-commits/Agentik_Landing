/**
 * Tiendas Surface Client (Level 1 — Store Network).
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Uses inventoryTruthState to distinguish certified zeros from unavailable data.
 * A store with CERTIFIED + totalReferences=0 truly has zero refs.
 * A store with UNAVAILABLE has no inventory source — show factual indisponibilidad.
 */
"use client";

import { useRouter } from "next/navigation";
import type { ManagerTiendasPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient, type SurfaceListItem } from "../manager-surface-client";

export function TiendasSurfaceClient({ tiendasPA }: { tiendasPA: ManagerTiendasPA }) {
  const router = useRouter();

  const storeItems: SurfaceListItem[] = tiendasPA.stores.map(s => {
    if (s.inventoryTruthState === "UNAVAILABLE") {
      // No inventory source responded — factual indisponibilidad
      return {
        id:          s.storeId,
        primary:     s.storeName,
        secondary:   "Inventario no disponible — fuente sin respuesta",
        href:        s.href,
        statusColor: "#9ca3af", // gray — no data, not a health signal
      };
    }

    // CERTIFIED data — show real counts (including true zeros)
    return {
      id:          s.storeId,
      primary:     s.storeName,
      secondary:   `${s.totalReferences} refs · ${s.referencesOutOfStock} agotadas`,
      href:        s.href,
      statusColor: s.referencesOutOfStock > 0 ? "#dc2626" : "#16a34a",
    };
  });

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
