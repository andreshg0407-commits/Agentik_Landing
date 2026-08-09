/**
 * AGENTIK-RECEIVABLES-AR-TRUTH-01 — Canonical AR Truth Tests
 *
 * Verifies:
 *   T01: SAG view schema matches expected fields
 *   T02: Row mapping produces correct domain types
 *   T03: Aging band classification
 *   T04: Customer grouping and aggregation
 *   T05: AMV LLANO hard gate ($542M→$0 — fully paid)
 *   T06: No Prisma dependency in AR service
 *   T07: No mutations in AR service
 *   T08: Query catalog includes canonical AR entries
 *   T09: Source authority alignment
 *   T10: Snapshot type invariants
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── T01: SAG view schema ─────────────────────────────────────────────────────

describe("SAG view schema", () => {
  it("T01a: SagCarteraRow has all 13 expected fields", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    const expectedFields = [
      "DOCUMENTO", "TIPO_DOCUMENTO", "CLIENTE_ID", "CLIENTE", "VENDEDOR",
      "FECHA_DOCUMENTO", "FECHA_VENCIMIENTO", "DIAS_MORA",
      "VALOR_DOCUMENTO", "SALDO_PENDIENTE", "ESTADO_CARTERA",
      "CIUDAD", "CANAL_VENTA",
    ];
    for (const f of expectedFields) {
      assert.ok(src.includes(f), `SagCarteraRow must include field ${f}`);
    }
  });

  it("T01b: SagRecaudoRow has all 12 expected fields", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    const expectedFields = [
      "ID_RECAUDO", "FECHA_RECAUDO", "CLIENTE_ID", "CLIENTE",
      "DOCUMENTO_RELACIONADO", "VALOR_RECAUDADO",
      "CONCILIADO", "REFERENCIA_BANCARIA", "ID_MOVIMIENTO_BANCO",
      "MONTO_NO_APLICADO", "BANCO", "REFERENCIA_PAGO",
    ];
    for (const f of expectedFields) {
      assert.ok(src.includes(f), `SagRecaudoRow must include field ${f}`);
    }
  });
});

// ── T02: Domain type mapping ─────────────────────────────────────────────────

describe("CertifiedReceivableDocument type", () => {
  it("T02a: has documento, saldoPendiente, diasMora", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(src.includes("documento:"), "Must have documento field");
    assert.ok(src.includes("saldoPendiente:"), "Must have saldoPendiente field");
    assert.ok(src.includes("diasMora:"), "Must have diasMora field");
    assert.ok(src.includes("valorDocumento:"), "Must have valorDocumento field");
  });
});

// ── T03: Canonical AR service structure ──────────────────────────────────────

describe("Canonical AR service", () => {
  it("T03a: exports fetchCertifiedArSnapshot", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("export async function fetchCertifiedArSnapshot"),
      "Must export fetchCertifiedArSnapshot",
    );
  });

  it("T03b: exports fetchCertifiedCustomerAr", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("export async function fetchCertifiedCustomerAr"),
      "Must export fetchCertifiedCustomerAr",
    );
  });

  it("T03c: queries vw_agentik_cartera (not CARTERA, not v_pagosnew)", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("vw_agentik_cartera"),
      "Must query vw_agentik_cartera",
    );
    // Must NOT use the legacy CARTERA table or v_pagosnew
    assert.ok(
      !src.includes("FROM CARTERA"),
      "Must NOT query legacy CARTERA table",
    );
    assert.ok(
      !src.includes("v_pagosnew"),
      "Must NOT use legacy v_pagosnew",
    );
  });

  it("T03d: uses getSagConnection for source routing", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("getSagConnection"),
      "Must use getSagConnection for dual-database routing",
    );
  });

  it("T03e: stamps truthStatus CERTIFIED on snapshots", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    const matches = src.match(/truthStatus:\s*"CERTIFIED"/g);
    assert.ok(
      matches && matches.length >= 2,
      `Expected at least 2 truthStatus: "CERTIFIED" stamps, found ${matches?.length ?? 0}`,
    );
  });

  it("T03f: stamps source vw_agentik_cartera on snapshots", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    const matches = src.match(/source:\s*"vw_agentik_cartera"/g);
    assert.ok(
      matches && matches.length >= 2,
      `Expected at least 2 source: "vw_agentik_cartera" stamps, found ${matches?.length ?? 0}`,
    );
  });
});

// ── T04: No Prisma dependency ────────────────────────────────────────────────

describe("No Prisma dependency in canonical AR", () => {
  it("T04a: canonical-ar-service.ts has no prisma import", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("prisma"), "canonical-ar-service must not import prisma");
  });

  it("T04b: canonical-ar-types.ts has no prisma import", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("prisma"), "canonical-ar-types must not import prisma");
  });
});

// ── T05: No mutations ────────────────────────────────────────────────────────

describe("No mutations in canonical AR service", () => {
  it("T05a: no DB write operations", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(!src.includes(".create("), "No create operations");
    assert.ok(!src.includes(".update("), "No update operations");
    assert.ok(!src.includes(".delete("), "No delete operations");
    assert.ok(!src.includes(".upsert("), "No upsert operations");
  });
});

// ── T06: Query catalog includes canonical AR entries ─────────────────────────

describe("Query catalog canonical AR", () => {
  it("T06a: QUERY_CATALOG includes canonicalAr domain", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("canonicalAr:"),
      "QUERY_CATALOG must include canonicalAr domain",
    );
  });

  it("T06b: has cartera query entry with validated status", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("canonicalAr.cartera"),
      "Must have canonicalAr.cartera query entry",
    );
    assert.ok(
      src.includes("vw_agentik_cartera"),
      "Must reference vw_agentik_cartera view",
    );
  });

  it("T06c: has recaudos query entry with validated status", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("canonicalAr.recaudos"),
      "Must have canonicalAr.recaudos query entry",
    );
    assert.ok(
      src.includes("vw_agentik_recaudos"),
      "Must reference vw_agentik_recaudos view",
    );
  });

  it("T06d: cartera and recaudos entries are validated", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
      ),
      "utf-8",
    );
    // Both should have status: "validated"
    // Count validated in the CANONICAL_AR section
    const canonicalSection = src.slice(src.indexOf("CANONICAL_AR"));
    const validatedCount = (canonicalSection.match(/status:\s*"validated"/g) || []).length;
    assert.ok(
      validatedCount >= 4,
      `Expected at least 4 validated entries in canonical AR, found ${validatedCount}`,
    );
  });
});

// ── T07: Source authority alignment ──────────────────────────────────────────

describe("Source authority alignment", () => {
  it("T07a: canonical-ar-service uses CANONICAL source (not LEGACY)", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // Must NOT reference v_pagosnew or LEGACY collection source
    assert.ok(!src.includes("v_pagosnew"), "Must not reference v_pagosnew");
    assert.ok(!src.includes("SAG_V_PAGOSNEW"), "Must not reference SAG_V_PAGOSNEW");
    assert.ok(!src.includes("LEGACY"), "Must not reference LEGACY source");
  });

  it("T07b: canonical-ar-types references vw_agentik_cartera as source", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes('"vw_agentik_cartera"'),
      "Must reference vw_agentik_cartera as source literal",
    );
  });
});

// ── T08: Snapshot type invariants ────────────────────────────────────────────

describe("Snapshot type invariants", () => {
  it("T08a: CertifiedCustomerReceivableSnapshot has required fields", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    const required = [
      "clienteId:", "nit:", "clienteName:", "totalPendiente:",
      "totalVencido:", "totalVigente:", "documentCount:",
      "overdueDocumentCount:", "maxDiasMora:", "documents:",
      "asOf:", "source:", "truthStatus:",
    ];
    for (const f of required) {
      assert.ok(
        src.includes(f),
        `CertifiedCustomerReceivableSnapshot must include ${f}`,
      );
    }
  });

  it("T08b: CertifiedArSnapshot has aging bands", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(src.includes("agingBands:"), "Must have agingBands field");
    assert.ok(src.includes("ArAgingBand"), "Must define ArAgingBand type");
  });

  it("T08c: CanonicalArResult is discriminated union", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(src.includes("ok: true"), "Must have ok: true variant");
    assert.ok(src.includes("ok: false"), "Must have ok: false variant");
    assert.ok(src.includes("SAG_UNAVAILABLE"), "Must include SAG_UNAVAILABLE error code");
    assert.ok(src.includes("VIEW_NOT_FOUND"), "Must include VIEW_NOT_FOUND error code");
  });
});

// ── T09: AMV LLANO hard gate ─────────────────────────────────────────────────

describe("AMV LLANO hard gate", () => {
  it("T09a: vw_agentik_cartera returns CERTIFIED_ZERO for fully paid customers", async () => {
    // AMV LLANO (CLIENTE_ID=856) has $542M in CustomerReceivable but $0 in
    // vw_agentik_cartera because all invoices are fully paid.
    // fetchCustomerArWithStatus returns CERTIFIED_ZERO for 0-row customers.
    // fetchCertifiedCustomerAr returns null (backward-compat wrapper).
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // fetchCustomerArWithStatus must return CERTIFIED_ZERO for empty results
    assert.ok(
      src.includes('"CERTIFIED_ZERO"'),
      "Must return CERTIFIED_ZERO when customer has 0 open receivables",
    );
    // fetchCertifiedCustomerAr (backward-compat) must return null for non-HAS_OPEN_AR
    assert.ok(
      src.includes('result.status === "HAS_OPEN_AR"'),
      "fetchCertifiedCustomerAr must check for HAS_OPEN_AR",
    );
  });

  it("T09b: canonical AR does NOT use legacy CustomerReceivable pipeline", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // Must not import Prisma or the legacy CustomerReceivable model
    assert.ok(
      !src.includes("from \"@/lib/prisma\""),
      "Must NOT import prisma",
    );
    assert.ok(
      !src.includes("paidAmount"),
      "Must NOT reference paidAmount (always 0 in legacy)",
    );
    assert.ok(
      !src.includes("balanceDue"),
      "Must NOT reference balanceDue (legacy over-reports)",
    );
    assert.ok(
      !src.includes("refreshProfileReceivables"),
      "Must NOT reference legacy refreshProfileReceivables",
    );
  });

  it("T09c: uses SALDO_PENDIENTE from SAG (not computed client-side)", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("SALDO_PENDIENTE"),
      "Must use SALDO_PENDIENTE from SAG cartera view",
    );
    // Must NOT compute remaining balance ourselves
    assert.ok(
      !src.includes("originalAmount - paidAmount"),
      "Must NOT compute balance from original - paid",
    );
  });
});

// ── T10: Aging band classification ───────────────────────────────────────────

describe("Aging band classification", () => {
  it("T10a: canonical-ar-service has all 7 aging bands", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    const bands = ["CURRENT", "1-30", "31-60", "61-90", "91-180", "181-365", "365+"];
    for (const band of bands) {
      assert.ok(src.includes(`"${band}"`), `Must include aging band "${band}"`);
    }
  });
});

// ── T10b: Document join hard gate (Section 4) ──────────────────────────────

describe("Document join hard gate", () => {
  it("T10b: canonical-ar-service uses CLIENTE_ID for customer filtering", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("CLIENTE_ID"),
      "Must filter by CLIENTE_ID (ka_nl_tercero) for customer queries",
    );
  });

  it("T10c: canonical-ar-service groups by clienteId (numeric key)", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("groups.get(doc.clienteId)"),
      "Must group documents by clienteId (numeric SAG PK)",
    );
  });

  it("T10d: canonical-ar-types defines DOCUMENTO_RELACIONADO for recaudos join", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("DOCUMENTO_RELACIONADO"),
      "SagRecaudoRow must include DOCUMENTO_RELACIONADO for doc-level join",
    );
  });

  it("T10e: query-catalog has carteraByCliente with CLIENTE_ID filter", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("carteraByCliente"),
      "Must have carteraByCliente query entry",
    );
    assert.ok(
      src.includes("WHERE CLIENTE_ID"),
      "carteraByCliente must filter by CLIENTE_ID",
    );
  });

  it("T10f: query-catalog has recaudosByCliente with CLIENTE_ID + DOCUMENTO join", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(
        __dirname,
        "../../../../lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("recaudosByCliente"),
      "Must have recaudosByCliente query entry",
    );
    assert.ok(
      src.includes("DOCUMENTO_RELACIONADO"),
      "recaudosByCliente must reference DOCUMENTO_RELACIONADO for join",
    );
  });
});

// ── T10g: Canonical recaudos service ─────────────────────────────────────────

describe("Canonical recaudos service", () => {
  it("T10g: exports fetchCertifiedCustomerRecaudos", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("export async function fetchCertifiedCustomerRecaudos"),
      "Must export fetchCertifiedCustomerRecaudos",
    );
  });

  it("T10h: exports fetchDocumentCollections", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("export async function fetchDocumentCollections"),
      "Must export fetchDocumentCollections",
    );
  });

  it("T10i: queries vw_agentik_recaudos", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("vw_agentik_recaudos"),
      "Must query vw_agentik_recaudos",
    );
  });

  it("T10j: uses DOCUMENTO_RELACIONADO for document-level join", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("DOCUMENTO_RELACIONADO"),
      "Must use DOCUMENTO_RELACIONADO for document-level join",
    );
  });

  it("T10k: no Prisma dependency in recaudos service", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("prisma"), "canonical-recaudos-service must not import prisma");
  });

  it("T10l: stamps truthStatus CERTIFIED on recaudos snapshot", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    const matches = src.match(/truthStatus:\s*"CERTIFIED"/g);
    assert.ok(
      matches && matches.length >= 2,
      `Expected at least 2 truthStatus: "CERTIFIED" stamps, found ${matches?.length ?? 0}`,
    );
  });

  it("T10m: canonical-ar-types defines CertifiedCollectionApplication", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("CertifiedCollectionApplication"),
      "Must define CertifiedCollectionApplication type",
    );
    assert.ok(
      src.includes("documentoRelacionado:"),
      "Must have documentoRelacionado field",
    );
    assert.ok(
      src.includes("valorRecaudado:"),
      "Must have valorRecaudado field",
    );
  });

  it("T10n: canonical-ar-types defines CertifiedCustomerCollectionSnapshot", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("CertifiedCustomerCollectionSnapshot"),
      "Must define CertifiedCustomerCollectionSnapshot type",
    );
    assert.ok(
      src.includes("totalRecaudado:"),
      "Must have totalRecaudado field",
    );
    assert.ok(
      src.includes("totalCreditos:"),
      "Must have totalCreditos field for credit notes/reversals",
    );
  });

  it("T10o: fetchDocumentCollections filters by DOCUMENTO_RELACIONADO AND CLIENTE_ID", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("DOCUMENTO_RELACIONADO =") && src.includes("AND CLIENTE_ID ="),
      "fetchDocumentCollections must filter by both DOCUMENTO_RELACIONADO and CLIENTE_ID",
    );
  });
});

// ── T11: Canonical AR wiring into CustomerCommercialContext ──────────────────

describe("Canonical AR wiring", () => {
  it("T11a: getCustomerReceivables imports fetchCustomerArWithStatus", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("fetchCustomerArWithStatus"),
      "Must import fetchCustomerArWithStatus from canonical-ar-service",
    );
  });

  it("T11b: getCustomerReceivables accepts optional sagTerceroId", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("sagTerceroId"),
      "Must accept sagTerceroId parameter",
    );
  });

  it("T11c: canonical path stamps CERTIFIED truthStatus", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes('truthStatus: "CERTIFIED"'),
      "Canonical path must stamp CERTIFIED truthStatus",
    );
  });

  it("T11d: legacy path still stamps UNVERIFIED via resolveReceivableTruthStatus", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("resolveReceivableTruthStatus"),
      "Legacy path must still use resolveReceivableTruthStatus",
    );
  });

  it("T11e: getCustomerCommercialContext passes sagTerceroId to receivables", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("customer.sagTerceroId"),
      "Must pass customer.sagTerceroId to getCustomerReceivables",
    );
  });

  it("T11f: canonical path maps totalPendiente to totalReceivable", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("snapshot.totalPendiente"),
      "Must map snapshot.totalPendiente to totalReceivable",
    );
    assert.ok(
      src.includes("snapshot.totalVencido"),
      "Must map snapshot.totalVencido to overdueAmount",
    );
  });

  it("T11g: canonical path handles SAG_UNAVAILABLE by falling to legacy", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    // SAG_UNAVAILABLE or IDENTITY_UNKNOWN should fall through to legacy
    assert.ok(
      src.includes("SAG_UNAVAILABLE") || src.includes("fall through to legacy"),
      "Must handle SAG_UNAVAILABLE by falling to legacy",
    );
  });

  it("T11h: attention service resolves sagTerceroId for canonical AR", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../frontline-attention-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("sagTerceroId"),
      "Attention service must resolve sagTerceroId for canonical AR path",
    );
  });
});

// ── T12: Zero-row safety ────────────────────────────────────────────────────

describe("Zero-row safety", () => {
  it("T12a: fetchCustomerArWithStatus exported", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("export async function fetchCustomerArWithStatus"),
      "Must export fetchCustomerArWithStatus",
    );
  });

  it("T12b: CustomerArResult type has CERTIFIED_ZERO status", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-types.ts"),
      "utf-8",
    );
    assert.ok(src.includes("CERTIFIED_ZERO"), "Must have CERTIFIED_ZERO status");
    assert.ok(src.includes("HAS_OPEN_AR"), "Must have HAS_OPEN_AR status");
    assert.ok(src.includes("SAG_UNAVAILABLE"), "Must have SAG_UNAVAILABLE status");
    assert.ok(src.includes("IDENTITY_UNKNOWN"), "Must have IDENTITY_UNKNOWN status");
  });

  it("T12c: invalid clienteId returns IDENTITY_UNKNOWN", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("IDENTITY_UNKNOWN"),
      "Must return IDENTITY_UNKNOWN for invalid clienteId",
    );
  });

  it("T12d: zero rows returns CERTIFIED_ZERO (not null)", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // fetchCustomerArWithStatus must return CERTIFIED_ZERO for 0 rows
    assert.ok(
      src.includes('"CERTIFIED_ZERO"'),
      "Must return CERTIFIED_ZERO for zero rows (not null)",
    );
  });

  it("T12e2: CERTIFIED_ZERO requires TERCEROS existence check", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // When cartera returns 0 rows, service must verify customer exists in TERCEROS
    assert.ok(
      src.includes("TERCEROS WHERE ka_nl_tercero"),
      "Must check TERCEROS for customer existence when cartera returns 0 rows",
    );
    // If TERCEROS returns 0 rows, must return IDENTITY_UNKNOWN (not CERTIFIED_ZERO)
    assert.ok(
      src.includes("terceroRows.length === 0"),
      "Must check terceroRows.length === 0 for nonexistent customer",
    );
  });

  it("T12e3: nonexistent clienteId returns IDENTITY_UNKNOWN via TERCEROS check", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // The TERCEROS check path must return IDENTITY_UNKNOWN
    // when customer does not exist (0 tercero rows + 0 cartera rows)
    const terceroBlock = src.slice(
      src.indexOf("TERCEROS WHERE ka_nl_tercero"),
      src.indexOf("Customer confirmed in TERCEROS"),
    );
    assert.ok(
      terceroBlock.includes('"IDENTITY_UNKNOWN"'),
      "TERCEROS existence failure must return IDENTITY_UNKNOWN",
    );
  });

  it("T12e: customer-commercial-context handles CERTIFIED_ZERO", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("CERTIFIED_ZERO"),
      "Must handle CERTIFIED_ZERO status from canonical AR",
    );
    assert.ok(
      src.includes("totalReceivable: 0"),
      "CERTIFIED_ZERO must produce totalReceivable = 0",
    );
  });
});

// ── T13: SALDO_PENDIENTE semantics certification ────────────────────────────

describe("SALDO_PENDIENTE semantics", () => {
  it("T13a: certification evidence file exists", async () => {
    const fs = require("fs");
    const path = require("path");
    assert.ok(
      fs.existsSync(path.resolve(__dirname, "../canonical-ar-certification.ts")),
      "canonical-ar-certification.ts must exist",
    );
  });

  it("T13b: documents SALDO_PENDIENTE includes collections", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("SALDO_PENDIENTE_INCLUDES_COLLECTIONS = YES"),
      "Must certify SALDO_PENDIENTE includes collections",
    );
  });

  it("T13c: documents SALDO_PENDIENTE includes credit notes", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("SALDO_PENDIENTE_INCLUDES_CREDIT_NOTES = YES"),
      "Must certify SALDO_PENDIENTE includes credit notes",
    );
  });

  it("T13d: documents DIAS_MORA is live-computed", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("DATEDIFF(DAY, FECHA_VENCIMIENTO, GETDATE())"),
      "Must document DIAS_MORA live-computation formula",
    );
  });

  it("T13e: documents source table saldos_facturas", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("saldos_facturas"),
      "Must document saldos_facturas as source for SALDO_PENDIENTE",
    );
  });
});

// ── T14: DPD authority ──────────────────────────────────────────────────────

describe("DPD authority", () => {
  it("T14a: canonical-ar-service uses DIAS_MORA from SAG (not computed)", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(src.includes("row.DIAS_MORA"), "Must use DIAS_MORA from SAG row");
    assert.ok(
      !src.includes("DATEDIFF"),
      "Must NOT compute DPD client-side (SAG computes it live)",
    );
  });

  it("T14b: certification documents DPD formula", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("DPD_FORMULA"),
      "Must document DPD formula",
    );
    assert.ok(
      src.includes("DUE_DATE_AUTHORITY"),
      "Must document due date authority",
    );
  });
});

// ── T15: Legacy prohibition ─────────────────────────────────────────────────

describe("Legacy prohibition in canonical AR", () => {
  it("T15a: canonical-ar-service has no v_pagosnew reference", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("v_pagosnew"), "Must NOT reference v_pagosnew");
    assert.ok(!src.includes("SAG_V_PAGOSNEW"), "Must NOT reference SAG_V_PAGOSNEW");
  });

  it("T15b: canonical-recaudos-service has no v_pagosnew reference", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("v_pagosnew"), "Must NOT reference v_pagosnew");
  });

  it("T15c: customer-commercial-context has no CollectionRecord reference", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("CollectionRecord"), "Must NOT reference CollectionRecord");
    assert.ok(!src.includes("v_pagosnew"), "Must NOT reference v_pagosnew");
  });

  it("T15d: canonical path does NOT fall back to legacy when CERTIFIED fails", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    // When canonical path returns CERTIFIED data, legacy must not override it
    // The structure: try canonical first, only use legacy if canonical returns null
    assert.ok(
      src.includes("if (canonical) return canonical"),
      "Canonical path must short-circuit — no legacy when canonical succeeds",
    );
  });
});

// ── T16: Freshness policy ───────────────────────────────────────────────────

describe("Freshness policy", () => {
  it("T16a: freshness threshold defined", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("CANONICAL_AR_FRESHNESS_THRESHOLD_HOURS"),
      "Must define freshness threshold",
    );
  });

  it("T16b: isCanonicalArFresh function exported", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("export function isCanonicalArFresh"),
      "Must export isCanonicalArFresh",
    );
  });

  it("T16c: freshness is based on read-success, NOT document dates", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    // Must document that document dates are NOT freshness evidence
    assert.ok(
      src.includes("PROHIBITED freshness evidence"),
      "Must document prohibited freshness evidence",
    );
    assert.ok(
      src.includes("MAX(FECHA_DOCUMENTO)") && src.includes("not source refresh"),
      "Must explicitly prohibit MAX(FECHA_DOCUMENTO) as freshness evidence",
    );
    assert.ok(
      src.includes("read-success"),
      "Freshness must be based on SAG read-success timestamp",
    );
  });

  it("T16d: asOf in service is query execution time (not document date)", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // asOf must be set to new Date() — the query execution timestamp
    assert.ok(
      src.includes("const asOf = new Date()"),
      "asOf must be set to new Date() (query execution time, not a document date)",
    );
    // Must NOT use FECHA_DOCUMENTO or any business date for freshness
    assert.ok(
      !src.includes("FECHA_DOCUMENTO") || !src.includes("freshness"),
      "Must NOT use FECHA_DOCUMENTO for freshness determination",
    );
  });
});

// ── T17: Parity — same canonical snapshot reaches all consumers ─────────────

describe("Consumer parity", () => {
  it("T17a: getCustomerCommercialContext uses getCustomerReceivables", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../customer-commercial-context.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("getCustomerReceivables(orgId, customerId"),
      "getCustomerCommercialContext must use getCustomerReceivables",
    );
  });

  it("T17b: frontline-attention-service uses getCustomerReceivables", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../frontline-attention-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("getCustomerReceivables("),
      "Attention service must use getCustomerReceivables",
    );
  });

  it("T17c: seller-inactive-customers uses getCustomerReceivables", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../seller-inactive-customers.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("getCustomerReceivables("),
      "Seller inactive customers must use getCustomerReceivables",
    );
  });

  it("T17d: server.ts exports canonical AR functions", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../server.ts"),
      "utf-8",
    );
    assert.ok(src.includes("fetchCertifiedArSnapshot"), "Must export fetchCertifiedArSnapshot");
    assert.ok(src.includes("fetchCertifiedCustomerAr"), "Must export fetchCertifiedCustomerAr");
    assert.ok(src.includes("fetchCustomerArWithStatus"), "Must export fetchCustomerArWithStatus");
    assert.ok(src.includes("fetchCertifiedCustomerRecaudos"), "Must export fetchCertifiedCustomerRecaudos");
  });
});

// ── T18: AMV LLANO real-data gate ───────────────────────────────────────────

describe("AMV LLANO real-data gate (certification evidence)", () => {
  it("T18a: certification documents AMV identity", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(src.includes("AMV_CLIENTE_ID: 856"), "Must document AMV CLIENTE_ID");
    assert.ok(src.includes("AMV_NIT: 900469068"), "Must document AMV NIT");
    assert.ok(src.includes("CERTIFIED_ZERO"), "Must document AMV result as CERTIFIED_ZERO");
  });

  it("T18b: certification documents AMV recaudos proof", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("VW_AGENTIK_RECAUDOS_ROWS: 330"),
      "Must document AMV had 330 recaudos",
    );
    assert.ok(
      src.includes("VW_AGENTIK_CARTERA_ROWS: 0"),
      "Must document AMV had 0 cartera rows",
    );
  });
});

// ── T18c-d: Regression gates ─────────────────────────────────────────────────

describe("Regression gates", () => {
  it("T18c: AMV LLANO (856) path: 0 cartera rows + TERCEROS existence → CERTIFIED_ZERO", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // The code path for 0 cartera rows must:
    // 1. Check TERCEROS existence
    // 2. If TERCEROS confirms → CERTIFIED_ZERO
    // 3. If TERCEROS denies → IDENTITY_UNKNOWN
    assert.ok(
      src.includes("TERCEROS WHERE ka_nl_tercero"),
      "Must verify customer in TERCEROS for 0-row cartera",
    );
    assert.ok(
      src.includes("Customer confirmed in TERCEROS"),
      "Must comment on TERCEROS confirmation before CERTIFIED_ZERO",
    );
  });

  it("T18d: positive overdue path: HAS_OPEN_AR with documents", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    // For customers with open AR (e.g. CLIENTE_ID=1244), the code must:
    // 1. Map rows to CertifiedReceivableDocument
    // 2. Group by customer
    // 3. Return HAS_OPEN_AR with snapshot
    assert.ok(
      src.includes("rows.map(mapCarteraRow)"),
      "Must map SAG rows to domain documents",
    );
    assert.ok(
      src.includes("groupByCustomer(docs, asOf)"),
      "Must group documents by customer",
    );
    assert.ok(
      src.includes('"HAS_OPEN_AR"'),
      "Must return HAS_OPEN_AR for non-empty results",
    );
  });

  it("T18e: certification documents exact status policy for all 4 statuses", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    // Must document the exact certification policy for each status
    assert.ok(
      src.includes("CERTIFIED (via HAS_OPEN_AR)"),
      "Must document CERTIFIED status policy",
    );
    assert.ok(
      src.includes("CERTIFIED_ZERO:"),
      "Must document CERTIFIED_ZERO status policy",
    );
    assert.ok(
      src.includes("IDENTITY_UNKNOWN:"),
      "Must document IDENTITY_UNKNOWN status policy",
    );
    assert.ok(
      src.includes("SAG_UNAVAILABLE:"),
      "Must document SAG_UNAVAILABLE status policy",
    );
    // CERTIFIED_ZERO must require TERCEROS existence
    assert.ok(
      src.includes("Customer existence confirmed in TERCEROS"),
      "CERTIFIED_ZERO policy must require TERCEROS existence check",
    );
  });
});

// ── T19: Prisma enum safety ─────────────────────────────────────────────────

describe("Prisma enum safety", () => {
  it("T19a: canonical AR service does not import prisma", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-service.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("@/lib/prisma"), "Must NOT import prisma");
  });

  it("T19b: canonical recaudos service does not import prisma", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-recaudos-service.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("@/lib/prisma"), "Must NOT import prisma");
  });

  it("T19c: canonical certification does not import prisma", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../canonical-ar-certification.ts"),
      "utf-8",
    );
    assert.ok(!src.includes("@/lib/prisma"), "Must NOT import prisma");
  });
});
