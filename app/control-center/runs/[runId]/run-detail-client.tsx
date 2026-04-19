"use client";

import { useState } from "react";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

export default function RunDetailClient({ runId }: { runId: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(status: "RUNNING" | "SUCCEEDED" | "FAILED") {
    setLoading(true);
    setErr(null);

    try {
      await api(`/api/runs/${runId}`, {
        method: "PATCH",
        body: JSON.stringify(
          status === "SUCCEEDED"
            ? { status, outputJson: { demo: true } }
            : status === "FAILED"
            ? { status, errorJson: { message: "demo fail" } }
            : { status }
        ),
      });

      // refrescar la página para ver cambios
      window.location.reload();
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <button
          className="border rounded px-2 py-1 text-sm"
          onClick={() => patch("RUNNING")}
          disabled={loading}
        >
          RUNNING
        </button>
        <button
          className="border rounded px-2 py-1 text-sm"
          onClick={() => patch("SUCCEEDED")}
          disabled={loading}
        >
          SUCCEEDED
        </button>
        <button
          className="border rounded px-2 py-1 text-sm"
          onClick={() => patch("FAILED")}
          disabled={loading}
        >
          FAILED
        </button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      {loading && <div className="text-sm text-muted-foreground">Actualizando…</div>}
    </div>
  );
}