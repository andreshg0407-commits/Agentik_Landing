/**
 * app/api/public/catalogs/[slug]/route.ts
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-LINKS-01
 *
 * Public API — no authentication required.
 *
 * GET /api/public/catalogs/{slug}
 *   → returns the public-safe catalog view for a given link slug
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   - No auth headers required
 *   - getPublicCatalogView() strips all internal identifiers before returning
 *   - Response never contains: organizationId, userId, emails, admin configs
 *   - Access tracking (accessCount, lastAccessAt) is updated on each request
 */

import { NextRequest, NextResponse }   from "next/server";
import { getPublicCatalogView }        from "@/lib/marketing-studio/catalogs/catalog-public-link-repository";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;

    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    const view = await getPublicCatalogView(slug);

    if (!view) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Add cache headers — public catalogs can be cached briefly
    // but must not be stale for long (products change)
    return NextResponse.json(
      { view },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.error("[public catalog GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
