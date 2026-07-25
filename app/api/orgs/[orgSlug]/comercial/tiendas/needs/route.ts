/**
 * POST /api/orgs/[orgSlug]/comercial/tiendas/needs
 *
 * Actions:
 *   load     — paginated eligible needs with KPIs
 *   variants — lazy-load variants for a specific reference in a store
 *
 * Sprint: AGENTIK-STORES-NEEDS-ELIGIBLE-UNIVERSE-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  loadEligibleStoreNeeds,
  loadVariantsForReference,
} from "@/lib/comercial/tiendas/store-needs-eligible-universe";
import { resolveActiveStores } from "@/lib/comercial/tiendas/store-governance-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "load": {
      const filter = {
        storeId: body.filter?.storeId as string | undefined,
        world:   body.filter?.world   as string | undefined,
        status:  body.filter?.status  as string | undefined,
      };
      const limit  = Math.min(body.limit  ?? 50, 200);
      const offset = body.offset ?? 0;

      const result = await loadEligibleStoreNeeds(orgId, filter as Parameters<typeof loadEligibleStoreNeeds>[1], limit, offset);
      return NextResponse.json(result);
    }

    case "variants": {
      const storeId       = body.storeId as string;
      const referenceCode = body.referenceCode as string;
      if (!storeId || !referenceCode) {
        return NextResponse.json({ error: "Missing storeId or referenceCode" }, { status: 400 });
      }

      // Resolve warehouseId from storeId slug
      const activeStores = await resolveActiveStores(orgId);
      const store = activeStores.find(s => s.slug === storeId || s.storeId === storeId);
      if (!store) {
        return NextResponse.json({ variants: [] });
      }

      const variants = await loadVariantsForReference(orgId, store.warehouseId, referenceCode);
      return NextResponse.json({ variants });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
