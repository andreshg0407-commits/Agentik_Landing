/**
 * /[orgSlug]/finanzas/tesoreria
 *
 * Tesorería Operativa — Server Component wrapper.
 * Handles auth + delegates rendering to TesoreriaClient (interactive layer).
 *
 * Sprint: AGENTIK-TREASURY-POLISH-03
 */

import { requireOrgAccess }       from "@/lib/auth/org-access";
import { TesoreriaClient }        from "./tesoreria-client";
import { getCashKpis }            from "@/lib/castillitos/cash-kpis";
import { getBankingSnapshot }     from "@/lib/finance/banking";
import { getGraphHealthSummary }  from "@/lib/finance/graph";

export default async function TesoreriaPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const [cashKpis, bankingSnapshot, graphHealth] = await Promise.all([
    getCashKpis(organization.id).catch(() => null),
    getBankingSnapshot(organization.id).catch(() => null),
    getGraphHealthSummary(organization.id).catch(() => null),
  ]);

  return (
    <TesoreriaClient
      orgSlug={orgSlug}
      cashKpis={cashKpis ?? undefined}
      bankingSnapshot={bankingSnapshot ?? undefined}
      graphIssueCount={(graphHealth?.criticalIssues ?? 0) + (graphHealth?.warningIssues ?? 0)}
      graphCriticalCount={graphHealth?.criticalIssues ?? 0}
    />
  );
}
