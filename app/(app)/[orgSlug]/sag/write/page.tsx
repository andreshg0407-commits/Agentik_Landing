/**
 * /{orgSlug}/sag/write
 *
 * Cola de Aprobación SAG — operator-facing queue for all SAG write operations.
 *
 * Server component: fetches all data at render time.
 * Client components: SagWriteRowActions (approve / reject / retry buttons).
 */

import Link                   from "next/link";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { prisma }             from "@/lib/prisma";
import ContextHeader          from "@/components/app/context-header";
import { statusLabel, badgeTone } from "@/lib/ui/status-labels";
import SagWriteRowActions     from "./sag-write-row-actions";

// ── Write type labels ─────────────────────────────────────────────────────────

const WRITE_TYPE_LABEL: Record<number, string> = {
  1:  "Cliente",
  2:  "Documento",
  3:  "Tercero",
  5:  "Artículo",
  6:  "Recibo / Egreso",
  28: "Doc. genérico",
};

function writeTypeLabel(tipo: number): string {
  return WRITE_TYPE_LABEL[tipo] ?? `Tipo ${tipo}`;
}

const RISK_LABEL: Record<string, string> = {
  LOW:    "Bajo",
  MEDIUM: "Medio",
  HIGH:   "Alto",
};

const RISK_COLOR: Record<string, string> = {
  LOW:    "#15803d",
  MEDIUM: "#b45309",
  HIGH:   "#b91c1c",
};

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

// ── Valid filter values ───────────────────────────────────────────────────────

const FILTER_STATUSES = ["ALL", "PENDING", "APPROVED", "SENDING", "SUCCEEDED", "FAILED", "REJECTED"] as const;
type FilterStatus = typeof FILTER_STATUSES[number];

