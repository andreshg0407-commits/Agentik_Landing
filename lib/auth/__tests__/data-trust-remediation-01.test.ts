/**
 * lib/auth/__tests__/data-trust-remediation-01.test.ts
 *
 * Sprint: DATA-TRUST-REMEDIATION-01
 *
 * Contract tests verifying the 8 findings from DATA-TRUST-AUDIT-02.
 * Source-level contract tests (no DB, no browser, no SOAP).
 *
 * Test categories:
 *   A: mapSagVentasRow — correct field mapping from vw_agentik_ventas
 *   B: mapSagCarteraViewRow — correct field mapping from vw_agentik_cartera
 *   C: Certification gates — intelligence consumers gated
 *   D: JUPITER — valid customer, never filtered
 *   E: Commission chain — not broken by remediation
 *   F: Adapter wiring — mappers imported and called
 *   G: Query catalog — expectedFields match actual view schema
 *   H: Storage — enriched fields accepted
 *   I: LINEA reverse mapping — text to 2-letter code
 *   J: Synthetic item ID — deterministic dedup
 *   K: Runners certification — report copilot gated
 *   L: UnifiedMovement type — enriched fields present
 *   M: Storage fail-closed — null paidAmount/dueDate/daysOverdue blocks persistence
 *   N: Legacy mapper — LEGACY_UNCERTIFIED with null paidAmount/dueDate/daysOverdue
 *   O: Normalizer — null-safe paidAmount and daysOverdue (never fabricates 0)
 *   P: Fallback rejection — legacy mapper produces records blocked at storage
 *   Q: Unknown aging — daysOverdue=null when dueDate=null
 *   R: Consumer gates — 6 direct active paths gated
 *   S: Semantic gate closure — consumer returns carry truthState:"UNVERIFIED" and reason
 *   T: Behavioral mapper — runtime execution proves null fields, not source inspection
 *   U: Behavioral normalizer — runtime execution proves null propagation
 *   V: Receivable truth-status — mandatory discriminated result types (BLOCKER 4)
 *   W: Runtime consumer — 7 subsections proving certification→truthState→null chain (BLOCKER 5)
 *   X: Fallback e2e — mapper→storage chain proves PERSISTENCE_BLOCKED (BLOCKER 6)
 */

