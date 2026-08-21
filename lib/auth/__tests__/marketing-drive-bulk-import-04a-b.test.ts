/**
 * lib/auth/__tests__/marketing-drive-bulk-import-04a-b.test.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-B — Section B: 14 Tests
 *
 * Source-reading pattern: reads implementation files and asserts on content.
 * No mocks, no DB, no network. Deterministic.
 */

// @ts-expect-error — vitest resolves at runtime, TSC does not have vitest types
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Source files ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../../..");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

const bibliotecaClientSrc = readSrc("components/marketing-studio/library/biblioteca-client.tsx");
const bulkImportDrawerSrc = readSrc("components/marketing-studio/library/bulk-import-drawer.tsx");
const driveRouteSrc       = readSrc("app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts");
const dryRunTypesSrc      = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-types.ts");
const dryRunEngineSrc     = readSrc("lib/marketing-studio/bulk-import/drive-dry-run-engine.ts");
const drawerSrc           = readSrc("components/marketing-studio/library/reference-folder-drawer.tsx");

// ── T01: Button in header ─────────────────────────────────────────────────

describe("04A-B-A: Global header button", () => {
  test("T01: Importar lote button exists in biblioteca-client header for inventory mode", () => {
    expect(bibliotecaClientSrc).toContain("Importar lote desde Drive");
    expect(bibliotecaClientSrc).toContain("showBulkImport");
    expect(bibliotecaClientSrc).toContain("setShowBulkImport(true)");
    // Button is in inventoryMode block, not productMode
    const invIdx = bibliotecaClientSrc.indexOf("{inventoryMode && (");
    const btnIdx = bibliotecaClientSrc.indexOf("Importar lote desde Drive");
    expect(invIdx).toBeGreaterThan(-1);
    expect(btnIdx).toBeGreaterThan(invIdx);
  });
});

// ── T02: Not inside individual drawer ─────────────────────────────────────

describe("04A-B-A: Not in individual drawer", () => {
  test("T02: Bulk import button does NOT appear in ReferenceFolderDrawer", () => {
    expect(drawerSrc).not.toContain("Importar lote desde Drive");
    expect(drawerSrc).not.toContain("showBulkImport");
    expect(drawerSrc).not.toContain("BulkImportDrawer");
  });
});

// ── T03: Unauthorized roles blocked ───────────────────────────────────────

describe("04A-B-C: Role authorization", () => {
  test("T03: Drive route requires canAccessMarketingStudio", () => {
    expect(driveRouteSrc).toContain("canAccessMarketingStudio");
    expect(driveRouteSrc).toContain("ACCESS_DENIED");
    expect(driveRouteSrc).toContain("requireOrgAccess");
  });
});

// ── T04: Drive not connected state ────────────────────────────────────────

describe("04A-B-D: Drive connection states", () => {
  test("T04: Drawer handles Drive not connected", () => {
    // Checks data.connected from status response
    expect(bulkImportDrawerSrc).toContain("data.connected");
    // Shows error when not connected
    expect(bulkImportDrawerSrc).toContain("Drive no está conectado");
  });
});

// ── T05: Root not configured state ────────────────────────────────────────

describe("04A-B-D: Root configuration states", () => {
  test("T05: Drawer handles root not configured", () => {
    expect(bulkImportDrawerSrc).toContain("tenantRootConfigured");
    expect(bulkImportDrawerSrc).toContain("DRIVE_TENANT_ROOT_NOT_CONFIGURED");
    expect(bulkImportDrawerSrc).toContain('setStep("configure")');
  });
});

// ── T06: Scan in progress ─────────────────────────────────────────────────

describe("04A-B-E: Scanning progress", () => {
  test("T06: Drawer has scanning step with real progress KPIs", () => {
    expect(bulkImportDrawerSrc).toContain('step === "scanning"');
    // Real progress: folders, files, pages, errors
    expect(bulkImportDrawerSrc).toContain("scanFoldersDone");
    expect(bulkImportDrawerSrc).toContain("scanFilesDone");
    expect(bulkImportDrawerSrc).toContain("scanPagesDone");
    expect(bulkImportDrawerSrc).toContain("Escaneando");
  });
});

// ── T07: Pagination — complete until 2000 limit ───────────────────────────

describe("04A-B-E: Pagination and truncation", () => {
  test("T07: Truncation uses complete/truncated fields (not hard 2000 limit)", () => {
    expect(bulkImportDrawerSrc).toContain("isTruncated");
    expect(bulkImportDrawerSrc).toContain("isComplete");
    // Truncated banner shown
    expect(bulkImportDrawerSrc).toContain("INCOMPLETO");
    expect(bulkImportDrawerSrc).toContain("complete=false");
  });
});

// ── T08: Truncated never shown as success ─────────────────────────────────

describe("04A-B-E: Truncation never success", () => {
  test("T08: Truncation warning is visually distinct and blocks success declaration", () => {
    // Must have amberLight warning background
    expect(bulkImportDrawerSrc).toContain("C.amberLight");
    // Must contain "No declare éxito con datos parciales"
    expect(bulkImportDrawerSrc).toContain("No declare");
    expect(bulkImportDrawerSrc).toContain("parciales");
  });
});

