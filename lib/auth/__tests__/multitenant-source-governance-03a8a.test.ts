/**
 * lib/auth/__tests__/multitenant-source-governance-03a8a.test.ts
 *
 * MULTITENANT-SOURCE-GOVERNANCE-03A8A — Behavioral tests for multi-tenant
 * document source classification.
 *
 * Verifies:
 *   1. Canonical document kinds are organization-agnostic
 *   2. Castillitos profile classifies all known codes correctly
 *   3. Ludisam profile classifies its own codes correctly
 *   4. 0R is PENDING in Ludisam (excluded from production calculations)
 *   5. No cross-contamination between tenant profiles
 *   6. Unknown profile → UNKNOWN_DOCUMENT (fail-closed)
 *   7. Unknown code within a known profile → UNKNOWN_DOCUMENT (fail-closed)
 *   8. classifyDocumentType in clientes-pure.ts delegates to resolver
 *   9. NIT 24296154 behavior preserved (via Castillitos profile)
 *  10. tipoDocumento fallback works when prefix is unrecognized
 *  11. Profile registry is case-insensitive
 *  12. No hardcoded document codes remain in classifyDocumentType
 *  13. Canonical kinds cover all required semantic categories
 */

import { describe, test, expect } from "bun:test";

import {
  resolveCanonicalDocumentKind,
  getDocumentSourceProfile,
  CASTILLITOS_PROFILE,
  LUDISAM_PROFILE,
  DOCUMENT_KIND_LABELS,
  type CanonicalDocumentKind,
  type DocumentClassificationResult,
} from "@/lib/comercial/clientes/document-source-profiles";

import {
  classifyDocumentType,
  mapCertifiedDocToReceivable,
} from "@/lib/comercial/clientes/clientes-pure";

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── 1. Canonical document kinds are complete ─────────────────────────────────

describe("Canonical document kinds", () => {
  const ALL_KINDS: CanonicalDocumentKind[] = [
    "SALES_INVOICE",
    "SALES_REMISSION",
    "SALES_CREDIT_NOTE",
    "CUSTOMER_RECEIPT",
    "CUSTOMER_ADVANCE",
    "UNKNOWN_DOCUMENT",
  ];

  test("all 6 canonical kinds have display labels", () => {
    for (const kind of ALL_KINDS) {
      expect(DOCUMENT_KIND_LABELS[kind]).toBeDefined();
      expect(typeof DOCUMENT_KIND_LABELS[kind]).toBe("string");
      expect(DOCUMENT_KIND_LABELS[kind].length).toBeGreaterThan(0);
    }
  });

  test("UNKNOWN_DOCUMENT label is generic 'Documento'", () => {
    expect(DOCUMENT_KIND_LABELS.UNKNOWN_DOCUMENT).toBe("Documento");
  });

  test("labels are in Spanish", () => {
    expect(DOCUMENT_KIND_LABELS.SALES_INVOICE).toBe("Factura");
    expect(DOCUMENT_KIND_LABELS.SALES_REMISSION).toBe("Remisión");
    expect(DOCUMENT_KIND_LABELS.SALES_CREDIT_NOTE).toBe("Nota crédito");
    expect(DOCUMENT_KIND_LABELS.CUSTOMER_RECEIPT).toBe("Recibo de caja");
    expect(DOCUMENT_KIND_LABELS.CUSTOMER_ADVANCE).toBe("Anticipo");
  });
});

// ── 2. Castillitos profile — complete coverage ───────────────────────────────

