"use client";

import { useEffect, useMemo, useState } from "react";

type RunRow = {
  id: string;
  organizationId: string;
  projectId: string | null;
  agentId: string | null;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

type ResolveOrgResp = {
  ok: true;
  organizationId: string;
  projectId: string;
  projectKey?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data as T;
}

export default function RunsTable() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [orgId, setOrgId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [take, setTake] = useState(20);

  // ✅ Auto-resolve org/project once (Agentik seed)
  useEffect(() => {
    async function resolveOrg() {
      try {
        setErr(null);
        const data = await api<ResolveOrgResp>("/api/orgs/resolve?slug=agentik");
        setOrgId(data.organizationId);
        setProjectId(data.projectId);
      } catch (e: any) {
        setErr(e.message ?? "Failed to resolve org");
      }
    }

    // Solo resolvemos si no hay orgId aún
    if (!orgId) resolveOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (orgId) p.set("organizationId", orgId);
    if (projectId) p.set("projectId", projectId);
    p.set("take", String(take));
    return p.toString();
  }, [orgId, projectId, take]);

  async function refresh() {
    if (!orgId) return; // ✅ evita fetch antes de tener contexto
    setLoading(true);
    setErr(null);

    try {
      const data = await api<{ ok: true; runs: RunRow[] }>(`/api/runs?${query}`);
      setRuns(data.runs);
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  // ✅ refresh automático cuando ya tengamos IDs / cambien filtros
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function createTestRun() {
    setErr(null);

    try {
      if (!orgId) {
        setErr("No hay organizationId aún (resolve falló).");
        return;
      }

      const payload = {
        organizationId: orgId,
        projectId: projectId || undefined,
        type: "marketing.image_to_video",
        input: { image: "test.jpg" },
      };

      const r = await api<{ ok: true; runId: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await refresh();
      alert(`✅ Run creado: ${r.runId}`);
    } catch (e: any) {
      setErr(e.message ?? "Error");
    }
  }

  async function patch(runId: string, status: string) {
    setErr(null);

    try {
      await api<{ ok: true }>(`/api/runs/${runId}`, {
        method: "PATCH",
        body: JSON.stringify(
          status === "SUCCEEDED"
            ? { status, outputJson: { demo: true } }
            : status === "FAILED"
            ? { status, errorJson: { message: "demo fail" } }
            : { status }
        ),
      });

      await refresh();
    } catch (e: any) {
      setErr(e.message ?? "Error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm">organizationId</label>
          <input
            className="border rounded px-3 py-2 text-sm w-[340px]"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="cmc..."
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm">projectId (opcional)</label>
          <input
            className="border rounded px-3 py-2 text-sm w-[340px]"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="cmc..."
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm">take</label>
          <input
            className="border rounded px-3 py-2 text-sm w-[120px]"
            type="number"
            min={1}
            max={100}
            value={take}
            onChange={(e) => setTake(Math.min(Math.max(Number(e.target.value), 1), 100))}
          />
        </div>

        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={refresh}
          disabled={loading || !orgId}
          title={!orgId ? "Esperando resolve de org..." : ""}
        >
          {loading ? "Cargando..." : "Refrescar"}
        </button>

        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={createTestRun}
          disabled={!orgId}
          title={!orgId ? "Esperando resolve de org..." : ""}
        >
          + Create test run
        </button>

        <a
          className="text-sm underline ml-auto"
          href="/api/debug/orgs"
          target="_blank"
          rel="noreferrer"
        >
          Ver orgs (debug)
        </a>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="border rounded overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-2">id</th>
              <th className="p-2">type</th>
              <th className="p-2">status</th>
              <th className="p-2">created</th>
              <th className="p-2">actions</th>
            </tr>
          </thead>

          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono text-xs">{r.id}</td>
                <td className="p-2">{r.type}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="p-2 flex gap-2">
                  <button
                    className="border rounded px-2 py-1"
                    onClick={() => patch(r.id, "RUNNING")}
                  >
                    RUNNING
                  </button>
                  <button
                    className="border rounded px-2 py-1"
                    onClick={() => patch(r.id, "SUCCEEDED")}
                  >
                    SUCCEEDED
                  </button>
                  <button
                    className="border rounded px-2 py-1"
                    onClick={() => patch(r.id, "FAILED")}
                  >
                    FAILED
                  </button>
                  <a
  className="underline px-2 py-1"
  href={`/control-center/runs/${r.id}`}
>
  detalle
</a>
                </td>
              </tr>
            ))}

            {!loading && runs.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  No hay runs aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}