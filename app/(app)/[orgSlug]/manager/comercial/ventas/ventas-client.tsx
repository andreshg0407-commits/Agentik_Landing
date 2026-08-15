/**
 * Ventas Surface Client.
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 */
"use client";

import type { ManagerVentasPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient } from "../manager-surface-client";

export function VentasSurfaceClient({ ventasPA }: { ventasPA: ManagerVentasPA }) {
  return (
    <ManagerSurfaceClient
      title="Ventas"
      subtitle={ventasPA.periodo || undefined}
      facts={ventasPA.facts}
      attentionStatus={ventasPA.attentionStatus}
      freshness={ventasPA.asOf}
    />
  );
}