describe("Castillitos profile — document classification", () => {
  const pid = "castillitos";

  test("F2 → SALES_REMISSION", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "F2-8484", tipoDocumento: "Remisión" });
    expect(r.kind).toBe("SALES_REMISSION");
    expect(r.label).toBe("Remisión");
    expect(r.pending).toBe(false);
  });

  test("FE → SALES_INVOICE", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "FE-7688", tipoDocumento: "Factura" });
    expect(r.kind).toBe("SALES_INVOICE");
    expect(r.label).toBe("Factura");
  });

  test("FD/FC/FG/FA/FW → SALES_INVOICE (all channels)", () => {
    for (const prefix of ["FD", "FC", "FG", "FA", "FW"]) {
      const r = resolveCanonicalDocumentKind(pid, { documento: `${prefix}-100`, tipoDocumento: "" });
      expect(r.kind).toBe("SALES_INVOICE");
    }
  });

  test("F1/VC/V1-V6/FF/FX → SALES_INVOICE (historical)", () => {
    for (const prefix of ["F1", "VC", "V1", "V2", "V3", "V4", "V5", "V6", "FF", "FX"]) {
      const r = resolveCanonicalDocumentKind(pid, { documento: `${prefix}-100`, tipoDocumento: "" });
      expect(r.kind).toBe("SALES_INVOICE");
    }
  });

  test("D2 → SALES_CREDIT_NOTE (nota crédito, NOT a payment)", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "D2-1234", tipoDocumento: "Nota Crédito" });
    expect(r.kind).toBe("SALES_CREDIT_NOTE");
    expect(r.label).toBe("Nota crédito");
  });

  test("NC/NE/ND/NF/NS/NT/NG/NA/NW/NX → SALES_CREDIT_NOTE", () => {
    for (const prefix of ["NC", "NE", "ND", "NF", "NS", "NT", "NG", "NA", "NW", "NX"]) {
      const r = resolveCanonicalDocumentKind(pid, { documento: `${prefix}-100`, tipoDocumento: "" });
      expect(r.kind).toBe("SALES_CREDIT_NOTE");
    }
  });

  test("D1/2D-6D/D3 → SALES_CREDIT_NOTE (devoluciones)", () => {
    for (const prefix of ["D1", "2D", "3D", "4D", "5D", "6D", "D3"]) {
      const r = resolveCanonicalDocumentKind(pid, { documento: `${prefix}-100`, tipoDocumento: "" });
      expect(r.kind).toBe("SALES_CREDIT_NOTE");
    }
  });

  test("R1/R2 → CUSTOMER_RECEIPT (recibo de caja — actual collections)", () => {
    const r1 = resolveCanonicalDocumentKind(pid, { documento: "R1-5001", tipoDocumento: "" });
    expect(r1.kind).toBe("CUSTOMER_RECEIPT");
    const r2 = resolveCanonicalDocumentKind(pid, { documento: "R2-5002", tipoDocumento: "" });
    expect(r2.kind).toBe("CUSTOMER_RECEIPT");
  });

  test("RS → CUSTOMER_RECEIPT (recibos San Diego)", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "RS-100", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_RECEIPT");
  });

  test("AN/A1 → CUSTOMER_ADVANCE (anticipos)", () => {
    for (const prefix of ["AN", "A1"]) {
      const r = resolveCanonicalDocumentKind(pid, { documento: `${prefix}-100`, tipoDocumento: "" });
      expect(r.kind).toBe("CUSTOMER_ADVANCE");
    }
  });

  test("tipoDocumento fallback: 'Factura' → SALES_INVOICE when prefix unknown", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "ZZ-999", tipoDocumento: "Factura" });
    expect(r.kind).toBe("SALES_INVOICE");
  });

  test("tipoDocumento fallback: 'Nota Crédito' → SALES_CREDIT_NOTE when prefix unknown", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "ZZ-999", tipoDocumento: "Nota Crédito" });
    expect(r.kind).toBe("SALES_CREDIT_NOTE");
  });

  test("unknown prefix AND unknown tipoDocumento → UNKNOWN_DOCUMENT", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "XX-999", tipoDocumento: "Something Else" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
    expect(r.label).toBe("Documento");
  });
});

// ── 3. Ludisam profile — distinct codes, no overlap assumed ──────────────────

