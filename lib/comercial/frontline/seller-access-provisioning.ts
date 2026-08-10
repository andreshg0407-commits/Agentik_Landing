/**
 * lib/comercial/frontline/seller-access-provisioning.ts
 *
 * AGENTIK-SELLER-ACCESS-PROVISIONING-V1-01
 *
 * Minimum secure provisioning flow: give a real seller access to Seller App V1.
 *
 * Uses EXISTING Agentik auth system:
 *   - User + PasswordCredential (bcrypt)
 *   - Membership + permissionsJson (sellerSlug + sellerTerceroId)
 *   - MembershipStatus lifecycle (INVITED → ACTIVE → DISABLED)
 *   - User.authJson for one-time setup token (hashed, expiring)
 *
 * NO parallel auth system. NO public registration. NO password chosen by admin.
 * NO fuzzy/name matching. Seller identity is explicit and immutable once set.
 *
 * SERVER ONLY.
 */

import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

const db = prisma as any;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SellerProvisioningInput {
  organizationId: string;
  /** Canonical seller slug from CRM seller directory. Immutable. */
  sellerSlug: string;
  /** SAG ka_nl_tercero_vend integer. Immutable. */
  sellerTerceroId: number;
  /** Seller display name (from CRM directory, for User.name if creating). */
  sellerName: string;
  /** Email address for the seller account. */
  email: string;
  /** User ID of the admin performing the provisioning. */
  adminUserId: string;
}

export interface SellerProvisioningResult {
  ok: boolean;
  /** One-time setup URL path (admin shares with seller). Only on success. */
  setupUrl?: string;
  /** Raw setup token — shown ONCE to admin, never logged. */
  setupToken?: string;
  userId?: string;
  membershipId?: string;
  isNewUser?: boolean;
  error?: string;
}

export type SellerAccessState =
  | "no_access"          // No User or Membership exists
  | "invited"            // Membership INVITED, setup token pending
  | "active"             // Membership ACTIVE, login enabled
  | "disabled";          // Membership DISABLED, access revoked

export interface SellerAccessStatus {
  state: SellerAccessState;
  email: string | null;
  userId: string | null;
  membershipId: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  disabledAt: string | null;
}

// ── Setup token ──────────────────────────────────────────────────────────────

const SETUP_TOKEN_BYTES = 32;
const SETUP_TOKEN_EXPIRY_HOURS = 72;

function generateSetupToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(SETUP_TOKEN_BYTES).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  return { raw, hash, expiresAt };
}

function hashSetupToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ── Conflict detection ──────────────────────────────────────────────────────

/**
 * Gate: same user must NOT be linked to two different sellerTerceroIds
 * within the same organization.
 */
async function detectSellerConflict(
  organizationId: string,
  userId: string,
  sellerSlug: string,
  sellerTerceroId: number,
): Promise<string | null> {
  const existing = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    select: { permissionsJson: true, status: true },
  });

  if (!existing) return null;

  const perms = existing.permissionsJson as Record<string, unknown> | null;
  if (!perms?.sellerSlug) return null;

  const existingSlug = perms.sellerSlug as string;
  const existingTerceroId = perms.sellerTerceroId as number | undefined;

  if (existingSlug !== sellerSlug) {
    return `CONFLICT: user already linked to seller "${existingSlug}" in this organization`;
  }

  if (existingTerceroId !== undefined && existingTerceroId !== sellerTerceroId) {
    return `CONFLICT: user already linked to sellerTerceroId=${existingTerceroId}, cannot change to ${sellerTerceroId}`;
  }

  return null;
}

/**
 * Gate: same sellerSlug/sellerTerceroId must NOT be linked to two different
 * users within the same organization.
 */
async function detectDuplicateSellerMapping(
  organizationId: string,
  sellerSlug: string,
  excludeUserId?: string,
): Promise<string | null> {
  // Find any membership in this org that already has this sellerSlug
  const memberships = await db.membership.findMany({
    where: {
      organizationId,
      status: { not: "DISABLED" },
    },
    select: { userId: true, permissionsJson: true },
  });

  for (const m of memberships) {
    if (excludeUserId && m.userId === excludeUserId) continue;
    const perms = m.permissionsJson as Record<string, unknown> | null;
    if (perms?.sellerSlug === sellerSlug) {
      return `CONFLICT: sellerSlug "${sellerSlug}" already assigned to another user in this organization`;
    }
  }

  return null;
}

// ── Provision ───────────────────────────────────────────────────────────────

