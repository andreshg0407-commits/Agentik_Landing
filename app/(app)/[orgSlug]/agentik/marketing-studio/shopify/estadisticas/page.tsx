/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/estadisticas/page.tsx
 *
 * SHOPIFY-STATISTICS-UI-01 — Estadísticas Shopify
 * SHOPIFY-EMPTY-EXPERIENCE-01 — Intelligent guided empty states
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
 *   - DisconnectedState and ErrorState use ModuleEmptyState (reusable, non-Shopify-specific)
 */
import { redirect }                    from "next/navigation";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { T, S }                        from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader }  from "@/components/workspace/operational-workspace-header";
import { ModuleEmptyState }            from "@/components/workspace/module-empty-state";

import { resolveShopifyContextStatus,
         vaultShopifyContextResolver } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import { getOverview }                 from "@/lib/marketing-studio/commerce/shopify-statistics-service";
import type { StatisticsOverview }     from "@/lib/marketing-studio/commerce/shopify-statistics-types";
import { prisma }                      from "@/lib/prisma";

import { StatisticsClient }            from "./statistics-client";
import type { RecentExecution }        from "./statistics-client";

// ── Shared Shopify empty state props ──────────────────────────────────────────

const SHOPIFY_CAPABILITIES = [
  {
    icon:        "📊",
    title:       "Inteligencia comercial",
    description: "Análisis de ventas, pedidos, ticket promedio y tendencias por período.",
  },
  {
    icon:        "📈",
    title:       "Tendencias de crecimiento",
    description: "Copilot detecta oportunidades y anomalías antes de que sean problemas.",
  },
  {
    icon:        "🏷",
    title:       "Promociones y descuentos",
    description: "Visibilidad completa sobre códigos activos, conversión y uso.",
  },
  {
    icon:        "✍",
    title:       "Enriquecimiento SEO",
    description: "Copilot sugiere y ejecuta mejoras de contenido en productos del catálogo.",
  },
  {
    icon:        "🤖",
    title:       "Automatización segura",
    description: "Acciones ejecutadas con aprobación humana y trazabilidad total.",
  },
  {
    icon:        "📋",
    title:       "Historial auditable",
    description: "Cada recomendación ejecutada queda registrada con contexto completo.",
  },
];

const SHOPIFY_PREVIEW_SLOTS = [
  { label: "Ventas",          sub: "esta semana" },
  { label: "Pedidos",         sub: "totales" },
  { label: "Ticket promedio", sub: "AOV" },
  { label: "Conversión",      sub: "%" },
  { label: "Clientes nuevos", sub: "únicos" },
  { label: "Promociones",     sub: "activas" },
  { label: "Pendientes SEO",  sub: "productos" },
  { label: "Alertas Copilot", sub: "señales" },
];

const SHOPIFY_SETUP_STEPS = [
  { label: "Conectar tienda Shopify",         current: true },
  { label: "Sincronizar catálogo de productos" },
  { label: "Generar primeras estadísticas" },
  { label: "Activar inteligencia Copilot" },
  { label: "Ejecutar recomendaciones" },
];

// ── Disconnected state ─────────────────────────────────────────────────────────

function DisconnectedState({
  orgSlug,
  code,
}: {
  orgSlug: string;
  code:    string;
}) {
  const isDisabled = code === "shopify_connection_disabled";

  const copilotHeadline = isDisabled
    ? "La conexión Shopify está inactiva — reactívala para continuar"
    : "Conecta tu tienda Shopify y activa la inteligencia comercial";

  const copilotBody = isDisabled
    ? "Tenía acceso a los datos de tu tienda, pero la conexión fue desactivada. Una vez que la reactives, reanudaré el análisis de ventas, tendencias y recomendaciones automáticamente."
    : "Una vez que conectes tu tienda, comenzaré a analizar ventas, pedidos y catálogo en tiempo real. Detectaré oportunidades, generaré recomendaciones accionables y podré ejecutar automatizaciones con tu aprobación. No necesitaré configuración adicional.";

  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Estadísticas Shopify"
        subtitle="Inteligencia comercial · Señales Copilot · Trazabilidad"
        status="neutral"
        statusLabel={isDisabled ? "Conexión inactiva" : "Integración requerida"}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Estadísticas" },
        ]}
      />
      <div style={{ marginTop: S[4] }}>
        <ModuleEmptyState
          copilotHeadline={copilotHeadline}
          copilotBody={copilotBody}
          setupTag={isDisabled ? "Conexión inactiva" : "Integración requerida"}
          setupSteps={SHOPIFY_SETUP_STEPS}
          capabilities={SHOPIFY_CAPABILITIES}
          previewLabel="Así se verá este panel cuando conectes Shopify"
          previewSlots={SHOPIFY_PREVIEW_SLOTS}
          primaryCta={{
            label: "Conectar tienda Shopify",
            href:  `/${orgSlug}/agentik/marketing-studio/shopify`,
          }}
          secondaryCta={{
            label: "Ir a Commerce OS",
            href:  `/${orgSlug}/agentik/marketing-studio/shopify`,
          }}
        />
      </div>
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
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Estadísticas" },
        ]}
      />
      <div style={{ marginTop: S[4] }}>
        <ModuleEmptyState
          copilotHeadline="No pude obtener estadísticas en este momento"
          copilotBody={`La tienda ${shopDomain} puede estar temporalmente no disponible o hubo un error de conexión. Los datos que ya tenía registrados siguen intactos. Inténtalo de nuevo en unos minutos.`}
          setupTag="Servicio temporalmente no disponible"
          setupSteps={[
            { label: "Verificar conexión con Shopify",        current: true },
            { label: "Reintentar carga de estadísticas" },
            { label: "Reanudar inteligencia Copilot" },
          ]}
          capabilities={SHOPIFY_CAPABILITIES}
          previewLabel="Estadísticas disponibles cuando se restaure la conexión"
          previewSlots={SHOPIFY_PREVIEW_SLOTS}
          primaryCta={{
            label: "Reintentar",
            href:  `/${orgSlug}/agentik/marketing-studio/shopify/estadisticas`,
          }}
          secondaryCta={{
            label: "Ir a Commerce OS",
            href:  `/${orgSlug}/agentik/marketing-studio/shopify`,
          }}
        />
      </div>
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
