/**
 * Integrations list page — /{orgSlug}/integrations
 *
 * Shows all configured integrations for the org in two sections:
 *  1. Conectores del sistema (Connector model — sag_pya_soap, castillitos_crm, …)
 *  2. Integraciones PYA legacy (Integration model — provider=PYA)
 *
 * Server component — zero client JS on this page.
 */

import Link from "next/link";
import { IntegrationProvider } from "@prisma/client";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";
import ContextHeader        from "@/components/app/context-header";
import { statusLabel }      from "@/lib/ui/status-labels";

// ── Connector source display names ────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  sag_pya_soap:    "SAG PYA SOAP (ERP)",
  castillitos_crm: "Castillitos CRM",
  sag_pya:         "SAG PYA (archivo)",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

// ── Status badge colours ───────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:   "#166534",
  INACTIVE: "#92400e",
  SYNCING:  "#1e40af",
  ERROR:    "#991b1b",
  ACTIVE_INTEGRATION: "#166534",
  PAUSED:   "#374151",
};

function statusDot(status: string): React.ReactNode {
  const color = STATUS_COLOR[status] ?? "#666";
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, marginRight: 6, flexShrink: 0,
    }} />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  // Load both models in parallel
  const [connectors, integrations] = await Promise.all([
    prisma.connector.findMany({
      where:   { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: {
            id: true, module: true, status: true,
            startedAt: true, finishedAt: true,
            rowsImported: true, rowsErrored: true, error: true,
          },
        },
      },
    }),
    prisma.integration.findMany({
      where:   { organizationId: orgId, provider: IntegrationProvider.PYA },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, status: true, lastSyncedAt: true, lastError: true },
    }),
  ]);

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1 style={{ marginBottom: 4 }}>Integraciones</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>
        Conectores y fuentes de datos configurados para esta organización.
      </p>

      {/* ── Section 1: Connector core adapters ────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          Conectores del sistema
        </h2>

        {connectors.length === 0 ? (
          <p style={{ fontSize: 13, color: "#888" }}>
            Sin conectores configurados.{" "}
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>
              POST /api/orgs/{orgSlug}/connectors
            </span>{" "}
            para registrar uno.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Nombre</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Fuente</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Estado</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Módulos</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Última ejecución</th>
                <th style={{ textAlign: "left", padding: "6px 0" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map(connector => {
                const lastRun = connector.runs[0];
                return (
                  <tr
                    key={connector.id}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    {/* Nombre */}
                    <td style={{ padding: "10px 12px 10px 0", fontWeight: 600 }}>
                      {connector.name}
                    </td>

                    {/* Fuente */}
                    <td style={{ padding: "10px 12px 10px 0", color: "#374151" }}>
                      {sourceLabel(connector.source)}
                    </td>

                    {/* Estado */}
                    <td style={{ padding: "10px 12px 10px 0" }}>
                      <span style={{ display: "flex", alignItems: "center" }}>
                        {statusDot(connector.status)}
                        {statusLabel(connector.status)}
                      </span>
                    </td>

                    {/* Módulos */}
                    <td style={{ padding: "10px 12px 10px 0" }}>
                      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(connector.modules as string[]).map(m => (
                          <span
                            key={m}
                            style={{
                              fontSize: 11, padding: "1px 6px", borderRadius: 4,
                              background: "#f1f5f9", color: "#334155", fontFamily: "monospace",
                            }}
                          >
                            {m}
                          </span>
                        ))}
                      </span>
                    </td>

                    {/* Última ejecución */}
                    <td style={{ padding: "10px 12px 10px 0", color: "#6b7280", fontSize: 12 }}>
                      {lastRun ? (
                        <span>
                          {lastRun.module} · {statusLabel(lastRun.status)}{" "}
                          · {lastRun.rowsImported ?? 0} importados
                          {lastRun.startedAt
                            ? ` · ${lastRun.startedAt.toISOString().slice(0, 10)}`
                            : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#d1d5db" }}>Sin ejecuciones</span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td style={{ padding: "10px 0", whiteSpace: "nowrap" }}>
                      <Link
                        href={`/${orgSlug}/integrations/connectors/${connector.id}`}
                        style={{
                          fontSize: 12, fontWeight: 600,
                          color: "#2563eb", textDecoration: "none",
                          padding: "3px 10px", border: "1px solid #bfdbfe",
                          borderRadius: 4, background: "#eff6ff",
                        }}
                      >
                        Abrir →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Section 2: Legacy PYA integrations ────────────────────────────── */}
      {integrations.length > 0 && (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            Integraciones PYA (legacy)
          </h2>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Nombre</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Estado</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Última sincronización</th>
                <th style={{ textAlign: "left", padding: "6px 0" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map(integration => (
                <tr
                  key={integration.id}
                  style={{ borderBottom: "1px solid #f3f4f6" }}
                >
                  <td style={{ padding: "10px 12px 10px 0", fontWeight: 600 }}>
                    {integration.name ?? "Integración PYA"}
                  </td>

                  <td style={{ padding: "10px 12px 10px 0" }}>
                    <span style={{ display: "flex", alignItems: "center" }}>
                      {statusDot(String(integration.status))}
                      {statusLabel(String(integration.status))}
                    </span>
                  </td>

                  <td style={{ padding: "10px 12px 10px 0", fontSize: 12, color: "#6b7280" }}>
                    {integration.lastSyncedAt
                      ? integration.lastSyncedAt.toISOString().slice(0, 19).replace("T", " ") + " UTC"
                      : <span style={{ color: "#d1d5db" }}>Nunca</span>}
                  </td>

                  <td style={{ padding: "10px 0" }}>
                    <Link
                      href={`/${orgSlug}/integrations/pya/${integration.id}`}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        color: "#2563eb", textDecoration: "none",
                        padding: "3px 10px", border: "1px solid #bfdbfe",
                        borderRadius: 4, background: "#eff6ff",
                      }}
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {connectors.length === 0 && integrations.length === 0 && (
        <div style={{
          border: "1px dashed #d1d5db", borderRadius: 8,
          padding: "32px 24px", textAlign: "center", color: "#9ca3af",
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
            Sin integraciones configuradas
          </div>
          <div style={{ fontSize: 13 }}>
            Ejecute el script de configuración o use la API para registrar conectores.
          </div>
        </div>
      )}
    </main>
  );
}
