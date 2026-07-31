/**
 * lib/comercial/tiendas/__tests__/commercial-reference-thumbnail.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F3A.3: certificacion del contrato
 * CommercialReferenceThumbnail. Prop canonica: referenceCode.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/commercial-reference-thumbnail.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const COMPONENT = read("components/comercial/commercial-reference-thumbnail.tsx");
const CLIENT = read("app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
const IMPORT_CLIENT = read("app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx");
const MALETAS_CLIENT = read("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const WIZARD = read("app/(app)/[orgSlug]/comercial/pedidos/wholesale-order-wizard.tsx");

// ═══════════════════════════════════════════════════════════════════════
// Contrato del componente
// ═══════════════════════════════════════════════════════════════════════

describe("CommercialReferenceThumbnail — contrato de props", () => {
  it("prop canonica es referenceCode (no reference)", () => {
    assert.ok(COMPONENT.includes("referenceCode: string"));
    assert.ok(!COMPONENT.match(/^\s+reference:/m), "prop 'reference' no debe existir");
  });

  it("description es opcional con fallback", () => {
    assert.ok(COMPONENT.includes("description?: string"));
  });

  it("referenceCode undefined/vacio no causa crash — guard con ternario", () => {
    assert.ok(COMPONENT.includes('referenceCode\n    ? referenceCode.replace'));
    assert.ok(COMPONENT.includes(': "?"'));
  });

  it("imageUrl null → fallback visual (no crash)", () => {
    assert.ok(COMPONENT.includes("imageUrl === null"));
    assert.ok(COMPONENT.includes("{initials}"));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Consumidores — todos usan referenceCode=
// ═══════════════════════════════════════════════════════════════════════

describe("consumidores — prop unificada referenceCode=", () => {
  it("tiendas-client: cero usos de reference= (solo referenceCode=)", () => {
    // All CommercialReferenceThumbnail usages must use referenceCode=
    const usages = [...CLIENT.matchAll(/CommercialReferenceThumbnail[^/]*\/?>/g)];
    assert.ok(usages.length >= 5, `esperadas >=5 instancias, encontradas ${usages.length}`);
    for (const m of usages) {
      assert.ok(!m[0].includes(" reference="), `uso legacy de reference= encontrado: ${m[0].slice(0, 80)}`);
    }
  });

  it("importaciones-client: usa referenceCode=", () => {
    const usages = [...IMPORT_CLIENT.matchAll(/CommercialReferenceThumbnail[^/]*\/?>/g)];
    assert.ok(usages.length >= 3);
    for (const m of usages) {
      assert.ok(m[0].includes("referenceCode="), `falta referenceCode= en importaciones`);
    }
  });

  it("maletas-client: usa referenceCode=", () => {
    const usages = [...MALETAS_CLIENT.matchAll(/CommercialReferenceThumbnail[^/]*\/?>/g)];
    assert.ok(usages.length >= 2);
    for (const m of usages) {
      assert.ok(m[0].includes("referenceCode="), `falta referenceCode= en maletas`);
    }
  });

  it("wholesale-order-wizard: usa referenceCode=", () => {
    const usages = [...WIZARD.matchAll(/CommercialReferenceThumbnail[^>]*>/gs)];
    assert.ok(usages.length >= 5);
    for (const m of usages) {
      assert.ok(!m[0].includes(" reference="), `uso legacy en wizard: ${m[0].slice(0, 80)}`);
    }
  });

  it("el drawer de necesidades (linea ~2590) incluye description", () => {
    // The needs suggestions thumbnail must have description=
    const idx = CLIENT.indexOf("referenceCode={s.referenceCode}");
    assert.ok(idx > 0, "no encontrado referenceCode={s.referenceCode}");
    const nearby = CLIENT.slice(idx, idx + 200);
    assert.ok(nearby.includes("description="), "falta description= en needs suggestions thumbnail");
  });
});
