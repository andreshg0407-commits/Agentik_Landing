/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/estadisticas/page.tsx
 *
 * SHOPIFY-STATISTICS-UI-01 + SHOPIFY-STATISTICS-UX-02
 * Shopify Commercial Intelligence Console — Server Component
 *
 * Architecture:
 *   - Single unified render path regardless of connection/data state
 *   - `connected` and `overview` passed to StatisticsClient; client handles all states
 *   - No early returns for disconnected/error states — client renders placeholders
 *   - accessToken resolved once, never passed to client
 *   - Vault credential resolution short-circuits gracefully when not connected
 */
import { redirect }                    from "next/navigation";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { T }                           from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader }  from "@/components/workspace/operational-workspace-header";

import { resolveShopifyContextStatus,
         vaultShopifyContextResolver } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import { getOverview }                 from "@/lib/marketing-studio/commerce/shopify-statistics-service";
import type { StatisticsOverview }     from "@/lib/marketing-studio/commerce/shopify-statistics-types";
import { prisma }                      from "@/lib/prisma";

import { StatisticsClient }            from "./statistics-client";
import type { RecentExecution }        from "./statistics-client";

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function EstadisticasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  const tenantId = organization.id;

  // ── 1. Connection check ────────────────────────────────────────────────────
  const connectionStatus = await resolveShopifyContextStatus({ tenantId });
  const connected        = connectionStatus.ok;

  // Start with what we know from the connection status
  let shopDomain:      string                  = connectionStatus.shopDomain ?? "";
  let overview:        StatisticsOverview | null = null;
  let recentExecutions: RecentExecution[]       = [];

  // ── 2. Vault + data fetch (only when connected) ────────────────────────────
  if (connected) {
    const shopifyCtx = await vaultShopifyContextResolver()(
      { executionId: "", correlationId: "", tenantId, userId: "", requestedAt: new Date() },
    );

    if (shopifyCtx) {
      shopDomain = shopifyCtx.shopDomain;

      const [overviewResult, executionsResult] = await Promise.allSettled([
        getOverview(tenantId, shopifyCtx.accessToken, shopifyCtx.shopDomain, "week"),
        (prisma as any).copilotExecution.findMany({
          where:   { tenantId },
          orderBy: { startedAt: "desc" },
          take:    6,
          select:  {
            executionId:      true,
            planTitle:        true,
            status:           true,
            startedAt:        true,
            completedSteps:   true,
            failedSteps:      true,
            approvalRequired: true,
            durationMs:       true,
          },
        }),
      ]);

      if (overviewResult.status === "fulfilled") {
        overview = overviewResult.value;
      }
      if (executionsResult.status === "fulfilled") {
        recentExecutions = executionsResult.value.map((e: any) => ({
          executionId:      e.executionId,
          planTitle:        e.planTitle,
          status:           e.status,
          startedAt:        e.startedAt.toISOString(),
          completedSteps:   e.completedSteps,
          failedSteps:      e.failedSteps,
          approvalRequired: e.approvalRequired,
          durationMs:       e.durationMs ?? null,
        }));
      }
    }
  }

  // ── 3. Determine header status ─────────────────────────────────────────────
  const headerStatus =
    !connected                                              ? "neutral"  :
    overview?.insights.some(i => i.severity === "critical") ? "critical" :
    overview?.insights.some(i => i.severity === "warning")  ? "warning"  :
    overview                                                ? "ok"       :
    "warning";

  const headerStatusLabel =
    !connected                ? "Integración requerida"          :
    !overview                 ? "Error al cargar datos"           :
    overview.insights.length === 0
      ? "Sin alertas activas"
      : `${overview.insights.length} señal${overview.insights.length !== 1 ? "es" : ""} Copilot`;

  // ── 4. Render — always a unified layout ───────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Estadísticas Shopify"
        subtitle={shopDomain || "Inteligencia comercial · Señales Copilot"}
        status={headerStatus}
        statusLabel={headerStatusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Estadísticas" },
        ]}
      />

      <StatisticsClient
        orgSlug={orgSlug}
        overview={overview}
        recentExecutions={recentExecutions}
        shopDomain={shopDomain}
        connected={connected}
      />
    </div>
  );
}
