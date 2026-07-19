"use client";

/**
 * components/comercial/sag-inventory-diagnostics-panel.tsx
 *
 * SAG Inventory Diagnostics + Manual Upload Panel.
 *
 * Shown inside the Maletas workspace when the inventory snapshot is missing
 * or stale. Lets operators:
 *   1. See the current inventory data source state
 *   2. Upload SAG inventory rows manually (V1 path)
 *   3. Trigger a sync and see the result
 *
 * Only renders when process.env.NODE_ENV !== "production" OR when hasSnapshot===false.
 *
 * Sprint: AGENTIK-SAG-INVENTORY-SNAPSHOT-SYNC-01
 */

import { useState, useCallback }  from "react";
import { C, T, S, R }             from "@/lib/ui/tokens";
import type { SagInventoryInputRow, SagInventorySyncResult } from "@/lib/integrations/sag/sag-inventory-contract";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:     string;
  snapshotAt:  string | null;
  hasSnapshot: boolean;
  refCount:    number;
  /** Called after a successful sync to refresh inventory in the parent */
  onSynced?:   () => void;
}

// ─── Status chip helper ───────────────────────────────────────────────────────

function SnapshotStatusChip({ hasSnapshot, snapshotAt }: { hasSnapshot: boolean; snapshotAt: string | null }) {
  if (!hasSnapshot) {
    return (
      <span className="ag-op-status ag-op-status--error" style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
        sin datos
      </span>
    );
  }
  if (snapshotAt) {
    const ageMs = Date.now() - new Date(snapshotAt).getTime();
    const ageH  = ageMs / (1000 * 60 * 60);
    if (ageH > 24) {
      return (
        <span className="ag-op-status ag-op-status--warning" style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
          desactualizado ({Math.round(ageH)}h)
        </span>
      );
    }
    return (
      <span className="ag-op-status ag-op-status--ok" style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
        activo
      </span>
    );
  }
  return null;
}

// ─── JSON example placeholder ─────────────────────────────────────────────────

const EXAMPLE_ROWS = JSON.stringify([
  { refCode: "CS-001", description: "PIJAMA NIÑA BEBE TALLA 0", line: "CS", disponible: 45, pendingOrdersQty: 12 },
  { refCode: "LT-002", description: "VESTIDO NIÑA KIDS TALLA 8", line: "LT", disponible: 30, pendingOrdersQty: 5 },
], null, 2);

// ─── Component ────────────────────────────────────────────────────────────────

