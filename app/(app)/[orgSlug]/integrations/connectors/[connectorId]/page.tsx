/**
 * Connector detail page — /{orgSlug}/integrations/connectors/{connectorId}
 *
 * Shows connector metadata, recent run history, and sync controls.
 */

import { notFound }           from "next/navigation";
import Link                   from "next/link";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { prisma }             from "@/lib/prisma";
import ContextHeader          from "@/components/app/context-header";
import { statusLabel }        from "@/lib/ui/status-labels";
import ConnectorSyncPanel     from "./connector-sync-panel";

// ── Source display names ───────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  sag_pya_soap:    "SAG PYA SOAP (ERP)",
  castillitos_crm: "Castillitos CRM",
  sag_pya:         "SAG PYA (archivo)",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ConnectorDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; connectorId: string }>;
}) {
  const { orgSlug, connectorId } = await params;
  const { organization }         = await requireOrgAccess(orgSlug);

  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, organizationId: organization.id },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 10,
        select: {
          id: true, module: true, status: true,
          startedAt: true, finishedAt: true,
          rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true,
          cursorBefore: true, cursorAfter: true,
          error: true,
        },
      },
    },
  });

  if (!connector) notFound();

  const modules   = connector.modules as string[];
  const lastRun   = connector.runs[0];

  return (
    <main>
      <ContextHeader organization={organization} />

      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href={`/${orgSlug}/integrations`}
          style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
        >
          ← Integraciones
        </Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>{connector.name}</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
        {sourceLabel(connector.source)}
      </p>

      {/* ── Metadata ──────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <dl style={{
          display: "grid", gridTemplateColumns: "160px 1fr",
          gap: "8px 0", fontSize: 13,
        }}>
          <dt style={{ color: "#6b7280", fontWeight: 600 }}>Estado</dt>
          <dd style={{ margin: 0 }}>{statusLabel(connector.status)}</dd>

          <dt style={{ color: "#6b7280", fontWeight: 600 }}>Fuente</dt>
          <dd style={{ margin: 0, fontFamily: "monospace", fontSize: 12 }}>
            {connector.source}
          </dd>

          <dt style={{ color: "#6b7280", fontWeight: 600 }}>Módulos</dt>
          <dd style={{ margin: 0, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {modules.map(m => (
              <span
                key={m}
                style={{
                  fontSize: 11, padding: "1px 8px", borderRadius: 4,
                  background: "#f1f5f9", color: "#334155", fontFamily: "monospace",
                }}
              >
                {m}
              </span>
            ))}
          </dd>

          {lastRun && (
            <>
              <dt style={{ color: "#6b7280", fontWeight: 600 }}>Última ejecución</dt>
              <dd style={{ margin: 0 }}>
                {lastRun.startedAt.toISOString().slice(0, 19).replace("T", " ")} UTC
                {" — "}
                {statusLabel(lastRun.status)}
                {" — "}
                {lastRun.rowsImported ?? 0} importados
              </dd>
            </>
          )}

          <dt style={{ color: "#6b7280", fontWeight: 600 }}>ID</dt>
          <dd style={{ margin: 0, fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>
            {connector.id}
          </dd>
        </dl>
      </section>

      {/* ── Sync controls ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          Control de sincronización
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          <b>Verificar</b> lee la primera página del origen sin escribir nada.{" "}
          <b>Sincronizar</b> ejecuta la importación completa e incrementa el cursor.
        </p>
        <ConnectorSyncPanel
          orgSlug={orgSlug}
          connectorId={connector.id}
          modules={modules}
        />
      </section>

      {/* ── Run history ───────────────────────────────────────────────────── */}
      {connector.runs.length > 0 && (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            Historial de ejecuciones
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Módulo</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Estado</th>
                <th style={{ textAlign: "right", padding: "6px 12px 6px 0" }}>Leídos</th>
                <th style={{ textAlign: "right", padding: "6px 12px 6px 0" }}>Importados</th>
                <th style={{ textAlign: "right", padding: "6px 12px 6px 0" }}>Errores</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Iniciada</th>
                <th style={{ textAlign: "left", padding: "6px 0" }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {connector.runs.map(run => (
                <tr
                  key={run.id}
                  style={{ borderBottom: "1px solid #f3f4f6", color: run.status === "FAILED" ? "#b91c1c" : undefined }}
                >
                  <td style={{ padding: "8px 12px 8px 0", fontFamily: "monospace" }}>{run.module}</td>
                  <td style={{ padding: "8px 12px 8px 0" }}>{statusLabel(run.status)}</td>
                  <td style={{ padding: "8px 12px 8px 0", textAlign: "right" }}>{run.rowsRead ?? "—"}</td>
                  <td style={{ padding: "8px 12px 8px 0", textAlign: "right" }}>{run.rowsImported ?? "—"}</td>
                  <td style={{ padding: "8px 12px 8px 0", textAlign: "right", color: (run.rowsErrored ?? 0) > 0 ? "#b91c1c" : undefined }}>
                    {run.rowsErrored ?? 0}
                  </td>
                  <td style={{ padding: "8px 12px 8px 0", color: "#6b7280" }}>
                    {run.startedAt.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td style={{ padding: "8px 0", color: "#b91c1c", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {run.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
