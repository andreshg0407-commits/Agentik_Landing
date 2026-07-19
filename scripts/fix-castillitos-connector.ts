/**
 * scripts/fix-castillitos-connector.ts
 *
 * Corrects the Castillitos sag_pya_soap connector config (ID: cmnhu4hky0000n4y50jlhkfib).
 *
 * Three bugs fixed:
 *
 *   1. database (a_s_bd) was MISSING from config.
 *      The SAG .NET server throws NullReferenceException when a_s_bd is absent.
 *      Fix: inject database = "INDDIANAA_CASTILLO-ALZATE" from PYA_SAG_BD env.
 *
 *   2. customerQuery = "SELECT * FROM TERCEROS" (wrong table).
 *      PYA manual v32 documents v_cl as the official view for customer queries.
 *      Fix: replace with "SELECT * FROM v_cl" (confirmed working 2026-04-08).
 *
 *   3. receivableQuery = "SELECT * FROM CARTERA" (table does not exist).
 *      Confirmed 2026-04-08: CARTERA is absent in this SAG installation.
 *      Fix: replace with the JOIN query MOVIMIENTOS + MOVIMIENTOS_ITEMS + FUENTES.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/fix-castillitos-connector.ts [--dry-run]
 */

import { prisma } from "@/lib/prisma";

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

const DRY_RUN = process.argv.includes("--dry-run");

// Confirmed working query from castillitos-overrides.ts homologation (2026-04-08).
// v_cl is the SAG-managed view over TERCEROS (same columns, no permission issues).
const CORRECT_CUSTOMER_QUERY = "SELECT * FROM v_cl";

// Confirmed 2026-04-08: CARTERA does not exist. MOVIMIENTOS + MOVIMIENTOS_ITEMS
// is the correct source. This is the DEFAULT_RECEIVABLE_QUERY from the adapter.
const CORRECT_RECEIVABLE_QUERY = [
  "SELECT",
  "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
  "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
  "  m.ss_moneda, m.ddt_fecha_new,",
  "  SUM(ISNULL(mi.n_valor, 0))      AS total_valor,",
  "  SUM(ISNULL(mi.n_iva, 0))        AS total_iva,",
  "  SUM(ISNULL(mi.n_descuento, 0))  AS total_descuento,",
  "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
  "FROM MOVIMIENTOS m",
  "LEFT JOIN MOVIMIENTOS_ITEMS mi",
  "  ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
  "LEFT JOIN FUENTES f",
  "  ON f.ka_ni_fuente = m.ka_ni_fuente",
  "WHERE m.sc_anulado = 'N'",
  "GROUP BY",
  "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
  "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
  "  m.ss_moneda, m.ddt_fecha_new,",
  "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
  "ORDER BY m.ka_nl_movimiento",
].join(" ");

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  FIX CASTILLITOS SAG CONNECTOR");
  if (DRY_RUN) console.log("  MODE: DRY RUN — no changes written");
  console.log("══════════════════════════════════════════════════\n");

  const connector = await prisma.connector.findUnique({
    where: { id: CONNECTOR_ID },
    select: { id: true, source: true, status: true, config: true, modules: true },
  });

  if (!connector) {
    console.error(`✗ Conector ${CONNECTOR_ID} no encontrado.`);
    process.exit(1);
  }

  // Read PYA_SAG_BD — required, must be set
  const database = process.env.PYA_SAG_BD?.trim();
  if (!database) {
    console.error("✗ PYA_SAG_BD no está seteado en el env. No se puede continuar.");
    process.exit(1);
  }

  const currentCfg = connector.config as Record<string, unknown>;

  console.log("Conector actual:");
  console.log("  status:         ", connector.status);
  console.log("  database campo: ", currentCfg["database"] ?? "(AUSENTE ← BUG)");
  console.log("  customerQuery:  ", currentCfg["customerQuery"]);
  console.log("  receivableQuery:", String(currentCfg["receivableQuery"]).slice(0, 60) + "...");
  console.log("");
  console.log("Fixes a aplicar:");
  console.log("  [1] database     (MISSING) → ", database);
  console.log("  [2] customerQuery           → SELECT * FROM v_cl");
  console.log("  [3] receivableQuery         → JOIN MOVIMIENTOS + MOVIMIENTOS_ITEMS + FUENTES");
  console.log("");

  if (DRY_RUN) {
    console.log("DRY RUN — sin cambios. Correr sin --dry-run para aplicar.");
    return;
  }

  const newConfig = {
    ...currentCfg,
    database,
    customerQuery:   CORRECT_CUSTOMER_QUERY,
    receivableQuery: CORRECT_RECEIVABLE_QUERY,
  };

  await prisma.connector.update({
    where: { id: CONNECTOR_ID },
    data: {
      config:    newConfig,
      status:    "ACTIVE",   // reset from ERROR
      updatedAt: new Date(),
    },
  });

  console.log("✓ Connector config actualizado.");
  console.log("  database:        ", database);
  console.log("  customerQuery:   ", CORRECT_CUSTOMER_QUERY);
  console.log("  receivableQuery: ", CORRECT_RECEIVABLE_QUERY.slice(0, 80) + "...");
  console.log("  status:          ACTIVE (reset desde ERROR)");
  console.log("");
  console.log("Próximo paso: correr el dry-run desde la UI para validar.");
  console.log("  POST /api/orgs/castillitos/connectors/" + CONNECTOR_ID + "/dry-run");
  console.log("  body: { \"module\": \"customers\" }");
  console.log("");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
