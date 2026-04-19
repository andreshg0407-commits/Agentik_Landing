"use client";

import { useState } from "react";

type SyncTarget = "products" | "orders";

interface SyncResult {
  runId: string;
  synced: number;
  failed: number;
}

type PanelState =
  | { status: "idle" }
  | { status: "loading"; target: SyncTarget }
  | { status: "success"; target: SyncTarget; result: SyncResult }
  | { status: "error";   target: SyncTarget; error: string };

interface Props {
  organizationId: string;
  integrationId:  string;
}

export default function PyaSyncPanel({ organizationId, integrationId }: Props) {
  const [state, setState] = useState<PanelState>({ status: "idle" });

  async function triggerSync(target: SyncTarget) {
    setState({ status: "loading", target });

    const path = target === "products" ? "sync-products" : "sync-orders";
    const url  = `/api/integrations/pya/${integrationId}/${path}`;

    try {
      const res  = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setState({ status: "error", target, error: data.error ?? "Error en la sincronización." });
        return;
      }

      setState({ status: "success", target, result: data.result });
    } catch (e) {
      setState({
        status: "error",
        target,
        error: e instanceof Error ? e.message : "Error inesperado.",
      });
    }
  }

  const loading = state.status === "loading";

  return (
    <>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        <button
          onClick={() => triggerSync("products")}
          disabled={loading}
        >
          {state.status === "loading" && state.target === "products"
            ? "Sincronizando productos…"
            : "Sincronizar productos"}
        </button>
        <button
          onClick={() => triggerSync("orders")}
          disabled={loading}
        >
          {state.status === "loading" && state.target === "orders"
            ? "Sincronizando pedidos…"
            : "Sincronizar pedidos"}
        </button>
      </div>

      {state.status === "success" && (
        <p>
          <strong>{state.target === "products" ? "Productos" : "Pedidos"} sincronizados.</strong>{" "}
          {state.result.synced} actualizados, {state.result.failed} fallidos.
          Ejecución: <code>{state.result.runId}</code>
        </p>
      )}

      {state.status === "error" && (
        <p style={{ color: "red" }}>
          Error al sincronizar {state.target === "products" ? "productos" : "pedidos"}: {state.error}
        </p>
      )}
    </>
  );
}