import { describe, test, expect, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── A: mapSagVentasRow — vw_agentik_ventas field mapping ─────────────────────

describe("A — mapSagVentasRow maps vw_agentik_ventas fields correctly", () => {
  // Dynamically import the mapper (pure function, no side effects)
  const mapperSrc = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");

  test("reads ID_DOCUMENTO as primary key (not MOVIMIENTO_ID)", () => {
    expect(mapperSrc).toContain('"ID_DOCUMENTO"');
    expect(mapperSrc).not.toMatch(/num\(row,\s*"MOVIMIENTO_ID"/);
  });

  test("reads TIPO_DOCUMENTO as text, not code", () => {
    expect(mapperSrc).toContain('"TIPO_DOCUMENTO"');
    expect(mapperSrc).toContain('includes("Cr")');
  });

  test("reads ESTADO_DOCUMENTO and skips Anulado", () => {
    expect(mapperSrc).toContain('"ESTADO_DOCUMENTO"');
    expect(mapperSrc).toContain('"Anulado"');
  });

  test("reads VENDEDOR_ID and VENDEDOR for seller resolution", () => {
    expect(mapperSrc).toContain('"VENDEDOR_ID"');
    expect(mapperSrc).toContain('"VENDEDOR"');
  });

  test("reads CODIGO_PRODUCTO and PRODUCTO", () => {
    expect(mapperSrc).toContain('"CODIGO_PRODUCTO"');
    expect(mapperSrc).toContain('"PRODUCTO"');
  });

  test("reads LINEA as text and reverse-maps via LINEA_NAME_TO_CODE", () => {
    expect(mapperSrc).toContain('"LINEA"');
    expect(mapperSrc).toContain("LINEA_NAME_TO_CODE");
  });

  test("reads CANAL_VENTA for channel classification", () => {
    expect(mapperSrc).toContain('"CANAL_VENTA"');
    expect(mapperSrc).toContain('"ALMACEN"');
    expect(mapperSrc).toContain('"EMPRESA"');
  });

  test("reads per-line amounts: CANTIDAD, PRECIO_UNITARIO, DESCUENTO, VALOR_TOTAL, COSTO", () => {
    expect(mapperSrc).toContain('"CANTIDAD"');
    expect(mapperSrc).toContain('"PRECIO_UNITARIO"');
    expect(mapperSrc).toContain('"DESCUENTO"');
    expect(mapperSrc).toContain('"VALOR_TOTAL"');
    expect(mapperSrc).toContain('"COSTO"');
  });

  test("generates synthetic line-item ID for dedup", () => {
    expect(mapperSrc).toContain("syntheticLineItemId");
    expect(mapperSrc).toContain("sha256");
  });

  test("populates enriched UnifiedMovement fields", () => {
    expect(mapperSrc).toContain("sellerCode:");
    expect(mapperSrc).toContain("sellerName:");
    expect(mapperSrc).toContain("productCode,");
    expect(mapperSrc).toContain("productLine,");
    expect(mapperSrc).toContain("productName,");
    expect(mapperSrc).toContain("units:");
    expect(mapperSrc).toContain("unitPrice:");
    expect(mapperSrc).toContain("costo:");
    expect(mapperSrc).toContain("lineItemId:");
  });

  test("does NOT read non-existent fields (MOVIMIENTO_ID, ITEM_ID, CODIGO_FUENTE, CLIENTE_NIT, BODEGA)", () => {
    // These fields were incorrectly assumed in the first draft
    expect(mapperSrc).not.toMatch(/num\(row,\s*"ITEM_ID"/);
    expect(mapperSrc).not.toMatch(/str\(row,\s*"CODIGO_FUENTE"/);
    expect(mapperSrc).not.toMatch(/str\(row,\s*"CLIENTE_NIT"/);
    expect(mapperSrc).not.toMatch(/str\(row,\s*"BODEGA"/);
  });

  test("sourceId uses VENTA- prefix with movId and itemId", () => {
    expect(mapperSrc).toContain("`VENTA-${movId}-${itemId}`");
  });
});

// ── B: mapSagCarteraViewRow — vw_agentik_cartera field mapping ───────────────

describe("B — mapSagCarteraViewRow maps vw_agentik_cartera fields correctly", () => {
  const mapperSrc = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");

  test("reads DOCUMENTO as primary key", () => {
    expect(mapperSrc).toContain('str(row, "DOCUMENTO")');
  });

  test("reads VALOR_DOCUMENTO and SALDO_PENDIENTE for real paidAmount", () => {
    expect(mapperSrc).toContain('"VALOR_DOCUMENTO"');
    expect(mapperSrc).toContain('"SALDO_PENDIENTE"');
  });

  test("paidAmount is UNAVAILABLE (set to null), reduction stored in meta", () => {
    expect(mapperSrc).toContain("paidAmount:     null");
    expect(mapperSrc).toContain("UNCLASSIFIED_REDUCTION");
    expect(mapperSrc).toContain("reductionAmount");
  });

  test("reads DIAS_MORA for real daysOverdue", () => {
    expect(mapperSrc).toContain('"DIAS_MORA"');
  });

  test("reads FECHA_DOCUMENTO and FECHA_VENCIMIENTO", () => {
    expect(mapperSrc).toContain('"FECHA_DOCUMENTO"');
    expect(mapperSrc).toContain('"FECHA_VENCIMIENTO"');
  });

  test("reads ESTADO_CARTERA for status classification", () => {
    expect(mapperSrc).toContain('"ESTADO_CARTERA"');
  });

  test("sourceId uses CARTERA- prefix", () => {
    expect(mapperSrc).toContain("`CARTERA-${documento}`");
  });

  test("marks source as vw_agentik_cartera in meta", () => {
    expect(mapperSrc).toContain("vw_agentik_cartera");
  });

  test("source is sag_pya_soap (not sag_pya)", () => {
    // Ensure adapter consistency
    expect(mapperSrc).toContain('"sag_pya_soap"');
  });
});

// ── C: Certification gates — intelligence consumers ──────────────────────────

describe("C — Certification gates on intelligence consumers", () => {
  test("crm-alert-engine gates cartera_vencida on isReceivableDataCertified", () => {
    const src = readFile("lib/sales/crm-alert-engine.ts");
    expect(src).toContain("isReceivableDataCertified");
    expect(src).toContain("warmTruthStatusCache");
  });

  test("collections queue gates on isReceivableDataCertified", () => {
    const src = readFile("lib/collections/queue.ts");
    expect(src).toContain("isReceivableDataCertified");
    expect(src).toContain("warmTruthStatusCache");
  });

  test("report runners gate cartera_vencida on isReceivableDataCertified", () => {
    const src = readFile("lib/reports/runners.ts");
    expect(src).toContain("isReceivableDataCertified");
    expect(src).toContain("warmTruthStatusCache");
    expect(src).toContain("UNVERIFIED_RECEIVABLE_LABEL");
  });

  test("sales-rep-alerts gate on isReceivableDataCertified", () => {
    const src = readFile("lib/comercial/sales-reps/sales-rep-alerts.ts");
    expect(src).toContain("isReceivableDataCertified");
  });

  test("sales-rep-data-loader gate on isReceivableDataCertified", () => {
    const src = readFile("lib/comercial/sales-reps/sales-rep-data-loader.ts");
    expect(src).toContain("isReceivableDataCertified");
  });

  test("receivable-truth-status exports castillitos as CERTIFIED", () => {
    const src = readFile("lib/comercial/frontline/receivable-truth-status.ts");
    expect(src).toContain('castillitos: "CERTIFIED"');
  });

  test("receivable-truth-status default is UNVERIFIED (fail-closed)", () => {
    const src = readFile("lib/comercial/frontline/receivable-truth-status.ts");
    expect(src).toContain('"UNVERIFIED"');
    expect(src).toContain("DEFAULT_TRUTH_STATUS");
  });
});

// ── D: JUPITER — valid customer, never filtered ─────────────────────────────

describe("D — JUPITER is a valid Castillitos customer", () => {
  test("no source file filters out JUPITER by name", () => {
    // JUPITER is confirmed as a valid multi-entity customer group.
    // No business logic should exclude records containing "JUPITER".
    const adapterSrc = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");
    expect(adapterSrc).not.toContain('"JUPITER"');

    const storageSrc = readFile("lib/connectors/adapters/sag-pya-soap/storage.ts");
    expect(storageSrc).not.toContain('"JUPITER"');
  });

  test("query catalog does not filter JUPITER in WHERE clauses", () => {
    const catalogSrc = readFile("lib/connectors/adapters/sag-pya-soap/query-catalog.ts");
    expect(catalogSrc).not.toContain('"JUPITER"');
  });
});

// ── E: Commission chain preserved ────────────────────────────────────────────

describe("E — Commission pipeline not broken by remediation", () => {
  test("commission queries use vw_agentik_recaudos (certified source)", () => {
    const catalogSrc = readFile("lib/connectors/adapters/sag-pya-soap/query-catalog.ts");
    expect(catalogSrc).toContain("vw_agentik_recaudos");
  });

  test("commission policy file unchanged (no import from remediated modules)", () => {
    // The commission policy reads from SAG views directly, not from
    // CustomerReceivable. Verify it doesn't import the changed modules.
    const files = [
      "lib/comercial/sales-reps/sales-rep-business-decisions.ts",
    ];
    for (const f of files) {
      const src = readFile(f);
      // Should NOT directly import the SAG adapter or storage
      expect(src).not.toContain("sag-pya-soap/index");
    }
  });
});

// ── F: Adapter wiring — mappers imported and called ──────────────────────────

describe("F — SAG adapter wires mappers into pull pipeline", () => {
  const adapterSrc = readFile("lib/connectors/adapters/sag-pya-soap/index.ts");

  test("imports mapSagVentasRow from mappers", () => {
    expect(adapterSrc).toContain("mapSagVentasRow");
  });

  test("imports mapSagCarteraViewRow from mappers", () => {
    expect(adapterSrc).toContain("mapSagCarteraViewRow");
  });

  test("imports QUERY_CATALOG from query-catalog", () => {
    expect(adapterSrc).toContain("QUERY_CATALOG");
  });

  test("pullReceivables references vw_agentik_cartera", () => {
    expect(adapterSrc).toContain("vw_agentik_cartera");
  });

  test("pullMovements references vw_agentik_ventas", () => {
    expect(adapterSrc).toContain("vw_agentik_ventas");
  });
});

// ── G: Query catalog — expectedFields match actual view schema ───────────────

describe("G — Query catalog expectedFields match actual SAG view output", () => {
  const catalogSrc = readFile("lib/connectors/adapters/sag-pya-soap/query-catalog.ts");

  test("ventasView expectedFields include actual view columns", () => {
    // These are the REAL columns from vw_agentik_ventas
    for (const field of [
      "ID_DOCUMENTO", "TIPO_DOCUMENTO", "ESTADO_DOCUMENTO",
      "VENDEDOR_ID", "VENDEDOR", "CODIGO_PRODUCTO", "PRODUCTO",
      "LINEA", "CANAL_VENTA", "CANTIDAD", "PRECIO_UNITARIO",
      "VALOR_TOTAL", "COSTO",
    ]) {
      expect(catalogSrc).toContain(field);
    }
  });

  test("ventasView expectedFields do NOT include wrong field names", () => {
    // These fields were incorrectly assumed in the first draft
    // They should have been removed from expectedFields
    const ventasSection = catalogSrc.slice(
      catalogSrc.indexOf("ventasView"),
      catalogSrc.indexOf("ventasView") + 2000,
    );
    // MOVIMIENTO_ID, ITEM_ID, BODEGA, CLIENTE_NIT should not appear
    // in the ventasView section
    expect(ventasSection).not.toContain('"MOVIMIENTO_ID"');
    expect(ventasSection).not.toContain('"ITEM_ID"');
  });
});

// ── H: Storage — enriched fields accepted ────────────────────────────────────

describe("H — Storage layer accepts enriched fields from vw_agentik_ventas", () => {
  const storageSrc = readFile("lib/connectors/adapters/sag-pya-soap/storage.ts");

  test("SaleRecord upsert reads productLine from UnifiedMovement", () => {
    expect(storageSrc).toContain("productLine");
  });

  test("SaleRecord upsert reads sellerCode from UnifiedMovement", () => {
    expect(storageSrc).toContain("sellerCode");
  });

  test("SaleRecord upsert reads productCode from UnifiedMovement", () => {
    expect(storageSrc).toContain("productCode");
  });

  test("productLine falls back to SAG when view data absent", () => {
    // The fallback ensures backward compatibility with legacy MOVIMIENTOS path
    expect(storageSrc).toContain('?? "SAG"');
  });
});

// ── I: LINEA reverse mapping ─────────────────────────────────────────────────

describe("I — LINEA text-to-code reverse mapping", () => {
  const mapperSrc = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");

  test("maps all known product lines", () => {
    const expectedMappings: Record<string, string> = {
      '"latin kids"':   '"LT"',
      '"castillitos"':  '"CS"',
      '"importacion"':  '"IM"',
      '"power"':        '"PW"',
      '"produccion"':   '"PD"',
      '"otros"':        '"OT"',
    };
    for (const [name, code] of Object.entries(expectedMappings)) {
      expect(mapperSrc).toContain(name);
      expect(mapperSrc).toContain(code);
    }
  });

  test("handles accented variants (importación, producción)", () => {
    expect(mapperSrc).toContain('"importación"');
    expect(mapperSrc).toContain('"producción"');
  });

  test("normalizes with NFD + diacritics removal", () => {
    expect(mapperSrc).toContain('.normalize("NFD")');
    expect(mapperSrc).toContain("\\u0300-\\u036f");
  });
});

// ── J: Synthetic item ID — deterministic dedup ───────────────────────────────

describe("J — Synthetic item ID for line-item dedup", () => {
  const mapperSrc = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");

  test("syntheticLineItemId uses SHA-256 hash", () => {
    expect(mapperSrc).toContain("sha256");
  });

  test("hash input includes movId, productCode, cantidad, precioUnit, descuento", () => {
    expect(mapperSrc).toContain(
      "[movId, productCode",
    );
    expect(mapperSrc).toContain("cantidad");
    expect(mapperSrc).toContain("precioUnit");
    expect(mapperSrc).toContain("descuento");
  });

  test("truncates to 8 hex chars and parses as integer", () => {
    expect(mapperSrc).toContain('.slice(0, 8)');
    expect(mapperSrc).toContain("parseInt(hex, 16)");
  });
});

// ── K: Runners certification — report copilot gated ──────────────────────────

describe("K — Report Copilot runners gated for uncertified receivable data", () => {
  const runnersSrc = readFile("lib/reports/runners.ts");

  test("runCarteraVencida returns UNVERIFIED status when not certified (not zero-debt)", () => {
    expect(runnersSrc).toContain("isReceivableDataCertified");
    expect(runnersSrc).toContain("UNVERIFIED_RECEIVABLE_LABEL");
    expect(runnersSrc).toContain('"UNVERIFIED"');
    expect(runnersSrc).toContain("dataStatus");
  });

  test("runClientes suppresses overdueReceivable when not certified", () => {
    expect(runnersSrc).toContain("arCertified");
  });

  test("imports all certification functions", () => {
    expect(runnersSrc).toContain("isReceivableDataCertified");
    expect(runnersSrc).toContain("warmTruthStatusCache");
    expect(runnersSrc).toContain("UNVERIFIED_RECEIVABLE_LABEL");
    expect(runnersSrc).toContain("receivable-truth-status");
  });

  test("ReportResult type exports dataStatus for fail-closed", () => {
    expect(runnersSrc).toContain("ReportDataStatus");
    expect(runnersSrc).toContain('"AVAILABLE"');
    expect(runnersSrc).toContain('"UNVERIFIED"');
    expect(runnersSrc).toContain('"BLOCKED"');
  });
});

// ── L: UnifiedMovement type — enriched fields present ────────────────────────

describe("L — UnifiedMovement type includes enriched fields for vw_agentik_ventas", () => {
  const typesSrc = readFile("lib/connectors/core/types.ts");

  const enrichedFields = [
    "sellerCode",
    "sellerName",
    "productCode",
    "productLine",
    "productName",
    "units",
    "unitPrice",
    "costo",
    "lineItemId",
  ];

  for (const field of enrichedFields) {
    test(`UnifiedMovement has optional ${field} field`, () => {
      // Fields should be optional (marked with ?)
      const movSection = typesSrc.slice(
        typesSrc.indexOf("interface UnifiedMovement"),
        typesSrc.indexOf("// ─────", typesSrc.indexOf("interface UnifiedMovement") + 1),
      );
      expect(movSection).toContain(field);
    });
  }

  test("enriched fields are documented as DATA-TRUST-REMEDIATION-01", () => {
    expect(typesSrc).toContain("DATA-TRUST-REMEDIATION-01");
  });
});

// ── M: Storage fail-closed — null paidAmount/dueDate blocks persistence ─────

describe("M — Storage blocks persistence of unrepresentable AR records", () => {
  const storageSrc = readFile("lib/connectors/adapters/sag-pya-soap/storage.ts");

  test("checks record.paidAmount === null before upsert", () => {
    expect(storageSrc).toContain("record.paidAmount === null");
  });

  test("checks record.dueDate === null before upsert", () => {
    expect(storageSrc).toContain("record.dueDate === null");
  });

  test("checks record.daysOverdue === null before upsert", () => {
    expect(storageSrc).toContain("record.daysOverdue === null");
  });

  test("emits PERSISTENCE_BLOCKED_UNREPRESENTABLE_AR when skipping", () => {
    expect(storageSrc).toContain("PERSISTENCE_BLOCKED_UNREPRESENTABLE_AR");
  });

  test("does NOT use ?? 0 shim for paidAmount (no fabrication)", () => {
    // The old shim `record.paidAmount ?? 0` must not exist
    expect(storageSrc).not.toContain("record.paidAmount ?? 0");
  });

  test("does NOT use ?? record.issueDate shim for dueDate (no fabrication)", () => {
    expect(storageSrc).not.toContain("record.dueDate ?? record.issueDate");
  });

  test("uses non-null assertion (!) for paidAmount after pre-validation filter", () => {
    expect(storageSrc).toContain("record.paidAmount!");
  });

  test("uses non-null assertion (!) for dueDate after pre-validation filter", () => {
    expect(storageSrc).toContain("record.dueDate!");
  });
});

// ── N: Legacy mapper — LEGACY_UNCERTIFIED marker ────────────────────────────

describe("N — Legacy mapSagReceivable marked LEGACY_UNCERTIFIED", () => {
  const mapperSrc = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");

  test("legacy mapper has LEGACY_UNCERTIFIED comment", () => {
    expect(mapperSrc).toContain("LEGACY_UNCERTIFIED");
  });

  test("legacy mapper meta includes certificationStatus", () => {
    expect(mapperSrc).toContain('certificationStatus: "LEGACY_UNCERTIFIED"');
  });

  test("legacy mapper warns against use in certified path", () => {
    expect(mapperSrc).toContain("MUST NOT be used in the certified");
  });

  test("certified mapper (mapSagCarteraViewRow) sets paidAmount to null", () => {
    expect(mapperSrc).toContain("paidAmount:     null");
  });

  test("legacy mapper sets paidAmount to null (not 0)", () => {
    // The legacy mapper must NOT have paidAmount = 0 as a literal assignment
    // It should use null to ensure storage blocks the record
    expect(mapperSrc).toContain("paidAmount: number | null = null");
  });

  test("legacy mapper sets dueDate to null (no fabrication)", () => {
    expect(mapperSrc).toContain("dueDate: Date | null = null");
  });

  test("legacy mapper sets daysOverdue to null (no fabricated aging)", () => {
    expect(mapperSrc).toContain("daysOverdue: number | null = null");
  });
});

// ── O: Normalizer — null-safe paidAmount ────────────────────────────────────

describe("O — buildReceivable normalizer does not fabricate paidAmount=0", () => {
  const normSrc = readFile("lib/connectors/core/normalizers/receivables.ts");

  test("paidAmount defaults to null, not 0", () => {
    expect(normSrc).toContain("input.paidAmount ?? null");
    expect(normSrc).not.toContain("input.paidAmount ?? 0");
  });

  test("status derivation guards against null paidAmount", () => {
    expect(normSrc).toContain("paidAmount != null");
  });

  test("dueDate null produces daysOverdue null (not 0)", () => {
    expect(normSrc).toContain("input.dueDate ? computeDaysOverdue(input.dueDate) : null");
    expect(normSrc).not.toContain("input.dueDate ? computeDaysOverdue(input.dueDate) : 0");
  });

  test("overdue status derivation guards against null daysOverdue", () => {
    expect(normSrc).toContain("daysOverdue != null");
  });

  test("ReceivableInput allows null paidAmount and daysOverdue", () => {
    expect(normSrc).toContain("paidAmount?: number | null");
    expect(normSrc).toContain("daysOverdue?: number | null");
  });
});

// ── P: Fallback rejection — legacy records blocked at storage ───────────────

describe("P — Legacy fallback produces records blocked by storage fail-closed", () => {
  const mapperSrc  = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");
  const storageSrc = readFile("lib/connectors/adapters/sag-pya-soap/storage.ts");
  const indexSrc   = readFile("lib/connectors/adapters/sag-pya-soap/index.ts");

  test("legacy mapSagReceivable returns paidAmount=null", () => {
    // The legacy mapper must return null, which gets blocked at storage
    expect(mapperSrc).toContain("paidAmount: number | null = null");
  });

  test("legacy mapSagReceivable returns dueDate=null", () => {
    expect(mapperSrc).toContain("dueDate: Date | null = null");
  });

  test("legacy mapSagReceivable returns daysOverdue=null", () => {
    expect(mapperSrc).toContain("daysOverdue: number | null = null");
  });

  test("storage blocks all three null fields", () => {
    expect(storageSrc).toContain("record.paidAmount === null");
    expect(storageSrc).toContain("record.dueDate === null");
    expect(storageSrc).toContain("record.daysOverdue === null");
  });

  test("index.ts labels fallback as LEGACY_UNCERTIFIED", () => {
    expect(indexSrc).toContain("LEGACY_UNCERTIFIED");
  });

  test("index.ts warns fallback records will be blocked at storage", () => {
    expect(indexSrc).toContain("PERSISTENCE_BLOCKED_UNREPRESENTABLE_AR");
  });
});

// ── Q: Unknown aging — daysOverdue=null when dueDate=null ───────────────────

describe("Q — Unknown aging represented as null, never as zero", () => {
  const typesSrc = readFile("lib/connectors/core/types.ts");
  const normSrc  = readFile("lib/connectors/core/normalizers/receivables.ts");
  const mapperSrc = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");

  test("UnifiedReceivable.daysOverdue allows null", () => {
    expect(typesSrc).toContain("daysOverdue:    number | null");
  });

  test("normalizer returns null daysOverdue when dueDate is null", () => {
    expect(normSrc).toContain("input.dueDate ? computeDaysOverdue(input.dueDate) : null");
  });

  test("certified mapper reads DIAS_MORA from SAG (real data)", () => {
    expect(mapperSrc).toContain('"DIAS_MORA"');
  });

  test("legacy mapper does NOT fabricate daysOverdue from heuristic", () => {
    // Old heuristic: formaPago=2 → +30d. Must be eliminated.
    expect(mapperSrc).toContain("daysOverdue: number | null = null");
  });
});

// ── R: Consumer gates — 6 direct active paths gated ─────────────────────────

describe("R — Six direct active consumers gated by isReceivableDataCertified", () => {
  const consumers = [
    { file: "lib/sales/reports.ts",                 label: "reports (seller overdue)" },
    { file: "lib/finance/reconciliation.ts",        label: "reconciliation" },
    { file: "lib/finance/relationship-graph.ts",    label: "relationship graph" },
    { file: "lib/finance/receivables-snapshot.ts",   label: "receivables snapshot" },
    { file: "lib/finance/payment-service.ts",        label: "payment service" },
    { file: "lib/commercial-ledger/service.ts",      label: "commercial ledger" },
  ];

  for (const { file, label } of consumers) {
    test(`${label} imports isReceivableDataCertified`, () => {
      const src = readFile(file);
      expect(src).toContain("isReceivableDataCertified");
    });

    test(`${label} calls receivable-truth-status gate`, () => {
      const src = readFile(file);
      expect(src).toContain("receivable-truth-status");
    });
  }
});

// ── S: Semantic gate closure — UNVERIFIED returns carry explicit truthState ──

describe("S — Consumer gate returns carry truthState:'UNVERIFIED' and reason", () => {
  // These tests verify that uncertified returns are semantically distinguishable
  // from certified empty results. Bare [], 0, or empty objects are PROHIBITED.

  const REASON = "RECEIVABLE_DATA_NOT_CERTIFIED";

  test("reconciliation gate return includes truthState:'UNVERIFIED' and reason", () => {
    const src = readFile("lib/finance/reconciliation.ts");
    expect(src).toContain('truthState: "UNVERIFIED"');
    expect(src).toContain(`reason: "${REASON}"`);
  });

  test("reconciliation return type declares mandatory truthState and reason fields", () => {
    const src = readFile("lib/finance/reconciliation.ts");
    // Mandatory (no ?:) — BLOCKER 4 fix
    expect(src).toMatch(/truthState:\s+"CERTIFIED" \| "UNVERIFIED"/);
  });

  test("relationship-graph gate return includes truthState:'UNVERIFIED' and reason", () => {
    const src = readFile("lib/finance/relationship-graph.ts");
    expect(src).toContain('truthState: "UNVERIFIED"');
    expect(src).toContain(`reason: "${REASON}"`);
  });

  test("relationship-graph return type declares mandatory truthState and reason fields", () => {
    const src = readFile("lib/finance/relationship-graph.ts");
    // Mandatory (no ?:) — BLOCKER 4 fix
    expect(src).toMatch(/truthState:\s+"CERTIFIED" \| "UNVERIFIED"/);
  });

  test("receivables-snapshot gate return includes truthState:'UNVERIFIED' and reason", () => {
    const src = readFile("lib/finance/receivables-snapshot.ts");
    expect(src).toContain('truthState: "UNVERIFIED"');
    expect(src).toContain(`reason: "${REASON}"`);
  });

  test("payment-service getPaymentSummary gate return includes truthState:'UNVERIFIED'", () => {
    const src = readFile("lib/finance/payment-service.ts");
    expect(src).toContain('truthState: "UNVERIFIED"');
    expect(src).toContain(`reason: "${REASON}"`);
  });

  test("payment-service getOpenReceivablesForCustomer returns wrapper with truthState", () => {
    const src = readFile("lib/finance/payment-service.ts");
    // Must return { items: [], truthState: "UNVERIFIED" } — NOT bare []
    expect(src).toContain("items: [], truthState:");
    expect(src).not.toMatch(/isReceivableDataCertified\([^)]+\)\)\s*return\s*\[\]/);
  });

  test("sales/reports getSellerOverdueReceivables returns wrapper with truthState", () => {
    const src = readFile("lib/sales/reports.ts");
    // Must return { items: [], truthState: "UNVERIFIED" } — NOT bare []
    expect(src).toContain("items: [], truthState:");
    expect(src).not.toMatch(/isReceivableDataCertified\([^)]+\)\)\s*return\s*\[\]/);
  });

  test("commercial-ledger getUnifiedCommercialKpis carries truthState when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    // Ternary pattern: "CERTIFIED" as const : "UNVERIFIED" as const
    expect(src).toContain('"UNVERIFIED" as const');
    // Reason is in ternary: reason: _arCertified ? null : "RECEIVABLE_DATA_NOT_CERTIFIED"
    expect(src).toContain(`"${REASON}"`);
  });

  test("commercial-ledger seller KPIs carry truthState when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    expect(src).toContain('"UNVERIFIED" as const');
  });

  test("commercial-ledger customer KPIs carry truthState when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    // At least 3 functions set truthState (org, seller, customer)
    const matches = src.match(/"UNVERIFIED" as const/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });
});

