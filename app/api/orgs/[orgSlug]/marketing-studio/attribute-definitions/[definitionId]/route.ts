/**
 * app/api/orgs/[orgSlug]/marketing-studio/attribute-definitions/[definitionId]/route.ts
 *
 * MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01
 *
 * PATCH  — update label, required, sortOrder, helpText, destination, or options
 * DELETE — remove the definition (existing product attribute values are preserved)
 *
 * Note: `type` is immutable after creation to preserve existing product values.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  updateAttributeDefinition,
  deleteAttributeDefinition,
}                                    from "@/lib/marketing-studio/products/attribute-definitions/attribute-definition-repository";

type RouteContext = { params: Promise<{ orgSlug: string; definitionId: string }> };

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug, definitionId } = await params;
    const { organization }          = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      label?:       string;
      required?:    boolean;
      sortOrder?:   number;
      helpText?:    string | null;
      destination?: string | null;
      options?:     { value: string; label: string; sortOrder?: number }[];
    };

    const definition = await updateAttributeDefinition(organization.id, definitionId, body);
    if (!definition) {
      return NextResponse.json({ error: "Definición no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ definition });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug, definitionId } = await params;
    const { organization }          = await requireOrgAccess(orgSlug);

    const deleted = await deleteAttributeDefinition(organization.id, definitionId);
    if (!deleted) {
      return NextResponse.json({ error: "Definición no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
