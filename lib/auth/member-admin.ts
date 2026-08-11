/**
 * lib/auth/member-admin.ts
 *
 * Sprint: AGENTIK-TENANT-USER-ADMIN-01
 *
 * Canonical member provisioning service for organization membership CRUD.
 *
 * Authorization law:
 *   - SUPER_ADMIN can manage all roles in any org.
 *   - AGENTIK_ADMIN can manage client-facing roles (ORG_ADMIN and below).
 *   - ORG_ADMIN and below CANNOT manage memberships.
 *   - Nobody can grant a role higher than their own.
 *   - Seller identity fields are NOT managed here — that is a
 *     separate concern handled by dedicated seller workflows.
 *
 * PURE server-side. No React. No viewport.
 */

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { roleRank } from "@/lib/auth/module-access";
import type { Role, MembershipStatus } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemberListItem {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  status: MembershipStatus;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  disabledAt: Date | null;
  hasSellerIdentity: boolean;
}

export interface CreateMemberInput {
  email: string;
  name: string;
  password: string;
  role: Role;
}

export interface UpdateMemberInput {
  role?: Role;
  status?: "ACTIVE" | "DISABLED";
}

export type MemberAdminError =
  | "UNAUTHORIZED"
  | "CANNOT_GRANT_HIGHER_ROLE"
  | "CANNOT_GRANT_INTERNAL_ROLE"
  | "EMAIL_ALREADY_EXISTS_IN_ORG"
  | "MEMBERSHIP_NOT_FOUND"
  | "INVALID_ROLE"
  | "INVALID_INPUT";

export type MemberAdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: MemberAdminError; detail: string };

// ── Constants ─────────────────────────────────────────────────────────────────

/** Roles that can manage org memberships. */
const ADMIN_ROLES = new Set<Role>(["SUPER_ADMIN", "AGENTIK_ADMIN"]);

/** Internal-only roles that ORG_ADMIN cannot be granted by non-SUPER_ADMIN. */
const INTERNAL_ROLES = new Set<Role>(["SUPER_ADMIN", "AGENTIK_ADMIN"]);

/** All valid roles for membership assignment. */
const VALID_ROLES = new Set<Role>([
  "SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN",
  "MANAGER", "OPERATOR", "VIEWER", "BILLING",
]);

// ── Authorization helpers ─────────────────────────────────────────────────────

function canManageMembers(callerRole: Role): boolean {
  return ADMIN_ROLES.has(callerRole);
}

function canGrantRole(callerRole: Role, targetRole: Role): boolean {
  // Cannot grant internal roles unless caller is SUPER_ADMIN
  if (INTERNAL_ROLES.has(targetRole) && callerRole !== "SUPER_ADMIN") {
    return false;
  }
  // Cannot grant a role equal to or higher than your own (except SUPER_ADMIN)
  if (callerRole === "SUPER_ADMIN") return true;
  return roleRank(callerRole) > roleRank(targetRole);
}

// ── List members ──────────────────────────────────────────────────────────────

export async function listOrgMembers(
  orgId: string,
  callerRole: Role,
): Promise<MemberAdminResult<MemberListItem[]>> {
  if (!canManageMembers(callerRole)) {
    return { ok: false, error: "UNAUTHORIZED", detail: "Role cannot manage memberships." };
  }

  const memberships = await prisma.membership.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      invitedAt: true,
      acceptedAt: true,
      disabledAt: true,
      permissionsJson: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const items: MemberListItem[] = memberships.map(m => {
    const perms = m.permissionsJson as Record<string, unknown> | null;
    return {
      membershipId: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      status: m.status,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      disabledAt: m.disabledAt,
      hasSellerIdentity: !!(perms?.sellerSlug),
    };
  });

  return { ok: true, data: items };
}

// ── Create member ─────────────────────────────────────────────────────────────

