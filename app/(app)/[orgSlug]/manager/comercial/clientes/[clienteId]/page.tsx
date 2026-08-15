/**
 * /[orgSlug]/manager/comercial/clientes/[clienteId] — Manager Client Detail.
 *
 * Sprint: AGENTIK-MANAGER-M2A
 *
 * Targeted canonicalization: reuses loadCliente360() from Desktop.
 * Assembles a Manager-appropriate PA — no Desktop UI imported.
 * Organization-scoped. Unknown/malformed clienteId → redirect to collection.
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadCliente360 } from "@/lib/comercial/clientes/cliente-360-loader";
import { assembleManagerClienteDetailPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { ClienteDetailClient } from "./cliente-detail-client";

export default async function ManagerClienteDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; clienteId: string }>;
}) {
  const { orgSlug, clienteId } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  // Fail closed: malformed or empty ID → redirect, never render
  if (!clienteId || clienteId.trim().length === 0) {
    redirect(`/${orgSlug}/manager/comercial/clientes`);
  }

  const data = await loadCliente360(orgId, clienteId);

  if (!data) {
    redirect(`/${orgSlug}/manager/comercial/clientes`);
  }

  const detailPA = assembleManagerClienteDetailPA(data);

  return <ClienteDetailClient detailPA={detailPA} orgSlug={orgSlug} />;
}
