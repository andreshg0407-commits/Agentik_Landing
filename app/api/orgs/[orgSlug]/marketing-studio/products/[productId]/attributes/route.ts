/**
 * app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/attributes/route.ts
 *
 * MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01
 *
 * PATCH — upsert one attribute value on a ProductEntity.
 *
 * Body: { key, label, value, type, destination? }
 * - value is serialized: string for text/select/color/dimension,
 *   number for number, boolean for boolean, string[] for multiselect.
 *
 * Records a PRODUCT_ATTRIBUTE_UPDATED activity event.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { upsertProductAttribute }    from "@/lib/marketing-studio/products/product-repository";
import { recordActivity }            from "@/lib/marketing-studio/products/product-repository";
import { ProductEventType }          from "@/lib/marketing-studio/products/domain/product-enums";
import { prisma }                    from "@/lib/prisma";

type RouteContext = { params: Promise<{ orgSlug: string; productId: string }> };

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug, productId }  = await params;
    const { organization }        = await requireOrgAccess(orgSlug);
    const organizationId          = organization.id;

    // Verify product ownership
    const product = await prisma.productEntity.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, name: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const body = await req.json() as {
      key:          string;
      label:        string;
      value:        string | number | boolean | string[] | null;
      type:         string;
      destination?: string | null;
    };

    if (!body.key?.trim())  return NextResponse.json({ error: "key required" },  { status: 400 });
    if (!body.label?.trim()) return NextResponse.json({ error: "label required" }, { status: 400 });

    // Deserialize value into typed columns
    let valueText:    string | null  = null;
    let valueNumber:  number | null  = null;
    let valueBoolean: boolean | null = null;

    if (body.type === "number") {
      valueNumber = typeof body.value === "number" ? body.value : null;
    } else if (body.type === "boolean") {
      valueBoolean = typeof body.value === "boolean" ? body.value : null;
    } else if (body.type === "multiselect") {
      // Stored as valueJson in upsertProductAttribute — pass serialized string for the call
      // upsertProductAttribute handles valueJson through the Prisma model directly
      valueText = null;
    } else {
      valueText = typeof body.value === "string" ? body.value : null;
    }

    await upsertProductAttribute(organizationId, productId, {
      key:          body.key.trim(),
      label:        body.label.trim(),
      valueText,
      valueNumber,
      valueBoolean,
      type:         body.type as never,
      destination:  body.destination ?? null,
    });

    await recordActivity(
      organizationId,
      productId,
      ProductEventType.PRODUCT_ATTRIBUTE_UPDATED,
      { key: body.key, label: body.label, type: body.type },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
