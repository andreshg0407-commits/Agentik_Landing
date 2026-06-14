/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/page.tsx
 *
 * MS-09B — Commerce Control Tower
 *
 * Replaces the "coming soon" stub with the full operational intelligence layer
 * for Shopify (and future commerce channel) publication management.
 *
 * Server component:
 *   - Loads products via listProductConsoleItems
 *   - Builds publication queue (pure computation)
 *   - Computes sync health, alert summary, commerce signals, collection display
 *   - Passes serializable props to client components
 *
 * ── NO Shopify API calls. Operational brain only. ──
 */

import Link                         from "next/link";
import { redirect }                  from "next/navigation";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { C, T, S, R }               from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { Panel, PanelHeader }        from "@/components/shell/primitives";
import { PublicationQueue }          from "@/components/marketing-studio/shopify/publication-queue";
import { MSMetricStrip }             from "@/components/marketing-studio/shared/ms-metric-strip";
import { MSAgentSignal }             from "@/components/marketing-studio/shared/ms-agent-signal";
import { MSHeroCard }                from "@/components/marketing-studio/shared/ms-hero-card";
import { MSStatusBadge }            from "@/components/marketing-studio/shared/ms-status-badge";
import type { MSStatusVariant }     from "@/components/marketing-studio/shared/ms-status-badge";

import { listProductConsoleItems }  from "@/lib/marketing-studio/products/product-query-service";
import { getIntegrationConnection } from "@/lib/integrations/integration-repository";
import {
  CONNECTION_STATUS_LABEL,
  CONNECTION_HEALTH_LABEL,
  CONNECTION_STATUS,
} from "@/lib/integrations/integration-types";
import { buildPublicationQueue, buildCommerceAlertSummary }
  from "@/lib/marketing-studio/commerce/publication-engine";
import { computeGlobalSyncHealth, buildRetryQueue, detectSyncConflicts }
  from "@/lib/marketing-studio/commerce/sync-engine";
import { generateLucaCommerceSignals, generateMilaCommerceSignals }
  from "@/lib/marketing-studio/commerce/luca-commerce";
import { buildCollectionDisplay }   from "@/lib/marketing-studio/commerce/collection-engine";
import { prisma }                    from "@/lib/prisma";
import {
  SYNC_HEALTH,
  SYNC_HEALTH_LABEL,
} from "@/lib/marketing-studio/commerce/commerce-types";

// ── Collection row ────────────────────────────────────────────────────────────

