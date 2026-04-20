/**
 * GET /api/orgs/[orgSlug]/marketing-studio/assets/[assetId]/download
 *
 * Same-origin download proxy for generated assets.
 *
 * Fetches the stored assetUrl server-side and streams it back with
 * Content-Disposition: attachment so the browser always downloads the
 * actual image file regardless of CORS or URL expiry visibility.
 *
 * Using this instead of <a href={assetUrl} download> avoids Safari's
 * behaviour of issuing a fresh cross-origin request that can 404 when
 * the provider URL (Replicate) has already been served from browser
 * cache for <img> display but is expired on the server.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { getDbAsset }                 from "@/lib/marketing-studio/asset-service";
import { getDbSession }               from "@/lib/marketing-studio/session-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string; assetId: string }> };

const EXT_FOR_MIME: Record<string, string> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif":  "gif",
};

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, assetId } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    const asset = await getDbAsset(assetId);
    if (!asset) {
      return NextResponse.json({ error: "ASSET_NOT_FOUND" }, { status: 404 });
    }

    // Verify the asset belongs to this org via its session
    const session = await getDbSession(asset.sessionId);
    if (!session || session.organizationId !== organization.id) {
      return NextResponse.json({ error: "ASSET_NOT_FOUND" }, { status: 404 });
    }

    if (!asset.assetUrl) {
      return NextResponse.json({ error: "Asset not ready" }, { status: 404 });
    }

    // Fetch the asset bytes server-side (no CORS, no browser cache quirks)
    const upstream = await fetch(asset.assetUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Asset source returned ${upstream.status}` },
        { status: 502 },
      );
    }

    const rawContentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const mimeType       = rawContentType.split(";")[0].trim();
    const ext            = EXT_FOR_MIME[mimeType] ?? "jpg";
    const filename       = `foto-estudio-${asset.assetType}-${assetId.slice(-8)}.${ext}`;

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":        mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(buffer.byteLength),
        "Cache-Control":       "no-store",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
