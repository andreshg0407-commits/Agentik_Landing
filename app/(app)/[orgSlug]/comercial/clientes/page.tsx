/**
 * /[orgSlug]/comercial/clientes
 *
 * Clientes — Centro Operativo de Clientes.
 * Sprint: CLIENTS-CANONICAL-TRUTH-03A1 — single AR snapshot per page load
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadArContext, loadClientesSummary, loadClientesPage } from "@/lib/comercial/clientes/client-loader";
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

  // Single AR context — shared by summary and page loaders (one SAG call)
  const arCtx = await loadArContext(organization.id);

  const [summary, pageResult] = await Promise.all([
    loadClientesSummary(organization.id, arCtx),
    loadClientesPage(organization.id, { page, search, filter }, arCtx),
  ]);

  return (
    <ClientesClient
      orgSlug={orgSlug}
      summary={summary}
      pageResult={pageResult}
      currentFilter={filter}
      currentSearch={search}
    />
  );
}
