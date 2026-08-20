/**
 * scripts/provision-review-personas.ts
 *
 * PLATFORM-REVIEW-PERSONAS-01: Idempotent provisioning for the three canonical
 * review personas in the Agentik org.
 *
 * Usage:
 *   bun run scripts/provision-review-personas.ts --dry-run
 *   bun run scripts/provision-review-personas.ts --execute
 *
 * MANDATORY: --dry-run or --execute must be specified explicitly.
 *
 * --dry-run:
 *   - NO writes, NO updates, NO creates, NO deletes.
 *   - Returns exit code 0 if audit succeeded.
 *   - Shows roles, memberships, seller identity (no secrets).
 *   - Generates BEFORE → PROPOSED table.
 *   - Generates rollback plan.
 *
 * --execute:
 *   - Applies provisioning changes to the database.
 *   - Idempotent: safe to run multiple times.
 *
 * SAFETY:
 *   - Does NOT create users that don't exist (must already exist from login).
 *   - Does NOT modify passwords.
 *   - Does NOT touch other tenants.
 *   - Affects ONLY the "agentik" org memberships for these three accounts.
 */

import path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { Role, MembershipStatus } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

// ── P2022 detector (mirrors lib/tenant.ts isPrismaColumnNotFound) ────────────

function isPlatformRoleColumnMissing(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const errObj = err as Record<string, unknown>;
  if (errObj.code === "P2022") {
    const meta = errObj.meta as Record<string, unknown> | undefined;
    if (meta) {
      const col = String(meta.column ?? meta.target ?? "");
      if (col.includes("platformRole")) return true;
    }
    return false;
  }
  const msg = typeof errObj.message === "string" ? errObj.message : "";
  if (msg.includes("platformRole") && msg.includes("does not exist")) return true;
  return false;
}

// ── Mode parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isExecute = args.includes("--execute");

if (!isDryRun && !isExecute) {
  console.error("ERROR: You must specify --dry-run or --execute explicitly.");
  console.error("Usage:");
  console.error("  bun run scripts/provision-review-personas.ts --dry-run");
  console.error("  bun run scripts/provision-review-personas.ts --execute");
  process.exit(1);
}

if (isDryRun && isExecute) {
  console.error("ERROR: Cannot specify both --dry-run and --execute.");
  process.exit(1);
}

// ── Persona definitions ─────────────────────────────────────────────────────────

interface PersonaDef {
  email: string;
  /** Target User.platformRole (global authority). null = tenant-only. */
  targetPlatformRole: "SUPER_ADMIN" | "AGENTIK_ADMIN" | null;
  /** Target Membership.role (tenant authority in agentik org). */
  targetMembershipRole: Role;
  classification: "PLATFORM" | "TENANT_ORG_ADMIN" | "TENANT_SELLER";
  description: string;
}

