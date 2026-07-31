/**
 * lib/comercial/tiendas/__tests__/store-snapshot-invalidation.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F3A: certificación de la matriz de
 * invalidación (T7) y de la cache compartida (T8, parte estática).
 *
 * T7 (fs): cada sitio de escritura catalogado I1–I5 contiene la llamada a
 * invalidateStoreSnapshot. T8/T9 (fs): la UI JAMÁS invalida — la llamada no
 * existe en tiendas-client ni en componentes; el comportamiento dinámico de
 * cache (cacheHit) lo verifica Opus con el script A/B sobre base real.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-snapshot-invalidation.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const MAIN_ROUTE = "app/api/orgs/[orgSlug]/comercial/tiendas/route.ts";
const POLICIES_ROUTE = "app/api/orgs/[orgSlug]/comercial/tiendas/policies/route.ts";

function caseBlock(src: string, caseName: string): string {
  const start = src.indexOf(`case "${caseName}"`);
  assert.ok(start >= 0, `case ${caseName} no existe`);
  const next = src.indexOf("\n    case ", start + 1);
  return src.slice(start, next > 0 ? next : src.length);
}

describe("T7 — matriz de invalidación I1–I5", () => {
  const main = read(MAIN_ROUTE);
  const policies = read(POLICIES_ROUTE);

  it("I1: store_activate y store_deactivate invalidan el snapshot", () => {
    assert.ok(caseBlock(main, "store_activate").includes("invalidateStoreSnapshot(orgId)"));
    assert.ok(caseBlock(main, "store_deactivate").includes("invalidateStoreSnapshot(orgId)"));
  });

  it("I2: distribution_save_config invalida el snapshot", () => {
    assert.ok(caseBlock(main, "distribution_save_config").includes("invalidateStoreSnapshot(orgId)"));
  });

  it("I3: las 4 escrituras de políticas invalidan el snapshot", () => {
    for (const c of ["save", "add_rule", "remove_rule", "toggle_active"]) {
      assert.ok(caseBlock(policies, c).includes("invalidateStoreSnapshot(orgId)"), `policies.${c} sin invalidación`);
    }
    // Las lecturas NO invalidan:
    assert.ok(!caseBlock(policies, "list").includes("invalidateStoreSnapshot"));
    assert.ok(!caseBlock(policies, "get_for_store").includes("invalidateStoreSnapshot"));
  });

  it("I4/I5: creación y transición de documentos invalidan el snapshot", () => {
    assert.ok(caseBlock(main, "replenishment_document_create").includes("invalidateStoreSnapshot(orgId)"));
    assert.ok(caseBlock(main, "replenishment_document_transition").includes("invalidateStoreSnapshot(orgId)"));
    // Las lecturas de documentos NO invalidan:
    assert.ok(!caseBlock(main, "replenishment_document_list").includes("invalidateStoreSnapshot"));
    assert.ok(!caseBlock(main, "replenishment_document_get").includes("invalidateStoreSnapshot"));
    assert.ok(!caseBlock(main, "replenishment_document_export").includes("invalidateStoreSnapshot"));
  });

  it("la lectura get_store_snapshot jamás invalida", () => {
    assert.ok(!caseBlock(main, "get_store_snapshot").includes("invalidateStoreSnapshot"));
  });
});

describe("T8/T9 — la UI jamás invalida (cache compartida, sin invalidación por navegación)", () => {
  it("invalidateStoreSnapshot no existe en tiendas-client ni en componentes comerciales", () => {
    const client = read("app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    assert.ok(!client.includes("invalidateStoreSnapshot"));
    const componentsDir = path.join(ROOT, "components/comercial");
    for (const f of fs.readdirSync(componentsDir)) {
      if (!f.endsWith(".tsx") && !f.endsWith(".ts")) continue;
      const src = fs.readFileSync(path.join(componentsDir, f), "utf8");
      assert.ok(!src.includes("invalidateStoreSnapshot"), `componente ${f} invalida el snapshot`);
    }
  });
});
