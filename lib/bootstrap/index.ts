/**
 * lib/bootstrap/index.ts
 *
 * Tenant Bootstrap Accelerator — public entry point.
 *
 * Single function: createTenantFromTemplate(templateKey, orgId)
 *
 * This is the only function external callers need. It orchestrates the
 * full bootstrap sequence:
 *
 *   1. Load the template by key (throws if unknown)
 *   2. Resolve the union of module bundles into an explicit module set
 *   3. Apply forceDisable overrides
 *   4. Seed TenantModules (exact enable/disable for all 14 keys)
 *   5. Seed Organization settings (currency, timezone, kpiFlags, agentikPreset, roleConfig)
 *   6. Ensure main project exists + apply ProjectModule overrides
 *   7. Create default workspaces (idempotent — skip existing)
 *   8. Return a BootstrapResult with a full audit trail
 *
 * Design:
 *   - Idempotent: safe to re-run on an existing org (re-applies settings,
 *     skips existing workspaces, upserts module rows)
 *   - Atomic per step: each seed helper wraps its own DB operation
 *   - No user creation, no auth changes, no connector setup
 *   - Portable: zero org-specific logic in this file
 *
 * Usage:
 *   import { createTenantFromTemplate } from "@/lib/bootstrap";
 *
 *   const result = await createTenantFromTemplate("retail-commerce", org.id, org.slug);
 *   console.log(result.modules.enabled);  // ["dashboard", "sales", ...]
 *
 * Templates available: "retail-commerce" | "fashion-wholesale" | "manufacturing-lite"
 */

import { getTemplate, listTemplates, TENANT_TEMPLATES } from "./templates";
import { resolveModuleSet }  from "./module-bundles";
import {
  seedTenantModules,
  seedOrgSettings,
  seedDefaultWorkspaces,
  seedProjectModuleOverrides,
  type BootstrapResult,
} from "./seed-helpers";
import type { ModuleKey } from "@/lib/tenant/modules";

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Bootstrap a tenant from a named template.
 *
 * @param templateKey  One of "retail-commerce" | "fashion-wholesale" | "manufacturing-lite"
 * @param orgId        Organization.id (DB primary key)
 * @param orgSlug      Organization.slug (used for workspace slug generation)
 * @returns            BootstrapResult with audit trail
 * @throws             Error if templateKey is unknown
 */
export async function createTenantFromTemplate(
  templateKey: string,
  orgId:       string,
  orgSlug:     string,
): Promise<BootstrapResult> {
  // ── 1. Load template ──────────────────────────────────────────────────────

  const template = getTemplate(templateKey);
  if (!template) {
    throw new Error(
      `BOOTSTRAP: Unknown template key "${templateKey}". ` +
      `Available: ${Object.keys(TENANT_TEMPLATES).join(", ")}`,
    );
  }

  // ── 2. Resolve module set (union of all bundles) ──────────────────────────

  const enabledModules = resolveModuleSet(template.moduleBundles);

  // ── 3. Apply forceDisable overrides ──────────────────────────────────────

  if (template.forceDisable) {
    for (const key of template.forceDisable) {
      enabledModules.delete(key as ModuleKey);
    }
  }

  // ── 4. Seed TenantModules ─────────────────────────────────────────────────

  const modules = await seedTenantModules(orgId, enabledModules);

  // ── 5. Seed org settings ──────────────────────────────────────────────────

  await seedOrgSettings(orgId, {
    currency:      template.settings.currency,
    timezone:      template.settings.timezone,
    localeCode:    template.settings.localeCode,
    kpiFlags:      template.settings.kpiFlags,
    agentikPreset: template.settings.agentikPreset,
    roleConfig:    template.roleConfig,
  });

  // ── 6. Seed project + ProjectModule overrides ─────────────────────────────

  const { projectId, applied: projectModules } = await seedProjectModuleOverrides(
    orgId,
    template.projectModuleOverrides,
  );

  // ── 7. Seed default workspaces ────────────────────────────────────────────

  const workspaces = await seedDefaultWorkspaces(
    orgId,
    orgSlug,
    template.workspaceDefaults,
  );

  // ── 8. Return audit result ────────────────────────────────────────────────

  return {
    organizationId:  orgId,
    templateKey,
    modules,
    workspaces,
    projectId,
    projectModules,
    settingsApplied: true,
    bootstrappedAt:  new Date().toISOString(),
  };
}

// ── Re-exports ────────────────────────────────────────────────────────────────
//
// Callers import from "@/lib/bootstrap" for everything bootstrap-related.

export { listTemplates, getTemplate }         from "./templates";
export { BUNDLE_KEYS, resolveModuleSet }      from "./module-bundles";
export {
  seedTenantModules,
  seedOrgSettings,
  seedDefaultWorkspaces,
  seedProjectModuleOverrides,
  seedKpiFlags,
  seedAgentikPreset,
  seedRoleConfig,
}                                              from "./seed-helpers";

// Types
export type { TenantTemplate, KpiFlags, AgentikPreset, WorkspaceDefault,
              ProjectModuleOverride, RoleConfig, AgentikSection, AgentRole } from "./templates";
export type { ModuleBundleKey }               from "./module-bundles";
export type { BootstrapResult, OrgSettingsInput } from "./seed-helpers";