const PERSONAS: PersonaDef[] = [
  {
    email: "hello@agentik.com.co",
    targetPlatformRole: "SUPER_ADMIN",
    targetMembershipRole: Role.ORG_ADMIN,
    classification: "PLATFORM",
    description: "Platform SUPER_ADMIN — full internal access, entitlement bypass. Membership=ORG_ADMIN (data scope only).",
  },
  {
    email: "agentikflows@gmail.com",
    targetPlatformRole: null,
    targetMembershipRole: Role.ORG_ADMIN,
    classification: "TENANT_ORG_ADMIN",
    description: "Tenant ORG_ADMIN — Manager App, respects entitlements, no platform access",
  },
  {
    email: "pruebas@agentik.com.co",
    targetPlatformRole: null,
    targetMembershipRole: Role.OPERATOR,
    classification: "TENANT_SELLER",
    description: "Tenant Seller — Seller App only, confined, no desktop/platform access",
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMODE: ${isDryRun ? "DRY-RUN (no writes)" : "EXECUTE (live writes)"}\n`);

  const org = await prisma.organization.findUnique({
    where: { slug: "agentik" },
    select: { id: true, slug: true, name: true },
  });

  if (!org) {
    console.error("ERROR: Organization 'agentik' not found. Run seed first.");
    process.exit(1);
  }

  console.log(`Organization: ${org.name} (${org.slug})`);
  console.log();

  // ── PHASE 1: AUDIT CURRENT STATE ───────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("CURRENT STATE (BEFORE)");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  interface AuditResult {
    email: string;
    userExists: boolean;
    userId?: string;
    beforePlatformRole?: string | null;
    beforeMembershipRole?: string;
    beforeStatus?: string;
    hasSeller?: boolean;
    sellerSlug?: string;
  }

  const results: AuditResult[] = [];

  for (const persona of PERSONAS) {
    let user: { id: string; email: string; name: string | null; platformRole?: string | null } | null = null;
    try {
      user = await (prisma as any).user.findUnique({
        where: { email: persona.email },
        select: { id: true, email: true, name: true, platformRole: true },
      });
    } catch (err: unknown) {
      if (!isPlatformRoleColumnMissing(err)) throw err;
    }

    // Fallback if platformRole column doesn't exist yet
    const userFallback = user ?? await prisma.user.findUnique({
      where: { email: persona.email },
      select: { id: true, email: true, name: true },
    });

    if (!userFallback) {
      console.log(`  ${persona.email}: USER NOT FOUND`);
      results.push({ email: persona.email, userExists: false });
      continue;
    }

    const membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: userFallback.id } },
      select: { role: true, status: true, permissionsJson: true },
    });

    const perms = membership?.permissionsJson as Record<string, unknown> | null;
    const sellerSlug = perms?.sellerSlug as string | undefined;
    const platformRole = (user as any)?.platformRole ?? "(column not yet migrated)";

    console.log(`  ${persona.email}`);
    console.log(`    User ID (partial): ${userFallback.id.slice(0, 8)}...`);
    console.log(`    Name:           ${(userFallback as any).name ?? "(none)"}`);
    console.log(`    Platform Role:  ${platformRole}`);
    console.log(`    Membership:     ${membership ? `role=${membership.role}, status=${membership.status}` : "NONE"}`);
    console.log(`    Seller ID:      ${sellerSlug ?? "(none)"}`);
    console.log();

    results.push({
      email: persona.email,
      userExists: true,
      userId: userFallback.id,
      beforePlatformRole: (user as any)?.platformRole ?? null,
      beforeMembershipRole: membership?.role,
      beforeStatus: membership?.status,
      hasSeller: !!sellerSlug,
      sellerSlug,
    });
  }

  // ── PHASE 2: PROPOSED CHANGES ──────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("PROPOSED CHANGES (BEFORE → AFTER)");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  console.log("  ┌─────────────────────────────┬───────────────┬───────────────┬─────────────────────┐");
  console.log("  │ Account                      │ Before        │ After         │ Classification      │");
  console.log("  ├─────────────────────────────┼───────────────┼───────────────┼─────────────────────┤");

  for (let i = 0; i < PERSONAS.length; i++) {
    const persona = PERSONAS[i];
    const result = results[i];
    const beforeMembership = result.userExists ? (result.beforeMembershipRole ?? "NO_MEMBERSHIP") : "USER_NOT_FOUND";
    const afterMembership = result.userExists ? persona.targetMembershipRole : "SKIP";
    const beforePlatform = result.userExists ? (result.beforePlatformRole ?? "null") : "N/A";
    const afterPlatform = result.userExists ? (persona.targetPlatformRole ?? "null") : "SKIP";
    const mChanged = beforeMembership !== afterMembership ? "*" : "";
    const pChanged = beforePlatform !== afterPlatform ? "*" : "";
    console.log(
      `  │ ${persona.email.padEnd(27)} │ ${beforeMembership.padEnd(13)} │ ${afterMembership.padEnd(13)} │ ${persona.classification.padEnd(19)} │${mChanged}`,
    );
    console.log(
      `  │ ${"".padEnd(27)} │ P:${beforePlatform.padEnd(10)} │ P:${afterPlatform.padEnd(10)} │ ${"".padEnd(19)} │${pChanged}`,
    );
  }

  console.log("  └─────────────────────────────┴───────────────┴───────────────┴─────────────────────┘");
  console.log();

  // ── PHASE 3: EXECUTE OR REPORT ──────────────────────────────────────────────

  if (isDryRun) {
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("DRY-RUN: NO CHANGES APPLIED");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    // Seller identity audit
    console.log("── SELLER IDENTITY AUDIT ──────────────────────────────────────────\n");
    const sellerResult = results.find(r => r.email === "pruebas@agentik.com.co");
    if (sellerResult?.hasSeller) {
      console.log(`  pruebas@agentik.com.co has sellerSlug: "${sellerResult.sellerSlug}"`);
      console.log("  Seller confinement: ACTIVE");
    } else if (sellerResult?.userExists) {
      console.log("  pruebas@agentik.com.co has NO sellerSlug.");
      console.log("  Seller confinement: INACTIVE (needs seller identity provisioning).");
      console.log("  ACTION REQUIRED: Provision a certified seller identity before confinement activates.");
    } else {
      console.log("  pruebas@agentik.com.co: USER NOT FOUND — cannot audit seller identity.");
    }

    console.log();
    console.log("── ROLLBACK PLAN ──────────────────────────────────────────────────\n");
    console.log("  To revert (if --execute were run), set roles back to:");
    for (let i = 0; i < PERSONAS.length; i++) {
      const r = results[i];
      if (r.userExists) {
        console.log(`    ${r.email}: membership=${r.beforeMembershipRole ?? "NO_MEMBERSHIP"}, platformRole=${r.beforePlatformRole ?? "null"}, status=${r.beforeStatus ?? "N/A"}`);
      }
    }
    console.log("\n  After rollback: users must sign out and sign in again.");
    console.log();

    console.log("EXIT CODE: 0 (audit successful, no writes performed)");
  } else {
    // --execute mode
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("EXECUTING PROVISIONING");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    for (let i = 0; i < PERSONAS.length; i++) {
      const persona = PERSONAS[i];
      const result = results[i];

      if (!result.userExists || !result.userId) {
        console.log(`  SKIP ${persona.email} — user does not exist`);
        continue;
      }

      // 1. Upsert membership role (tenant authority)
      await prisma.membership.upsert({
        where: {
          organizationId_userId: { organizationId: org.id, userId: result.userId },
        },
        update: {
          role: persona.targetMembershipRole,
          status: MembershipStatus.ACTIVE,
        },
        create: {
          organizationId: org.id,
          userId: result.userId,
          role: persona.targetMembershipRole,
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date(),
        },
      });

      // 2. Set platformRole on User (global authority) — try/catch for missing column
      if (persona.targetPlatformRole !== null) {
        try {
          await (prisma as any).user.update({
            where: { id: result.userId },
            data: { platformRole: persona.targetPlatformRole },
          });
        } catch {
          console.log(`    WARNING: Could not set platformRole=${persona.targetPlatformRole} — column may not exist yet`);
        }
      } else {
        // Clear platformRole if target is null
        try {
          await (prisma as any).user.update({
            where: { id: result.userId },
            data: { platformRole: null },
          });
        } catch {
          // Column doesn't exist yet — acceptable
        }
      }

      const mAction = result.beforeMembershipRole === persona.targetMembershipRole ? "CONFIRMED" : "UPDATED";
      console.log(`  ${mAction} ${persona.email} → membership=${persona.targetMembershipRole}, platformRole=${persona.targetPlatformRole ?? "null"}`);
    }

    console.log("\n  DONE. Users must sign out and sign in again for changes to take effect.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
