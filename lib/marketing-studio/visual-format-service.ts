/**
 * lib/marketing-studio/visual-format-service.ts
 *
 * Server-side service for tenant visual formats.
 *
 * ── Persistence model ─────────────────────────────────────────────────────────
 *
 *   Custom formats are stored in TenantMarketingConfig.configJson.visualFormats.
 *   Built-in system formats (CASTILLITOS_FORMATS) are never stored here —
 *   they come from the constants and are combined at read time.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 *
 *   Each org has its own TenantMarketingConfig row → isolated per tenant.
 *   Formats from one org are never visible to another.
 *
 * ── ID strategy ───────────────────────────────────────────────────────────────
 *
 *   crypto.randomUUID() → stable UUID, never Date.now().
 */

import { prisma }                    from "@/lib/prisma";
import { getTenantConfig }           from "@/lib/marketing-studio/tenant-config";
import { CASTILLITOS_FORMATS }       from "@/lib/marketing-studio/visual-format-types";
import type { VisualFormat, StoredVisualFormat } from "@/lib/marketing-studio/visual-format-types";
import type { TenantMarketingConfig }            from "@/lib/marketing-studio/types";

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns the combined visual format list for a tenant:
 *   - System formats first (CASTILLITOS_FORMATS for retail tenants)
 *   - Tenant custom formats after
 *
 * Never duplicates: system formats are identified by fixed id strings,
 * custom formats by their UUID.
 */
export async function listTenantVisualFormats(
  organizationId: string,
  orgSlug: string,
): Promise<{ systemFormats: VisualFormat[]; customFormats: StoredVisualFormat[] }> {
  // System formats — only for retail tenants (Castillitos)
  const systemFormats: VisualFormat[] = orgSlug === "castillitos" ? [...CASTILLITOS_FORMATS] : [];

  // Custom formats from DB
  const row = await (prisma as any).tenantMarketingConfig.findUnique({
    where:  { organizationId },
    select: { configJson: true },
  });

  const configJson = row?.configJson as TenantMarketingConfig | undefined;
  const customFormats: StoredVisualFormat[] = (configJson?.visualFormats ?? []) as StoredVisualFormat[];

  return { systemFormats, customFormats };
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persists a new custom format for a tenant.
 *
 * Rules:
 *   - Generates a stable UUID id.
 *   - Rejects duplicates: same name + same width + same height.
 *   - If no TenantMarketingConfig row exists yet, creates one from the code-level registry.
 *
 * Returns the stored format on success.
 * Throws with a user-readable message on validation failure or duplicate.
 */
export async function saveTenantVisualFormat(
  organizationId: string,
  orgSlug: string,
  input: {
    name:             string;
    width:            number;
    height:           number;
    margins:          { top: number; bottom: number; left: number; right: number };
    safeArea:         { width: number; height: number };
    compositionNotes: string;
  },
): Promise<StoredVisualFormat> {
  // ── Validation ────────────────────────────────────────────────────────────
  if (!input.name?.trim()) throw new Error("El nombre del formato es requerido.");
  if (input.width  < 1 || input.width  > 10000) throw new Error("Ancho inválido (1–10000 px).");
  if (input.height < 1 || input.height > 10000) throw new Error("Alto inválido (1–10000 px).");
  const { top, bottom, left, right } = input.margins;
  if ([top, bottom, left, right].some(m => m < 0 || m > 2000)) throw new Error("Márgenes inválidos (0–2000 px).");
  if (input.safeArea.width < 1 || input.safeArea.height < 1)   throw new Error("Área útil inválida.");

  // ── Load existing config ──────────────────────────────────────────────────
  const row = await (prisma as any).tenantMarketingConfig.findUnique({
    where:  { organizationId },
    select: { id: true, configJson: true, tenantName: true, promptEngine: true },
  });

  const existingConfig = row?.configJson as TenantMarketingConfig | undefined;
  const existingFormats: StoredVisualFormat[] = (existingConfig?.visualFormats ?? []) as StoredVisualFormat[];

  // ── Duplicate check ───────────────────────────────────────────────────────
  const isDuplicate = existingFormats.some(
    f => f.name.trim().toLowerCase() === input.name.trim().toLowerCase()
      && f.width  === input.width
      && f.height === input.height,
  );
  if (isDuplicate) {
    throw new Error(`Ya existe un formato llamado "${input.name}" con las mismas dimensiones.`);
  }

  // ── Build stored format ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  const newFormat: StoredVisualFormat = {
    id:               crypto.randomUUID(),
    name:             input.name.trim(),
    description:      `Formato personalizado ${input.width}×${input.height} px.`,
    width:            input.width,
    height:           input.height,
    margins:          input.margins,
    safeArea:         input.safeArea,
    compositionNotes: input.compositionNotes.trim() ||
      `Product centered in safe area (${input.safeArea.width}×${input.safeArea.height} px). ` +
      `Maintain margins — top: ${top} px, bottom: ${bottom} px, left: ${left} px, right: ${right} px.`,
    isCustom:         true,
    createdAt:        now,
    updatedAt:        now,
  };

  const updatedFormats = [...existingFormats, newFormat];

  // ── Persist ───────────────────────────────────────────────────────────────
  if (row) {
    // Update existing row — patch visualFormats inside configJson
    const updatedConfig = { ...(existingConfig ?? {}), visualFormats: updatedFormats };
    await (prisma as any).tenantMarketingConfig.update({
      where: { organizationId },
      data:  { configJson: updatedConfig },
    });
  } else {
    // No DB row yet — bootstrap from code-level registry + new format
    const codeCfg = getTenantConfig(orgSlug);
    const baseConfig: Record<string, unknown> = codeCfg
      ? { ...codeCfg, visualFormats: updatedFormats }
      : { visualFormats: updatedFormats };

    const promptEngine =
      orgSlug === "castillitos" ? "kids_product"  :
      orgSlug === "do-jeans"    ? "fashion_adult" :
      "generic";

    await (prisma as any).tenantMarketingConfig.create({
      data: {
        organizationId,
        tenantName:   codeCfg?.tenantName ?? orgSlug,
        active:       true,
        promptEngine,
        configJson:   baseConfig,
      },
    });
  }

  return newFormat;
}
