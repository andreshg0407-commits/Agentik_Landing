/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-tenant-profile.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Tenant Profile Adapter — derives reasoning context from tenant configuration.
 * No DB. No server-only.
 */

import type { ReasoningEvidence, ReasoningContext, ReasoningSourceDomain, ReasoningSignal } from "../cross-module-types";
import { generateCmrId } from "../cross-module-types";

// ── Tenant profile shape ──────────────────────────────────────────────────────

export interface TenantReasoningProfile {
  orgSlug:        string;
  displayName:    string;
  industry?:      string;
  enabledModules: string[];
  activeDomains:  ReasoningSourceDomain[];
  metadata:       Record<string, unknown>;
}

// ── Build profile from module list ────────────────────────────────────────────

const MODULE_TO_DOMAIN: Record<string, ReasoningSourceDomain> = {
  finanzas:       "FINANCE",
  tesoreria:      "FINANCE",
  conciliacion:   "FINANCE",
  cierre:         "FINANCE",
  cobros:         "COLLECTIONS",
  comercial:      "COMMERCIAL",
  marketing:      "MARKETING",
  "foto-estudio": "MARKETING",
  executive:      "EXECUTIVE",
  agentik:        "EXECUTIVE",
};

export function buildTenantReasoningProfile(
  orgSlug: string,
  displayName: string,
  enabledModules: string[],
  metadata: Record<string, unknown> = {},
): TenantReasoningProfile {
  const domainSet = new Set<ReasoningSourceDomain>();
  for (const mod of enabledModules) {
    const domain = MODULE_TO_DOMAIN[mod];
    if (domain) domainSet.add(domain);
  }
  domainSet.add("EXECUTIVE");
  domainSet.add("MEMORY");

  return {
    orgSlug,
    displayName,
    enabledModules,
    activeDomains: [...domainSet],
    metadata,
  };
}

// ── Profile → Evidence ────────────────────────────────────────────────────────

export function tenantProfileToEvidence(
  profile: TenantReasoningProfile,
): ReasoningEvidence {
  return {
    id:          generateCmrId("ev"),
    orgSlug:     profile.orgSlug,
    type:        "SIGNAL",
    domain:      "EXECUTIVE",
    label:       `Perfil de tenant: ${profile.displayName}`,
    description: `Módulos activos: ${profile.enabledModules.join(", ")}. Dominios: ${profile.activeDomains.join(", ")}.`,
    strength:    0.60,
    reliability: 0.90,
    sourceRef:   profile.orgSlug,
    sourceType:  "tenant_profile",
    metadata:    {
      displayName:    profile.displayName,
      enabledModules: profile.enabledModules,
      activeDomains:  profile.activeDomains,
      industry:       profile.industry,
      ...profile.metadata,
    },
    collectedAt: new Date().toISOString(),
  };
}

// ── Derive ReasoningContext base from profile ─────────────────────────────────

export function profileToReasoningContext(
  profile: TenantReasoningProfile,
  signals:  ReasoningSignal[] = [],
): ReasoningContext {
  return {
    orgSlug:       profile.orgSlug,
    domains:       profile.activeDomains,
    signals,
    tenantProfile: {
      displayName:    profile.displayName,
      enabledModules: profile.enabledModules,
      industry:       profile.industry,
    },
    requestedAt:   new Date().toISOString(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isTenantDomainActive(
  profile: TenantReasoningProfile,
  domain: ReasoningSourceDomain,
): boolean {
  return profile.activeDomains.includes(domain);
}

export function getTenantPrimaryDomains(
  profile: TenantReasoningProfile,
): ReasoningSourceDomain[] {
  const priority: ReasoningSourceDomain[] = ["FINANCE", "COMMERCIAL", "COLLECTIONS", "MARKETING"];
  return priority.filter(d => profile.activeDomains.includes(d));
}
