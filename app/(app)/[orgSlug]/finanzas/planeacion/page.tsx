/**
 * /[orgSlug]/finanzas/planeacion
 *
 * Planeación Financiera — Server Component wrapper.
 * Handles auth + loads real FPA data → delegates to PlaneacionClient.
 *
 * Sprint: AGENTIK-FINANCIAL-TRUTH-01 — Phase 6: Planeación real
 */

import { requireOrgAccess }         from "@/lib/auth/org-access";
import { getEnabledModules }        from "@/lib/tenant/modules";
import { PlaneacionClient }         from "./planeacion-client";
import {
  getFpaBudgets,
  getFpaVariance,
  getFpaCashFlow,
  getFpaRevenueForecast,
  buildFpaRecommendations,
} from "@/lib/finance/fpa-queries";
import { computeCashFlowConfidence } from "@/lib/finance/source-confidence";

export default async function PlaneacionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const year = new Date().getFullYear();

  const [mods, budgets, variance, cashFlow, forecast, cashConfidence] = await Promise.all([
    getEnabledModules(organization.id),
    getFpaBudgets(organization.id, year).catch(() => []),
    getFpaVariance(organization.id, year).catch(() => ({ rows: [], hasData: false })),
    getFpaCashFlow(organization.id).catch(() => null),
    getFpaRevenueForecast(organization.id).catch(() => null),
    computeCashFlowConfidence(organization.id).catch(() => null),
  ]);

  const recommendations =
    forecast && cashFlow
      ? buildFpaRecommendations(forecast, variance, cashFlow)
      : [];

  return (
    <PlaneacionClient
      orgSlug={orgSlug}
      enabledModules={[...mods]}
      budgets={budgets}
      variance={variance}
      cashFlow={cashFlow ?? undefined}
      forecast={forecast ?? undefined}
      recommendations={recommendations}
      cashConfidenceLevel={cashConfidence?.level ?? "LOW"}
      cashConfidenceReasons={cashConfidence?.reasons ?? []}
      hasBank={cashConfidence?.hasBank ?? false}
      hasBudgets={cashConfidence?.hasBudgets ?? false}
    />
  );
}
