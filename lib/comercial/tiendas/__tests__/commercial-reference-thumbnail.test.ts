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
    const usages = [...WIZARD.matchAll(/CommercialReferenceThumbnail[\s\S]*?>/g)];
    assert.ok(usages.length >= 5);
    for (const m of usages) {
      assert.ok(!m[0].includes(" reference="), `uso legacy en wizard: ${m[0].slice(0, 80)}`);
    }
  });

  it("el drawer de necesidades incluye description en thumbnails", () => {
    // The operative needs suggestions thumbnail must have description=
    const idx = CLIENT.indexOf("referenceCode={item.referenceCode} imageUrl={null} description={item.productName}");
    assert.ok(idx > 0, "no encontrado thumbnail con referenceCode/description en needs tab");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TH1–TH8: Thumbnail consistency for composition drill-down + especiales
// ═══════════════════════════════════════════════════════════════════════

const PRESENTATION = read("lib/comercial/tiendas/store-presentation-assembler.ts");

describe("TH1–TH8: thumbnail consistency in composition + especiales", () => {
  it("TH1: AccessoryFamilyReferencePresentation includes thumbnailUrl", () => {
    assert.ok(
      PRESENTATION.includes("readonly thumbnailUrl: string | null;"),
      "AccessoryFamilyReferencePresentation must have thumbnailUrl",
    );
  });

  it("TH2: SpecialProductRulePresentation matchedReferences includes thumbnailUrl", () => {
    // The special rule presentation builder must include thumbnailUrl in matched references
    assert.ok(
      PRESENTATION.includes("thumbnailUrl: imageByCode.get(m.referenceCode) ?? null"),
      "special matched refs must resolve thumbnailUrl from imageByCode",
    );
    // The type declaration must include thumbnailUrl
    const typeSection = PRESENTATION.slice(
      PRESENTATION.indexOf("interface SpecialProductRulePresentation"),
      PRESENTATION.indexOf("interface SpecialProductRulePresentation") + 600,
    );
    assert.ok(typeSection.includes("thumbnailUrl"), "thumbnailUrl missing from SpecialProductRulePresentation type");
  });

  it("TH3: heroImageUrl null does not filter out references (contract valid for placeholder)", () => {
    // Composition builder maps thumbnailUrl with ?? null fallback — no filtering
    assert.ok(PRESENTATION.includes("thumbnailUrl: imageById.get(r.referenceId) ?? null"),
      "composition must resolve thumbnailUrl from imageById with null fallback");
    // Special builder maps thumbnailUrl with ?? null fallback — no filtering
    assert.ok(PRESENTATION.includes("thumbnailUrl: imageByCode.get(m.referenceCode) ?? null"),
      "especiales must resolve thumbnailUrl from imageByCode with null fallback");
  });

  it("TH4: units field unchanged in both presentation types", () => {
    // AccessoryFamilyReferencePresentation
    const accRef = PRESENTATION.match(/interface AccessoryFamilyReferencePresentation[\s\S]*?\}/);
    assert.ok(accRef);
    assert.ok(accRef![0].includes("readonly units: number"), "units must remain in composition refs");
    // SpecialProductRulePresentation matchedReferences
    const specBlock = PRESENTATION.match(/matchedReferences:\s*readonly\s*\{[\s\S]*?\}\[\]/);
    assert.ok(specBlock);
    assert.ok(specBlock![0].includes("readonly units: number"), "units must remain in special matched refs");
  });

  it("TH5: composition drill-down does NOT duplicate imageUrl in SnapshotFamilyReference", () => {
    // SnapshotFamilyReference is in the pipeline — must NOT have heroImageUrl/imageUrl
    const pipeline = read("lib/comercial/tiendas/store-snapshot-pipeline.ts");
    const sfr = pipeline.match(/interface SnapshotFamilyReference[\s\S]*?\}/);
    assert.ok(sfr, "SnapshotFamilyReference not found in pipeline");
    assert.ok(!sfr![0].includes("heroImageUrl"), "heroImageUrl must NOT be in SnapshotFamilyReference");
    assert.ok(!sfr![0].includes("imageUrl"), "imageUrl must NOT be in SnapshotFamilyReference");
    assert.ok(!sfr![0].includes("thumbnailUrl"), "thumbnailUrl must NOT be in SnapshotFamilyReference");
  });

  it("TH6: especiales resolves thumbnail from referenceCatalog via imageByCode map", () => {
    // buildSpecialProductsPresentation must build imageByCode from snapshot.referenceCatalog
    const fn = PRESENTATION.match(/function buildSpecialProductsPresentation[\s\S]*?return \{/);
    assert.ok(fn, "buildSpecialProductsPresentation not found");
    assert.ok(fn![0].includes("imageByCode"), "must use imageByCode map");
    assert.ok(fn![0].includes("snapshot.referenceCatalog"), "must read from referenceCatalog");
  });

  it("TH7: tiendas-client does NOT join images against referenceCatalog", () => {
    // Client must not reference referenceCatalog for image resolution
    assert.ok(!CLIENT.includes("referenceCatalog"), "tiendas-client must not access referenceCatalog directly");
  });

  it("TH8: CommercialReferenceThumbnail handles imageUrl=null without broken images", () => {
    // Component renders initials fallback when imageUrl is null (verified by source)
    assert.ok(COMPONENT.includes("imageUrl === null"), "must check for null imageUrl");
    assert.ok(COMPONENT.includes("{initials}"), "must render initials when no image");
    assert.ok(COMPONENT.includes("onError"), "must handle image load errors");
  });
});