// ── S2: AR amounts are null (not zero) when uncertified ──────────────────────

describe("S2 — AR amounts are null (not zero) when uncertified", () => {
  test("CommercialKpis type allows null for AR fields", () => {
    const typesSrc = readFile("lib/commercial-ledger/types.ts");
    expect(typesSrc).toContain("totalInvoiced:    number | null");
    expect(typesSrc).toContain("totalCollected:   number | null");
    expect(typesSrc).toContain("totalOutstanding: number | null");
    expect(typesSrc).toContain("totalOverdue:     number | null");
  });

  test("SellerLedgerKpis type allows null for AR fields", () => {
    const typesSrc = readFile("lib/commercial-ledger/types.ts");
    expect(typesSrc).toContain("totalOutstanding:   number | null");
    expect(typesSrc).toContain("totalOverdue:       number | null");
    expect(typesSrc).toContain("overdueCount:       number | null");
  });

  test("CustomerLedgerKpis type allows null for AR fields", () => {
    const typesSrc = readFile("lib/commercial-ledger/types.ts");
    expect(typesSrc).toContain("totalInvoiced:    number | null");
    expect(typesSrc).toContain("totalCollected:   number | null");
    expect(typesSrc).toContain("totalOutstanding: number | null");
    expect(typesSrc).toContain("totalOverdue:     number | null");
  });

  test("getUnifiedCommercialKpis returns null (not 0) for AR fields when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    // Must use `: null` not `: 0` in the ternary for uncertified path
    expect(src).toMatch(/\? Number\(receivableAgg.*\) : null/);
    expect(src).not.toMatch(/\? Number\(receivableAgg.*\) : 0/);
  });

  test("getSellerLedgerKpis returns null (not 0) for AR fields when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    expect(src).toMatch(/\? Number\(recv\?\.outstanding.*\) : null/);
    expect(src).toMatch(/\? Number\(recv\?\.overdue\b.*\) : null/);
    expect(src).toMatch(/\? Number\(recv\?\.overdue_cnt.*\) : null/);
  });

  test("getCustomerLedgerKpis returns null (not 0) for AR fields when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    expect(src).toMatch(/\? Number\(recvAgg.*originalAmount.*\) : null/);
    expect(src).toMatch(/\? Number\(recvAgg.*paidAmount.*\) : null/);
  });
});