/**
 * Provision seller access to Seller App V1.
 *
 * Creates or reuses User + Membership with explicit seller identity.
 * Generates a one-time setup token for password creation.
 * Admin shares the setup link — seller sets their own password.
 */
export async function provisionSellerAccess(
  input: SellerProvisioningInput,
): Promise<SellerProvisioningResult> {
  const { organizationId, sellerSlug, sellerTerceroId, sellerName, email, adminUserId } = input;

  // Validate inputs
  if (!sellerSlug?.trim()) return { ok: false, error: "sellerSlug is required" };
  if (!sellerTerceroId || sellerTerceroId <= 0) return { ok: false, error: "sellerTerceroId must be a positive integer" };
  if (!email?.trim()) return { ok: false, error: "email is required" };
  if (!adminUserId?.trim()) return { ok: false, error: "adminUserId is required" };

  const normalizedEmail = email.toLowerCase().trim();

  // Check if sellerSlug already assigned to another user
  const dupMapping = await detectDuplicateSellerMapping(organizationId, sellerSlug);
  if (dupMapping) return { ok: false, error: dupMapping };

  // Find or create User
  let user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true, deletedAt: true },
  });

  let isNewUser = false;

  if (user?.deletedAt) {
    return { ok: false, error: "DELETED_USER: this email belongs to a soft-deleted user account" };
  }

  if (user) {
    // Existing user — check for seller conflict
    const conflict = await detectSellerConflict(organizationId, user.id, sellerSlug, sellerTerceroId);
    if (conflict) return { ok: false, error: conflict };

    // §5: Block admin-to-seller accidental downgrade
    // If this user already has a MANAGER+ role in this org, refuse to overwrite with OPERATOR.
    const existingMem = await db.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { role: true, status: true },
    });
    if (existingMem) {
      const protectedRoles = new Set(["MANAGER", "ORG_ADMIN", "SUPER_ADMIN", "AGENTIK_ADMIN"]);
      if (protectedRoles.has(existingMem.role) && existingMem.status === "ACTIVE") {
        return {
          ok: false,
          error: `DOWNGRADE_BLOCKED: user has role ${existingMem.role} in this organization. Cannot downgrade to OPERATOR for seller provisioning.`,
        };
      }
    }
  } else {
    // New user
    user = await db.user.create({
      data: {
        email: normalizedEmail,
        name: sellerName,
      },
      select: { id: true, email: true, name: true },
    });
    isNewUser = true;
  }

  // Generate setup token
  const { raw: setupTokenRaw, hash: setupTokenHash, expiresAt: setupTokenExpiresAt } = generateSetupToken();

  // Store setup token hash + provisioning context in User.authJson
  // Context binding: token is cryptographically tied to this exact provisioning context.
  // completeSellerSetup validates all context fields before activation.
  await db.user.update({
    where: { id: user.id },
    data: {
      authJson: {
        setupTokenHash,
        setupTokenExpiresAt: setupTokenExpiresAt.toISOString(),
        provisionedBy: adminUserId,
        provisionedAt: new Date().toISOString(),
        // Context binding fields — validated during setup
        boundOrganizationId: organizationId,
        boundSellerSlug: sellerSlug,
        boundSellerTerceroId: sellerTerceroId,
      },
    },
  });

  // Create or update Membership
  const permissionsJson = {
    sellerSlug,
    sellerTerceroId,
  };

  const existingMembership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: user.id },
    },
    select: { id: true, status: true },
  });

  let membershipId: string;

  if (existingMembership) {
    // Update existing membership
    await db.membership.update({
      where: { id: existingMembership.id },
      data: {
        role: "OPERATOR",
        status: "INVITED",
        permissionsJson,
        invitedAt: new Date(),
        acceptedAt: null,
        disabledAt: null,
      },
    });
    membershipId = existingMembership.id;
  } else {
    // Create new membership
    const created = await db.membership.create({
      data: {
        organizationId,
        userId: user.id,
        role: "OPERATOR",
        status: "INVITED",
        permissionsJson,
        invitedAt: new Date(),
      },
      select: { id: true },
    });
    membershipId = created.id;
  }

  // Build setup URL (internal path only — admin copies and shares)
  const setupUrl = `/login/setup?token=${setupTokenRaw}&email=${encodeURIComponent(normalizedEmail)}`;

  return {
    ok: true,
    setupUrl,
    setupToken: setupTokenRaw,
    userId: user.id,
    membershipId,
    isNewUser,
  };
}

// ── Setup (seller sets own password) ────────────────────────────────────────

export interface SetupResult {
  ok: boolean;
  error?: string;
}

