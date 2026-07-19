/**
 * app/api/orgs/[orgSlug]/marketing-studio/attribute-definitions/import/route.ts
 *
 * AGENTIK-ATTRIBUTE-IMPORT-01 — SAG → Attribute Import Endpoint
 *
 * POST — Receive external product data (SAG, Shopify, ERP) and run
 *        the attribute normalization pipeline for one or more products.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   requireOrgAccess on every request.
 *   organizationId is always derived from the authenticated session —
 *   never from the request body.
 *
 * ── Request body ─────────────────────────────────────────────────────────────
 *   {
 *     tenantSlug: string,                    // used for field map resolution
 *     products: [
 *       {
 *         agentikProductId: string,           // ProductEntity.id
 *         externalData: {
 *           externalId:  string,             // SAG product ID
 *           source:      string,             // "sag" | "shopify" | ...
 *           fields: [
 *             { externalField: string, externalValue: string }
 *           ]
 *         }
 *       }
 *     ]
 *   }
 *
 * ── Response ──────────────────────────────────────────────────────────────────
 *   200: { result: BatchImportResult }
 *   400: { error: string }     — validation failure
 *   401/403: auth errors
 *   500: { error: string }
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import { runAttributeImportPipeline }   from "@/lib/marketing-studio/attributes/attribute-import-pipeline";
import type { ExternalProductField }    from "@/lib/marketing-studio/attributes/attribute-import-types";
import type { AttributeImportSource }   from "@/lib/marketing-studio/attributes/attribute-import-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

const VALID_SOURCES: AttributeImportSource[] = [
  "sag", "shopify", "erp_generic", "manual",
];

export async function POST(
  req:     NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug }      = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      tenantSlug?: string;
      products?:   unknown[];
    };

    // ── Validation ───────────────────────────────────────────────────────────
    if (!Array.isArray(body.products) || body.products.length === 0) {
      return NextResponse.json(
        { error: "products must be a non-empty array" },
        { status: 400 },
      );
    }

    const tenantSlug = body.tenantSlug ?? orgSlug;

    // Validate product records
    const products: {
      agentikProductId: string;
      externalData: {
        externalId: string;
        source:     AttributeImportSource;
        fields:     ExternalProductField[];
      };
    }[] = [];

    for (const raw of body.products) {
      const p = raw as Record<string, unknown>;
      if (typeof p.agentikProductId !== "string" || !p.agentikProductId) {
        return NextResponse.json(
          { error: "Each product must have agentikProductId (string)" },
          { status: 400 },
        );
      }
      const ext = p.externalData as Record<string, unknown> | undefined;
      if (!ext || typeof ext.externalId !== "string") {
        return NextResponse.json(
          { error: "Each product must have externalData.externalId" },
          { status: 400 },
        );
      }
      if (!VALID_SOURCES.includes(ext.source as AttributeImportSource)) {
        return NextResponse.json(
          { error: `externalData.source must be one of: ${VALID_SOURCES.join(", ")}` },
          { status: 400 },
        );
      }
      if (!Array.isArray(ext.fields)) {
        return NextResponse.json(
          { error: "externalData.fields must be an array" },
          { status: 400 },
        );
      }

      products.push({
        agentikProductId: p.agentikProductId,
        externalData: {
          externalId: ext.externalId,
          source:     ext.source as AttributeImportSource,
          fields:     (ext.fields as unknown[]).map((f: unknown) => {
            const field = f as Record<string, unknown>;
            return {
              externalField: String(field.externalField ?? ""),
              externalValue: String(field.externalValue ?? ""),
            };
          }),
        },
      });
    }

    // ── Run pipeline ─────────────────────────────────────────────────────────
    const result = await runAttributeImportPipeline({
      organizationId: organization.id,
      tenantSlug,
      products,
    });

    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