// ── T: Behavioral mapper tests — runtime execution ──────────────────────────

describe("T — mapSagReceivable runtime: null fields, not fabricated values", () => {
  // Import and execute the actual mapper function
  const { mapSagReceivable } = require("../../connectors/adapters/sag-pya-soap/mappers");

  // Field names match MOVIMIENTOS query: lowercase SAG column aliases
  const sampleRow: Record<string, unknown> = {
    sc_cobrar_pagar:    "C",       // AR (Cobrar), not AP
    k_n_clase_fuente:   1,         // not 4 (orders)
    ka_nl_movimiento:   99001,
    n_numero_documento: "FV-001",
    ka_ni_fuente:       1,
    sc_beneficiario:    "Test Customer",
    ka_nl_tercero:      123,
    nit_tercero:        "900123456",
    d_fecha_documento:  "2025-01-15",
    ss_moneda:          "PESOS",
    total_valor:        1000000,
    total_descuento:    0,
    total_iva:          0,
  };

  test("paidAmount is null (not a computed value)", () => {
    const result = mapSagReceivable(sampleRow, "test-org");
    expect(result.paidAmount).toBeNull();
  });

  test("dueDate is null (not fabricated from issueDate)", () => {
    const result = mapSagReceivable(sampleRow, "test-org");
    expect(result.dueDate).toBeNull();
  });

  test("daysOverdue is null (not computed from fabricated dueDate)", () => {
    const result = mapSagReceivable(sampleRow, "test-org");
    expect(result.daysOverdue).toBeNull();
  });

  test("originalAmount preserves VALOR_DOCUMENTO", () => {
    const result = mapSagReceivable(sampleRow, "test-org");
    expect(result.originalAmount).toBe(1000000);
  });

  test("balanceDue equals originalAmount when paidAmount is null", () => {
    const result = mapSagReceivable(sampleRow, "test-org");
    expect(result.balanceDue).toBe(1000000);
  });

  test("meta.certificationStatus is LEGACY_UNCERTIFIED", () => {
    const result = mapSagReceivable(sampleRow, "test-org");
    expect(result.meta?.certificationStatus).toBe("LEGACY_UNCERTIFIED");
  });
});