export function SagInventoryDiagnosticsPanel({ orgSlug, snapshotAt, hasSnapshot, refCount, onSynced }: Props) {
  const [expanded,   setExpanded]   = useState(!hasSnapshot);
  const [rawJson,    setRawJson]    = useState("");
  const [dryRun,     setDryRun]     = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [result,     setResult]     = useState<SagInventorySyncResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setParseError(null);
    setResult(null);

    let rows: SagInventoryInputRow[];
    try {
      const parsed = JSON.parse(rawJson.trim() || "[]") as unknown;
      if (!Array.isArray(parsed)) throw new Error("Se esperaba un array JSON []");
      rows = parsed as SagInventoryInputRow[];
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "JSON inválido");
      return;
    }

    setSyncing(true);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/integrations/sag/sync-inventory`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rows, dryRun }),
      });
      const json = await res.json() as { ok: boolean } & SagInventorySyncResult;
      setResult(json);
      if (json.ok && json.status === "success" && !dryRun) {
        onSynced?.();
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSyncing(false);
    }
  }, [orgSlug, rawJson, dryRun, onSynced]);

  return (
    <div style={{
      border:       `1px solid ${hasSnapshot ? C.line : "#b45309"}`,
      borderRadius: R.lg,
      background:   hasSnapshot ? C.surface : "#fffbeb",
      marginBottom: S[4],
      overflow:     "hidden",
    }}>
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          width:          "100%",
          padding:        `${S[3]}px ${S[4]}px`,
          background:     "transparent",
          border:         "none",
          cursor:         "pointer",
          textAlign:      "left" as const,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.5 }}>
            INVENTARIO SAG
          </span>
          <SnapshotStatusChip hasSnapshot={hasSnapshot} snapshotAt={snapshotAt} />
          {hasSnapshot && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.6 }}>
              {refCount} refs · {snapshotAt ? new Date(snapshotAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}
            </span>
          )}
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.4 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: `${S[4]}px` }}>

          {/* State summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[4] }}>
            <div className="ag-kpi-card" style={{ padding: `${S[3]}px` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.5 }}>Fuente</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600 }}>
                {hasSnapshot ? "CommercialCoverageSnapshot" : "sin snapshot"}
              </div>
            </div>
            <div className="ag-kpi-card" style={{ padding: `${S[3]}px` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.5 }}>Referencias</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600 }}>
                {refCount > 0 ? `${refCount} refs` : "—"}
              </div>
            </div>
            <div className="ag-kpi-card" style={{ padding: `${S[3]}px` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.5 }}>Último snapshot</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600 }}>
                {snapshotAt ? new Date(snapshotAt).toLocaleString("es-CO") : "Nunca"}
              </div>
            </div>
          </div>

          {/* Manual upload section */}
          <div style={{ marginBottom: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.6, marginBottom: S[2] }}>
              CARGA MANUAL V1 — Pega filas de inventario SAG en formato JSON
            </div>
            <textarea
              value={rawJson}
              onChange={e => setRawJson(e.target.value)}
              placeholder={EXAMPLE_ROWS}
              rows={8}
              style={{
                width:        "100%",
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                background:   C.surfaceAlt,
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[2]}px ${S[3]}px`,
                color:        C.ink,
                resize:       "vertical",
                boxSizing:    "border-box" as const,
              }}
            />
          </div>

          {parseError && (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        "#b45309",
              background:   "#fffbeb",
              border:       "1px solid #fde68a",
              borderRadius: R.sm,
              padding:      `${S[2]}px ${S[3]}px`,
              marginBottom: S[3],
            }}>
              {parseError}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <button
              className="ag-action-primary"
              onClick={() => void handleSync()}
              disabled={syncing || (!rawJson.trim())}
              style={{ fontSize: T.sz.xs }}
            >
              {syncing ? "Procesando..." : dryRun ? "Validar (dry run)" : "Cargar snapshot"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: S[2], cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={e => setDryRun(e.target.checked)}
              />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, opacity: 0.7 }}>
                Dry run (solo validar)
              </span>
            </label>
          </div>

          {/* Sync result */}
          {result && (
            <div style={{
              marginTop:    S[4],
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              background:   result.status === "success" ? "#f0fdf4" : result.status === "error" ? "#fff1f2" : C.surface,
              border:       `1px solid ${result.status === "success" ? "#86efac" : result.status === "error" ? "#fecdd3" : C.line}`,
              borderRadius: R.md,
              padding:      `${S[3]}px ${S[4]}px`,
            }}>
              <div style={{ fontWeight: 600, marginBottom: S[2] }}>
                {result.status === "success" && "✓ Snapshot cargado"}
                {result.status === "partial" && "⚠ Carga parcial"}
                {result.status === "dry_run" && "○ Dry run — nada persistido"}
                {result.status === "empty" && "○ Sin filas válidas"}
                {result.status === "error" && `✗ Error: ${result.error ?? ""}`}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: `${S[1]}px ${S[4]}px`, width: "fit-content" }}>
                <span style={{ opacity: 0.6 }}>refs escritas</span><span>{result.refsWritten}</span>
                <span style={{ opacity: 0.6 }}>filas inválidas</span><span>{result.invalidRows}</span>
                <span style={{ opacity: 0.6 }}>duplicados</span><span>{result.duplicateRows}</span>
                <span style={{ opacity: 0.6 }}>tiempo</span><span>{result.durationMs}ms</span>
              </div>
              {result.validationErrors.length > 0 && (
                <div style={{ marginTop: S[3], opacity: 0.7 }}>
                  {result.validationErrors.map((e, i) => (
                    <div key={i}>fila {e.rowIndex}: {e.refCode ?? "?"} — {e.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
