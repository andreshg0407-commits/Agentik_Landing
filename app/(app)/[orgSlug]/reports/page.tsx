/**
 * Centro de Control Ejecutivo — server page.
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-INTEGRATION-02
 *
 * Assembles intelligence from all engines and passes to client.
 * The dashboard NEVER calculates — it only displays.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { assembleDashboardState } from "@/lib/executive-dashboard";
import { loadCastillitosExecutiveIntelligence } from "@/lib/executive-dashboard/castillitos-executive-loader";
import { ExecutiveControlCenter } from "./executive-dashboard-client";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  // ── Dashboard state (signals, events, etc.) ─────────────────────────────
  const state = assembleDashboardState({
    orgSlug,
    signals: [],
    events: [],
    ruleResults: [],
    plans: [],
    decisions: [],
    actions: [],
    kpis: [],
    traces: [],
  });

  // ── Full Executive Intelligence ─────────────────────────────────────────
  const intel = await loadCastillitosExecutiveIntelligence(organization.id, orgSlug);

  return (
    <ExecutiveControlCenter
      orgSlug={orgSlug}
      state={state}
      availabilityReport={intel.availabilityReport}
      maletaReport={intel.maletaReport}
      productionReport={intel.productionReport}
      executiveIntelligence={intel}
    />
  );
}
