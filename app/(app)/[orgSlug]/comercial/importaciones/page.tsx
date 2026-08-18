/**
 * /[orgSlug]/comercial/importaciones
 *
 * Importaciones — Server Component wrapper.
 * Loads import intelligence data with on-demand activation.
 *
 * RUNTIME ACTIVATION (05A2):
 *   When cache is empty (SOURCE_UNAVAILABLE), triggers a single prewarm
 *   attempt inline. This ensures the module activates on first visit
 *   without depending exclusively on a cron that may not have executed.
 *
 *   States:
 *     CERTIFIED  — fresh cache hit
 *     STALE      — expired cache, serving last good snapshot
 *     LOADING    — prewarm triggered inline (first visit)
 *     SOURCE_DOWN — prewarm attempted and failed, no prior snapshot
 *
 * Sprint: IMPORTS-CANONICAL-REPORTS-RUNTIME-05A2
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getCachedImportIntelligence,
  prewarmImportCache,
} from "@/lib/comercial/importaciones/import-intelligence-cache";
import type { CachedImportTruthState } from "@/lib/comercial/importaciones/import-intelligence-cache";
import { ImportacionesClient } from "./importaciones-client";

export default async function ImportacionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  let cached = await getCachedImportIntelligence(orgId);
  let runtimeState: CachedImportTruthState = cached.truthState;

  // On-demand activation: if no snapshot exists, trigger prewarm inline
  if (cached.truthState === "SOURCE_UNAVAILABLE") {
    const prewarmResult = await prewarmImportCache(orgId);
    if (prewarmResult.ok) {
      // Re-read the now-warm cache
      cached = await getCachedImportIntelligence(orgId);
      runtimeState = cached.truthState;
    } else {
      runtimeState = "SOURCE_UNAVAILABLE";
    }
  }

  const { items, kpis } = cached.result;

  return (
    <ImportacionesClient
      orgSlug={orgSlug}
      items={items}
      kpis={kpis}
      truthState={runtimeState}
      freshness={cached.freshness}
      computedAt={cached.computedAt}
    />
  );
}
