/**
 * components/marketing-studio/shopify/shopify-module-primitives.tsx
 *
 * AGENTIK-COPILOT-BOUNDARIES-01 / SHOPIFY-MODULE-MATURITY-02 / AGENTIK-OPERATIONAL-UX-KIT-01
 *
 * Thin re-export layer — generic implementations live in the Operational UX Kit.
 * Only Shopify-specific wrappers (URL-binding) are defined here.
 *
 * Reused across:
 *   - estadisticas/statistics-client.tsx
 *   - promociones/promociones-client.tsx
 *   - operaciones/operaciones-client.tsx
 *
 * Architecture:
 *   - "use client" NOT declared — pure presentational fragments
 *   - No AI, no Copilot, no business logic
 *   - Generic components delegated to @/components/agentik/operational-ux-kit
 */

import React from "react";
import {
  AgMetricCard,
  AgDrawerSection,
  AgDrawerAction,
  AgPlaceholderRow,
  AgDistributionBar,
  AgStageFlow,
  AgRiskMeter,
  AgConnectCTA,
  AgActivationTimeline,
} from "@/components/agentik/operational-ux-kit";

export type { AgMetricCardProps as ShopifyKpiCardProps } from "@/components/agentik/operational-ux-kit";
export type { DistributionSegment, StageFlowItem } from "@/components/agentik/operational-ux-kit";

// ── Re-exports ──────────────────────────────────────────────────────────────

export { AgMetricCard    as ShopifyKpiCard        } from "@/components/agentik/operational-ux-kit";
export { AgDrawerSection as ShopifyDrawerSection  } from "@/components/agentik/operational-ux-kit";
export { AgDrawerAction  as ShopifyDrawerAction   } from "@/components/agentik/operational-ux-kit";
export { AgPlaceholderRow as ShopifyPlaceholderRow } from "@/components/agentik/operational-ux-kit";
export { AgDistributionBar as ShopifyDistributionBar } from "@/components/agentik/operational-ux-kit";
export { AgStageFlow     as ShopifyStageFlow      } from "@/components/agentik/operational-ux-kit";
export { AgRiskMeter     as ShopifyRiskMeter      } from "@/components/agentik/operational-ux-kit";

// ── ShopifyConnectCTA — Shopify-specific wrapper ────────────────────────────

/**
 * Primary connection call-to-action.
 * Renders as a styled <a> tag pointing to the Shopify connection page.
 */
export function ShopifyConnectCTA({
  orgSlug,
  label = "Conectar tienda Shopify",
}: {
  orgSlug: string;
  label?:  string;
}) {
  return (
    <AgConnectCTA
      href={`/${orgSlug}/agentik/marketing-studio/shopify`}
      label={label}
    />
  );
}

// ── ShopifyActivationTimeline — Shopify-specific wrapper ────────────────────

/**
 * Two-mode activation guide bound to the Shopify connection URL.
 */
export function ShopifyActivationTimeline({
  steps,
  connected,
  orgSlug,
  compactText,
  criticalCount = 0,
}: {
  steps:          string[];
  connected:      boolean;
  orgSlug:        string;
  compactText:    string;
  criticalCount?: number;
}) {
  return (
    <AgActivationTimeline
      steps={steps}
      connected={connected}
      ctaHref={`/${orgSlug}/agentik/marketing-studio/shopify`}
      compactText={compactText}
      criticalCount={criticalCount}
    />
  );
}