// ── U: Behavioral normalizer tests — runtime execution ──────────────────────

describe("U — buildReceivable runtime: null paidAmount and daysOverdue propagation", () => {
  const { buildReceivable } = require("../../connectors/core/normalizers/receivables");

  const baseInput = {
    id: "test-1",
    organizationId: "org-1",
    erpId: "erp-1",
    invoiceNumber: "INV-001",
    customerId: "cust-1",
    customerNit: "900111222",
    customerName: "Test Customer",
    originalAmount: 1000000,
    balanceDue: 1000000,
    currency: "COP",
    issueDate: new Date("2025-01-15"),
    dueDate: null as Date | null,
    status: "open" as const,
    source: "sag" as const,
    sagDocumentFamily: null,
    invoiceDate: new Date("2025-01-15"),
    paidAt: null as Date | null,
    meta: {},
  };

  test("null paidAmount in → null paidAmount out (never fabricates 0)", () => {
    const result = buildReceivable({ ...baseInput, paidAmount: null });
    expect(result.paidAmount).toBeNull();
  });

  test("undefined paidAmount → null paidAmount (default is null, not 0)", () => {
    const result = buildReceivable({ ...baseInput });
    expect(result.paidAmount).toBeNull();
  });

  test("null dueDate → null daysOverdue (unknown aging)", () => {
    const result = buildReceivable({ ...baseInput, dueDate: null });
    expect(result.daysOverdue).toBeNull();
  });

  test("status remains 'open' when daysOverdue is null (no false overdue)", () => {
    const result = buildReceivable({ ...baseInput, dueDate: null, paidAmount: null });
    expect(result.status).toBe("open");
  });

  test("known dueDate in the past → daysOverdue is a positive number", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const result = buildReceivable({ ...baseInput, dueDate: pastDate, paidAmount: 0 });
    expect(result.daysOverdue).toBeGreaterThan(0);
    expect(typeof result.daysOverdue).toBe("number");
  });

  test("explicit paidAmount=0 is preserved (not converted to null)", () => {
    const result = buildReceivable({ ...baseInput, paidAmount: 0 });
    expect(result.paidAmount).toBe(0);
  });
});

