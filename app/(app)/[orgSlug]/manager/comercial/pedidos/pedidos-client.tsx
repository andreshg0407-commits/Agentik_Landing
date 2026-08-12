/**
 * Pedidos Surface Client.
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Sync state shown as freshness, not as business attention.
 */
"use client";

import { C, T, S } from "@/lib/ui/tokens";
import type { ManagerPedidosPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient } from "../manager-surface-client";

export function PedidosSurfaceClient({ pedidosPA }: { pedidosPA: ManagerPedidosPA }) {
  return (
    <ManagerSurfaceClient
      title="Pedidos"
      facts={pedidosPA.facts}
      attentionStatus={pedidosPA.attentionStatus}
      freshness={pedidosPA.asOf}
    >
      {/* Sync state as data health, not attention */}
      {pedidosPA.syncState && pedidosPA.syncState !== "SYNCED" && (
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkLight,
          padding:       `${S[2]}px 0`,
          fontStyle:     "italic",
          marginBottom:  S[3],
        }}>
          Estado de sincronizacion: {pedidosPA.syncState === "SYNC_PENDING" ? "pendiente" : "error"}
        </div>
      )}
    </ManagerSurfaceClient>
  );
}
