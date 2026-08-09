/**
 * AGENTIK-RECEIVABLES-AR-TRUTH-01 — Collection Source Authority Tests
 *
 * Verifies that:
 *   - v_pagosnew (SAG_V_PAGOSNEW) is classified as LEGACY
 *   - vw_agentik_recaudos (SAG_VW_AGENTIK_RECAUDOS) is classified as CANONICAL
 *   - isCanonicalCollectionSource returns true ONLY for canonical sources
 *   - isLegacyCollectionSource returns true ONLY for legacy sources
 *   - assertCanonicalSource rejects legacy sources with explanation
 *   - Shadow reconciliation carries sourceAuthority: "LEGACY"
 *   - No raw data mutation
 *   - Prisma schema includes SAG_VW_AGENTIK_RECAUDOS enum value
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCollectionSourceAuthority,
  isCanonicalCollectionSource,
  isLegacyCollectionSource,
  assertCanonicalSource,
  CANONICAL_COLLECTION_SOURCE,
  LEGACY_COLLECTION_SOURCE,
  LEGACY_COLLECTION_LABEL,
  CANONICAL_COLLECTION_LABEL,
} from "../collection-source-authority";

// ── T01: Source authority resolver ──────────────────────────────────────────

describe("CollectionSourceAuthority resolver", () => {
  it("T01a: SAG_V_PAGOSNEW is LEGACY", () => {
    assert.equal(resolveCollectionSourceAuthority("SAG_V_PAGOSNEW"), "LEGACY");
  });

  it("T01b: SAG_VW_AGENTIK_RECAUDOS is CANONICAL", () => {
    assert.equal(resolveCollectionSourceAuthority("SAG_VW_AGENTIK_RECAUDOS"), "CANONICAL");
  });

  it("T01c: SAG_V_MOVPAGOS is PENDING_VALIDATION", () => {
    assert.equal(resolveCollectionSourceAuthority("SAG_V_MOVPAGOS"), "PENDING_VALIDATION");
  });

  it("T01d: SAG_V_DOCPAGOS is PENDING_VALIDATION", () => {
    assert.equal(resolveCollectionSourceAuthority("SAG_V_DOCPAGOS"), "PENDING_VALIDATION");
  });

  it("T01e: MANUAL is MANUAL", () => {
    assert.equal(resolveCollectionSourceAuthority("MANUAL"), "MANUAL");
  });

  it("T01f: unknown source defaults to PENDING_VALIDATION", () => {
    assert.equal(resolveCollectionSourceAuthority("UNKNOWN_SOURCE"), "PENDING_VALIDATION");
  });
});

// ── T02: Canonical check ────────────────────────────────────────────────────

describe("isCanonicalCollectionSource", () => {
  it("T02a: SAG_VW_AGENTIK_RECAUDOS is canonical", () => {
    assert.equal(isCanonicalCollectionSource("SAG_VW_AGENTIK_RECAUDOS"), true);
  });

  it("T02b: SAG_V_PAGOSNEW is NOT canonical", () => {
    assert.equal(isCanonicalCollectionSource("SAG_V_PAGOSNEW"), false);
  });

  it("T02c: MANUAL is NOT canonical", () => {
    assert.equal(isCanonicalCollectionSource("MANUAL"), false);
  });

  it("T02d: SAG_V_MOVPAGOS is NOT canonical", () => {
    assert.equal(isCanonicalCollectionSource("SAG_V_MOVPAGOS"), false);
  });
});

// ── T03: Legacy check ───────────────────────────────────────────────────────

describe("isLegacyCollectionSource", () => {
  it("T03a: SAG_V_PAGOSNEW is legacy", () => {
    assert.equal(isLegacyCollectionSource("SAG_V_PAGOSNEW"), true);
  });

  it("T03b: SAG_VW_AGENTIK_RECAUDOS is NOT legacy", () => {
    assert.equal(isLegacyCollectionSource("SAG_VW_AGENTIK_RECAUDOS"), false);
  });

  it("T03c: MANUAL is NOT legacy", () => {
    assert.equal(isLegacyCollectionSource("MANUAL"), false);
  });
});

// ── T04: assertCanonicalSource guard ────────────────────────────────────────

describe("assertCanonicalSource guard", () => {
  it("T04a: CANONICAL source passes", () => {
    const result = assertCanonicalSource("SAG_VW_AGENTIK_RECAUDOS");
    assert.equal(result.canonical, true);
  });

  it("T04b: LEGACY source fails with explanation", () => {
    const result = assertCanonicalSource("SAG_V_PAGOSNEW");
    assert.equal(result.canonical, false);
    if (!result.canonical) {
      assert.ok(result.reason.includes("LEGACY"));
      assert.ok(result.reason.includes("v_pagosnew"));
      assert.ok(result.reason.includes("MUST NOT"));
    }
  });

  it("T04c: PENDING source fails", () => {
    const result = assertCanonicalSource("SAG_V_MOVPAGOS");
    assert.equal(result.canonical, false);
    if (!result.canonical) {
      assert.ok(result.reason.includes("PENDING_VALIDATION"));
    }
  });

  it("T04d: unknown source fails", () => {
    const result = assertCanonicalSource("INVENTED_SOURCE");
    assert.equal(result.canonical, false);
  });
});

// ── T05: Constants ──────────────────────────────────────────────────────────

describe("Source authority constants", () => {
  it("T05a: CANONICAL_COLLECTION_SOURCE is SAG_VW_AGENTIK_RECAUDOS", () => {
    assert.equal(CANONICAL_COLLECTION_SOURCE, "SAG_VW_AGENTIK_RECAUDOS");
  });

  it("T05b: LEGACY_COLLECTION_SOURCE is SAG_V_PAGOSNEW", () => {
    assert.equal(LEGACY_COLLECTION_SOURCE, "SAG_V_PAGOSNEW");
  });

  it("T05c: LEGACY_COLLECTION_LABEL does not say canonical or verified", () => {
    assert.ok(!LEGACY_COLLECTION_LABEL.toLowerCase().includes("canónic"));
    assert.ok(!LEGACY_COLLECTION_LABEL.toLowerCase().includes("verificad"));
  });

  it("T05d: CANONICAL_COLLECTION_LABEL says verified", () => {
    assert.ok(CANONICAL_COLLECTION_LABEL.toLowerCase().includes("verificad"));
  });
});

// ── T06: Shadow reconciliation carries sourceAuthority ──────────────────────

describe("Shadow reconciliation sourceAuthority", () => {
  it("T06a: ShadowReconciliationResult type includes sourceAuthority", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../reconciliation/shadow-reconciliation.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("sourceAuthority: CollectionSourceAuthority"),
      "ShadowReconciliationResult must include sourceAuthority field",
    );
  });

  it("T06b: shadowReconcileCustomer stamps LEGACY on results", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../reconciliation/shadow-reconciliation.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes('sourceAuthority: "LEGACY"'),
      "shadowReconcileCustomer must stamp sourceAuthority: LEGACY on results",
    );
  });

  it("T06c: ShadowReconciliationSummary includes sourceAuthority", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../reconciliation/shadow-reconciliation.ts"),
      "utf-8",
    );
    // Count occurrences of sourceAuthority: "LEGACY" — should be 3
    // (two in results, one in summary)
    const matches = src.match(/sourceAuthority: "LEGACY"/g);
    assert.ok(
      matches && matches.length >= 3,
      `Expected at least 3 sourceAuthority: "LEGACY" stamps, found ${matches?.length ?? 0}`,
    );
  });
});

// ── T07: Prisma schema includes canonical enum value ────────────────────────

describe("Prisma schema enum", () => {
  it("T07a: CollectionAmountSource includes SAG_VW_AGENTIK_RECAUDOS", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../../prisma/schema.prisma"),
      "utf-8",
    );
    assert.ok(
      src.includes("SAG_VW_AGENTIK_RECAUDOS"),
      "Prisma schema must include SAG_VW_AGENTIK_RECAUDOS enum value",
    );
  });

  it("T07b: CollectionAmountSource marks SAG_V_PAGOSNEW as LEGACY", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../../prisma/schema.prisma"),
      "utf-8",
    );
    assert.ok(
      src.includes("LEGACY") && src.includes("SAG_V_PAGOSNEW"),
      "Prisma schema must mark SAG_V_PAGOSNEW as LEGACY",
    );
  });

  it("T07c: CollectionAmountSource marks SAG_VW_AGENTIK_RECAUDOS as CANONICAL", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../../prisma/schema.prisma"),
      "utf-8",
    );
    assert.ok(
      src.includes("CANONICAL") && src.includes("SAG_VW_AGENTIK_RECAUDOS"),
      "Prisma schema must mark SAG_VW_AGENTIK_RECAUDOS as CANONICAL",
    );
  });
});

// ── T08: No raw data mutation ───────────────────────────────────────────────

describe("No raw data mutation", () => {
  it("T08a: collection-source-authority.ts has no prisma import", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../collection-source-authority.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("prisma"), "collection-source-authority must not import prisma");
  });

  it("T08b: collection-source-authority.ts has no DB writes", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../collection-source-authority.ts"),
      "utf-8",
    );
    assert.ok(!src.includes(".create("), "No create operations");
    assert.ok(!src.includes(".update("), "No update operations");
    assert.ok(!src.includes(".delete("), "No delete operations");
    assert.ok(!src.includes(".upsert("), "No upsert operations");
  });
});

// ── T09: v_pagosnew prohibition in documentation ───────────────────────────

describe("v_pagosnew LEGACY markers", () => {
  it("T09a: query-catalog.ts marks v_pagosnew as LEGACY", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("LEGACY") && src.includes("v_pagosnew"),
      "query-catalog.ts must mark v_pagosnew as LEGACY",
    );
  });

  it("T09b: mappers.ts marks v_pagosnew as LEGACY", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/mappers.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("LEGACY") && src.includes("v_pagosnew"),
      "mappers.ts must mark v_pagosnew as LEGACY",
    );
  });

  it("T09c: storage.ts marks v_pagosnew as LEGACY", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/storage.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("LEGACY") && src.includes("v_pagosnew"),
      "storage.ts must mark v_pagosnew as LEGACY",
    );
  });

  it("T09d: cobros-kpis.ts marks v_pagosnew as LEGACY", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../../lib/finance/cobros-kpis.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("LEGACY") && src.includes("v_pagosnew"),
      "cobros-kpis.ts must mark v_pagosnew as LEGACY",
    );
  });

  it("T09e: source-contract.ts marks v_pagosnew as LEGACY", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../../reconciliation/source-contract.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("LEGACY") && src.includes("v_pagosnew"),
      "source-contract.ts must mark v_pagosnew as LEGACY",
    );
  });
});

// ── T10: receivable-truth-status.ts references AR-TRUTH-01 ──────────────────

describe("receivable-truth-status references AR-TRUTH-01", () => {
  it("T10: receivable-truth-status.ts mentions collection-source-authority", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../receivable-truth-status.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("collection-source-authority"),
      "receivable-truth-status.ts must reference collection-source-authority.ts",
    );
    assert.ok(
      src.includes("AGENTIK-RECEIVABLES-AR-TRUTH-01"),
      "receivable-truth-status.ts must reference AR-TRUTH-01 sprint",
    );
  });
});
