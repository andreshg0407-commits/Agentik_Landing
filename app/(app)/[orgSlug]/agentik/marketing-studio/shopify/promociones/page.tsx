/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/promociones/page.tsx
 *
 * SHOPIFY-PROMOTIONS-04 — Promociones y Descuentos
 *
 * Workplace for managing Shopify promotions, discount codes, and campaigns.
 * Lives inside the Marketing Studio > Shopify surface.
 *
 * Server component — NO AI, NO Copilot calls.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { C, T, S, R }                from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { Panel, PanelHeader }         from "@/components/shell/primitives";
import { getIntegrationConnection }   from "@/lib/integrations/integration-repository";
import { getIntegrationSecret }       from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }          from "@/lib/integrations/integration-types";
import { listPromotions }             from "@/lib/marketing-studio/commerce/shopify-promotions-service";
import type {
  ShopifyPromotionSummary,
  PromotionListResult,
} from "@/lib/marketing-studio/commerce/shopify-promotions-types";

// ── Status badge styles ────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  active: {
    fontFamily: T.mono, fontSize: T.sz.xs,
    background: C.greenLight, color: C.green,
    border: `1px solid ${C.greenBorder}`,
    borderRadius: R.pill, padding: `2px ${S[2]}px`,
  },
  scheduled: {
    fontFamily: T.mono, fontSize: T.sz.xs,
    background: C.surfaceAlt, color: C.blueDark,
    border: `1px solid ${C.line}`,
    borderRadius: R.pill, padding: `2px ${S[2]}px`,
  },
  expired: {
    fontFamily: T.mono, fontSize: T.sz.xs,
    background: C.surfaceAlt, color: C.inkMid,
    border: `1px solid ${C.line}`,
    borderRadius: R.pill, padding: `2px ${S[2]}px`,
  },
  disabled: {
    fontFamily: T.mono, fontSize: T.sz.xs,
    background: C.redLight, color: C.red,
    border: `1px solid ${C.redBorder}`,
    borderRadius: R.pill, padding: `2px ${S[2]}px`,
  },
};

const STATUS_LABEL: Record<string, string> = {
  active:    "Activa",
  scheduled: "Programada",
  expired:   "Finalizada",
  disabled:  "Desactivada",
};

// ── Promotion row ──────────────────────────────────────────────────────────────

function PromotionRow({ promo }: { promo: ShopifyPromotionSummary }) {
  const valueLabel =
    promo.valueType === "percentage"
      ? `${promo.value}% de descuento`
      : `$${promo.value} de descuento`;

  const dateLabel = promo.endsAt
    ? `${new Date(promo.startsAt).toLocaleDateString("es-CO")} → ${new Date(promo.endsAt).toLocaleDateString("es-CO")}`
    : `Desde ${new Date(promo.startsAt).toLocaleDateString("es-CO")}`;

  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
          {promo.title}
          {promo.managedByAgentik && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, marginLeft: S[2] }}>
              Agentik
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
          {valueLabel}
          {promo.code && (
            <span style={{ marginLeft: S[2] }}>· Código: {promo.code}</span>
          )}
        </div>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flexShrink: 0 }}>
        {dateLabel}
      </div>
      {promo.usageLimit != null && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flexShrink: 0 }}>
          {promo.currentUsage} / {promo.usageLimit} usos
        </div>
      )}
      <span style={STATUS_STYLE[promo.status] ?? STATUS_STYLE.expired}>
        {STATUS_LABEL[promo.status] ?? promo.status}
      </span>
    </div>
  );
}

// ── Section block ──────────────────────────────────────────────────────────────

function PromotionSection({
  title,
  promotions,
  emptyLabel,
}: {
  title:      string;
  promotions: ShopifyPromotionSummary[];
  emptyLabel: string;
}) {
  return (
    <Panel style={{ marginBottom: S[4] }}>
      <PanelHeader title={title} />
      <div className="ag-op-table">
        {promotions.length === 0 ? (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
            padding: `${S[6]}px ${S[4]}px`, textAlign: "center",
          }}>
            {emptyLabel}
          </div>
        ) : (
          promotions.map(p => <PromotionRow key={p.id} promo={p} />)
        )}
      </div>
    </Panel>
  );
}

// ── Disconnected state ─────────────────────────────────────────────────────────

function DisconnectedState({ orgSlug }: { orgSlug: string }) {
  return (
    <Panel>
      <div style={{ padding: `${S[8]}px ${S[4]}px`, textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, marginBottom: S[2] }}>
          Shopify no conectado
        </div>
        <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[4] }}>
          Conecta tu tienda para administrar promociones y descuentos desde Agentik.
        </p>
        <a
          href={`/api/integrations/shopify/connect?orgSlug=${orgSlug}`}
          style={{
            fontFamily: T.mono, fontSize: T.sz.sm,
            color: "#fff", background: C.blueDark,
            border: "none", borderRadius: R.md,
            padding: `${S[2]}px ${S[4]}px`,
            textDecoration: "none", display: "inline-block",
          }}
        >
          Conectar Shopify →
        </a>
      </div>
    </Panel>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function PromocionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // Resolve Shopify connection
  const connection  = await getIntegrationConnection(organization.id, "shopify");
  const isConnected = connection?.status === CONNECTION_STATUS.CONNECTED && !!connection.shopDomain;

  let promotions: PromotionListResult | null = null;

  if (isConnected && connection?.id) {
    const vaultSecret = await getIntegrationSecret({
      organizationId: organization.id,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
    });

    if (vaultSecret) {
      try {
        promotions = await listPromotions(
          organization.id,
          vaultSecret.plainValue,   // ⚠ server-only
          connection.shopDomain!,
        );
      } catch {
        // Non-blocking — render with empty state
      }
    }
  }

  const totalActive = promotions?.active.length ?? 0;
  const statusLabel = !isConnected
    ? "Shopify desconectado"
    : totalActive > 0
      ? `${totalActive} promoción${totalActive !== 1 ? "es" : ""} activa${totalActive !== 1 ? "s" : ""}`
      : "Sin promociones activas";

  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Promociones y descuentos"
        subtitle="Descuentos, códigos y campañas de tu tienda Shopify"
        status={!isConnected ? "neutral" : totalActive > 0 ? "ok" : "neutral"}
        statusLabel={statusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify", href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Promociones" },
        ]}
      />

      <div style={{ padding: `${S[4]}px 0` }}>
        {!isConnected ? (
          <DisconnectedState orgSlug={orgSlug} />
        ) : (
          <>
            {/* Active signal strip */}
            {totalActive > 0 && (
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.green,
                background: C.greenLight, border: `1px solid ${C.greenBorder}`,
                borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`,
                marginBottom: S[4],
              }}>
                {totalActive} promoción{totalActive !== 1 ? "es" : ""} activa{totalActive !== 1 ? "s" : ""} en tu tienda ahora mismo.
              </div>
            )}

            <PromotionSection
              title="Activas"
              promotions={promotions?.active ?? []}
              emptyLabel="Sin promociones activas en este momento."
            />
            <PromotionSection
              title="Programadas"
              promotions={promotions?.scheduled ?? []}
              emptyLabel="Sin promociones programadas."
            />
            <PromotionSection
              title="Finalizadas"
              promotions={promotions?.expired ?? []}
              emptyLabel="Sin promociones finalizadas."
            />
          </>
        )}
      </div>
    </div>
  );
}
