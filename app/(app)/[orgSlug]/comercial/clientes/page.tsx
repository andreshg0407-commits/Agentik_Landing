/**
 * /[orgSlug]/comercial/clientes
 *
 * Clientes — Centro Operativo de Clientes.
 * Sprint: CLIENTES-PERFORMANCE-HOTFIX-01 — server-side pagination
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadClientesSummary, loadClientesPage } from "@/lib/comercial/clientes/client-loader";
import { isReceivableDataCertified, warmTruthStatusCache } from "@/lib/comercial/frontline/receivable-truth-status";
import { ClientesClient } from "./clientes-client";

export default async function ClientesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { organization } = await requireOrgAccess(orgSlug);

  const page = Math.max(parseInt(String(sp.page ?? "1"), 10) || 1, 1);
  const search = String(sp.q ?? "");
  const filter = (sp.filter ?? "todos") as "todos" | "activos" | "inactivos" | "con_cartera" | "con_vendedor" | "sin_compra_90d" | "con_crm" | "sin_crm";

  // Warm truth status cache before parallel loads (client-loader also warms,
  // but doing it here ensures cache is ready for the arCertified prop)
  await warmTruthStatusCache();
  const arCertified = isReceivableDataCertified(organization.id);

  const [summary, pageResult] = await Promise.all([
    loadClientesSummary(organization.id),
    loadClientesPage(organization.id, { page, search, filter }),
  ]);

  return (
    <ClientesClient
      orgSlug={orgSlug}
      summary={summary}
      pageResult={pageResult}
      currentFilter={filter}
      currentSearch={search}
      arCertified={arCertified}
    />
  );
}
