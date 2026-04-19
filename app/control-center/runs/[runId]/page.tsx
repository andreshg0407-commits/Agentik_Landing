import RunDetailClient from "./run-detail-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { runId: string };
};

async function getRun(runId: string) {
  // En server component usamos fetch absoluto relativo funciona ok
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/runs/${runId}`, {
    cache: "no-store",
  });

  // Si no tienes NEXT_PUBLIC_BASE_URL en local, el fetch relativo puede fallar.
  // Alternativa simple: usar relativo directamente:
  // const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" }); // (esto NO funciona en server)
  // Por eso usamos BASE_URL opcional.

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Failed to load run");
  return data.run;
}

export default async function RunDetailPage({ params }: PageProps) {
  const run = await getRun(params.runId);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Run Detail</h1>
          <p className="text-sm text-muted-foreground font-mono break-all">
            {run.id}
          </p>
        </div>

        <a className="text-sm underline" href="/control-center/runs">
          ← Volver a Runs
        </a>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="border rounded p-4 space-y-2">
          <div className="text-sm font-semibold">Estado</div>
          <div className="text-sm">
            <span className="font-mono">{run.status}</span>
          </div>

          <div className="text-sm font-semibold pt-2">Tipo</div>
          <div className="text-sm font-mono">{run.type}</div>
        </div>

        <div className="border rounded p-4 space-y-2">
          <div className="text-sm font-semibold">IDs</div>
          <div className="text-xs font-mono break-all">
            org: {run.organizationId}
          </div>
          <div className="text-xs font-mono break-all">
            project: {run.projectId ?? "—"}
          </div>
          <div className="text-xs font-mono break-all">
            agent: {run.agentId ?? "—"}
          </div>
        </div>

        <div className="border rounded p-4 space-y-2">
          <div className="text-sm font-semibold">Tiempos</div>
          <div className="text-xs">
            created: {new Date(run.createdAt).toLocaleString()}
          </div>
          <div className="text-xs">
            queued: {run.queuedAt ? new Date(run.queuedAt).toLocaleString() : "—"}
          </div>
          <div className="text-xs">
            started: {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
          </div>
          <div className="text-xs">
            ended: {run.endedAt ? new Date(run.endedAt).toLocaleString() : "—"}
          </div>
        </div>

        <div className="border rounded p-4 space-y-2">
          <div className="text-sm font-semibold">Control</div>
          <RunDetailClient runId={run.id} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <JsonPanel title="inputJson" value={run.inputJson} />
        <JsonPanel title="outputJson" value={run.outputJson} />
        <JsonPanel title="errorJson" value={run.errorJson} />
      </div>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: any }) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <pre className="text-xs overflow-auto bg-muted/30 rounded p-3">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}