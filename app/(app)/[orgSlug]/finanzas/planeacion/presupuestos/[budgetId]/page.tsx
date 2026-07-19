/**
 * /[orgSlug]/finanzas/planeacion/presupuestos/[budgetId]
 *
 * Vista operativa de detalle de un presupuesto vivo.
 * Server Component wrapper — auth + delegate to BudgetDetailClient.
 *
 * Sprint: AGENTIK-FINANCE-BUDGET-DETAIL-01
 */

import { requireOrgAccess }    from "@/lib/auth/org-access";
import { BudgetDetailClient }  from "./budget-detail-client";

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; budgetId: string }>;
}) {
  const { orgSlug, budgetId } = await params;
  await requireOrgAccess(orgSlug);
  return <BudgetDetailClient orgSlug={orgSlug} budgetId={budgetId} />;
}
