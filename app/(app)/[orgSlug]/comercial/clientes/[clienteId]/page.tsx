/**
 * /[orgSlug]/comercial/clientes/[clienteId]
 *
 * Cliente 360 — Vista detalle operativa.
 * Sprint: CLIENTES-360-01 Phase 1
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadCliente360 } from "@/lib/comercial/clientes/cliente-360-loader";
import { Cliente360Client } from "./cliente-360-client";
import { NotFoundClient } from "./not-found-client";

export default async function Cliente360Page({
  params,
}: {
  params: Promise<{ orgSlug: string; clienteId: string }>;
}) {
  const { orgSlug, clienteId } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const data = await loadCliente360(organization.id, clienteId);

  if (!data) {
    return <NotFoundClient orgSlug={orgSlug} />;
  }

  return <Cliente360Client orgSlug={orgSlug} data={data} />;
}