/**
 * Complete seller account setup: validate token, create password, activate membership.
 *
 * Called from the setup page when the seller sets their password.
 */
export async function completeSellerSetup(
  email: string,
  setupToken: string,
  password: string,
): Promise<SetupResult> {
  if (!email?.trim() || !setupToken?.trim() || !password?.trim()) {
    return { ok: false, error: "Todos los campos son requeridos" };
  }
  if (password.length < 8) {
    return { ok: false, error: "La contrasena debe tener al menos 8 caracteres" };
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Find user
  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, authJson: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    return { ok: false, error: "Enlace de configuracion invalido" };
  }

  // Validate token
  const authJson = user.authJson as Record<string, unknown> | null;
  if (!authJson?.setupTokenHash || !authJson?.setupTokenExpiresAt) {
    return { ok: false, error: "No hay invitacion pendiente para esta cuenta" };
  }

  const expectedHash = authJson.setupTokenHash as string;
  const expiresAt = new Date(authJson.setupTokenExpiresAt as string);
  const actualHash = hashSetupToken(setupToken);

  if (actualHash !== expectedHash) {
    return { ok: false, error: "Enlace de configuracion invalido" };
  }

  if (new Date() > expiresAt) {
    return { ok: false, error: "El enlace ha expirado. Solicita uno nuevo a tu supervisor." };
  }

  // Validate context binding — token must match exact provisioning context
  const boundOrgId = authJson.boundOrganizationId as string | undefined;
  const boundSellerSlug = authJson.boundSellerSlug as string | undefined;
  const boundSellerTerceroId = authJson.boundSellerTerceroId as number | undefined;

  // If context fields exist (post-hardening tokens), validate the membership matches
  if (boundOrgId && boundSellerSlug) {
    const boundMembership = await db.membership.findUnique({
      where: { organizationId_userId: { organizationId: boundOrgId, userId: user.id } },
      select: { id: true, status: true, permissionsJson: true },
    });

    if (!boundMembership || boundMembership.status !== "INVITED") {
      return { ok: false, error: "Enlace de configuracion invalido — la invitacion no coincide" };
    }

    const perms = boundMembership.permissionsJson as Record<string, unknown> | null;
    if (perms?.sellerSlug !== boundSellerSlug) {
      return { ok: false, error: "Enlace de configuracion invalido — identidad de vendedor no coincide" };
    }
    if (boundSellerTerceroId !== undefined && perms?.sellerTerceroId !== boundSellerTerceroId) {
      return { ok: false, error: "Enlace de configuracion invalido — terceroId no coincide" };
    }
  }

  // Create or update password
  const passwordHash = await hashPassword(password);
  await db.passwordCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, passwordHash },
    update: { passwordHash },
  });

  // Clear setup token (single-use: token can never be reused)
  await db.user.update({
    where: { id: user.id },
    data: { authJson: null },
  });

  // Activate ONLY the bound membership (not all INVITED memberships)
  if (boundOrgId) {
    await db.membership.updateMany({
      where: {
        userId: user.id,
        organizationId: boundOrgId,
        status: "INVITED",
      },
      data: {
        status: "ACTIVE",
        acceptedAt: new Date(),
      },
    });
  } else {
    // Legacy path: pre-hardening tokens without context binding
    await db.membership.updateMany({
      where: {
        userId: user.id,
        status: "INVITED",
      },
      data: {
        status: "ACTIVE",
        acceptedAt: new Date(),
      },
    });
  }

  return { ok: true };
}

// ── Resend setup link ───────────────────────────────────────────────────────

/**
 * Regenerate the setup token for a seller with INVITED status.
 */
export async function resendSellerSetupLink(
  organizationId: string,
  sellerSlug: string,
  adminUserId: string,
): Promise<SellerProvisioningResult> {
  const membership = await findSellerMembership(organizationId, sellerSlug);
  if (!membership) {
    return { ok: false, error: "No se encontro la invitacion del vendedor" };
  }

  if (membership.status !== "INVITED") {
    return { ok: false, error: `No se puede reenviar: estado actual es ${membership.status}` };
  }

  const { raw, hash, expiresAt } = generateSetupToken();

  // Resolve sellerTerceroId from membership permissionsJson for context binding
  const perms = membership.permissionsJson as Record<string, unknown> | null;
  const sellerTerceroId = perms?.sellerTerceroId as number | undefined;

  await db.user.update({
    where: { id: membership.userId },
    data: {
      authJson: {
        setupTokenHash: hash,
        setupTokenExpiresAt: expiresAt.toISOString(),
        provisionedBy: adminUserId,
        provisionedAt: new Date().toISOString(),
        boundOrganizationId: organizationId,
        boundSellerSlug: sellerSlug,
        boundSellerTerceroId: sellerTerceroId ?? null,
      },
    },
  });

  // Update invitedAt
  await db.membership.update({
    where: { id: membership.id },
    data: { invitedAt: new Date() },
  });

  const setupUrl = `/login/setup?token=${raw}&email=${encodeURIComponent(membership.userEmail)}`;

  return {
    ok: true,
    setupUrl,
    setupToken: raw,
    userId: membership.userId,
    membershipId: membership.id,
    isNewUser: false,
  };
}

