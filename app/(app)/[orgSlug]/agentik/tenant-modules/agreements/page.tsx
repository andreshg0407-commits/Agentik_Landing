/**
 * app/(app)/[orgSlug]/agentik/tenant-modules/agreements/page.tsx
 *
 * Commercial agreement management — SUPER_ADMIN / AGENTIK_ADMIN only.
 *
 * Sprint: AGENTIK-CUSTOM-COMMERCIAL-AGREEMENTS-01
 *
 * View, create, supersede, and expire tenant commercial agreements.
 * Does NOT create agreements automatically — admin must explicitly configure.
 */

import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { listAgreements, getActiveAgreement } from "@/lib/tenant/commercial-agreement-service";
import { getSellableModules } from "@/lib/tenant/module-catalog";
import { AgreementsClient } from "./agreements-client";
import {
  CASTILLITOS_BUNDLE_MODULE_KEYS,
  CASTILLITOS_CONTRACT_LIMITS,
  USAGE_METRIC_READINESS,
} from "@/lib/tenant/commercial-agreement-types";

export default async function AgreementsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireTenant(orgSlug);

  if (ctx.role !== "SUPER_ADMIN" && ctx.role !== "AGENTIK_ADMIN") {
    redirect(`/${orgSlug}`);
  }

  const [agreements, activeAgreement] = await Promise.all([
    listAgreements(ctx.orgId),
    getActiveAgreement(ctx.orgId),
  ]);

  const sellableModules = getSellableModules().map(m => ({
    key: m.key,
    name: m.name,
    category: m.category,
  }));

  return (
    <AgreementsClient
      orgSlug={orgSlug}
      agreements={agreements}
      activeAgreement={activeAgreement}
      sellableModules={sellableModules}
      castillitosPreset={{
        moduleKeys: CASTILLITOS_BUNDLE_MODULE_KEYS as string[],
        contractLimits: CASTILLITOS_CONTRACT_LIMITS.map(l => ({
          metricKey: l.metricKey,
          includedQuantity: l.includedQuantity,
          policy: l.policy,
          overagePriceCents: l.overagePriceCents,
          overageCurrency: l.overageCurrency,
          contractualNote: l.contractualNote,
        })),
      }}
      metricReadiness={USAGE_METRIC_READINESS as Record<string, string>}
    />
  );
}
