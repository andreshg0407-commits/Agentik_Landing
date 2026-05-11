/**
 * lib/customer360/identity.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CUSTOMER IDENTITY RESOLUTION — central helper
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Regla de oro:
 *   Ningún flujo operativo depende de NIT suelto, nombre suelto o
 *   ka_nl_tercero como identidad principal. Todo debe resolver a customerId.
 *
 * Orden de búsqueda:
 *   1. sagTerceroId  (ka_nl_tercero — integer PK de SAG TERCEROS, más estable)
 *   2. nitNormalized (NIT real de TERCEROS.n_nit — sin puntos/guiones)
 *   3. name exacto normalizado  (fallback temporal — marca NEEDS_REVIEW)
 *   4. Crear CustomerProfile nuevo si no existe
 *
 * Casos especiales:
 *   - Consumidor Final (NIT 222222222 / 0 / null + nombre genérico) → CONSUMIDOR_FINAL
 *   - Conflicto NIT vs sagTerceroId → NEEDS_REVIEW + identityNotes
 *   - Nunca sobrescribir un NIT válido con un ID interno SAG.
 *
 * Uso:
 *   const { customerId, isNew, status } = await resolveCustomerIdentity({
 *     organizationId: "...",
 *     sagTerceroId:   526,
 *     nit:            "901383501",
 *     customerName:   "INDUSTRIAS DIANA ALZATE SAS",
 *   });
 */

import { prisma }         from "@/lib/prisma";
import { IdentityStatus } from "@prisma/client";

// ── Constants ────────────────────────────────────────────────────────────────

/** NITs that represent anonymous consumers — never use as real identity. */
const CONSUMIDOR_FINAL_NITS = new Set(["222222222", "0", "222", ""]);

