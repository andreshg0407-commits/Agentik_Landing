/**
 * lib/comercial/tiendas/__tests__/store-snapshot-refetch.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F3A.1: certificación del refetch posterior
 * a escrituras. Obligatorias 1–4 de la orden (la 5 — cacheHit tras
 * invalidación — corre sobre base real en el script A/B, sección h).
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-snapshot-refetch.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { createSnapshotRefresher } from "../store-snapshot-refresher";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const CLIENT = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";
const SUPPLY_TAB = "components/comercial/store-supply-rules-tab.tsx";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ═════════════════════════════════════════════════════════════════════════════
// Unidad — ley del refresher (obligatorias 1, 2 y 3)
// ═════════════════════════════════════════════════════════════════════════════

describe("refresher — ley de concurrencia", () => {
  it("OBLIGATORIA 1: escritura exitosa → lectura nueva → estado visible actualizado (y refreshing bien secuenciado)", async () => {
    const applied: string[] = [];
    const refreshing: boolean[] = [];
    const r = createSnapshotRefresher<string>({
      fetchSnapshot: async () => "S1",
      onSnapshot: s => applied.push(s),
      onRefreshingChange: v => refreshing.push(v),
    });
    await r.refresh();
    assert.deepEqual(applied, ["S1"]);
    assert.deepEqual(refreshing, [true, false]);
    assert.equal(r.isInFlight(), false);
  });

  it("OBLIGATORIA 2: fallo (throw o null) → NO aplica nada — el snapshot anterior se conserva", async () => {
    const applied: string[] = [];
    const rThrow = createSnapshotRefresher<string>({
      fetchSnapshot: async () => { throw new Error("red"); },
      onSnapshot: s => applied.push(s),
    });
    await rThrow.refresh();
    const rNull = createSnapshotRefresher<string>({
      fetchSnapshot: async () => null,
      onSnapshot: s => applied.push(s),
    });
    await rNull.refresh();
    assert.deepEqual(applied, []);                       // cero aplicaciones
    assert.equal(rThrow.isInFlight(), false);            // y el vuelo cerró limpio
  });

  it("OBLIGATORIA 3: escrituras solapadas → single-flight coalescido, sin carreras ni respuestas viejas sobre nuevas", async () => {
    const applied: string[] = [];
    const gates = [deferred<string | null>(), deferred<string | null>(), deferred<string | null>()];
    let call = 0;
    const r = createSnapshotRefresher<string>({
      fetchSnapshot: () => gates[call++].promise,
      onSnapshot: s => applied.push(s),
    });

    const p1 = r.refresh();          // vuelo 1 (S1, resolverá al final)
    const p2 = r.refresh();          // solapada → pendiente coalescido
    const p3 = r.refresh();          // triple clic → MISMO pendiente (no tercera lectura)
    assert.equal(r.isInFlight(), true);

    gates[0].resolve("S1");          // respuesta vieja llega primero
    await p2; await p3;              // los solapados retornan sin abrir vuelo propio
    gates[1].resolve("S2");          // el trailing lee la corrida nueva
    await p1;

    assert.deepEqual(applied, ["S1", "S2"]);   // en orden; S2 es el estado final
    assert.equal(call, 2);                     // 3 clics → exactamente 2 lecturas
    assert.equal(r.isInFlight(), false);
    // Y una respuesta vieja jamás pisa a una nueva: el último aplicado es S2.
    assert.equal(applied[applied.length - 1], "S2");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// fs — cableado del cliente (obligatorias 1, 2 y 4)
// ═════════════════════════════════════════════════════════════════════════════

describe("cableado en tiendas-client (fs)", () => {
  const client = read(CLIENT);

  it("OBLIGATORIA 1: las escrituras de la pantalla invocan refreshSnapshot en el ÉXITO", () => {
    // Gobernanza: dentro del bloque data.ok de executeGovernanceAction
    const gov = client.slice(client.indexOf("async function executeGovernanceAction"));
    const okBlock = gov.slice(gov.indexOf("if (data.ok) {"), gov.indexOf("} else {"));
    assert.ok(okBlock.includes("refreshSnapshot()"), "gobernanza exitosa debe refrescar");
    // Editor del Derrotero: el drawer propaga el refresco al tab de reglas
    assert.ok(client.includes("onSaved={onSnapshotRefresh}"));
    assert.ok(client.includes("onSnapshotRefresh={refreshSnapshot}"));
    // Y el tab lo dispara SOLO tras guardar con éxito:
    const tabSrc = read(SUPPLY_TAB);
    const saveFn = tabSrc.slice(tabSrc.indexOf("async function saveChanges"));
    const successPart = saveFn.slice(0, saveFn.indexOf("catch"));
    assert.ok(successPart.includes("onSaved?.()"));
  });

  it("OBLIGATORIA 2: las rutas de fallo NO refrescan", () => {
    const gov = client.slice(client.indexOf("async function executeGovernanceAction"));
    const elseBlock = gov.slice(gov.indexOf("} else {"), gov.indexOf("} catch {"));
    const catchBlock = gov.slice(gov.indexOf("} catch {"), gov.indexOf("setGovBusy(false)"));
    assert.ok(!elseBlock.includes("refreshSnapshot"));
    assert.ok(!catchBlock.includes("refreshSnapshot"));
    const tabSrc = read(SUPPLY_TAB);
    const saveFn = tabSrc.slice(tabSrc.indexOf("async function saveChanges"));
    assert.ok(!saveFn.slice(saveFn.indexOf("catch")).includes("onSaved"));
    // data.error (fallo de negocio) retorna ANTES del onSaved:
    const beforeOnSaved = saveFn.slice(0, saveFn.indexOf("onSaved?.()"));
    assert.ok(beforeOnSaved.includes("if (data.error) { setError(data.error); return; }"));
  });

  it("OBLIGATORIA 4: navegación, tabs, búsqueda, filtros y drawer JAMÁS refrescan — sitios de llamada exactos", () => {
    // Exactamente 3 apariciones: definición (const refreshSnapshot = ...),
    // gobernanza exitosa, y el prop del drawer. Ni una más.
    const count = (client.match(/refreshSnapshot/g) ?? []).length;
    assert.equal(count, 3, `refreshSnapshot aparece ${count} veces; esperadas 3`);
    // Cero refresco en manejadores de navegación/filtros/drawer:
    for (const handler of ["setTab(", "setCovLine(", "setInvSearch(", "setDiscSearch(", "openStoreDrawer", "closeDrawer"]) {
      const idx = client.indexOf(handler);
      assert.ok(idx >= 0, `handler ${handler} no encontrado`);
    }
    const openDrawerFn = client.slice(client.indexOf("function openStoreDrawer"), client.indexOf("function closeDrawer"));
    assert.ok(!openDrawerFn.includes("refreshSnapshot"));
    // El único fetch de estado sigue siendo get_store_snapshot (T1 intacta):
    for (const banned of ["\"store_distribution\"", "\"store_coverage\"", "\"store_unit_needs\"", "\"store_replenishment_plan\"", "\"store_warehouse_first_needs\"", "\"store_coverage_candidates\""]) {
      assert.ok(!client.includes(`action: ${banned}`), `acción legacy presente: ${banned}`);
    }
  });
});
