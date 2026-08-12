/**
 * Store Detail Client (Level 2).
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Executive read-only. Source status visible.
 * "Sin ventas en 28 dias" is a FACT, not Attention.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerStoreDetailPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient } from "../../manager-surface-client";

const SOURCE_LABELS: Record<string, string> = {
  FRESH:        "Actualizado",
  AGING:        "Envejeciendo",
  STALE:        "Desactualizado",
  UNAVAILABLE:  "No disponible",
  DEGRADED:     "Degradado",
};

export function StoreDetailClient({ detailPA }: { detailPA: ManagerStoreDetailPA }) {
  return (
    <ManagerSurfaceClient
      title={detailPA.storeName}
      facts={detailPA.facts}
      attentionStatus={detailPA.attentionStatus}
      freshness={detailPA.asOf}
    >
      {/* Source status */}
      <div style={{
        display:     "flex",
        alignItems:  "center",
        gap:         S[2],
        marginBottom: S[4],
      }}>
        <div style={{
          width:        8,
          height:       8,
          borderRadius: "50%",
          background:   detailPA.sourceStatus === "FRESH" ? "#16a34a"
            : detailPA.sourceStatus === "AGING" ? "#d97706"
            : "#dc2626",
        }} />
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
        }}>
          Fuente: {SOURCE_LABELS[detailPA.sourceStatus] ?? detailPA.sourceStatus}
        </span>
      </div>
    </ManagerSurfaceClient>
  );
}