const FILTER_LABEL: Record<FilterStatus, string> = {
  ALL:      "Todas",
  PENDING:  "Pendientes",
  APPROVED: "Aprobadas",
  SENDING:  "Enviando",
  SUCCEEDED:"Exitosas",
  FAILED:   "Fallidas",
  REJECTED: "Rechazadas",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SagWriteQueuePage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgSlug }  = await params;
  const sp           = await searchParams;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const canApprove = ["MANAGER", "ORG_ADMIN", "SUPER_ADMIN"].includes(membership.role);

  const rawFilter = sp.status?.toUpperCase() ?? "ALL";
  const filter    = (FILTER_STATUSES as readonly string[]).includes(rawFilter)
    ? (rawFilter as FilterStatus)
    : "ALL";

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const [operations, kpis] = await Promise.all([
    prisma.sagWriteOperation.findMany({
      where: {
        organizationId: organization.id,
        ...(filter !== "ALL" ? { status: filter } : {}),
      },
      orderBy: { initiatedAt: "desc" },
      take:    200,
      select: {
        id:            true,
        writeType:     true,
        status:        true,
        risk:          true,
        description:   true,
        sourceRef:     true,
        initiatedBy:   true,
        initiatedAt:   true,
        approvedBy:    true,
        approvedAt:    true,
        sentAt:        true,
        retryCount:    true,
        lastError:     true,
        sagResponseOk: true,
      },
    }),
    prisma.sagWriteOperation.groupBy({
      by:     ["status"],
      where:  { organizationId: organization.id },
      _count: { _all: true },
    }),
  ]);

  // KPI map
  const kpiMap = Object.fromEntries(kpis.map(k => [k.status, k._count._all]));
  const kpiPending   = kpiMap["PENDING"]   ?? 0;
  const kpiApproved  = (kpiMap["APPROVED"] ?? 0) + (kpiMap["SENDING"] ?? 0);
  const kpiSucceeded = kpiMap["SUCCEEDED"] ?? 0;
  const kpiFailed    = kpiMap["FAILED"]    ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main>
      <ContextHeader organization={organization} />

      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link href={`/${orgSlug}/integrations`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
          ← Integraciones
        </Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>Cola de Aprobación SAG</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
        Todas las escrituras al ERP SAG requieren aprobación humana antes de ser enviadas.
      </p>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12, marginBottom: 28,
      }}>
        {([
          { label: "Pendientes",      value: kpiPending,   color: "#888",    filter: "PENDING"   },
          { label: "En vuelo",        value: kpiApproved,  color: "#1565c0", filter: "APPROVED"  },
          { label: "Exitosas",        value: kpiSucceeded, color: "#15803d", filter: "SUCCEEDED" },
          { label: "Fallidas",        value: kpiFailed,    color: "#b91c1c", filter: "FAILED"    },
        ] as const).map(kpi => (
          <Link
            key={kpi.filter}
            href={`/${orgSlug}/sag/write?status=${kpi.filter}`}
            style={{ textDecoration: "none" }}
          >
            <div style={{
              border: `1px solid ${filter === kpi.filter ? kpi.color : "#e5e7eb"}`,
              borderRadius: 8, padding: "14px 18px", background: "#fff",
              cursor: "pointer",
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{kpi.label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Status filter tabs ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {FILTER_STATUSES.map(s => (
          <Link
            key={s}
            href={s === "ALL" ? `/${orgSlug}/sag/write` : `/${orgSlug}/sag/write?status=${s}`}
            style={{
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
              border: `1px solid ${filter === s ? "#374151" : "#d1d5db"}`,
              background: filter === s ? "#374151" : "#fff",
              color:      filter === s ? "#fff"    : "#374151",
              textDecoration: "none",
            }}
          >
            {FILTER_LABEL[s]}
          </Link>
        ))}
      </div>

      {/* ── Operations table ───────────────────────────────────────────────── */}
      {operations.length === 0 ? (
        <div style={{
          padding: "40px 0", textAlign: "center",
          color: "#9ca3af", fontSize: 14, borderTop: "1px solid #e5e7eb",
        }}>
          No hay operaciones{filter !== "ALL" ? ` con estado "${FILTER_LABEL[filter]}"` : ""}.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Tipo</th>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Descripción / Referencia</th>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Estado</th>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Riesgo</th>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Iniciado por</th>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Iniciado</th>
              <th style={{ textAlign: "left", padding: "6px 12px 6px 0" }}>Aprobado / Enviado</th>
              <th style={{ textAlign: "left", padding: "6px 0" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {operations.map(op => (
              <tr key={op.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                {/* Tipo */}
                <td style={{ padding: "10px 12px 10px 0" }}>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4,
                    background: "#f1f5f9", color: "#334155", fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}>
                    {writeTypeLabel(op.writeType)}
                  </span>
                </td>

                {/* Descripción */}
                <td style={{ padding: "10px 12px 10px 0", maxWidth: 280 }}>
                  <div style={{ fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {op.description}
                  </div>
                  {op.sourceRef && (
                    <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                      {op.sourceRef}
                    </div>
                  )}
                  {op.lastError && op.status === "FAILED" && (
                    <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {op.lastError}
                    </div>
                  )}
                </td>

                {/* Estado */}
                <td style={{ padding: "10px 12px 10px 0", whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: 700, color: badgeTone(op.status) }}>
                    {statusLabel(op.status)}
                  </span>
                  {op.retryCount > 0 && (
                    <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>
                      ×{op.retryCount}
                    </span>
                  )}
                </td>

                {/* Riesgo */}
                <td style={{ padding: "10px 12px 10px 0", whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 11, color: RISK_COLOR[op.risk] ?? "#888" }}>
                    {RISK_LABEL[op.risk] ?? op.risk}
                  </span>
                </td>

                {/* Iniciado por */}
                <td style={{ padding: "10px 12px 10px 0", color: "#6b7280", fontFamily: "monospace", fontSize: 11 }}>
                  {op.initiatedBy.slice(0, 12)}
                </td>

                {/* Fecha iniciado */}
                <td style={{ padding: "10px 12px 10px 0", color: "#6b7280", whiteSpace: "nowrap" }}>
                  {fmt(op.initiatedAt)}
                </td>

                {/* Aprobado / enviado */}
                <td style={{ padding: "10px 12px 10px 0", color: "#6b7280", whiteSpace: "nowrap" }}>
                  {fmt(op.sentAt ?? op.approvedAt)}
                </td>

                {/* Acciones */}
                <td style={{ padding: "10px 0" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <Link
                      href={`/${orgSlug}/sag/write/${op.id}`}
                      style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 4,
                        border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151",
                        textDecoration: "none", whiteSpace: "nowrap",
                      }}
                    >
                      Abrir
                    </Link>
                    {(op.status === "PENDING" || op.status === "FAILED") && (
                      <SagWriteRowActions
                        orgSlug={orgSlug}
                        operationId={op.id}
                        status={op.status}
                        canApprove={canApprove}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
