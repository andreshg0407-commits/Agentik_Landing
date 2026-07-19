/**
 * GET /api/orgs/[orgSlug]/comercial/clientes/[clienteId]/360
 *
 * CLIENTES-DRAWER-360-01 — On-demand Cliente 360 data for drawer.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadCliente360 } from "@/lib/comercial/clientes/cliente-360-loader";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; clienteId: string }> },
) {
  const { orgSlug, clienteId } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const data = await loadCliente360(organization.id, clienteId);
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
