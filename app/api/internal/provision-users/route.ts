/**
 * DELIVERY-HARDENING-07A0 — Castillitos User Provisioning
 *
 * Preview-only batch provisioning endpoint. Idempotent:
 * - If user exists + membership correct → ALREADY_CORRECT
 * - If user exists + role differs → UPDATED
 * - If user does not exist → CREATED
 *
 * Guards:
 * - VERCEL_ENV !== "production"
 * - PROBE_SECRET required
 * - castillitos only
 * - Password received via POST body (never stored in code)
 * - No SUPER_ADMIN or AGENTIK_ADMIN grants
 *
 * Sprint: DELIVERY-HARDENING-07A0
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_ORG = "castillitos";

// Blocked roles — never provisioned via this endpoint
const BLOCKED_ROLES = new Set<string>(["SUPER_ADMIN", "AGENTIK_ADMIN"]);

interface UserSpec {
  email: string;
  name: string;
  role: Role;
  permissionsJson?: Record<string, unknown>;
}

// User matrix — emails normalized to lowercase, no passwords stored
const USER_MATRIX: UserSpec[] = [
  { email: "patronajecastillitos@gmail.com",    name: "Lina Maria Jaramillo",   role: "OPERATOR",  permissionsJson: { moduleScope: ["maletas"] } },
  { email: "liderbodegacastillitos@gmail.com",  name: "Jaime Cruz",             role: "VIEWER" },
  { email: "pvaldas@castillitos.com",           name: "Leidy Paola Gonzalez",   role: "OPERATOR",  permissionsJson: { moduleScope: ["tiendas"] } },
  { email: "maquilacolombia2026@gmail.com",     name: "Yuliana Ospina",         role: "ORG_ADMIN" },
  { email: "gerencia@castillitos.com",          name: "Luis Alfredo Castillo",  role: "ORG_ADMIN" },
  { email: "contabilidadcastillitos@gmail.com", name: "Astrid Perez",           role: "VIEWER" },
  { email: "communitymanager@castillitos.com",  name: "Manuela Tamayo",         role: "VIEWER",    permissionsJson: { moduleScope: ["marketing_studio"] } },
  { email: "nestorventascastillitos@gmail.com",  name: "Nestor Alzate",          role: "OPERATOR",  permissionsJson: { sellerSlug: "nestor-alzate" } },
  { email: "orlandoventascastillitos@gmail.com", name: "Orlando Naranjo",        role: "OPERATOR",  permissionsJson: { sellerSlug: "orlando-naranjo" } },
];

export async function POST(req: Request) {
  // ── Guard: Preview-only ──────────────────────────────────────────────
  const vercelEnv = process.env.VERCEL_ENV ?? "development";
  if (vercelEnv === "production") {
    return NextResponse.json(
      { error: "BLOCKED_PRODUCTION", message: "Provisioning is Preview-only." },
      { status: 403 },
    );
  }

  // ── Guard: PROBE_SECRET ──────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const probeSecret = searchParams.get("secret");
  const expectedSecret = process.env.PROBE_SECRET;

  if (!probeSecret || !expectedSecret || probeSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "AUTH_FAILED", message: "PROBE_SECRET required." },
      { status: 401 },
    );
  }

  // ── Parse password from body ─────────────────────────────────────────
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const tempPassword = body.password;
  if (!tempPassword || tempPassword.length < 8) {
    return NextResponse.json(
      { error: "PASSWORD_REQUIRED", message: "POST body must include password (≥8 chars). Password is NOT stored in code." },
      { status: 400 },
    );
  }

  // ── Resolve org ──────────────────────────────────────────────────────
  const org = await prisma.organization.findUnique({
    where: { slug: ALLOWED_ORG },
    select: { id: true, slug: true },
  });
  if (!org) {
    return NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 });
  }

  // ── Hash password once ───────────────────────────────────────────────
  const passwordHash = await hashPassword(tempPassword);

  // ── Provision each user ──────────────────────────────────────────────
  const results: Record<string, unknown> = {};

  for (const spec of USER_MATRIX) {
    if (BLOCKED_ROLES.has(spec.role)) {
      results[spec.email] = { status: "BLOCKED", cause: `Role ${spec.role} is blocked.` };
      continue;
    }

    try {
      const email = spec.email.trim().toLowerCase();

      // Upsert user
      const user = await prisma.user.upsert({
        where: { email },
        update: { name: spec.name },
        create: { email, name: spec.name },
      });

      // Set password credential
      await prisma.passwordCredential.upsert({
        where: { userId: user.id },
        update: { passwordHash },
        create: { userId: user.id, passwordHash },
      });

      // Check existing membership
      const existing = await prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        select: { id: true, role: true, status: true, permissionsJson: true },
      });

      if (existing) {
        const needsRoleUpdate = existing.role !== spec.role;
        const needsStatusUpdate = existing.status !== "ACTIVE";
        const existingPerms = existing.permissionsJson as Record<string, unknown> | null;
        const needsPermsUpdate = spec.permissionsJson && JSON.stringify(existingPerms) !== JSON.stringify(spec.permissionsJson);

        if (!needsRoleUpdate && !needsStatusUpdate && !needsPermsUpdate) {
          results[spec.email] = {
            status: "ALREADY_CORRECT",
            userId: user.id,
            membershipId: existing.id,
            role: existing.role,
          };
          continue;
        }

        // Update membership
        const updateData: Record<string, unknown> = {};
        if (needsRoleUpdate) updateData.role = spec.role;
        if (needsStatusUpdate) {
          updateData.status = "ACTIVE";
          updateData.acceptedAt = new Date();
          updateData.disabledAt = null;
        }
        if (needsPermsUpdate) updateData.permissionsJson = spec.permissionsJson;

        const updated = await prisma.membership.update({
          where: { id: existing.id },
          data: updateData,
        });

        results[spec.email] = {
          status: "UPDATED",
          userId: user.id,
          membershipId: updated.id,
          role: updated.role,
          changes: {
            ...(needsRoleUpdate ? { role: `${existing.role} → ${spec.role}` } : {}),
            ...(needsStatusUpdate ? { status: `${existing.status} → ACTIVE` } : {}),
            ...(needsPermsUpdate ? { permissions: "updated" } : {}),
          },
        };
      } else {
        // Create membership
        const membership = await prisma.membership.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: spec.role,
            status: "ACTIVE",
            acceptedAt: new Date(),
            permissionsJson: spec.permissionsJson as any ?? undefined,
          },
        });

        results[spec.email] = {
          status: "CREATED",
          userId: user.id,
          membershipId: membership.id,
          role: membership.role,
        };
      }
    } catch (e: unknown) {
      results[spec.email] = {
        status: "ERROR",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return NextResponse.json({
    action: "DELIVERY-HARDENING-07A0-PROVISION",
    organizationId: org.id,
    orgSlug: org.slug,
    timestamp: new Date().toISOString(),
    userCount: USER_MATRIX.length,
    results,
  });
}