// ── T09: Table and filters ────────────────────────────────────────────────

describe("04A-B-D: Results table and filters", () => {
  test("T09: Results table has all required columns and filters", () => {
    // Table columns
    expect(bulkImportDrawerSrc).toContain("Ruta");
    expect(bulkImportDrawerSrc).toContain("Archivo");
    expect(bulkImportDrawerSrc).toContain("Ref.");
    expect(bulkImportDrawerSrc).toContain("Mundo");
    expect(bulkImportDrawerSrc).toContain("Tipo");
    expect(bulkImportDrawerSrc).toContain("Rol");
    expect(bulkImportDrawerSrc).toContain("Estado");
    expect(bulkImportDrawerSrc).toContain("Motivo");
    // Filters
    expect(bulkImportDrawerSrc).toContain("filterStatus");
    expect(bulkImportDrawerSrc).toContain("filterType");
    expect(bulkImportDrawerSrc).toContain("filterSearch");
  });
});

// ── T10: CSV/JSON download ────────────────────────────────────────────────

describe("04A-B-D: Download support", () => {
  test("T10: CSV and JSON download functions exist", () => {
    expect(bulkImportDrawerSrc).toContain("downloadCSV");
    expect(bulkImportDrawerSrc).toContain("downloadJSON");
    expect(bulkImportDrawerSrc).toContain("text/csv");
    expect(bulkImportDrawerSrc).toContain("application/json");
    expect(bulkImportDrawerSrc).toContain(".csv");
    expect(bulkImportDrawerSrc).toContain(".json");
  });
});

// ── T11: Import CTA permanently disabled ──────────────────────────────────

describe("04A-B-F: Import CTA disabled", () => {
  test("T11: Apply/import button is disabled and says 'todavía bloqueada'", () => {
    expect(bulkImportDrawerSrc).toContain("Importación todavía bloqueada");
    // Button must be disabled — check surrounding 600 chars
    const btnIdx = bulkImportDrawerSrc.indexOf("Importación todavía bloqueada");
    const surrounding = bulkImportDrawerSrc.slice(Math.max(0, btnIdx - 600), btnIdx + 600);
    expect(surrounding).toContain("disabled");
    expect(surrounding).toContain("not-allowed");
  });
});

// ── T12: Zero write routes ────────────────────────────────────────────────

describe("04A-B-F: Zero write enforcement", () => {
  test("T12: Drawer uses GET-only for scanning — no POST/PUT/PATCH/DELETE (04A-D)", () => {
    // 04A-D: server-side analysis per page — drawer no longer POSTs raw files
    // All scanning is via GET ?action=scan-page — zero writes
    expect(bulkImportDrawerSrc).toContain("scan-page");
    // No POST/PUT/PATCH/DELETE methods
    expect(bulkImportDrawerSrc).not.toContain('method: "POST"');
    expect(bulkImportDrawerSrc).not.toContain("method: \"PUT\"");
    expect(bulkImportDrawerSrc).not.toContain("method: \"PATCH\"");
    expect(bulkImportDrawerSrc).not.toContain("method: \"DELETE\"");
    // No create/update/delete operations
    expect(bulkImportDrawerSrc).not.toContain(".create(");
    expect(bulkImportDrawerSrc).not.toContain(".update(");
    expect(bulkImportDrawerSrc).not.toContain(".delete(");
  });
});

// ── T13: Prior gates continue (meta check) ───────────────────────────────

describe("04A-B-F: Prior gates preserved", () => {
  test("T13: Dry-run engine is still zero-writes and route still validates ancestry", () => {
    expect(dryRunEngineSrc).toContain("ZERO WRITES");
    expect(dryRunEngineSrc).not.toContain("prisma.");
    expect(driveRouteSrc).toContain("isDescendantOfRoot");
    expect(driveRouteSrc).toContain("OUTSIDE_TENANT_ROOT");
    expect(driveRouteSrc).toContain("getTenantDriveRoot");
  });
});

// ── T14: KPI display ─────────────────────────────────────────────────────

describe("04A-B-D: KPI display", () => {
  test("T14: Results show all required KPIs", () => {
    expect(bulkImportDrawerSrc).toContain("Escaneados");
    expect(bulkImportDrawerSrc).toContain("Refs. detectadas");
    expect(bulkImportDrawerSrc).toContain("Coincidencias");
    expect(bulkImportDrawerSrc).toContain("Ambiguas");
    expect(bulkImportDrawerSrc).toContain("Sin referencia");
    expect(bulkImportDrawerSrc).toContain("Duplicados");
    expect(bulkImportDrawerSrc).toContain("Rechazados");
    expect(bulkImportDrawerSrc).toContain("Errores");
    // Asset type breakdown
    expect(bulkImportDrawerSrc).toContain("Fotos:");
    expect(bulkImportDrawerSrc).toContain("Videos:");
    expect(bulkImportDrawerSrc).toContain("Banners:");
  });
});
