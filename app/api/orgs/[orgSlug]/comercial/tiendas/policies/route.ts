/**
 * POST /api/orgs/[orgSlug]/comercial/tiendas/policies
 *
 * Actions: list, save, toggle_active, get_for_store, add_rule, remove_rule, rule_catalog
 *
 * Sprint: TIENDAS-POLICY-FOUNDATION-01
 * Sprint: TIENDAS-RULE-CATALOG-INTEGRATION-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  listStorePolicies,
  saveStorePolicy,
  toggleStorePolicyActive,
  getStorePolicyByStoreId,
  addRuleToStore,
  removeRuleFromStore,
} from "@/lib/comercial/tiendas/store-policy-service";
import { getStoreRuleCatalog } from "@/lib/comercial/tiendas/store-replenishment-service";
import { validateRuleAgainstCatalog } from "@/lib/comercial/tiendas/store-rule-catalog";

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
      const policies = await listStorePolicies(orgId);
      return NextResponse.json({ policies });
    }

    case "get_for_store": {
      const policy = await getStorePolicyByStoreId(orgId, body.storeId);
      return NextResponse.json({ policy });
    }

    case "save": {
      const policy = await saveStorePolicy(orgId, {
        storeId:   body.storeId,
        storeName: body.storeName,
        rules:     body.rules ?? [],
        capacity:  body.capacity,
        active:    body.active,
      });
      return NextResponse.json({ policy });
    }

    case "rule_catalog": {
      try {
        const catalog = await getStoreRuleCatalog(orgId);
        return NextResponse.json({ catalog });
      } catch {
        return NextResponse.json({ catalog: { lines: [], subgroupsByLine: {}, productClasses: [], sizeClasses: [] } });
      }
    }

    case "add_rule": {
      // Validate rule against catalog before saving (RULE-CATALOG-INTEGRATION-01)
      try {
        const catalog = await getStoreRuleCatalog(orgId);
        const validation = validateRuleAgainstCatalog(catalog, body.rule ?? {});
        if (!validation.valid) {
          return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
        }
      } catch {
        // Catalog unavailable — allow save (fail open for existing flows)
      }

      const policy = await addRuleToStore(orgId, body.storeId, body.storeName, body.rule);
      return NextResponse.json({ policy });
    }

    case "remove_rule": {
      const policy = await removeRuleFromStore(orgId, body.storeId, body.ruleId);
      return NextResponse.json({ policy });
    }

    case "toggle_active": {
      const policy = await toggleStorePolicyActive(orgId, body.storeId);
      return NextResponse.json({ policy });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
