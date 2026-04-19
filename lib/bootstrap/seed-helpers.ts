/**
 * lib/bootstrap/seed-helpers.ts
 *
 * Low-level, idempotent seed helpers for tenant bootstrap.
 *
 * All helpers are:
 *   - Idempotent (safe to call multiple times on the same org)
 *   - Org-scoped (never touch other orgs)
 *   - Zero side-effects beyond their explicit DB writes
 *   - Portable (no Castillitos-specific logic)
 *
 * Called by createTenantFromTemplate() and optionally by migration scripts.
 */

import { prisma }            from "@/lib/prisma";
import { Prisma }           from "@prisma/client";
import { setModuleEnabled }  from "@/lib/tenant/modules";
import { MODULE_KEYS }       from "@/lib/tenant/modules";
import { ensureMainProject } from "@/lib/ensure-main-project";
import type { ModuleKey }    from "@/lib/tenant/modules";
import type {
  KpiFlags,
  AgentikPreset,
  WorkspaceDefault,
  ProjectModuleOverride,
  RoleConfig,
} from "./templates";

// ── Module seeding ────────────────────────────────────────────────────────────

/**
 * Apply an explicit module enable/disable set to an org.
 *
 * Every ModuleKey in `enabledKeys` is set to enabled=true.
 * Every ModuleKey NOT in `enabledKeys` is set to enabled=false.
 *
 * This converts the open-by-default semantics into explicit control:
 * after calling this, the org's module set is exactly `enabledKeys`.
 *
 * @param organizationId  Target org DB id.
 * @param enabledKeys     Set of modules that should be active.
 */
export async function seedTenantModules(
  organizationId: string,
  enabledKeys:    Set<ModuleKey>,
): Promise<{ enabled: ModuleKey[]; disabled: ModuleKey[] }> {
  const enabled:  ModuleKey[] = [];
  const disabled: ModuleKey[] = [];

  for (const key of MODULE_KEYS) {
    const shouldEnable = enabledKeys.has(key);
    await setModuleEnabled(organizationId, key, shouldEnable);
    if (shouldEnable) enabled.push(key);
    else              disabled.push(key);
  }

  return { enabled, disabled };
}

// ── Org settings ──────────────────────────────────────────────────────────────

export interface OrgSettingsInput {
  currency?:      string;
  timezone?:      string;
  localeCode?:    string;
  kpiFlags?:      KpiFlags;
  agentikPreset?: AgentikPreset;
  roleConfig?:    RoleConfig[];
}

/**
 * Deep-merge template settings into Organization.settingsJson.
 *
 * Existing keys not covered by the input are preserved (non-destructive).
 * Designed to be called multiple times safely.
 */
export async function seedOrgSettings(
  organizationId: string,
  input:          OrgSettingsInput,
): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where:  { id: organizationId },
    select: { settingsJson: true },
  });

  const existing = (org.settingsJson && typeof org.settingsJson === "object" && !Array.isArray(org.settingsJson))
    ? (org.settingsJson as Record<string, unknown>)
    : {};

  const merged: Record<string, unknown> = {
    ...existing,
    ...(input.currency    ? { currency:    input.currency    } : {}),
    ...(input.timezone    ? { timezone:    input.timezone    } : {}),
    ...(input.localeCode  ? { localeCode:  input.localeCode  } : {}),
    ...(input.kpiFlags    ? { kpiFlags:    input.kpiFlags    } : {}),
    ...(input.agentikPreset ? { agentikPreset: input.agentikPreset } : {}),
    ...(input.roleConfig  ? { roleConfig:  input.roleConfig  } : {}),
  };

  await prisma.organization.update({
    where: { id: organizationId },
    data:  { settingsJson: merged as Prisma.InputJsonValue },
  });
}

// ── Workspace seeding ─────────────────────────────────────────────────────────

/**
 * Create default workspaces for the org based on template definitions.
 * Skips workspaces whose slug already exists (idempotent).
 *
 * Slug format: "{orgSlug}-{slugSuffix}"
 */
export async function seedDefaultWorkspaces(
  organizationId: string,
  orgSlug:        string,
  workspaceDefaults: WorkspaceDefault[],
): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const def of workspaceDefaults) {
    const slug = `${orgSlug}-${def.slugSuffix}`;

    const existing = await prisma.workspace.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    });

    if (existing) {
      skipped.push(slug);
      continue;
    }

    await prisma.workspace.create({
      data: {
        organizationId,
        name:        def.name,
        slug,
        type:        def.type,
        description: def.description,
        settingsJson: { bootstrapped: true } as Prisma.InputJsonValue,
      },
    });

    created.push(slug);
  }

  return { created, skipped };
}

// ── ProjectModule overrides ───────────────────────────────────────────────────

/**
 * Apply ProjectModule feature code overrides to the org's main project.
 *
 * Ensures the main project exists (via ensureMainProject), then upserts
 * each override. Only touches the specified codes — does not reset others.
 */
export async function seedProjectModuleOverrides(
  organizationId: string,
  overrides:      ProjectModuleOverride[],
): Promise<{ projectId: string; applied: string[] }> {
  const project = await ensureMainProject(organizationId);

  const applied: string[] = [];

  for (const override of overrides) {
    await prisma.projectModule.upsert({
      where: {
        projectId_code: { projectId: project.id, code: override.code },
      },
      create: {
        projectId: project.id,
        code:      override.code,
        enabled:   override.enabled,
      },
      update: {
        enabled: override.enabled,
      },
    });
    applied.push(override.code);
  }

  return { projectId: project.id, applied };
}

// ── KPI flags ─────────────────────────────────────────────────────────────────

/**
 * Seed KPI flags into Organization.settingsJson.kpiFlags.
 *
 * Thin wrapper over seedOrgSettings for single-purpose callers.
 * Idempotent — overwrites only the kpiFlags key.
 */
export async function seedKpiFlags(
  organizationId: string,
  flags:          KpiFlags,
): Promise<void> {
  return seedOrgSettings(organizationId, { kpiFlags: flags });
}

// ── Agentik starter sections ──────────────────────────────────────────────────

/**
 * Seed Agentik preset configuration into Organization.settingsJson.agentikPreset.
 *
 * This pre-configures which sections, automations, and agents the Agentik
 * page should prioritize for this tenant type. Pages read this when
 * deciding content and defaults.
 *
 * Idempotent — overwrites only the agentikPreset key.
 */
export async function seedAgentikPreset(
  organizationId: string,
  preset:         AgentikPreset,
): Promise<void> {
  return seedOrgSettings(organizationId, { agentikPreset: preset });
}

// ── Role capability guide ─────────────────────────────────────────────────────

/**
 * Seed role configuration guidance into Organization.settingsJson.roleConfig.
 *
 * Not access-control enforcement — this is onboarding guidance that tells
 * the org admin what each role is designed to do in their vertical.
 * Can be surfaced in a settings / team management panel.
 *
 * Idempotent — overwrites only the roleConfig key.
 */
export async function seedRoleConfig(
  organizationId: string,
  roleConfig:     RoleConfig[],
): Promise<void> {
  return seedOrgSettings(organizationId, { roleConfig });
}

// ── Bootstrap result type ─────────────────────────────────────────────────────

export interface BootstrapResult {
  organizationId: string;
  templateKey:    string;
  modules:   { enabled: ModuleKey[]; disabled: ModuleKey[] };
  workspaces:     { created: string[]; skipped: string[] };
  projectId:      string;
  projectModules: string[];
  settingsApplied: boolean;
  bootstrappedAt:  string;   // ISO timestamp
}
