/**
 * Probe SUBGRUPOS table for grupo FK field
 */
import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { loadSagTestEnv } from "@/lib/sag/env";

async function main() {
  const config = loadSagTestEnv();

  // 1. SUBGRUPOS fields
  const subRows = await consultaSagJson(config, "SELECT TOP 3 * FROM SUBGRUPOS") as Record<string, unknown>[];
  console.log("\n=== SUBGRUPOS fields ===");
  console.log(Object.keys(subRows[0]).join(", "));
  console.log("\nSample:", JSON.stringify(subRows[0], null, 2));

  // 2. GRUPOS fields
  const grupoRows = await consultaSagJson(config, "SELECT TOP 3 * FROM GRUPOS") as Record<string, unknown>[];
  console.log("\n=== GRUPOS fields ===");
  console.log(Object.keys(grupoRows[0]).join(", "));
  console.log("\nSample:", JSON.stringify(grupoRows[0], null, 2));

  // 3. Verify subgrupo→grupo link: pick subgrupo 107 (PIJAMA NIÑA BB CL)
  const linked = await consultaSagJson(
    config,
    "SELECT ka_ni_subgrupo, sc_detalle_subgrupo, ka_ni_grupo FROM SUBGRUPOS WHERE ka_ni_subgrupo = 107",
  ) as Record<string, unknown>[];
  console.log("\n=== Subgrupo 107 grupo FK ===");
  console.log(JSON.stringify(linked, null, 2));

  // 4. Resolve the grupo name
  if (linked.length > 0 && linked[0].ka_ni_grupo) {
    const grupoId = linked[0].ka_ni_grupo;
    const grupo = await consultaSagJson(
      config,
      `SELECT ka_ni_grupo, sc_detalle_grupo FROM GRUPOS WHERE ka_ni_grupo = ${grupoId}`,
    ) as Record<string, unknown>[];
    console.log("\n=== Grupo resolution ===");
    console.log(JSON.stringify(grupo, null, 2));
  }

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
