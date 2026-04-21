/**
 * scripts/_fix-connector-token.ts
 *
 * Fixes the Castillitos sag_pya_soap connector — three issues confirmed by raw SOAP probes:
 *
 *   1. Token in connector DB is INVALID (PYA_AP... 13chars placeholder).
 *      The dry-run fires with connector.config.token, NOT the env var.
 *      PROVEN: SELECT 1 AS ok with connector token → FALLIDO NullReferenceException.
 *              Same query with env token → {"ok":1} SUCCESS.
 *      Fix: replace with valid PYA_SOAP_TOKEN from env.
 *
 *   2. customerQuery = "SELECT * FROM v_cl" — v_cl does NOT exist.
 *      PROVEN: "Invalid object name 'v_cl'."
 *      Fix: revert to "SELECT * FROM TERCEROS" (confirmed working, returns real rows).
 *
 *   3. a_s_bd is NOT required by this SAG installation (single-DB config).
 *      Probes B and E confirm: TERCEROS and MOVIMIENTOS work without a_s_bd.
 *      database field kept in config but has no operational effect here.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/_fix-connector-token.ts
 */

import { prisma } from "@/lib/prisma";

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

function maskToken(t: string): string {
  if (!t) return "(EMPTY)";
  return t.slice(0, 6) + "..." + `[${t.length}chars]`;
}

async function main() {
  const newToken = process.env.PYA_SOAP_TOKEN?.trim() || process.env.SAG_TEST_TOKEN?.trim();
  if (!newToken) {
    console.error("✗ PYA_SOAP_TOKEN not set in env. Cannot fix token.");
    process.exit(1);
  }

  const connector = await prisma.connector.findUnique({
    where: { id: CONNECTOR_ID },
    select: { config: true, status: true },
  });
  if (!connector) {
    console.error(`✗ Connector ${CONNECTOR_ID} not found.`);
    process.exit(1);
  }

  const currentCfg = connector.config as Record<string, unknown>;
  const currentToken = typeof currentCfg.token === "string" ? currentCfg.token : "(missing)";

  console.log("\n══════════════════════════════════════════════════");
  console.log("  FIX CASTILLITOS CONNECTOR — TOKEN + QUERY");
  console.log("══════════════════════════════════════════════════");
  console.log(`  status now:      ${connector.status}`);
  console.log(`  current token:   ${maskToken(currentToken)}  ← INVALID`);
  console.log(`  new token:       ${maskToken(newToken)}      ← valid env token`);
  console.log(`  customerQuery:   TERCEROS (reverting from v_cl which does not exist)`);
  console.log("");

  const newConfig = {
    ...currentCfg,
    token:         newToken,
    customerQuery: "SELECT * FROM TERCEROS",  // v_cl does not exist — confirmed by probe
  };

  await prisma.connector.update({
    where: { id: CONNECTOR_ID },
    data: {
      config:    newConfig,
      status:    "ACTIVE",
      updatedAt: new Date(),
    },
  });

  console.log("✓ Done.");
  console.log(`  token updated:       ${maskToken(currentToken)} → ${maskToken(newToken)}`);
  console.log(`  customerQuery:       SELECT * FROM TERCEROS`);
  console.log(`  receivableQuery:     unchanged (MOVIMIENTOS JOIN — confirmed working)`);
  console.log(`  status:              ACTIVE`);
  console.log("");
  console.log("  Dry-run ahora debería retornar filas reales.");
  console.log("");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
