/**
 * app/api/orgs/[orgSlug]/marketing-studio/attribute-definitions/route.ts
 *
 * MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01
 *
 * GET  — list all attribute definitions for the org
 * POST — create a new attribute definition
 *
 * Security: requireOrgAccess on every request.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  listAttributeDefinitions,
  createAttributeDefinition,
}                                    from "@/lib/marketing-studio/products/attribute-definitions/attribute-definition-repository";
import { ATTRIBUTE_VALUE_TYPE_VALUES } from "@/lib/marketing-studio/products/domain/product-enums";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug }    = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const definitions = await listAttributeDefinitions(organization.id);
    return NextResponse.json({ definitions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug }    = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      key:          string;
      label:        string;
      type:         string;
      required?:    boolean;
      sortOrder?:   number;
      helpText?:    string | null;
      destination?: string | null;
      options?:     { value: string; label: string; sortOrder?: number }[];
    };

    if (!body.key?.trim())   return NextResponse.json({ error: "key required" },  { status: 400 });
    if (!body.label?.trim()) return NextResponse.json({ error: "label required" }, { status: 400 });
    if (!ATTRIBUTE_VALUE_TYPE_VALUES.includes(body.type as never)) {
      return NextResponse.json({ error: `type must be one of: ${ATTRIBUTE_VALUE_TYPE_VALUES.join(", ")}` }, { status: 400 });
    }

    const definition = await createAttributeDefinition({
      organizationId: organization.id,
      key:            body.key.trim(),
      label:          body.label.trim(),
      type:           body.type as never,
      required:       body.required    ?? false,
      sortOrder:      body.sortOrder   ?? 0,
      helpText:       body.helpText    ?? null,
      destination:    body.destination ?? null,
      options:        body.options     ?? [],
    });

    return NextResponse.json({ definition }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado";
    if (msg === "UNAUTHENTICATED")  return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")    return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Ya existe un atributo con esa clave para este org" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