describe("Ludisam profile — document classification", () => {
  const pid = "ludisam";

  test("RE → SALES_REMISSION", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "RE-200", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_REMISSION");
    expect(r.label).toBe("Remisión");
  });

  test("F7 → SALES_INVOICE", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "F7-300", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_INVOICE");
  });

  test("N7 → SALES_CREDIT_NOTE", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "N7-400", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_CREDIT_NOTE");
  });

  test("2R → CUSTOMER_RECEIPT", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "2R-500", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_RECEIPT");
  });

  test("1R → CUSTOMER_RECEIPT", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "1R-600", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_RECEIPT");
  });

  test("0R → UNKNOWN_DOCUMENT with pending=true", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "0R-700", tipoDocumento: "" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
    expect(r.pending).toBe(true);
  });

  test("F2 is NOT recognized in Ludisam (Castillitos-only code)", () => {
    const r = resolveCanonicalDocumentKind(pid, { documento: "F2-8484", tipoDocumento: "" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
  });
});

// ── 4. Cross-contamination prevention ────────────────────────────────────────

describe("Cross-tenant isolation", () => {
  test("Castillitos F2 → SALES_REMISSION, but Ludisam F2 → UNKNOWN_DOCUMENT", () => {
    const cast = resolveCanonicalDocumentKind("castillitos", { documento: "F2-100", tipoDocumento: "" });
    const ludi = resolveCanonicalDocumentKind("ludisam", { documento: "F2-100", tipoDocumento: "" });
    expect(cast.kind).toBe("SALES_REMISSION");
    expect(ludi.kind).toBe("UNKNOWN_DOCUMENT");
  });

  test("Ludisam RE → SALES_REMISSION, but Castillitos RE → UNKNOWN_DOCUMENT", () => {
    const ludi = resolveCanonicalDocumentKind("ludisam", { documento: "RE-200", tipoDocumento: "" });
    const cast = resolveCanonicalDocumentKind("castillitos", { documento: "RE-200", tipoDocumento: "" });
    expect(ludi.kind).toBe("SALES_REMISSION");
    expect(cast.kind).toBe("UNKNOWN_DOCUMENT");
  });

  test("Ludisam N7 → SALES_CREDIT_NOTE, but Castillitos N7 → UNKNOWN_DOCUMENT", () => {
    const ludi = resolveCanonicalDocumentKind("ludisam", { documento: "N7-100", tipoDocumento: "" });
    const cast = resolveCanonicalDocumentKind("castillitos", { documento: "N7-100", tipoDocumento: "" });
    expect(ludi.kind).toBe("SALES_CREDIT_NOTE");
    expect(cast.kind).toBe("UNKNOWN_DOCUMENT");
  });

  test("Ludisam 2R → CUSTOMER_RECEIPT, but Castillitos 2R → UNKNOWN_DOCUMENT", () => {
    const ludi = resolveCanonicalDocumentKind("ludisam", { documento: "2R-100", tipoDocumento: "" });
    const cast = resolveCanonicalDocumentKind("castillitos", { documento: "2R-100", tipoDocumento: "" });
    expect(ludi.kind).toBe("CUSTOMER_RECEIPT");
    expect(cast.kind).toBe("UNKNOWN_DOCUMENT");
  });
});

// ── 5. Fail-closed: unknown profile ──────────────────────────────────────────

