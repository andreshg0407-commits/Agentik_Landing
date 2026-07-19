/**
 * lib/tenant/branding.ts
 *
 * Transversal tenant branding service.
 * Single source of corporate identity for Comercial, Marketing, PDFs,
 * catalogs, and communications.
 *
 * Sprint: TENANT-BRANDING-FOUNDATION-01
 * Hotfix: TENANT-BRANDING-PRISMA-CLIENT-01
 */

import { prisma } from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrganizationBrandingData {
  id: string | null;
  organizationId: string;
  /** true when this record exists in the database */
  isPersisted: boolean;

  // Identity
  commercialName: string;
  legalName: string;
  taxId: string;

  // Contact
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;

  // Visual
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  logoDarkUrl: string;
  logoMonoUrl: string;

  // Document
  documentFooter: string;

  // Social
  socialInstagram: string;
  socialFacebook: string;
  socialWhatsapp: string;
}

export interface BrandingUpsertInput {
  commercialName?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  logoMonoUrl?: string;
  documentFooter?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialWhatsapp?: string;
}

// ── Fallback ─────────────────────────────────────────────────────────────────

function buildFallback(orgId: string, orgName: string): OrganizationBrandingData {
  return {
    id: null,
    organizationId: orgId,
    isPersisted: false,
    commercialName: orgName,
    legalName: orgName,
    taxId: "",
    address: "",
    city: "",
    country: "Colombia",
    phone: "",
    email: "",
    website: "",
    primaryColor: "#004AAD",
    secondaryColor: "#1e1e2e",
    accentColor: "#004AAD",
    logoUrl: "",
    logoDarkUrl: "",
    logoMonoUrl: "",
    documentFooter: `Documento generado por Agentik para ${orgName}.`,
    socialInstagram: "",
    socialFacebook: "",
    socialWhatsapp: "",
  };
}

function rowToData(row: Record<string, unknown>, orgName: string): OrganizationBrandingData {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: s(row.id) || null,
    organizationId: s(row.organizationId),
    isPersisted: true,
    commercialName: s(row.commercialName) || orgName,
    legalName: s(row.legalName) || orgName,
    taxId: s(row.taxId),
    address: s(row.address),
    city: s(row.city),
    country: s(row.country) || "Colombia",
    phone: s(row.phone),
    email: s(row.email),
    website: s(row.website),
    primaryColor: s(row.primaryColor) || "#004AAD",
    secondaryColor: s(row.secondaryColor) || "#1e1e2e",
    accentColor: s(row.accentColor) || "#004AAD",
    logoUrl: s(row.logoUrl),
    logoDarkUrl: s(row.logoDarkUrl),
    logoMonoUrl: s(row.logoMonoUrl),
    documentFooter: s(row.documentFooter) || `Documento generado por Agentik para ${orgName}.`,
    socialInstagram: s(row.socialInstagram),
    socialFacebook: s(row.socialFacebook),
    socialWhatsapp: s(row.socialWhatsapp),
  };
}

// ── Prisma delegate accessor ────────────────────────────────────────────────

/**
 * Access the OrganizationBranding delegate from Prisma.
 * Throws a clear error if the model is not available (stale client or missing migration).
 */
function db() {
  const delegate = (prisma as any).organizationBranding;
  if (!delegate) {
    throw new Error(
      "Prisma Client no tiene el modelo OrganizationBranding. " +
      "Ejecuta: npx prisma generate && npx prisma migrate dev, luego reinicia el servidor.",
    );
  }
  return delegate;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get branding by organization ID. Never returns null — falls back to defaults.
 */
export async function getOrganizationBranding(orgId: string): Promise<OrganizationBrandingData> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const orgName = org?.name ?? "Organización";

  try {
    const delegate = (prisma as any).organizationBranding;
    if (!delegate) return buildFallback(orgId, orgName);
    const row = await delegate.findUnique({ where: { organizationId: orgId } });
    if (row) return rowToData(row as Record<string, unknown>, orgName);
  } catch {
    // Table may not exist yet — return fallback
  }

  return buildFallback(orgId, orgName);
}

/**
 * Get branding by org slug. Never returns null.
 */
export async function getOrganizationBrandingBySlug(orgSlug: string): Promise<OrganizationBrandingData> {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true } });
  if (!org) return buildFallback("", orgSlug);
  return getOrganizationBranding(org.id);
}

/**
 * Create or update branding for an organization.
 * Throws with a clear message if Prisma delegate or table is unavailable.
 */
export async function upsertOrganizationBranding(
  orgId: string,
  input: BrandingUpsertInput,
): Promise<OrganizationBrandingData> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const orgName = org?.name ?? "Organización";

  const delegate = db(); // throws if delegate missing

  const row = await delegate.upsert({
    where: { organizationId: orgId },
    update: { ...input },
    create: { organizationId: orgId, ...input },
  });

  return rowToData(row as Record<string, unknown>, orgName);
}