// ── Revoke ──────────────────────────────────────────────────────────────────

export interface RevokeResult {
  ok: boolean;
  error?: string;
}

/**
 * Revoke seller access. Sets Membership to DISABLED.
 * Does NOT delete User, financial history, or SAG business records.
 */
export async function revokeSellerAccess(
  organizationId: string,
  sellerSlug: string,
  _adminUserId: string,
): Promise<RevokeResult> {
  const membership = await findSellerMembership(organizationId, sellerSlug);
  if (!membership) {
    return { ok: false, error: "No se encontro la membresía del vendedor" };
  }

  if (membership.status === "DISABLED") {
    return { ok: false, error: "El acceso ya esta revocado" };
  }

  await db.membership.update({
    where: { id: membership.id },
    data: {
      status: "DISABLED",
      disabledAt: new Date(),
    },
  });

  return { ok: true };
}

// ── Access state query ──────────────────────────────────────────────────────

/**
 * Get the access state for a seller in an organization.
 * Used by Vendedores UI to show access badges and available actions.
 */
export async function getSellerAccessState(
  organizationId: string,
  sellerSlug: string,
): Promise<SellerAccessStatus> {
  const membership = await findSellerMembership(organizationId, sellerSlug);

  if (!membership) {
    return {
      state: "no_access",
      email: null,
      userId: null,
      membershipId: null,
      invitedAt: null,
      acceptedAt: null,
      disabledAt: null,
    };
  }

  const state: SellerAccessState =
    membership.status === "ACTIVE" ? "active"
    : membership.status === "INVITED" ? "invited"
    : "disabled";

  return {
    state,
    email: membership.userEmail,
    userId: membership.userId,
    membershipId: membership.id,
    invitedAt: membership.invitedAt?.toISOString() ?? null,
    acceptedAt: membership.acceptedAt?.toISOString() ?? null,
    disabledAt: membership.disabledAt?.toISOString() ?? null,
  };
}

/**
 * Batch access state for all sellers in an organization.
 * Returns a map of sellerSlug → SellerAccessStatus.
 */
export async function getSellerAccessStates(
  organizationId: string,
): Promise<Map<string, SellerAccessStatus>> {
  const memberships = await db.membership.findMany({
    where: { organizationId },
    select: {
      id: true,
      userId: true,
      status: true,
      permissionsJson: true,
      invitedAt: true,
      acceptedAt: true,
      disabledAt: true,
      user: { select: { email: true } },
    },
  });

  const result = new Map<string, SellerAccessStatus>();

  for (const m of memberships) {
    const perms = m.permissionsJson as Record<string, unknown> | null;
    const slug = perms?.sellerSlug as string | undefined;
    if (!slug) continue;

    const state: SellerAccessState =
      m.status === "ACTIVE" ? "active"
      : m.status === "INVITED" ? "invited"
      : "disabled";

    result.set(slug, {
      state,
      email: m.user?.email ?? null,
      userId: m.userId,
      membershipId: m.id,
      invitedAt: m.invitedAt?.toISOString() ?? null,
      acceptedAt: m.acceptedAt?.toISOString() ?? null,
      disabledAt: m.disabledAt?.toISOString() ?? null,
    });
  }

  return result;
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function findSellerMembership(
  organizationId: string,
  sellerSlug: string,
) {
  const memberships = await db.membership.findMany({
    where: { organizationId },
    select: {
      id: true,
      userId: true,
      status: true,
      permissionsJson: true,
      invitedAt: true,
      acceptedAt: true,
      disabledAt: true,
      user: { select: { email: true } },
    },
  });

  for (const m of memberships) {
    const perms = m.permissionsJson as Record<string, unknown> | null;
    if (perms?.sellerSlug === sellerSlug) {
      return {
        ...m,
        userEmail: m.user?.email as string,
      };
    }
  }

  return null;
}
