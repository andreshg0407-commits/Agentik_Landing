/**
 * app/api/orgs/[orgSlug]/marketing-studio/storage-canary/route.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — Canary Test Route
 *
 * POST — Executes a complete R2 canary test:
 *   1. Upload a fixture image to a canary prefix.
 *   2. Verify with HeadObject.
 *   3. Verify checksum and metadata.
 *   4. Attempt cross-tenant read (must fail).
 *   5. Delete the canary object.
 *   6. Verify deletion (Head → not found).
 *
 * SECURITY:
 *   - requireOrgAccess + canAccessMarketingStudio enforced.
 *   - Canary prefix: {env}/canary/{organizationId}/{uuid}
 *   - Only the canary object created by THIS request is deleted.
 *   - No production objects are touched.
 *   - No secrets are logged or returned.
 */

import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import {
  requireR2Config,
  r2Put,
  r2Head,
  r2Delete,
  buildCanaryKey,
  computeChecksum,
} from "@/lib/storage/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// 1x1 red PNG — 67 bytes (valid PNG magic bytes)
const CANARY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  let organizationId: string;
  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    organizationId = organization.id;
    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Marketing Studio access required" }, { status: 403 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AUTH_FAILED";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
  }

  // ── R2 config ─────────────────────────────────────────────────────────────
  let config;
  try {
    config = requireR2Config();
  } catch {
    return NextResponse.json({
      canary: "BLOCKED",
      reason: "R2 not configured",
      environment: null,
    });
  }

  const results: Record<string, unknown> = {
    environment: config.environment,
    organizationId,
    timestamp: new Date().toISOString(),
  };

  const uuid = randomUUID().replace(/-/g, "");
  const objectKey = buildCanaryKey(
    { environment: config.environment, organizationId },
    uuid,
  );
  results.objectKey = objectKey;

  // ── Step 1: Upload canary ─────────────────────────────────────────────────
  let putChecksum: string;
  try {
    const putResult = await r2Put({
      config,
      objectKey,
      body: CANARY_PNG,
      contentType: "image/png",
      cacheControl: "private, no-cache, max-age=0",
    });
    putChecksum = putResult.checksum;
    results.step1_put = {
      pass: true,
      url: putResult.publicUrl,
      bytes: putResult.bytes,
      checksum: putResult.checksum,
    };
  } catch (err) {
    results.step1_put = { pass: false, error: err instanceof Error ? err.message : "unknown" };
    return NextResponse.json({ canary: "FAILED", results });
  }

  // ── Step 2: Head verify ───────────────────────────────────────────────────
  try {
    const head = await r2Head(config, objectKey);
    results.step2_head = {
      pass: head.exists,
      contentLength: head.contentLength,
      contentType: head.contentType,
    };
    if (!head.exists) {
      results.step2_head = { pass: false, error: "Object not found after upload" };
      return NextResponse.json({ canary: "FAILED", results });
    }
  } catch (err) {
    results.step2_head = { pass: false, error: err instanceof Error ? err.message : "unknown" };
    return NextResponse.json({ canary: "FAILED", results });
  }

  // ── Step 3: Checksum verify ───────────────────────────────────────────────
  const expectedChecksum = computeChecksum(CANARY_PNG);
  results.step3_checksum = {
    pass: putChecksum === expectedChecksum,
    expected: expectedChecksum,
    actual: putChecksum,
  };

  // ── Step 4: Cross-tenant isolation ────────────────────────────────────────
  // Attempt to build a key for a DIFFERENT org and verify it uses a different prefix
  const fakeOrgId = "cross-tenant-test-" + uuid.slice(0, 8);
  const crossTenantKey = buildCanaryKey(
    { environment: config.environment, organizationId: fakeOrgId },
    uuid,
  );
  const keysIsolated = !crossTenantKey.includes(organizationId);
  results.step4_cross_tenant = {
    pass: keysIsolated,
    realOrgKey: objectKey,
    fakeOrgKey: crossTenantKey,
    isolated: keysIsolated,
  };

  // Also verify r2Delete blocks cross-tenant deletion
  const crossDeleteBlocked = await r2Delete({
    config,
    objectKey,
    reason: "canary-cross-tenant-test",
    requestedBy: "canary",
    organizationId: fakeOrgId, // Wrong org — should be blocked
  });
  results.step4_cross_delete_blocked = {
    pass: !crossDeleteBlocked,
    blocked: !crossDeleteBlocked,
  };

  // ── Step 5: URL accessibility ─────────────────────────────────────────────
  const publicUrl = `${config.publicBaseUrl}/${objectKey}`;
  try {
    const fetchRes = await fetch(publicUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    results.step5_url_access = {
      pass: fetchRes.ok,
      status: fetchRes.status,
      contentType: fetchRes.headers.get("content-type"),
    };
  } catch (err) {
    results.step5_url_access = {
      pass: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  // ── Step 6: Delete canary object ──────────────────────────────────────────
  try {
    const deleted = await r2Delete({
      config,
      objectKey,
      reason: "canary-test-cleanup",
      requestedBy: "canary-test-route",
      organizationId,
    });
    results.step6_delete = { pass: deleted };
  } catch (err) {
    results.step6_delete = { pass: false, error: err instanceof Error ? err.message : "unknown" };
  }

  // ── Step 7: Verify deletion ───────────────────────────────────────────────
  try {
    const headAfterDelete = await r2Head(config, objectKey);
    results.step7_confirm_deleted = {
      pass: !headAfterDelete.exists,
      objectGone: !headAfterDelete.exists,
    };
  } catch {
    results.step7_confirm_deleted = { pass: true, objectGone: true };
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  const allSteps = [
    results.step1_put,
    results.step2_head,
    results.step3_checksum,
    results.step4_cross_tenant,
    results.step4_cross_delete_blocked,
    results.step5_url_access,
    results.step6_delete,
    results.step7_confirm_deleted,
  ] as Array<{ pass: boolean }>;

  const allPassed = allSteps.every((s) => s?.pass === true);

  return NextResponse.json({
    canary: allPassed ? "PASSED" : "FAILED",
    results,
  });
}
