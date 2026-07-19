"use client";

/**
 * ConnectorSyncPanel — client component
 *
 * Provides per-module dry-run and sync buttons for a connector.
 * Dry-run: fetches from source, normalises, but writes nothing and does not advance cursor.
 * Sync: full upsert into domain models + advances cursor.
 */

import { useState }    from "react";
import { useRouter }   from "next/navigation";

interface ModuleResult {
  rowsRead:     number;
  rowsImported: number;
  rowsSkipped:  number;
  rowsErrored:  number;
  status:       string;
  error:        string | null;
  ms:           number;
  note?:        string;
  /** True when there are more pages to sync (cursor is still page:N). */
  resumable?:   boolean;
}

interface Props {
  orgSlug:     string;
  connectorId: string;
  modules:     string[];
}

type ActionState =
  | { phase: "idle" }
  | { phase: "loading";       module: string; action: "dry-run" | "sync" }
  | { phase: "syncing-batch"; module: string; batch: number; rowsImported: number }
  | { phase: "done";          module: string; action: "dry-run" | "sync"; result: ModuleResult }
  | { phase: "error";         module: string; action: "dry-run" | "sync"; message: string };

// ── Module display labels ─────────────────────────────────────────────────────

const MODULE_LABEL: Record<string, string> = {
  customers:     "Clientes",
  receivables:   "Cartera",
  opportunities: "Oportunidades",
  activities:    "Actividades",
  quotes:        "Cotizaciones",
  orders:        "Pedidos",
  invoices:      "Facturas",
  inventory:     "Inventario",
};