export async function createOrgMember(
  orgId: string,
  callerRole: Role,
  input: CreateMemberInput,
): Promise<MemberAdminResult<MemberListItem>> {
  if (!canManageMembers(callerRole)) {
    return { ok: false, error: "UNAUTHORIZED", detail: "Role cannot manage memberships." };
  }

  if (!VALID_ROLES.has(input.role)) {
    return { ok: false, error: "INVALID_ROLE", detail: `Role ${input.role} is not valid.` };
  }

  if (!canGrantRole(callerRole, input.role)) {
    if (INTERNAL_ROLES.has(input.role)) {
      return { ok: false, error: "CANNOT_GRANT_INTERNAL_ROLE", detail: `Cannot grant ${input.role} — internal role.` };
    }
    return { ok: false, error: "CANNOT_GRANT_HIGHER_ROLE", detail: `Cannot grant ${input.role} — exceeds caller authority.` };
  }

  if (!input.email || !input.name || !input.password) {
    return { ok: false, error: "INVALID_INPUT", detail: "email, name, and password are required." };
  }

  if (input.password.length < 8) {
    return { ok: false, error: "INVALID_INPUT", detail: "Password must be at least 8 characters." };
  }

  // Upsert user (may already exist in another org)
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: { name: input.name },
    create: { email: input.email, name: input.name },
  });

  // Check if membership already exists in this org
  const existing = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (existing) {
    return { ok: false, error: "EMAIL_ALREADY_EXISTS_IN_ORG", detail: `${input.email} already has a membership in this org.` };
  }

  // Set password credential
  const hash = await hashPassword(input.password);
  await prisma.passwordCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash: hash },
    create: { userId: user.id, passwordHash: hash },
  });

  // Create membership — directly ACTIVE (no invitation flow for admin provisioning)
  const membership = await prisma.membership.create({
    data: {
      organizationId: orgId,
      userId: user.id,
      role: input.role,
      status: "ACTIVE",
      acceptedAt: new Date(),
    },
  });

  return {
    ok: true,
    data: {
      membershipId: membership.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
      status: membership.status,
      invitedAt: membership.invitedAt,
      acceptedAt: membership.acceptedAt,
      disabledAt: membership.disabledAt,
      hasSellerIdentity: false,
    },
  };
}

// ── Update member ─────────────────────────────────────────────────────────────

export async function updateOrgMember(
  orgId: string,
  callerRole: Role,
  membershipId: string,
  input: UpdateMemberInput,
): Promise<MemberAdminResult<MemberListItem>> {
  if (!canManageMembers(callerRole)) {
    return { ok: false, error: "UNAUTHORIZED", detail: "Role cannot manage memberships." };
  }

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: orgId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      invitedAt: true,
      acceptedAt: true,
      disabledAt: true,
      permissionsJson: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (!membership) {
    return { ok: false, error: "MEMBERSHIP_NOT_FOUND", detail: "Membership not found in this org." };
  }

  const updateData: Record<string, unknown> = {};

  if (input.role) {
    if (!VALID_ROLES.has(input.role)) {
      return { ok: false, error: "INVALID_ROLE", detail: `Role ${input.role} is not valid.` };
    }
    if (!canGrantRole(callerRole, input.role)) {
      if (INTERNAL_ROLES.has(input.role)) {
        return { ok: false, error: "CANNOT_GRANT_INTERNAL_ROLE", detail: `Cannot grant ${input.role}.` };
      }
      return { ok: false, error: "CANNOT_GRANT_HIGHER_ROLE", detail: `Cannot grant ${input.role}.` };
    }
    updateData.role = input.role;
  }

  if (input.status === "DISABLED") {
    updateData.status = "DISABLED";
    updateData.disabledAt = new Date();
  } else if (input.status === "ACTIVE") {
    updateData.status = "ACTIVE";
    updateData.disabledAt = null;
  }

  const updated = await prisma.membership.update({
    where: { id: membershipId },
    data: updateData,
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      invitedAt: true,
      acceptedAt: true,
      disabledAt: true,
      permissionsJson: true,
      user: { select: { email: true, name: true } },
    },
  });

  const perms = updated.permissionsJson as Record<string, unknown> | null;

  return {
    ok: true,
    data: {
      membershipId: updated.id,
      userId: updated.userId,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role,
      status: updated.status,
      invitedAt: updated.invitedAt,
      acceptedAt: updated.acceptedAt,
      disabledAt: updated.disabledAt,
      hasSellerIdentity: !!(perms?.sellerSlug),
    },
  };
}
