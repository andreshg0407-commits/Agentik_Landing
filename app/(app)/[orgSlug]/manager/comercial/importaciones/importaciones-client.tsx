/**
 * Importaciones Surface Client.
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Preserves SIN_FECHA_DE_ACTIVIDAD_IMPORTACION as separate truth state.
 * Low rotation reuses canonical engine — no recalculation in Manager.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerImportacionesPA } from "@/lib/comercial/manager/manager-commercial-types";
import { ManagerSurfaceClient } from "../manager-surface-client";

export function ImportacionesSurfaceClient({
  importacionesPA,
}: {
  importacionesPA: ManagerImportacionesPA;
}) {
  return (
    <ManagerSurfaceClient
      title="Importaciones"
      facts={importacionesPA.facts}
      attentionStatus={importacionesPA.attentionStatus}
      freshness={importacionesPA.asOf}
    >
      {/* SIN_FECHA truth state */}
      {importacionesPA.sinFechaCount > 0 && (
        <div style={{
          padding:      `${S[2]}px ${S[3]}px`,
          background:   "rgba(217,119,6,0.06)",
          border:       `1px solid rgba(217,119,6,0.15)`,
          borderRadius: R.md,
          marginBottom: S[4],
        }}>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      "#92400e",
          }}>
            {importacionesPA.sinFechaCount} {importacionesPA.sinFechaCount === 1 ? "referencia" : "referencias"} sin fecha de actividad de importación
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      "#92400e",
            opacity:    0.7,
            marginTop:  2,
          }}>
            Sin fecha de actividad de importación — no clasificadas como baja rotación
          </div>
        </div>
      )}
    </ManagerSurfaceClient>
  );
}
