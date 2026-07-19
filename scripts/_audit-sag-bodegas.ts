/**
 * scripts/_audit-sag-bodegas.ts
 *
 * Query SAG BODEGAS table directly via SOAP to get warehouse names.
 * This is the ONLY source of truth for mapping ka_nl_bodega → ss_nombre.
 *
 * Read-only. No writes.
 *
 * Usage: npx tsx scripts/_audit-sag-bodegas.ts
 */

import "dotenv/config";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const config: PyaApiConfig = {
  endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
  token: process.env.PYA_SOAP_TOKEN?.trim() || process.env.SAG_TEST_TOKEN?.trim() || "",
  database: process.env.PYA_SAG_BD,
};

async function main() {
  console.log(`\n=== SAG BODEGAS QUERY ===`);
  console.log(`endpoint: ${config.endpointUrl}`);
  console.log(`token: ${config.token ? "[SET]" : "MISSING"}`);
  console.log(`database: ${config.database ?? "(none)"}\n`);

  if (!config.token) {
    console.log("ERROR: No SAG token. Set PYA_SOAP_TOKEN or SAG_TEST_TOKEN in .env");
    return;
  }

  try {
    const rows = await consultaSagJson(config, "SELECT * FROM BODEGAS");
    console.log(`BODEGAS: ${rows.length} rows\n`);

    // Show all warehouses with their PK, code, name, and active status
    const sorted = rows
      .map((r: Record<string, unknown>) => ({
        ka_nl_bodega: Number(r.ka_nl_bodega ?? 0),
        ss_codigo: String(r.ss_codigo ?? ""),
        ss_nombre: String(r.ss_nombre ?? ""),
        sc_activo: r.sc_activo,
      }))
      .sort((a, b) => a.ka_nl_bodega - b.ka_nl_bodega);

    console.table(sorted);

    // Now show the mapping that matters for tiendas
    console.log("\n--- Potential store matches ---");
    const storeNames = [
      "Almacén A", "Almacén C", "Almacén D", "Almacén G",
      "Tienda Web", "Empresa", "Empresa F2", "POS", "SAG",
    ];
    for (const storeName of storeNames) {
      const upper = storeName.toUpperCase().replace("É", "E");
      const matches = sorted.filter(w =>
        w.ss_nombre.toUpperCase().includes(upper) ||
        upper.includes(w.ss_nombre.toUpperCase().trim())
      );
      if (matches.length > 0) {
        for (const m of matches) {
          console.log(`  "${storeName}" → ka_nl_bodega=${m.ka_nl_bodega}, ss_codigo="${m.ss_codigo}", ss_nombre="${m.ss_nombre}"`);
        }
      } else {
        // Try partial match on last word
        const lastWord = storeName.split(/\s+/).pop()?.toUpperCase() ?? "";
        const partial = sorted.filter(w => w.ss_nombre.toUpperCase().includes(lastWord));
        if (partial.length > 0) {
          for (const m of partial) {
            console.log(`  "${storeName}" ~partial~ ka_nl_bodega=${m.ka_nl_bodega}, ss_codigo="${m.ss_codigo}", ss_nombre="${m.ss_nombre}"`);
          }
        } else {
          console.log(`  "${storeName}" → NO MATCH`);
        }
      }
    }
  } catch (e: any) {
    console.log(`ERROR: ${e.message}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