describe("Unknown profile — fail-closed", () => {
  test("unknown profileId → UNKNOWN_DOCUMENT for any document", () => {
    const r = resolveCanonicalDocumentKind("acme-corp", { documento: "FE-100", tipoDocumento: "Factura" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
    expect(r.label).toBe("Documento");
    expect(r.pending).toBe(false);
  });

  test("empty profileId → UNKNOWN_DOCUMENT", () => {
    const r = resolveCanonicalDocumentKind("", { documento: "FE-100", tipoDocumento: "Factura" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
  });

  test("getDocumentSourceProfile returns null for unknown profileId", () => {
    expect(getDocumentSourceProfile("acme-corp")).toBeNull();
    expect(getDocumentSourceProfile("")).toBeNull();
  });
});

// ── 6. Profile registry case-insensitivity ───────────────────────────────────

describe("Profile registry — case-insensitive", () => {
  test("'Castillitos' (capital C) resolves the same as 'castillitos'", () => {
    const r = resolveCanonicalDocumentKind("Castillitos", { documento: "F2-100", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_REMISSION");
  });

  test("'LUDISAM' (uppercase) resolves the same as 'ludisam'", () => {
    const r = resolveCanonicalDocumentKind("LUDISAM", { documento: "RE-200", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_REMISSION");
  });
});

// ── 7. classifyDocumentType delegates to resolver ────────────────────────────

describe("classifyDocumentType — delegates to resolver", () => {
  test("default profile (castillitos): F2 → 'Remisión'", () => {
    expect(classifyDocumentType("", "F2-100")).toBe("Remisión");
  });

  test("default profile (castillitos): D2 → 'Nota crédito'", () => {
    expect(classifyDocumentType("Nota Crédito", "D2-100")).toBe("Nota crédito");
  });

  test("explicit ludisam profile: RE → 'Remisión'", () => {
    expect(classifyDocumentType("", "RE-200", "ludisam")).toBe("Remisión");
  });

  test("explicit ludisam profile: F7 → 'Factura'", () => {
    expect(classifyDocumentType("", "F7-300", "ludisam")).toBe("Factura");
  });

  test("unknown profile: any document → 'Documento'", () => {
    expect(classifyDocumentType("Factura", "FE-100", "unknown-tenant")).toBe("Documento");
  });
});

// ── 8. mapCertifiedDocToReceivable uses classifyDocumentType ──────────────────

describe("mapCertifiedDocToReceivable — document type via resolver", () => {
  const baseDoc = {
    valorDocumento: 1_000_000,
    saldoPendiente: 500_000,
    diasMora: 15,
    fechaDocumento: new Date("2026-01-15"),
    fechaVencimiento: new Date("2026-02-15"),
  };

  test("F2 document → documentType='Remisión'", () => {
    const r = mapCertifiedDocToReceivable({ ...baseDoc, documento: "F2-8484", tipoDocumento: "Remisión" });
    expect(r.documentType).toBe("Remisión");
  });

  test("D2 document → documentType='Nota crédito'", () => {
    const r = mapCertifiedDocToReceivable({ ...baseDoc, documento: "D2-1234", tipoDocumento: "Nota Crédito", saldoPendiente: -200_000 });
    expect(r.documentType).toBe("Nota crédito");
    expect(r.status).toBe("CREDIT");
  });

  test("FE document → documentType='Factura'", () => {
    const r = mapCertifiedDocToReceivable({ ...baseDoc, documento: "FE-7688", tipoDocumento: "Factura" });
    expect(r.documentType).toBe("Factura");
  });

  test("paidAmount remains null (NEVER inferred by difference)", () => {
    const r = mapCertifiedDocToReceivable({ ...baseDoc, documento: "FE-7688", tipoDocumento: "Factura" });
    expect(r.paidAmount).toBeNull();
  });
});

// ── 9. NIT 24296154 behavior preserved ───────────────────────────────────────

describe("NIT 24296154 — behavior preserved via Castillitos profile", () => {
  test("D2 prefix → SALES_CREDIT_NOTE (not CUSTOMER_RECEIPT)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "D2-1234", tipoDocumento: "Nota Crédito" });
    expect(r.kind).toBe("SALES_CREDIT_NOTE");
    expect(r.kind).not.toBe("CUSTOMER_RECEIPT");
  });

  test("R1 prefix → CUSTOMER_RECEIPT (actual collection)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "R1-5678", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_RECEIPT");
  });
});

// ── 10. No hardcoded codes in classifyDocumentType ───────────────────────────

describe("classifyDocumentType — no hardcoded codes in source", () => {
  const src = readFile("lib/comercial/clientes/clientes-pure.ts");

  test("classifyDocumentType body does NOT contain hardcoded prefix checks", () => {
    // Extract the function body
    const fnStart = src.indexOf("export function classifyDocumentType");
    const fnEnd = src.indexOf("}", fnStart);
    const fnBody = src.slice(fnStart, fnEnd + 1);

    // Should NOT contain direct prefix comparisons like 'prefix === "D2"'
    expect(fnBody).not.toContain('"D2"');
    expect(fnBody).not.toContain('"F2"');
    expect(fnBody).not.toContain('"R1"');
    expect(fnBody).not.toContain('"NC"');
    expect(fnBody).not.toContain('"FE"');
    expect(fnBody).not.toContain('"F1"');
  });

  test("classifyDocumentType delegates to resolveCanonicalDocumentKind", () => {
    expect(src).toContain("resolveCanonicalDocumentKind");
    expect(src).toContain('from "./document-source-profiles"');
  });
});

// ── 11. Ludisam 0R PENDING exclusion ─────────────────────────────────────────

describe("Ludisam 0R — PENDING exclusion", () => {
  test("0R returns kind=UNKNOWN_DOCUMENT and pending=true", () => {
    const r = resolveCanonicalDocumentKind("ludisam", { documento: "0R-999", tipoDocumento: "" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
    expect(r.pending).toBe(true);
    expect(r.label).toBe("Documento");
  });

  test("non-PENDING codes return pending=false", () => {
    const r = resolveCanonicalDocumentKind("ludisam", { documento: "F7-100", tipoDocumento: "" });
    expect(r.pending).toBe(false);
  });
});

// ── 12. Profile structural invariants ────────────────────────────────────────

describe("Profile structural invariants", () => {
  test("Castillitos profile has profileId='castillitos'", () => {
    expect(CASTILLITOS_PROFILE.profileId).toBe("castillitos");
  });

  test("Ludisam profile has profileId='ludisam'", () => {
    expect(LUDISAM_PROFILE.profileId).toBe("ludisam");
  });

  test("Castillitos has at least 40 prefix entries", () => {
    expect(Object.keys(CASTILLITOS_PROFILE.prefixMap).length).toBeGreaterThanOrEqual(40);
  });

  test("Ludisam has exactly 6 prefix entries (RE, F7, N7, 2R, 1R, 0R)", () => {
    expect(Object.keys(LUDISAM_PROFILE.prefixMap).length).toBe(6);
  });

  test("every Castillitos entry maps to a valid canonical kind", () => {
    const validKinds = new Set(Object.keys(DOCUMENT_KIND_LABELS));
    for (const [, entry] of Object.entries(CASTILLITOS_PROFILE.prefixMap)) {
      expect(validKinds.has(entry.kind)).toBe(true);
    }
  });

  test("every Ludisam entry maps to a valid canonical kind", () => {
    const validKinds = new Set(Object.keys(DOCUMENT_KIND_LABELS));
    for (const [, entry] of Object.entries(LUDISAM_PROFILE.prefixMap)) {
      expect(validKinds.has(entry.kind)).toBe(true);
    }
  });
});

// ── 13. document-source-profiles.ts — structural checks ─────────────────────

describe("document-source-profiles.ts — no server-only dependencies", () => {
  const src = readFile("lib/comercial/clientes/document-source-profiles.ts");

  test("does NOT import from Prisma", () => {
    expect(src).not.toContain("prisma");
    expect(src).not.toContain("@prisma");
  });

  test("does NOT import from server-only modules", () => {
    expect(src).not.toContain('from "server-only"');
    expect(src).not.toContain("canonical-ar-service");
    expect(src).not.toContain("receivable-truth-status");
  });

  test("is a pure module (no async, no fetch, no DB)", () => {
    expect(src).not.toContain("async ");
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("import { db");
  });
});
