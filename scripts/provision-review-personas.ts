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
  targetRole: Role;
  classification: "PLATFORM" | "TENANT_ORG_ADMIN" | "TENANT_SELLER";
  description: string;
}

const PERSONAS: PersonaDef[] = [
  {
    email: "hello@agentik.com.co",
    targetRole: Role.SUPER_ADMIN,
    classification: "PLATFORM",
    description: "Platform SUPER_ADMIN — full internal access, entitlement bypass",
  },
  {
    email: "agentikflows@gmail.com",
    targetRole: Role.ORG_ADMIN,
    classification: "TENANT_ORG_ADMIN",
    description: "Tenant ORG_ADMIN — Manager App, respects entitlements, no platform access",
  },
  {
    email: "pruebas@agentik.com.co",
    targetRole: Role.OPERATOR,
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
    beforeRole?: string;
    beforeStatus?: string;
    hasSeller?: boolean;
    sellerSlug?: string;
  }

  const results: AuditResult[] = [];

  for (const persona of PERSONAS) {
    const user = await prisma.user.findUnique({
      where: { email: persona.email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      console.log(`  ${persona.email}: USER NOT FOUND`);
      results.push({ email: persona.email, userExists: false });
      continue;
    }

    const membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      select: { role: true, status: true, permissionsJson: true },
    });

    const perms = membership?.permissionsJson as Record<string, unknown> | null;
    const sellerSlug = perms?.sellerSlug as string | undefined;

    console.log(`  ${persona.email}`);
    console.log(`    User ID (partial): ${user.id.slice(0, 8)}...`);
    console.log(`    Name:       ${user.name ?? "(none)"}`);
    console.log(`    Membership: ${membership ? `role=${membership.role}, status=${membership.status}` : "NONE"}`);
    console.log(`    Seller ID:  ${sellerSlug ?? "(none)"}`);
    console.log();

    results.push({
      email: persona.email,
      userExists: true,
      userId: user.id,
      beforeRole: membership?.role,
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
    const before = result.userExists ? (result.beforeRole ?? "NO_MEMBERSHIP") : "USER_NOT_FOUND";
    const after = result.userExists ? persona.targetRole : "SKIP";
    const changed = before !== after ? " ← CHANGE" : "";
    console.log(
      `  │ ${persona.email.padEnd(27)} │ ${before.padEnd(13)} │ ${after.padEnd(13)} │ ${persona.classification.padEnd(19)} │${changed}`,
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
        console.log(`    ${r.email}: role=${r.beforeRole ?? "NO_MEMBERSHIP"}, status=${r.beforeStatus ?? "N/A"}`);
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

      await prisma.membership.upsert({
        where: {
          organizationId_userId: { organizationId: org.id, userId: result.userId },
        },
        update: {
          role: persona.targetRole,
          status: MembershipStatus.ACTIVE,
        },
        create: {
          organizationId: org.id,
          userId: result.userId,
          role: persona.targetRole,
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date(),
        },
      });

      const action = result.beforeRole === persona.targetRole ? "CONFIRMED" : "UPDATED";
      console.log(`  ${action} ${persona.email} → role=${persona.targetRole}`);
    }

    console.log("\n  DONE. Users must sign out and sign in again for changes to take effect.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
