/**
 * POST /api/orgs/[orgSlug]/comercial/tiendas/warehouse-config
 *
 * Actions: list, save, toggle_active
 *
 * Sprint: COMERCIAL-TIENDAS-NO-HARDCODE-05
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  listWarehouseConfigs,
  saveWarehouseConfig,
  toggleWarehouseConfigActive,
} from "@/lib/comercial/tiendas/store-warehouse-config-service";

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
    case "list": {
      const configs = await listWarehouseConfigs(orgId);
      return NextResponse.json({ configs });
    }

    case "save": {
      const config = await saveWarehouseConfig(orgId, {
        id:               body.id,
        storeName:        body.storeName,
        sagWarehouseCode: body.sagWarehouseCode,
        city:             body.city,
        responsibleName:  body.responsibleName,
        storeType:        body.storeType,
        isMainWarehouse:  body.isMainWarehouse,
        active:           body.active,
      });
      return NextResponse.json({ config });
    }

    case "toggle_active": {
      const config = await toggleWarehouseConfigActive(orgId, body.configId);
      return NextResponse.json({ config });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
