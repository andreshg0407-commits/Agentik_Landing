/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/estadisticas/page.tsx
 *
 * SHOPIFY-STATISTICS-UI-01 — Estadísticas Shopify
 *
 * Server Component. Responsibilities:
 *   1. Auth + org access check
 *   2. Shopify connection check via resolveShopifyContextStatus (single check)
 *   3. Vault credential resolution — single call, never reaches client
 *   4. getOverview() — full statistics snapshot for the week
 *   5. Recent Copilot executions for tenant (Level 4 context)
 *   6. Pass serializable data → StatisticsClient (no secrets in props)
 *
 * Architecture:
 *   - accessToken never passed to client
 *   - Statistics consumed as signals; Copilot recommendations via /execute pipeline
 *   - No business logic in UI layer — all computation in service layer
 */
import { redirect }                    from "next/navigation";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { C, T, S, R }                  from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader }  from "@/components/workspace/operational-workspace-header";
import { Panel }                       from "@/components/shell/primitives";

import { resolveShopifyContextStatus,
         vaultShopifyContextResolver } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import { getOverview }                 from "@/lib/marketing-studio/commerce/shopify-statistics-service";
import type { StatisticsOverview }     from "@/lib/marketing-studio/commerce/shopify-statistics-types";
import { prisma }                      from "@/lib/prisma";

import { StatisticsClient }            from "./statistics-client";
import type { RecentExecution }        from "./statistics-client";

// ── Disconnected state ─────────────────────────────────────────────────────────

function DisconnectedState({
  orgSlug,
  code,
}: {
  orgSlug: string;
  code: string;
}) {
  const messages: Record<string, string> = {
    shopify_connection_not_found: "No hay una conexión Shopify registrada para esta organización.",
    shopify_connection_disabled:  "La conexión Shopify está inactiva o fue desconectada.",
    shopify_shop_domain_missing:  "La conexión existe pero no tiene dominio de tienda configurado.",
    shopify_access_token_missing: "Faltan credenciales de acceso en el Vault seguro.",
    shopify_context_resolution_failed: "Error al verificar la conexión. Inténtalo de nuevo.",
  };
  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Estadísticas Shopify"
        subtitle="Inteligencia comercial · Señales Copilot · Trazabilidad"
        status="neutral"
        statusLabel="Sin conexión Shopify"
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify", href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Estadísticas" },
        ]}
      />
      <Panel>
        <div style={{ padding: `${S[10]}px ${S[4]}px`, textAlign: "center" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: C.blueLight, border: `1px solid ${C.blueBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: `0 auto ${S[4]}px`,
          }}>
            <span style={{ fontSize: 22 }}>📊</span>
          </div>
          <div style={{ fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            Estadísticas no disponibles
          </div>
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, maxWidth: 400, margin: `0 auto ${S[5]}px`, lineHeight: 1.6 }}>
            {messages[code] ?? "Conecta tu tienda Shopify para acceder a estadísticas en tiempo real."}
          </div>
          <a
            href={`/${orgSlug}/agentik/marketing-studio/shopify`}
            style={{
              display: "inline-block", padding: `${S[2]}px ${S[4]}px`,
              background: C.blueDark, color: C.white,
              borderRadius: R.md, fontSize: T.sz.sm, textDecoration: "none",
            }}
          >
            Ir a Shopify Commerce OS →
          </a>
        </div>
      </Panel>
    </div>
  );
}

// ── Error state ────────────────────────────────────────────────────────────────

function ErrorState({ orgSlug, shopDomain }: { orgSlug: string; shopDomain: string }) {
  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Estadísticas Shopify"
        subtitle={shopDomain}
        status="warning"
        statusLabel="Error al cargar estadísticas"
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify", href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Estadísticas" },
        ]}
      />
      <Panel>
        <div style={{ padding: `${S[8]}px ${S[4]}px`, textAlign: "center" }}>
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[3] }}>
            No fue posible obtener estadísticas desde Shopify en este momento.
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
            La tienda Shopify puede estar temporalmente no disponible. Inténtalo de nuevo.
          </div>
        </div>
      </Panel>
    </div>
  );
}

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

  // ── 1. Connection check (single resolveShopifyContextStatus call) ──────────
  const connectionStatus = await resolveShopifyContextStatus({ tenantId });

  if (!connectionStatus.ok) {
    return <DisconnectedState orgSlug={orgSlug} code={connectionStatus.code} />;
  }

  // ── 2. Vault credential resolution — single call, never passed to client ──
  const shopifyCtx = await vaultShopifyContextResolver()(
    { executionId: "", correlationId: "", tenantId, userId: "", requestedAt: new Date() },
  );

  if (!shopifyCtx) {
    return <DisconnectedState orgSlug={orgSlug} code="shopify_context_resolution_failed" />;
  }

  // ── 3. Statistics + recent executions (parallel) ──────────────────────────
  let overview: StatisticsOverview | null = null;
  let recentExecutions: RecentExecution[] = [];

  const [overviewResult, executionsResult] = await Promise.allSettled([
    getOverview(tenantId, shopifyCtx.accessToken, shopifyCtx.shopDomain, "week"),
    (prisma as any).copilotExecution.findMany({
      where:   { tenantId },
      orderBy: { startedAt: "desc" },
      take:    6,
      select: {
        executionId:     true,
        planTitle:       true,
        status:          true,
        startedAt:       true,
        completedSteps:  true,
        failedSteps:     true,
        approvalRequired: true,
        durationMs:      true,
      },
    }),
  ]);

  if (overviewResult.status === "fulfilled") {
    overview = overviewResult.value;
  }
  if (executionsResult.status === "fulfilled") {
    recentExecutions = executionsResult.value.map((e: any) => ({
      executionId:     e.executionId,
      planTitle:       e.planTitle,
      status:          e.status,
      startedAt:       e.startedAt.toISOString(),
      completedSteps:  e.completedSteps,
      failedSteps:     e.failedSteps,
      approvalRequired: e.approvalRequired,
      durationMs:      e.durationMs ?? null,
    }));
  }

  // ── 4. Render ─────────────────────────────────────────────────────────────
  if (!overview) {
    return <ErrorState orgSlug={orgSlug} shopDomain={shopifyCtx.shopDomain} />;
  }

  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Estadísticas Shopify"
        subtitle={shopifyCtx.shopDomain}
        status={
          overview.insights.some(i => i.severity === "critical") ? "critical" :
          overview.insights.some(i => i.severity === "warning")  ? "warning"  :
          "ok"
        }
        statusLabel={
          overview.insights.length === 0          ? "Sin alertas activas" :
          `${overview.insights.length} señal${overview.insights.length !== 1 ? "es" : ""} Copilot`
        }
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
        shopDomain={shopifyCtx.shopDomain}
      />
    </div>
  );
}
