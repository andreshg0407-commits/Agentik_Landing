/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/[catalogId]/qr/route.ts
 *
 * MARKETING-STUDIO-CATALOG-QR-SHARING-01
 *
 * GET /api/orgs/{orgSlug}/marketing-studio/catalog-definitions/{catalogId}/qr
 *   → returns a print-quality QR PNG for the catalog's active public link
 *
 * Query params:
 *   download=true  → Content-Disposition: attachment (triggers browser save)
 *   (default)      → Content-Disposition: inline (renders in browser / img tag)
 *
 * Status codes:
 *   200 — PNG returned
 *   404 — Catalog not found, or link inactive/expired/missing
 *   500 — QR generation failed
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   requireOrgAccess validates the session before any QR is generated.
 *   The QR itself encodes only the public URL — no internal IDs are returned.
 */

import { headers }               from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import { generateCatalogQrPng }  from "@/lib/marketing-studio/catalogs/catalog-qr-service";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgSlug: string; catalogId: string }>;
}

function resolveBaseUrl(hdrs: Headers): string {
  // Prefer explicit env var — most reliable across environments
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  const host  = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const hdrs    = await headers();
    const baseUrl = resolveBaseUrl(hdrs);

    const result = await generateCatalogQrPng(organization.id, catalogId, baseUrl);

    const download    = req.nextUrl.searchParams.get("download") === "true";
    const disposition = download
      ? `attachment; filename="${result.fileName}"`
      : `inline; filename="${result.fileName}"`;

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type":        "image/png",
        "Content-Disposition": disposition,
        "Content-Length":      String(result.buffer.length),
        // Short private cache — public link could be regenerated at any time
        "Cache-Control":       "private, max-age=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[catalog QR]", err);

    if (
      message === "no_link" ||
      message === "link_expired" ||
      message === "link_inactive"
    ) {
      return NextResponse.json(
        { error: "Catalog is not published or the link is unavailable" },
        { status: 404 },
      );
    }

    if (message.includes("not found")) {
      return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "QR generation failed" }, { status: 500 });
  }
}
