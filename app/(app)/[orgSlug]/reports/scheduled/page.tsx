/**
 * /[orgSlug]/reports/scheduled
 *
 * Reportes Programados — gestión de informes automáticos con distribución por email.
 *
 * Server-rendered: load existing scheduled reports, pass to ScheduledClient.
 * No layout changes. Standalone page reachable from the reports copilot header.
 */

import Link                 from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { listScheduledReports } from "@/lib/scheduled-reports/service";
import { C, T, S, R }       from "@/lib/ui/tokens";
import ScheduledClient      from "./client";

export default async function ScheduledReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }         = await params;
  const { organization }    = await requireOrgAccess(orgSlug);
  const reports             = await listScheduledReports(organization.id, { limit: 50 });

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 760, margin: "0 auto", padding: "16px 12px 48px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: S[5] }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[1] + 2 }}>
          <Link href={`/${orgSlug}/reports`} style={{ fontSize: T.sz.sm, color: C.inkLight, textDecoration: "none" }}>
            ← Informes
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: S[2] }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: T.wt.black, color: C.ink }}>
              Reportes Programados
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: T.sz.sm, color: C.inkLight }}>
              Informes automáticos con distribución por email · Semanal o mensual
            </p>
          </div>
          <div style={{
            fontSize: T.sz.xs, padding: "3px 10px", borderRadius: R.sm,
            background: C.brandLight, color: C.brand, fontWeight: T.wt.bold,
            border: `1px solid ${C.brandBorder}`,
          }}>
            {reports.filter(r => r.isActive).length} activo{reports.filter(r => r.isActive).length !== 1 ? "s" : ""}
            {" · "}
            {reports.length} total
          </div>
        </div>
      </div>

      {/* ── Client panel (templates + list + create + toggle) ── */}
      <ScheduledClient orgSlug={orgSlug} initialReports={reports} />

    </div>
  );
}