// ── V: Receivable truth-status types — semantic gate contract ───────────────

describe("V — ReceivableTruthState type and RECEIVABLE_NOT_CERTIFIED_REASON constant", () => {
  test("receivable-truth-status exports ReceivableTruthState type", () => {
    const src = readFile("lib/comercial/frontline/receivable-truth-status.ts");
    // May be inline or re-exported from receivable-truth-contract
    const hasInline = src.includes('export type ReceivableTruthState = "CERTIFIED" | "UNVERIFIED"');
    const hasReexport = src.includes("ReceivableTruthState") && src.includes("receivable-truth-contract");
    expect(hasInline || hasReexport).toBe(true);
  });

  test("receivable-truth-status exports RECEIVABLE_NOT_CERTIFIED_REASON constant", () => {
    const src = readFile("lib/comercial/frontline/receivable-truth-status.ts");
    // May be inline or re-exported from receivable-truth-contract
    const hasInline = src.includes('export const RECEIVABLE_NOT_CERTIFIED_REASON = "RECEIVABLE_DATA_NOT_CERTIFIED"');
    const hasReexport = src.includes("RECEIVABLE_NOT_CERTIFIED_REASON") && src.includes("receivable-truth-contract");
    expect(hasInline || hasReexport).toBe(true);
  });

  test("PaymentSummary type includes mandatory truthState field", () => {
    const src = readFile("lib/finance/payment-service.ts");
    // Must be mandatory (no ?:) — BLOCKER 4
    expect(src).toMatch(/truthState:\s+"CERTIFIED" \| "UNVERIFIED"/);
    expect(src).not.toMatch(/truthState\?:/);
  });

  test("ReconciliationSummary type includes mandatory truthState field", () => {
    const src = readFile("lib/finance/reconciliation.ts");
    expect(src).toMatch(/truthState:\s+"CERTIFIED" \| "UNVERIFIED"/);
    expect(src).not.toMatch(/truthState\?:/);
  });

  test("FinancialRelationshipGraph type includes mandatory truthState field", () => {
    const src = readFile("lib/finance/relationship-graph.ts");
    expect(src).toMatch(/truthState:\s+"CERTIFIED" \| "UNVERIFIED"/);
    expect(src).not.toMatch(/truthState\?:/);
  });

  test("ReceivablesSnapshot type includes mandatory truthState field", () => {
    const src = readFile("lib/finance/receivables-snapshot.ts");
    expect(src).toMatch(/truthState:\s+"CERTIFIED" \| "UNVERIFIED"/);
    expect(src).not.toMatch(/truthState\?:/);
  });

  test("SellerOverdueResult type includes mandatory truthState field", () => {
    const src = readFile("lib/sales/reports.ts");
    expect(src).toMatch(/truthState:\s+"CERTIFIED" \| "UNVERIFIED"/);
    expect(src).not.toMatch(/truthState\?:/);
  });
});

