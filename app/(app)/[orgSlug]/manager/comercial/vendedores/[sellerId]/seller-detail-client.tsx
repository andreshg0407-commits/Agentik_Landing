/**
 * Seller Detail Client.
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Read-only executive presentation. No operational actions.
 * Commission shows truth state when identity cannot be resolved.
 * Maleta section nested here, not as standalone hub surface.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerSellerDetailPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient } from "../../manager-surface-client";

const STATUS_LABELS: Record<string, string> = {
  activo:   "Activo",
  atencion: "Requiere atencion",
  inactivo: "Inactivo",
};

const STATUS_COLORS: Record<string, string> = {
  activo:   "#16a34a",
  atencion: "#d97706",
  inactivo: "#9ca3af",
};

export function SellerDetailClient({ detailPA }: { detailPA: ManagerSellerDetailPA }) {
  return (
    <ManagerSurfaceClient
      title={detailPA.sellerName}
      facts={detailPA.facts}
      attentionStatus={detailPA.attentionStatus}
      freshness={detailPA.asOf}
    >
      {/* Activity status */}
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
          background:   STATUS_COLORS[detailPA.activityStatus] ?? "#9ca3af",
        }} />
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
        }}>
          {STATUS_LABELS[detailPA.activityStatus] ?? detailPA.activityStatus}
        </span>
      </div>

      {/* Commission truth state */}
      <div style={{
        padding:      `${S[3]}px ${S[3]}px`,
        background:   "#fff",
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        marginBottom: S[4],
      }}>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
          marginBottom: 4,
        }}>
          Comision
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.sm,
          color:      detailPA.commissionTruthState === "CERTIFIED" ? C.ink : C.inkLight,
          fontStyle:  detailPA.commissionTruthState === "IDENTITY_UNRESOLVED" ? "italic" : "normal",
        }}>
          {detailPA.commissionLabel ?? truthStateLabel(detailPA.commissionTruthState)}
        </div>
      </div>

      {/* Maleta section (nested, not standalone) */}
      {detailPA.maletaSection ? (
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
            Maleta activa
          </div>
          <div style={{ display: "flex", gap: S[4] }}>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Posiciones</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                {detailPA.maletaSection.assignedPositions}/{detailPA.maletaSection.totalPositions}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cobertura</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                {detailPA.maletaSection.coveragePercent}%
              </div>
            </div>
          </div>
        </div>
      ) : detailPA.maletaQuerySucceeded ? (
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
            Maleta
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            No hay una maleta activa certificada
          </div>
        </div>
      ) : null}
    </ManagerSurfaceClient>
  );
}

function truthStateLabel(state: string): string {
  switch (state) {
    case "CERTIFIED": return "Certificada";
    case "PARTIAL": return "Datos parciales";
    case "IDENTITY_UNRESOLVED": return "Identidad no resuelta";
    case "SOURCE_UNAVAILABLE": return "Fuente no disponible";
    default: return state;
  }
}
