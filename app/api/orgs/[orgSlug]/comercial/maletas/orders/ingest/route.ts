/**
 * POST /api/orgs/[orgSlug]/comercial/maletas/orders/ingest
 *
 * Records sold quantity for one or more order lines.
 * Backward compatibility note (AGENTIK-COMERCIAL-SALES-PORTFOLIO-TERMINOLOGY-01):
 *   These endpoints live under /maletas for Castillitos backward compatibility.
 *   Domain concept: Sales Portfolio order deduction.
 * Finds the vendor's active bag, deducts from the item,
 * recalculates availableToSellQty, and emits commercial signals
 * when pressure is triggered.
 *
 * Single line:
 *   { salesRepId, reference, qtySold, orderRef?, soldAt? }
 *
 * Batch:
 *   { lines: [{ salesRepId, reference, qtySold, orderRef?, soldAt? }, ...] }
 *
 * Responses:
 *   Single: { ok, result: OrderLineResult }
 *   Batch:  { ok, processed, succeeded, failed, results: OrderLineResult[] }
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-PERSISTENCE-ORDERS-01
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import {
  ingestOrderLine,
  ingestOrderLineBatch,
  type OrderLineInput,
}                                        from "@/lib/comercial/maletas/order-ingest-service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as
      | OrderLineInput
      | { lines: OrderLineInput[] };

    // Batch mode
    if ("lines" in body) {
      if (!Array.isArray(body.lines) || body.lines.length === 0) {
        return NextResponse.json(
          { ok: false, error: "lines array is required and must not be empty" },
          { status: 400 },
        );
      }
      const batch = await ingestOrderLineBatch(organization.id, body.lines);
      return NextResponse.json({ ok: true, ...batch });
    }

    // Single mode
    if (!body.salesRepId || !body.reference || typeof body.qtySold !== "number") {
      return NextResponse.json(
        { ok: false, error: "salesRepId, reference, and qtySold are required" },
        { status: 400 },
      );
    }
    if (body.qtySold <= 0) {
      return NextResponse.json(
        { ok: false, error: "qtySold must be greater than 0" },
        { status: 400 },
      );
    }

    const result = await ingestOrderLine(organization.id, body);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, result },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