function CollectionRow({
  title, type, productCount, readyCount, blockedCount, shopifyStatus, lucaNote,
}: {
  title: string; type: string; productCount: number;
  readyCount: number; blockedCount: number;
  shopifyStatus: "ready" | "partial" | "blocked";
  lucaNote?: string;
}) {
  const statusLabel = shopifyStatus === "ready" ? "Lista" : shopifyStatus === "partial" ? "Parcial" : "Bloqueada";
  const typeLabel: Record<string, string> = {
    category:    "Categoría",
    performance: "Rendimiento",
    campaign:    "Campaña",
    seasonal:    "Temporada",
    dynamic:     "Dinámica",
    readiness:   "Readiness",
  };

  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: "1fr 90px 80px 80px 80px",
      gap: `0 ${S[3]}px`,
      alignItems: "center",
      padding: `${S[2]}px ${S[3]}px`,
    }}>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
          {title}
        </div>
        {lucaNote && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 1 }}>
            {lucaNote}
          </div>
        )}
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
        {typeLabel[type] ?? type}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{productCount}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>{readyCount}</span>
      <MSStatusBadge
        label={statusLabel}
        variant={shopifyStatus === "ready" ? "ok" : shopifyStatus === "partial" ? "warning" : "error"}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ShopifyCommercePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // ── Data ──
  const [products, connection, webhookPendingCount] = await Promise.all([
    listProductConsoleItems(organization.id),
    getIntegrationConnection(organization.id, "shopify"),
    prisma.integrationWebhookEvent.count({
      where: { organizationId: organization.id, provider: "shopify", status: "pending" },
    }),
  ]);
  const queue          = buildPublicationQueue(products, "shopify");
  const alertSummary   = buildCommerceAlertSummary(queue);
  const syncHealth     = computeGlobalSyncHealth(queue, "shopify");
  const retryQueue     = buildRetryQueue(queue);
  const conflicts      = detectSyncConflicts(queue);
  const webhookPending = webhookPendingCount;
  const lucaSignals    = generateLucaCommerceSignals(products, queue, "shopify");
  const milaSignals    = generateMilaCommerceSignals(products, queue);
  const collections    = buildCollectionDisplay(products);

  // Distinct categories from the product catalog — passed to PublicationQueue for the category filter
  const categories = [...new Set(
    products.map(p => p.category).filter((c): c is string => c !== null && c.trim() !== ""),
  )].sort();

  const isEmpty      = products.length === 0;
  const isConnected  = connection?.status === CONNECTION_STATUS.CONNECTED;

  // ── Hero card props ──
  const connStatusVariant: MSStatusVariant =
    connection?.status === CONNECTION_STATUS.CONNECTED ? "ok" :
    connection?.status === "expired"                   ? "warning" :
    connection?.status === "error"                     ? "error" :
    connection?.status === "revoked"                   ? "error" :
    "neutral";
  const connTitle = `Shopify · ${CONNECTION_STATUS_LABEL[connection?.status ?? "not_connected"] ?? "No conectado"}`;
  const connSubtitle = connection?.health
    ? CONNECTION_HEALTH_LABEL[connection.health as keyof typeof CONNECTION_HEALTH_LABEL]
    : undefined;
  const connMeta = [
    connection?.externalAccountName ? { label: "cuenta",     value: connection.externalAccountName } : null,
    connection?.scopes?.length      ? { label: "scopes",     value: String(connection.scopes.length) } : null,
    connection?.connectedAt         ? { label: "conectado",  value: new Date(connection.connectedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) } : null,
    connection?.errorMessage        ? { label: "error",      value: connection.errorMessage.slice(0, 80) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const connCta = connection?.status === CONNECTION_STATUS.CONNECTED
    ? { label: "Verificar conexión", href: `/api/integrations/shopify/health?orgSlug=${orgSlug}&live=true` }
    : { label: "Conectar Shopify →", href: `/api/integrations/shopify/connect?orgSlug=${orgSlug}`, variant: "primary" as const };

  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>

      {/* Header */}
      <OperationalWorkspaceHeader
        title="Shopify Commerce OS"
        subtitle="Cola de publicación · Sincronización · Colecciones inteligentes"
        status={alertSummary.syncFailures > 0 ? "critical" : alertSummary.retryQueue > 0 ? "warning" : "ok"}
        statusLabel={alertSummary.syncFailures > 0 ? `${alertSummary.syncFailures} fallos de sync` : alertSummary.readyToPublish > 0 ? `${alertSummary.readyToPublish} listos para publicar` : "Sistema operativo"}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify Commerce OS" },
        ]}
      />

      {/* ── Integration Connection Status ── */}
      <MSHeroCard
        status={connStatusVariant}
        title={connTitle}
        subtitle={connSubtitle}
        meta={connMeta.length > 0 ? connMeta : undefined}
        cta={connCta}
        style={{ marginBottom: S[5] }}
      />

      {isEmpty ? (
        // Empty state — differentiate disconnected vs connected
        <Panel>
          <div style={{ padding: `${S[8]}px ${S[4]}px`, textAlign: "center" }}>
            {!isConnected ? (
              <>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[2] }}>
                  Conecta tu tienda Shopify para empezar
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, maxWidth: 380, margin: "0 auto", lineHeight: 1.6, marginBottom: S[4] }}>
                  Una vez conectada, los productos aprobados aparecerán aquí listos para publicar.
                </div>
                <a
                  href={`/api/integrations/shopify/connect?orgSlug=${orgSlug}`}
                  style={{
                    display: "inline-block",
                    padding: `${S[2]}px ${S[4]}px`,
                    background: C.blueDark, color: "#fff",
                    borderRadius: R.md, fontFamily: T.mono,
                    fontSize: T.sz.sm, textDecoration: "none",
                  }}
                >
                  Conectar Shopify
                </a>
              </>
            ) : (
              <>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[2] }}>
                  Sin productos en la biblioteca
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, maxWidth: 380, margin: "0 auto", lineHeight: 1.6, marginBottom: S[4] }}>
                  Agrega y aprueba productos en la Biblioteca Creativa para activar la cola de publicación.
                </div>
                <Link
                  href={`/${orgSlug}/agentik/marketing-studio/biblioteca`}
                  style={{
                    display: "inline-block",
                    padding: `${S[2]}px ${S[4]}px`,
                    background: C.blueDark, color: "#fff",
                    borderRadius: R.md, fontFamily: T.mono,
                    fontSize: T.sz.sm, textDecoration: "none",
                  }}
                >
                  Ir a Biblioteca
                </Link>
              </>
            )}
          </div>
        </Panel>
      ) : (
        <>
          {/* ── Metric Strip — business-oriented ── */}
          <MSMetricStrip cards={[
            {
              value:   alertSummary.draft,
              label:   "Borradores",
              sub:     "en preparación",
              dot:     C.inkLight,
              variant: "neutral",
            },
            {
              value:   alertSummary.readyToPublish,
              label:   "Listos para publicar",
              sub:     "completos y aprobados",
              dot:     C.blueDark,
              variant: alertSummary.readyToPublish > 0 ? "ok" : "neutral",
            },
            {
              value:   alertSummary.published,
              label:   "Publicados",
              sub:     `de ${alertSummary.total} en biblioteca`,
              dot:     C.green,
              variant: alertSummary.published > 0 ? "ok" : "neutral",
            },
            {
              value:   alertSummary.syncFailures,
              label:   "Con errores",
              sub:     alertSummary.syncFailures > 0 ? "requieren atención" : "sin errores activos",
              dot:     C.red,
              variant: alertSummary.syncFailures > 0 ? "critical" : "neutral",
            },
          ]} />

          {/* ── Sync health — compact inline strip ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[3],
            padding: `${S[2]}px ${S[3]}px`,
            background: C.white, border: `1px solid ${C.line}`,
            borderRadius: R.md, marginBottom: S[4],
            flexWrap: "wrap" as const,
          }}>
            <MSStatusBadge
              label={`Sincronización · ${SYNC_HEALTH_LABEL[syncHealth.overallHealth as keyof typeof SYNC_HEALTH_LABEL] ?? syncHealth.overallHealth} · ${syncHealth.healthScore}/100`}
              variant={syncHealth.overallHealth === SYNC_HEALTH.HEALTHY ? "ok" : syncHealth.overallHealth === SYNC_HEALTH.WARNING ? "warning" : syncHealth.overallHealth === SYNC_HEALTH.CRITICAL ? "error" : "neutral"}
              size="md"
            />
            {[
              { label: "Saludable",    value: syncHealth.healthyCount,      color: C.green    },
              { label: "Advertencia",  value: syncHealth.warningCount,      color: C.amber    },
              { label: "Crítico",      value: syncHealth.criticalCount,     color: C.red      },
              { label: "Desconectado", value: syncHealth.disconnectedCount, color: C.inkFaint },
            ].filter(s => s.value > 0).map(s => (
              <span key={s.label} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontFamily: T.mono, fontSize: T.sz.xs, color: s.color,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                {s.value} {s.label}
              </span>
            ))}
            {syncHealth.driftWarnings > 0 && (
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
                padding: `2px ${S[2]}px`,
                background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                borderRadius: R.pill,
              }}>
                {syncHealth.driftWarnings} sin actualizar &gt;7d
              </span>
            )}
            {syncHealth.lastSyncAt && (
              <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                Última sincronización: {new Date(syncHealth.lastSyncAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {/* ── Catálogo Shopify ── */}
          <div style={{ marginBottom: S[6] }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em",
              }}>
                Catálogo Shopify
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                · {queue.length} productos
              </span>
            </div>
            <PublicationQueue queue={queue} orgSlug={orgSlug} categories={categories} isConnected={isConnected} />
          </div>

          {/* ── Agent Signals ── */}
          {(lucaSignals.length > 0 || milaSignals.length > 0) && (
            <div style={{ display: "flex", gap: S[3], marginBottom: S[5], flexWrap: "wrap" as const }}>
              {lucaSignals.length > 0 && (
                <MSAgentSignal
                  variant="dark"
                  text={lucaSignals[0].label}
                  sub={lucaSignals[0].detail}
                  agentLabel="Luca · Comercio"
                />
              )}
              {milaSignals.length > 0 && (
                <MSAgentSignal
                  variant="positive"
                  text={milaSignals[0].label}
                  sub={milaSignals[0].detail}
                  agentLabel="Mila · Ventas"
                />
              )}
            </div>
          )}

          {/* ── Collection Intelligence ── */}
          {collections.length > 0 && (
            <Panel style={{ marginBottom: S[5] }}>
              <PanelHeader
                title="Colecciones Inteligentes"
                badge={
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                    {collections.length} sugeridas
                  </span>
                }
              />
              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 80px 80px 80px",
                gap: `0 ${S[3]}px`,
                padding: `${S[1]}px ${S[3]}px`,
                borderBottom: `1px solid ${C.line}`,
                color: C.inkFaint, fontSize: T.sz.xs,
                fontFamily: T.mono, textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                <span>Colección</span>
                <span>Tipo</span>
                <span>Productos</span>
                <span>Listos</span>
                <span>Estado</span>
              </div>
              <div className="ag-op-table">
                {collections.map(col => (
                  <CollectionRow
                    key={col.id}
                    title={col.title}
                    type={col.type}
                    productCount={col.productCount}
                    readyCount={col.readyCount}
                    blockedCount={col.blockedCount}
                    shopifyStatus={col.shopifyStatus}
                    lucaNote={col.lucaNote}
                  />
                ))}
              </div>
            </Panel>
          )}

          {/* ── Conflict Panel ── */}
          {conflicts.length > 0 && (
            <Panel style={{ marginBottom: S[5] }}>
              <PanelHeader title="Conflictos de Sync Detectados" />
              <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: S[2] }}>
                {conflicts.map((conflict, idx) => (
                  <div key={`${conflict.productId}-${idx}`} style={{
                    display: "flex", gap: S[2], alignItems: "flex-start",
                    padding: `${S[2]}px ${S[3]}px`,
                    background: conflict.severity === "critical" ? C.redLight : C.amberLight,
                    border: `1px solid ${conflict.severity === "critical" ? C.redBorder : C.amberBorder}`,
                    borderRadius: R.md,
                  }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      color: conflict.severity === "critical" ? C.red : C.amber,
                      fontWeight: T.wt.bold, flexShrink: 0,
                    }}>
                      {conflict.severity === "critical" ? "CRÍTICO" : "AVISO"}
                    </span>
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
                        {conflict.productName}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
                        {conflict.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* ── Acciones de sincronización ── */}
          <div style={{
            display: "flex", gap: S[2], flexWrap: "wrap" as const,
            marginBottom: S[5],
          }}>
            <a
              href={`/api/integrations/shopify/sync-check?orgSlug=${orgSlug}`}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                background: C.blueDark, color: C.white,
                border: `1px solid ${C.blueDark}`, textDecoration: "none",
              }}
            >
              Revisar sincronización →
            </a>
            <a
              href={`/api/integrations/shopify/webhook/process?orgSlug=${orgSlug}`}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                background: C.surface, color: C.ink,
                border: `1px solid ${C.line}`, textDecoration: "none",
              }}
            >
              Actualizar cambios de Shopify
            </a>
            {webhookPending > 0 && (
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
                padding: `${S[2]}px 0`, alignSelf: "center",
              }}>
                {webhookPending} cambios de Shopify pendientes
              </span>
            )}
          </div>

          {/* ── Footer legend ── */}
          <div style={{
            padding: `${S[3]}px ${S[3]}px`,
            borderTop: `1px solid ${C.line}`,
            display: "flex", gap: S[4], flexWrap: "wrap", alignItems: "center",
          }}>
            {[
              { color: C.green,    label: "Publicado / Saludable" },
              { color: C.amber,    label: "Advertencia / Parcial" },
              { color: C.red,      label: "Crítico / Fallido"     },
              { color: C.inkFaint, label: "Desconectado"          },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{item.label}</span>
              </div>
            ))}
            <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Agentik Commerce OS · MS-09 · Publicación masiva activa · Estado en vivo disponible
            </span>
          </div>
        </>
      )}
    </div>
  );
}