function moduleLabel(m: string): string {
  return MODULE_LABEL[m] ?? m;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConnectorSyncPanel({ orgSlug, connectorId, modules }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ phase: "idle" });
  const [syncAllState, setSyncAllState] = useState<
    { phase: "idle" } | { phase: "loading" } | { phase: "done"; ms: number } | { phase: "error"; message: string }
  >({ phase: "idle" });

  const isLoading =
    state.phase === "loading" ||
    state.phase === "syncing-batch" ||
    syncAllState.phase === "loading";

  async function triggerDryRun(module: string) {
    console.log("dry-run click", module);
    setState({ phase: "loading", module, action: "dry-run" });
    try {
      const endpointUrl = `/api/orgs/${orgSlug}/connectors/${connectorId}/dry-run`;
      console.log("calling", endpointUrl);
      const res  = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState({ phase: "done", module, action: "dry-run", result: data });
      router.refresh(); // reload server-rendered run history
    } catch (e) {
      setState({ phase: "error", module, action: "dry-run", message: (e as Error).message });
    }
  }

  async function triggerSync(module: string) {
    setState({ phase: "loading", module, action: "sync" });

    let batch         = 0;
    let totalImported = 0;
    let totalRead     = 0;
    let totalSkipped  = 0;
    let totalErrored  = 0;
    let lastStatus    = "SUCCESS";
    let lastError: string | null = null;
    const t0 = Date.now();

    try {
      // Loop while the server signals there are more pages (resumable batch import).
      // For all other modules / adapters resumable is always false so the loop
      // runs exactly once — identical behaviour to the previous implementation.
      while (true) {
        batch++;

        // After the first batch switch to the batch-progress indicator
        if (batch > 1) {
          setState({ phase: "syncing-batch", module, batch, rowsImported: totalImported });
        }

        const res  = await fetch(`/api/orgs/${orgSlug}/connectors/${connectorId}/sync`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ module }),
        });
        const data: ModuleResult & { resumable?: boolean } = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);

        // Accumulate counters across all batches
        totalImported += data.rowsImported ?? 0;
        totalRead     += data.rowsRead     ?? 0;
        totalSkipped  += data.rowsSkipped  ?? 0;
        totalErrored  += data.rowsErrored  ?? 0;
        lastStatus     = data.status       ?? lastStatus;
        if (data.error) lastError = data.error;

        if (!data.resumable) break;
      }

      setState({
        phase: "done",
        module,
        action: "sync",
        result: {
          rowsRead:     totalRead,
          rowsImported: totalImported,
          rowsSkipped:  totalSkipped,
          rowsErrored:  totalErrored,
          status:       lastStatus,
          error:        lastError,
          ms:           Date.now() - t0,
        },
      });
      router.refresh();
    } catch (e) {
      setState({ phase: "error", module, action: "sync", message: (e as Error).message });
    }
  }

  async function triggerSyncAll() {
    setSyncAllState({ phase: "loading" });
    setState({ phase: "idle" });
    const t0 = Date.now();
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/connectors/${connectorId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSyncAllState({ phase: "done", ms: Date.now() - t0 });
      router.refresh(); // reload server-rendered run history
    } catch (e) {
      setSyncAllState({ phase: "error", message: (e as Error).message });
    }
  }

  return (
    <div>
      {/* ── Per-module rows ────────────────────────────────────────────────── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            <th style={{ textAlign: "left", padding: "6px 16px 6px 0", fontWeight: 600 }}>Módulo</th>
            <th style={{ textAlign: "left", padding: "6px 16px 6px 0", fontWeight: 600 }}>Verificar (dry-run)</th>
            <th style={{ textAlign: "left", padding: "6px 0",          fontWeight: 600 }}>Sincronizar</th>
          </tr>
        </thead>
        <tbody>
          {modules.map(module => {
            const active =
              state.phase !== "idle" &&
              (state as { module: string }).module === module;

            const isDryRunLoading =
              active &&
              state.phase === "loading" &&
              (state as { action: string }).action === "dry-run";

            const isSyncLoading =
              (active &&
                state.phase === "loading" &&
                (state as { action: string }).action === "sync") ||
              (state.phase === "syncing-batch" &&
                (state as { module: string }).module === module);

            return (
              <tr key={module} style={{ borderBottom: "1px solid #f3f4f6" }}>
                {/* Module name */}
                <td style={{ padding: "10px 16px 10px 0", fontWeight: 500 }}>
                  {moduleLabel(module)}
                  <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6, fontFamily: "monospace" }}>
                    {module}
                  </span>
                </td>

                {/* Dry-run button */}
                <td style={{ padding: "10px 16px 10px 0" }}>
                  <button
                    type="button"
                    onClick={() => triggerDryRun(module)}
                    disabled={isLoading}
                    style={{
                      fontSize: 12, fontWeight: 600, cursor: isLoading ? "not-allowed" : "pointer",
                      padding: "4px 12px", borderRadius: 4, border: "1px solid #d1d5db",
                      background: isDryRunLoading ? "#f9fafb" : "#ffffff",
                      color: isDryRunLoading ? "#9ca3af" : "#374151",
                    }}
                  >
                    {isDryRunLoading ? "Verificando…" : "Verificar"}
                  </button>
                </td>

                {/* Sync button */}
                <td style={{ padding: "10px 0" }}>
                  <button
                    type="button"
                    onClick={() => triggerSync(module)}
                    disabled={isLoading}
                    style={{
                      fontSize: 12, fontWeight: 600, cursor: isLoading ? "not-allowed" : "pointer",
                      padding: "4px 12px", borderRadius: 4, border: "1px solid #bfdbfe",
                      background: isSyncLoading ? "#eff6ff" : "#2563eb",
                      color: isSyncLoading ? "#93c5fd" : "#ffffff",
                    }}
                  >
                    {isSyncLoading
                    ? (state.phase === "syncing-batch" && (state as { module: string }).module === module)
                      ? `Lote ${(state as { batch: number }).batch}…`
                      : "Conectando…"
                    : `Sincronizar ${moduleLabel(module)}`}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Result panel ──────────────────────────────────────────────────── */}

      {/* Loading feedback — visible while SOAP/API call is in flight */}
      {state.phase === "loading" && (
        <div style={{
          marginTop: 16, padding: "12px 16px", borderRadius: 6,
          background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13,
          color: "#475569",
        }}>
          <span style={{ marginRight: 8 }}>⏳</span>
          {state.action === "dry-run" ? "Verificando" : "Sincronizando"} <b>{moduleLabel(state.module)}</b>
          {" "}— conectando con la fuente de datos…
        </div>
      )}

      {/* Batch-import progress — visible while looping through resumable pages */}
      {state.phase === "syncing-batch" && (
        <div style={{
          marginTop: 16, padding: "12px 16px", borderRadius: 6,
          background: "#f0f9ff", border: "1px solid #bae6fd", fontSize: 13,
          color: "#0369a1",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            ⏳ Importando <b>{moduleLabel(state.module)}</b> — lote {state.batch}
          </div>
          <div style={{ color: "#0c4a6e" }}>
            {state.rowsImported.toLocaleString("es-CO")} registros guardados hasta ahora…
            <span style={{ marginLeft: 12, fontSize: 11, color: "#0369a1" }}>
              (cada lote ≈ 10 000 registros · puede tomar 60–70 s)
            </span>
          </div>
        </div>
      )}

      {state.phase === "done" && (() => {
        const succeeded = state.result.status === "SUCCEEDED" || state.result.status === "SUCCESS";
        const partial   = state.result.status === "PARTIAL";
        const bgColor   = succeeded ? "#f0fdf4" : partial ? "#fff7ed" : "#fff7ed";
        const border    = succeeded ? "#bbf7d0" : "#fed7aa";
        const labelColor = succeeded ? "#15803d" : partial ? "#c2410c" : "#c2410c";
        return (
          <div style={{
            marginTop: 16, padding: "12px 16px", borderRadius: 6,
            background: bgColor, border: `1px solid ${border}`, fontSize: 13,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {state.action === "dry-run" ? "Verificación" : "Sincronización"} — {moduleLabel(state.module)}
              {" "}
              <span style={{ color: labelColor }}>
                {state.result.status ?? "—"}
              </span>
            </div>
            <div style={{ color: "#374151" }}>
              Leídos: <b>{state.result.rowsRead ?? 0}</b>
              {" · "}Importados: <b>{state.result.rowsImported ?? 0}</b>
              {" · "}Omitidos: <b>{state.result.rowsSkipped ?? 0}</b>
              {(state.result.rowsErrored ?? 0) > 0 && (
                <> · <span style={{ color: "#b91c1c" }}>Errores: {state.result.rowsErrored}</span></>
              )}
              {" · "}{state.result.ms} ms
            </div>
            {state.result.note && (
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
                {state.result.note}
              </div>
            )}
            {state.result.error && (
              <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 12 }}>
                Error: {state.result.error}
              </div>
            )}
          </div>
        );
      })()}

      {state.phase === "error" && (
        <div style={{
          marginTop: 16, padding: "12px 16px", borderRadius: 6,
          background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13,
        }}>
          <b style={{ color: "#991b1b" }}>Error al ejecutar {state.action}:</b>{" "}
          <span style={{ color: "#7f1d1d" }}>{state.message}</span>
        </div>
      )}

      {/* ── Sync all ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
        <button
          type="button"
          onClick={triggerSyncAll}
          disabled={isLoading}
          style={{
            fontSize: 13, fontWeight: 700, cursor: isLoading ? "not-allowed" : "pointer",
            padding: "6px 20px", borderRadius: 6,
            border: "1px solid #1d4ed8",
            background: syncAllState.phase === "loading" ? "#bfdbfe" : "#1d4ed8",
            color: syncAllState.phase === "loading" ? "#1e40af" : "#ffffff",
          }}
        >
          {syncAllState.phase === "loading" ? "Sincronizando todos los módulos…" : "Sincronizar todos los módulos"}
        </button>

        {syncAllState.phase === "loading" && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "#475569" }}>
            ⏳ Conectando con la fuente de datos… (puede tardar hasta 60 s)
          </span>
        )}
        {syncAllState.phase === "done" && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "#15803d" }}>
            ✓ Sincronización completa — historial actualizado ({syncAllState.ms} ms)
          </span>
        )}
        {syncAllState.phase === "error" && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "#b91c1c" }}>
            Error: {syncAllState.message}
          </span>
        )}
      </div>
    </div>
  );
}