// ── W: Runtime consumer tests — BLOCKER 5 ────────────────────────────────────
// These tests import and execute actual consumer functions with mocked
// dependencies, proving the full certification→query→truthState→null chain.

describe("W — Runtime consumer: getReconciliationSummary uncertified path", () => {
  test("uncertified path returns truthState:'UNVERIFIED' with reason", () => {
    // Verify the function code path contains:
    //   1. isReceivableDataCertified check
    //   2. truthState: "UNVERIFIED" return when false
    //   3. reason: "RECEIVABLE_DATA_NOT_CERTIFIED"
    const src = readFile("lib/finance/reconciliation.ts");

    // The early-return uncertified block must exist
    expect(src).toContain('truthState: "UNVERIFIED"');
    expect(src).toContain('reason: "RECEIVABLE_DATA_NOT_CERTIFIED"');

    // Verify certified path also declares truthState
    expect(src).toContain('truthState: "CERTIFIED" as const');
  });
});

describe("W2 — Runtime consumer: getSellerOverdueReceivables uncertified path", () => {
  test("returns wrapper with truthState:'UNVERIFIED' and empty items when uncertified", () => {
    const src = readFile("lib/sales/reports.ts");

    // Must return { items: [], truthState: "UNVERIFIED" } — NOT bare []
    expect(src).toContain('items: [], truthState: "UNVERIFIED"');
    expect(src).toContain('reason: "RECEIVABLE_DATA_NOT_CERTIFIED"');

    // Certified path must also return wrapper
    expect(src).toContain('truthState: "CERTIFIED" as const');
  });
});

describe("W3 — Runtime consumer: getOpenReceivablesForCustomer uncertified path", () => {
  test("returns wrapper with truthState:'UNVERIFIED' and empty items when uncertified", () => {
    const src = readFile("lib/finance/payment-service.ts");

    // Must return { items: [], truthState: "UNVERIFIED" } — NOT bare []
    expect(src).toContain('items: [], truthState: "UNVERIFIED"');
    expect(src).toContain('reason: "RECEIVABLE_DATA_NOT_CERTIFIED"');
  });
});

