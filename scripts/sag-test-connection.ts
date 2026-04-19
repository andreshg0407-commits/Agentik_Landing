/**
 * scripts/sag-test-connection.ts
 *
 * Phase 0 + Phase 1 — SAG connection validation.
 *
 * Phase 0: Validate all required env vars are present.
 * Phase 1: Fire a minimal SOAP call (SELECT TOP 1 * FROM TERCEROS) and confirm
 *          the endpoint is reachable and the token is accepted.
 *
 * Also verifies that the Castillitos org and its sag_pya_soap connector exist
 * in the Neon database (read-only DB query).
 *
 * Usage:
 *   npx tsx scripts/sag-test-connection.ts
 *   PYA_DEBUG=true npx tsx scripts/sag-test-connection.ts
 *
 * Exit 0 = all checks passed.
 * Exit 1 = at least one check failed.
 */

import * as dotenv from "dotenv";
import * as path   from "path";

// Load .env first, then .env.local overrides (Next.js convention).
// Order matters: .env.local wins over .env.
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { loadSagHomologEnv, maskToken } from "../lib/sag/env";
import { sagInfo, sagError, serializeSagError } from "../lib/sag/logger";
import { consultaSagJson } from "../lib/connectors/pya/client";
// Dynamic import: prisma reads DATABASE_URL at require-time.
// Importing it here (after dotenv.config) would be hoisted in ESM.
// Resolved by lazy-loading inside the function body instead.

// ── Colour helpers ─────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
};

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let exitCode = 0;

  console.log(`\n${C.bold}SAG Connection Test${C.reset} — Castillitos`);
  console.log(C.grey + new Date().toISOString() + C.reset);

  // ── Phase 0: Environment ──────────────────────────────────────────────────

  section("Phase 0 — Environment");

  let env: ReturnType<typeof loadSagHomologEnv>;
  try {
    env = loadSagHomologEnv();
    ok(`SAG_TEST_TOKEN: ${maskToken(env.token)}`);
    ok(`SAG_TEST_DB:    ${env.database}`);
    ok(`Endpoint:       ${env.endpointUrl}`);
    info(`PYA_DEBUG: ${env.debug}`);
    info(`SAG_LOG_LEVEL: ${env.logLevel}`);
    sagInfo("sync:start", { message: "env validated" });
  } catch (err) {
    fail(`Environment error: ${err instanceof Error ? err.message : String(err)}`);
    sagError("sync:all:fail", serializeSagError(err, { message: "env validation failed" }));
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    warn("DATABASE_URL is not set — DB checks will be skipped");
  } else {
    ok("DATABASE_URL is set");
  }

  // ── Phase 0b: Database checks ─────────────────────────────────────────────

  section("Phase 0b — Database");

  if (process.env.DATABASE_URL) {
    try {
      // Lazy import — DATABASE_URL must be in process.env before this runs
      const { prisma } = await import("../lib/prisma");
      try {
        const org = await prisma.organization.findUnique({
          where:  { slug: "castillitos" },
          select: { id: true, name: true, status: true },
        });

        if (!org) {
          fail("Organization 'castillitos' not found in DB");
          exitCode = 1;
        } else {
          ok(`Org found: ${org.name} (${org.id})`);
          if (org.status !== "ACTIVE") {
            warn(`Org status is ${org.status} — expected ACTIVE`);
          } else {
            ok(`Org status: ACTIVE`);
          }

          const connector = await (prisma as any).connector.findFirst({
            where:  { organizationId: org.id, source: "sag_pya_soap" },
            select: { id: true, status: true },
          });

          if (!connector) {
            warn("sag_pya_soap connector not found — run setup-castillitos-connectors.ts first");
          } else {
            ok(`Connector found: ${connector.id} (status: ${connector.status})`);
          }
        }
      } finally {
        await prisma.$disconnect().catch(() => undefined);
      }
    } catch (err) {
      fail(`DB error: ${err instanceof Error ? err.message : String(err)}`);
      warn("Continuing with SOAP test despite DB error");
    }
  } else {
    info("Skipping DB checks (no DATABASE_URL)");
  }

  // ── Phase 1: SOAP connection ──────────────────────────────────────────────

  section("Phase 1 — SOAP Connection");

  info(`Calling: ${env.endpointUrl}`);
  info("Query: SELECT TOP 1 * FROM TERCEROS");

  const t0 = Date.now();

  try {
    const rows = await consultaSagJson(
      { token: env.token, endpointUrl: env.endpointUrl, database: env.database },
      "SELECT TOP 1 * FROM TERCEROS",
    );

    const ms = Date.now() - t0;

    sagInfo("soap:ok", { message: "connection validated", ms });

    if (rows.length === 0) {
      warn(`SOAP call succeeded but returned 0 rows (ms: ${ms})`);
      warn("The query may have no matching rows — not necessarily an error");
    } else {
      ok(`SOAP call succeeded — ${rows.length} row(s) returned (ms: ${ms})`);

      // Print field names discovered
      const fields = Object.keys(rows[0]);
      ok(`Fields discovered in TERCEROS: ${fields.join(", ")}`);
    }

  } catch (err) {
    const ms = Date.now() - t0;
    fail(`SOAP call failed (ms: ${ms}): ${err instanceof Error ? err.message : String(err)}`);
    sagError("soap:fault", serializeSagError(err, { ms }));
    exitCode = 1;

    // Print diagnostic hint
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Token incorrecto") || msg.includes("PYA_SAG_ERROR")) {
      warn("Token appears expired or invalid — re-issue from SAG admin and update SAG_TEST_TOKEN in .env");
    } else if (msg.includes("PYA_HTTP_ERROR: 401")) {
      warn("HTTP 401 — token rejected by the endpoint");
    } else if (msg.includes("PYA_HTTP_ERROR: 503") || msg.includes("ECONNREFUSED")) {
      warn("SAG endpoint appears unreachable — check Azure portal");
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Summary");

  if (exitCode === 0) {
    ok(`All checks passed`);
    console.log(`\n  ${C.green}${C.bold}Phase 0 + Phase 1 complete.${C.reset}`);
    console.log(`  Next: run  npx tsx scripts/sag-test-read.ts\n`);
  } else {
    fail(`One or more checks failed — see above`);
    console.log(`\n  ${C.red}${C.bold}Fix the issues above before running Phase 2+.${C.reset}\n`);
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error(`\n${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
