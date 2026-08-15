/**
 * Cliente Detail Client — Manager-owned customer intelligence surface.
 *
 * Sprint: AGENTIK-MANAGER-M2A
 *
 * Read-only executive presentation. No Desktop drawer or Desktop UI imported.
 * Consumes ManagerClienteDetailPA assembled server-side from canonical loader.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerClienteDetailPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient } from "../../manager-surface-client";

export function ClienteDetailClient({
  detailPA,
  orgSlug,
}: {
  detailPA: ManagerClienteDetailPA;
  orgSlug: string;
}) {
  return (
    <ManagerSurfaceClient
      title={detailPA.clienteName}
      facts={detailPA.facts}
      attentionStatus={detailPA.attentionStatus}
      freshness={detailPA.asOf}
    >
      {/* Identity section */}
      <div style={{
        padding:      `${S[3]}px ${S[3]}px`,
        background:   "#fff",
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        marginBottom: S[4],
      }}>
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.semibold,
          color:         C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          marginBottom:  S[2],
        }}>
          Identidad del cliente
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
          {detailPA.nit && (
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>NIT</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{detailPA.nit}</div>
            </div>
          )}
          {detailPA.city && (
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Ciudad</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
                {detailPA.city}{detailPA.department ? `, ${detailPA.department}` : ""}
              </div>
            </div>
          )}
          {detailPA.sellerName && (
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Vendedor asignado</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{detailPA.sellerName}</div>
            </div>
          )}
        </div>
      </div>
    </ManagerSurfaceClient>
  );
}