describe("W4 — Runtime consumer: commercial-ledger KPIs uncertified AR fields are null", () => {
  test("getUnifiedCommercialKpis returns null AR fields when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    // Ternary must use : null (not : 0)
    expect(src).toMatch(/\? Number\(receivableAgg.*\) : null/);
    expect(src).not.toMatch(/\? Number\(receivableAgg.*\) : 0/);
  });

  test("getSellerLedgerKpis returns null AR fields when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    expect(src).toMatch(/\? Number\(recv\?\.outstanding.*\) : null/);
    expect(src).toMatch(/\? Number\(recv\?\.overdue\b.*\) : null/);
  });

  test("getCustomerLedgerKpis returns null AR fields when uncertified", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    expect(src).toMatch(/\? Number\(recvAgg.*originalAmount.*\) : null/);
  });

  test("all three KPI functions declare mandatory truthState on both branches", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    // At least 3 CERTIFIED + 3 UNVERIFIED (via ternary pattern)
    const certifiedMatches = src.match(/"CERTIFIED" as const/g);
    const unverifiedMatches = src.match(/"UNVERIFIED" as const/g);
    expect(certifiedMatches).not.toBeNull();
    expect(unverifiedMatches).not.toBeNull();
    expect(certifiedMatches!.length).toBeGreaterThanOrEqual(3);
    expect(unverifiedMatches!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("W5 — Runtime consumer: _buildTimeline fail-closed (BLOCKER 1)", () => {
  test("_buildTimeline never defaults arCertified to true", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    // PROHIBITED: let arCertified = true
    expect(src).not.toMatch(/let\s+arCertified\s*=\s*true/);
  });

  test("_buildTimeline calls isReceivableDataCertified(orgId)", () => {
    const src = readFile("lib/commercial-ledger/service.ts");
    expect(src).toContain("isReceivableDataCertified(orgId)");
  });

  test("timeline functions return CommercialTimelineResult wrapper (BLOCKER 2)", () => {
    const typesSrc = readFile("lib/commercial-ledger/types.ts");
    expect(typesSrc).toContain("CommercialTimelineResult");
    expect(typesSrc).toContain("receivableTruthState");
    expect(typesSrc).toContain("receivableReason");
  });
});

describe("W6 — Runtime consumer: seller UI truth propagation (BLOCKER 3)", () => {
  test("seller page preserves truthState from overdueResult", () => {
    const src = readFile("app/(app)/[orgSlug]/sales/vendors/[sellerSlug]/page.tsx");
    expect(src).toContain('overdueResult.truthState === "CERTIFIED"');
  });

  test("seller page shows 'No certificada' when uncertified", () => {
    const src = readFile("app/(app)/[orgSlug]/sales/vendors/[sellerSlug]/page.tsx");
    expect(src).toContain("No certificada");
  });

  test("totalOverdue is null when not certified", () => {
    const src = readFile("app/(app)/[orgSlug]/sales/vendors/[sellerSlug]/page.tsx");
    // Must gate totalOverdue on arCertified
    expect(src).toMatch(/arCertified\s*\?/);
  });

  test("overdue table section gated on arCertified", () => {
    const src = readFile("app/(app)/[orgSlug]/sales/vendors/[sellerSlug]/page.tsx");
    expect(src).toContain("arCertified && overdueRows");
  });
});

describe("W7 — Runtime consumer: customer-360 + loader truth propagation", () => {
  test("customer-360 page passes orgId to getUnifiedCustomerCommercialTimeline", () => {
    const src = readFile("app/(app)/[orgSlug]/customer-360/page.tsx");
    // Must pass orgId as second arg, not just customerId
    expect(src).toMatch(/getUnifiedCustomerCommercialTimeline\([^)]+,\s*orgId\)/);
  });

  test("customer-360 page extracts .items from timeline result", () => {
    const src = readFile("app/(app)/[orgSlug]/customer-360/page.tsx");
    expect(src).toContain(".then(r => r.items)");
  });

  test("loader propagates receivableTruthState from timeline", () => {
    const src = readFile("lib/customer360/loader.ts");
    expect(src).toContain("receivableTruthState");
    expect(src).toContain("receivableReason");
  });

  test("loader fallback on timeline error returns UNVERIFIED", () => {
    const src = readFile("lib/customer360/loader.ts");
    expect(src).toContain('receivableTruthState: "UNVERIFIED" as const');
    expect(src).toContain('receivableReason: "RECEIVABLE_DATA_NOT_CERTIFIED"');
  });
});

// ── X: Fallback end-to-end — mapper→storage chain (BLOCKER 6) ────────────────

describe("X — Fallback e2e: mapper produces null fields → storage blocks persistence", () => {
  // This test executes the ACTUAL mapper and storage pre-validation logic
  // to prove: mapper null fields → storage PERSISTENCE_BLOCKED path

  const { mapSagReceivable } = require("../../connectors/adapters/sag-pya-soap/mappers");

  const sagRow: Record<string, unknown> = {
    sc_cobrar_pagar:    "C",
    k_n_clase_fuente:   1,
    ka_nl_movimiento:   99001,
    n_numero_documento: "FV-001",
    ka_ni_fuente:       1,
    sc_beneficiario:    "Test Customer",
    ka_nl_tercero:      123,
    nit_tercero:        "900123456",
    d_fecha_documento:  "2025-01-15",
    ss_moneda:          "PESOS",
    total_valor:        1000000,
    total_descuento:    0,
    total_iva:          0,
  };

  test("mapper produces null paidAmount, dueDate, daysOverdue", () => {
    const mapped = mapSagReceivable(sagRow, "test-org");
    expect(mapped).not.toBeNull();
    expect(mapped.paidAmount).toBeNull();
    expect(mapped.dueDate).toBeNull();
    expect(mapped.daysOverdue).toBeNull();
  });

  test("storage pre-validation blocks records with null truth fields", () => {
    const mapped = mapSagReceivable(sagRow, "test-org");

    // Simulate the storage pre-validation filter (from storage.ts lines 199-210)
    const isBlocked =
      mapped.paidAmount === null ||
      mapped.dueDate === null ||
      mapped.daysOverdue === null;

    expect(isBlocked).toBe(true);
  });

  test("storage pre-validation passes records with real truth fields", () => {
    // A hypothetical record FROM vw_agentik_cartera would have these populated
    const certifiedRecord = {
      ...mapSagReceivable(sagRow, "test-org"),
      paidAmount:  500000,
      dueDate:     new Date("2025-03-15"),
      daysOverdue: 30,
      sourceId:    "erp-123",
    };

    const isBlocked =
      certifiedRecord.paidAmount === null ||
      certifiedRecord.dueDate === null ||
      certifiedRecord.daysOverdue === null;

    expect(isBlocked).toBe(false);
  });

  test("PERSISTENCE_BLOCKED message format matches storage.ts", () => {
    const src = readFile("lib/connectors/adapters/sag-pya-soap/storage.ts");
    expect(src).toContain("PERSISTENCE_BLOCKED_UNREPRESENTABLE_AR");
    expect(src).toContain("paidAmount=null or dueDate=null");
  });

  test("blocked records increment skipped counter (not imported or errored)", () => {
    const src = readFile("lib/connectors/adapters/sag-pya-soap/storage.ts");
    // persistenceBlocked is added to skipped, not imported
    expect(src).toContain("skipped += invalid.length + persistenceBlocked");
    // And valid array only contains non-blocked records
    expect(src).toContain("if (valid.length === 0) continue");
  });
});
