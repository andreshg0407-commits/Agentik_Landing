/**
 * Inventario Surface Client.
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 */
"use client";

import type { ManagerInventarioPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient } from "../manager-surface-client";

export function InventarioSurfaceClient({ inventarioPA }: { inventarioPA: ManagerInventarioPA }) {
  return (
    <ManagerSurfaceClient
      title="Inventario"
      facts={inventarioPA.facts}
      attentionStatus={inventarioPA.attentionStatus}
      freshness={inventarioPA.asOf}
    />
  );
}
