/**
 * Clientes Surface Client.
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 */
"use client";

import type { ManagerClientesPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient, type SurfaceListItem } from "../manager-surface-client";

export function ClientesSurfaceClient({ clientesPA }: { clientesPA: ManagerClientesPA }) {
  const highlights: SurfaceListItem[] = clientesPA.highlights.map(h => ({
    id:        h.id,
    primary:   h.name,
    secondary: h.label,
    meta:      h.value,
  }));

  return (
    <ManagerSurfaceClient
      title="Clientes"
      facts={clientesPA.facts}
      attentionStatus={clientesPA.attentionStatus}
      listTitle={highlights.length > 0 ? "Destacados" : undefined}
      listItems={highlights}
      freshness={clientesPA.asOf}
    />
  );
}
