/**
 * scripts/dev-elevate.ts
 *
 * Elevates a local user to SUPER_ADMIN for internal route access.
 * LOCAL DEVELOPMENT ONLY — never run against production.
 *
 * Usage:
 *   npx tsx scripts/dev-elevate.ts <email> [orgSlug]
 *
 * Examples:
 *   npx tsx scripts/dev-elevate.ts andreshg0407@gmail.com agentik
 *   npx tsx scripts/dev-elevate.ts andreshg0407@gmail.com castillitos
 *
 * After running: sign out at /login → sign in again so the JWT picks up the new role.
 */

import path                          from "path";
import * as dotenv                   from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

// Build Prisma client inline after env is loaded — avoids module-eval ordering
// issue that occurs when importing @/lib/prisma (which reads DATABASE_URL at
// import time before dotenv.config() has run).
import { PrismaClient }              from "@prisma/client";
import { PrismaPg }                  from "@prisma/adapter-pg";
import { Pool }                      from "pg";
import { Role, MembershipStatus }    from "@prisma/client";

const pool    = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const email   = process.argv[2];
const orgSlug = process.argv[3] ?? "agentik";

if (!email) {
  console.error("Usage: npx tsx scripts/dev-elevate.ts <email> [orgSlug]");
  console.error("       orgSlug defaults to \"agentik\"");
  process.exit(1);
}

async function main() {
  // ── Locate user ─────────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`✗ No user found with email: ${email}`);
    console.error("  Run 'npx prisma db seed' first if the DB is empty.");
    process.exit(1);
  }

  // ── Locate org ───────────────────────────────────────────────────────────────
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) {
    console.error(`✗ No organization found with slug: "${orgSlug}"`);
    const orgs = await prisma.organization.findMany({ select: { slug: true, name: true } });
    console.error("  Available orgs:", orgs.map(o => `${o.slug} (${o.name})`).join(", "));
    process.exit(1);
  }

  // ── Upsert membership ────────────────────────────────────────────────────────
  const existing = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
  });

  if (existing) {
    const prev = existing.role;
    await prisma.membership.update({
      where: { id: existing.id },
      data:  { role: Role.SUPER_ADMIN, status: MembershipStatus.ACTIVE },
    });
    console.log(`✓ Elevated  ${email}  ${prev} → SUPER_ADMIN  in org "${orgSlug}"`);
  } else {
    await prisma.membership.create({
      data: {
        organizationId: org.id,
        userId:         user.id,
        role:           Role.SUPER_ADMIN,
        status:         MembershipStatus.ACTIVE,
        acceptedAt:     new Date(),
      },
    });
    console.log(`✓ Created   ${email}  SUPER_ADMIN membership in org "${orgSlug}" (new)`);
  }

  console.log("\nNext steps:");
  console.log("  1. Sign out → sign in at /login  (JWT must refresh to pick up new role)");
  console.log(`  2. Marketing Studio: /${orgSlug}/agentik/marketing-studio`);
  console.log(`  3. New session:      /${orgSlug}/agentik/marketing-studio/new`);
}

main()
  .catch(e => { console.error("✗ Error:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