/** Name patterns that are generic anonymous consumers. */
const CONSUMIDOR_FINAL_NAMES = new Set([
  "CONSUMIDOR FINAL",
  "CONSUMIDOR",
  "CLIENTE MOSTRADOR",
  "SIN NOMBRE",
  "VARIOS",
  "CONTADO",
]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolveCustomerInput {
  organizationId: string;
  /** ka_nl_tercero from SAG TERCEROS — integer internal PK (most stable). */
  sagTerceroId?:  number | null;
  /** Real NIT from TERCEROS.n_nit (digits only, no dots/dashes/DV). */
  nit?:           string | null;
  /** Customer name from SAG sc_beneficiario. Used as last-resort fallback. */
  customerName?:  string | null;
  /** Email for future CRM merges — not used for resolution today. */
  email?:         string | null;
  /** Phone for future CRM merges — not used for resolution today. */
  phone?:         string | null;
}

export interface ResolveCustomerResult {
  /** CustomerProfile.id — the canonical identity key. */
  customerId:     string;
  /** Whether a new profile was created by this call. */
  isNew:          boolean;
  /** Resolution method used. */
  resolvedBy:     "sagTerceroId" | "nit" | "name" | "created";
  /** Current identityStatus on the profile. */
  status:         IdentityStatus;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a NIT string: strip whitespace, dots, dashes, and DV suffix. */
export function normalizeNit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = String(raw).trim().replace(/[\s.\-]/g, "");
  if (!clean || clean === "0") return null;
  // Strip DV: if 10 digits and last char after a hyphen was the DV, clean already handles it.
  // Colombian NITs are 9 digits; some sources include a 10th check digit separated by hyphen.
  // We already removed hyphens, so just strip to max 10 chars for safety.
  const digits = clean.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/** Normalize a customer name for loose matching. */
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Returns true when the NIT or name represents an anonymous consumer. */
function isConsumidorFinal(nit: string | null, name: string | null): boolean {
  if (nit && CONSUMIDOR_FINAL_NITS.has(nit)) return true;
  if (name && CONSUMIDOR_FINAL_NAMES.has(normalizeName(name))) return true;
  return false;
}

/** Generate a stable slug from NIT (preferred) or name. */
function makeSlug(nit: string | null, name: string | null): string {
  const base = nit ?? normalizeName(name ?? "sin-nombre");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const db = prisma as any;

/**
 * Resolve or create a CustomerProfile for an incoming SAG record.
 *
 * Thread-safety note: callers should not call this concurrently for the
 * same (organizationId, sagTerceroId/nit) — the upsert is not atomic.
 * In practice the sync engine processes records sequentially per org.
 */
export async function resolveCustomerIdentity(
  input: ResolveCustomerInput,
): Promise<ResolveCustomerResult> {
  const { organizationId } = input;
  const nitNorm   = normalizeNit(input.nit);
  const nameNorm  = normalizeName(input.customerName);
  const terceroId = input.sagTerceroId && input.sagTerceroId > 0
    ? input.sagTerceroId
    : null;

  // ── Consumidor Final fast-path ────────────────────────────────────────────
  if (isConsumidorFinal(nitNorm, nameNorm || input.customerName || null)) {
    const existing = await db.customerProfile.findFirst({
      where:  { organizationId, identityStatus: "CONSUMIDOR_FINAL" },
      select: { id: true, identityStatus: true },
    });
    if (existing) {
      return { customerId: existing.id, isNew: false, resolvedBy: "name", status: "CONSUMIDOR_FINAL" };
    }
    const created = await db.customerProfile.create({
      data: {
        organizationId,
        name:           "CONSUMIDOR FINAL",
        slug:           "consumidor-final",
        identityStatus: "CONSUMIDOR_FINAL",
        identityNotes:  "Auto-created placeholder for anonymous consumer records",
        customerType:   "B2C",
        nitNormalized:  null,
        sagTerceroId:   null,
      },
      select: { id: true },
    });
    return { customerId: created.id, isNew: true, resolvedBy: "created", status: "CONSUMIDOR_FINAL" };
  }

  // ── Step 1: lookup by sagTerceroId ────────────────────────────────────────
  if (terceroId != null) {
    const byTercero = await db.customerProfile.findFirst({
      where:  { organizationId, sagTerceroId: terceroId },
      select: { id: true, nit: true, nitNormalized: true, identityStatus: true },
    });
    if (byTercero) {
      // If we now have a real NIT and the profile doesn't, update it.
      const updates: Record<string, unknown> = {};
      if (nitNorm && !byTercero.nitNormalized) {
        updates.nitNormalized = nitNorm;
        updates.nit           = nitNorm;
        if (byTercero.identityStatus === "NEEDS_REVIEW") {
          updates.identityStatus = "VERIFIED" satisfies IdentityStatus;
        }
      }
      if (Object.keys(updates).length > 0) {
        await db.customerProfile.update({ where: { id: byTercero.id }, data: updates });
      }
      return {
        customerId:  byTercero.id,
        isNew:       false,
        resolvedBy:  "sagTerceroId",
        status:      (updates.identityStatus as IdentityStatus) ?? byTercero.identityStatus,
      };
    }
  }

  // ── Step 2: lookup by nitNormalized ───────────────────────────────────────
  if (nitNorm) {
    const byNit = await db.customerProfile.findFirst({
      where:  { organizationId, nitNormalized: nitNorm },
      select: { id: true, sagTerceroId: true, identityStatus: true },
    });
    if (byNit) {
      // A NIT-based lookup is itself identity confirmation → always upgrade NEEDS_REVIEW.
      const updates: Record<string, unknown> = {};
      if (terceroId != null && byNit.sagTerceroId == null) updates.sagTerceroId = terceroId;
      if (byNit.identityStatus === "NEEDS_REVIEW") {
        updates.identityStatus = "VERIFIED" satisfies IdentityStatus;
      }
      if (Object.keys(updates).length > 0) {
        await db.customerProfile.update({ where: { id: byNit.id }, data: updates });
      }
      return {
        customerId: byNit.id,
        isNew:      false,
        resolvedBy: "nit",
        status:     (updates.identityStatus as IdentityStatus) ?? byNit.identityStatus,
      };
    }

    // Also try legacy `nit` field (for profiles created before nitNormalized was added).
    const byLegacyNit = await db.customerProfile.findFirst({
      where:  { organizationId, nit: nitNorm },
      select: { id: true, sagTerceroId: true, identityStatus: true },
    });
    if (byLegacyNit) {
      const updates: Record<string, unknown> = { nitNormalized: nitNorm };
      if (terceroId != null && byLegacyNit.sagTerceroId == null) updates.sagTerceroId = terceroId;
      // NIT confirmed by lookup → upgrade
      if (byLegacyNit.identityStatus === "NEEDS_REVIEW") {
        updates.identityStatus = "VERIFIED" satisfies IdentityStatus;
      }
      await db.customerProfile.update({ where: { id: byLegacyNit.id }, data: updates });
      return {
        customerId: byLegacyNit.id,
        isNew:      false,
        resolvedBy: "nit",
        status:     (updates.identityStatus as IdentityStatus) ?? byLegacyNit.identityStatus,
      };
    }
  }

  // ── Step 3: lookup by exact name (fallback — marks NEEDS_REVIEW) ──────────
  if (nameNorm) {
    const byName = await db.customerProfile.findFirst({
      where:  { organizationId, name: nameNorm },
      select: { id: true, sagTerceroId: true, nitNormalized: true, identityStatus: true },
    });
    if (byName) {
      const updates: Record<string, unknown> = {};
      if (terceroId != null && byName.sagTerceroId == null) updates.sagTerceroId   = terceroId;
      if (nitNorm   && !byName.nitNormalized)               updates.nitNormalized  = nitNorm;
      if (nitNorm   && !byName.nitNormalized)               updates.nit            = nitNorm;
      // Upgrade from NEEDS_REVIEW if we now have both NIT and sagTerceroId
      if (
        byName.identityStatus === "NEEDS_REVIEW" &&
        (nitNorm || updates.nitNormalized) &&
        (terceroId != null || updates.sagTerceroId)
      ) {
        updates.identityStatus = "VERIFIED" satisfies IdentityStatus;
      }
      if (Object.keys(updates).length > 0) {
        await db.customerProfile.update({ where: { id: byName.id }, data: updates });
      }
      return {
        customerId: byName.id,
        isNew:      false,
        resolvedBy: "name",
        status:     (updates.identityStatus as IdentityStatus) ?? byName.identityStatus,
      };
    }
  }

  // ── Step 4: create new CustomerProfile ───────────────────────────────────
  const slug         = makeSlug(nitNorm, nameNorm);
  const finalStatus: IdentityStatus = nitNorm && terceroId != null
    ? "VERIFIED"
    : nitNorm
    ? "VERIFIED"
    : "NEEDS_REVIEW";
  const notes = finalStatus === "NEEDS_REVIEW"
    ? `Created via name-fallback. sagTerceroId=${terceroId ?? "null"}, nit=${nitNorm ?? "null"}`
    : undefined;

  // Ensure slug uniqueness within org by appending terceroId if taken.
  let finalSlug = slug;
  const existing = await db.customerProfile.findFirst({
    where:  { organizationId, slug: finalSlug },
    select: { id: true },
  });
  if (existing) {
    finalSlug = terceroId != null
      ? `${slug}-${terceroId}`
      : `${slug}-${Date.now()}`;
  }

  const created = await db.customerProfile.create({
    data: {
      organizationId,
      name:           nameNorm || "SIN NOMBRE",
      slug:           finalSlug,
      sagTerceroId:   terceroId ?? null,
      nitNormalized:  nitNorm   ?? null,
      nit:            nitNorm   ?? null,
      identityStatus: finalStatus,
      identityNotes:  notes ?? null,
    },
    select: { id: true },
  });

  return { customerId: created.id, isNew: true, resolvedBy: "created", status: finalStatus };
}
