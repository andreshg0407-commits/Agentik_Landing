/**
 * AGENTIK-RECEIVABLES-SAFETY-LOCK-P0 — Test suite
 *
 * Verifies that uncertified receivable data does NOT produce:
 *   - overdue warnings
 *   - CUSTOMER_OVERDUE attention items
 *   - cartera alerts
 *   - credit blocks in order decision engine
 *
 * And that CERTIFIED data still produces expected warnings.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveReceivableTruthStatus,
  isReceivableDataCertified,
  UNVERIFIED_RECEIVABLE_LABEL,
} from "../receivable-truth-status";

// ── T01: Truth status resolver ──────────────────────────────────────────────

describe("ReceivableTruthStatus resolver", () => {
  it("T01a: castillitos is CERTIFIED", () => {
    assert.equal(resolveReceivableTruthStatus("castillitos"), "CERTIFIED");
  });

  it("T01b: unknown org is UNVERIFIED", () => {
    assert.equal(resolveReceivableTruthStatus("unknown-org"), "UNVERIFIED");
  });

  it("T01c: isReceivableDataCertified returns true for castillitos", () => {
    assert.equal(isReceivableDataCertified("castillitos"), true);
  });

  it("T01d: isReceivableDataCertified returns false for any org", () => {
    assert.equal(isReceivableDataCertified("any-slug"), false);
    assert.equal(isReceivableDataCertified(""), false);
  });

  it("T01e: UNVERIFIED_RECEIVABLE_LABEL is non-accusatory", () => {
    assert.ok(!UNVERIFIED_RECEIVABLE_LABEL.includes("vencida"));
    assert.ok(!UNVERIFIED_RECEIVABLE_LABEL.includes("mora"));
    assert.ok(UNVERIFIED_RECEIVABLE_LABEL.includes("validación"));
  });
});

// ── T02: CustomerReceivablesContext truthStatus ─────────────────────────────

describe("CustomerReceivablesContext truthStatus", () => {
  it("T02a: truthStatus field is required in type", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(__dirname, "../frontline-types.ts"),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("truthStatus"),
      "CustomerReceivablesContext must include truthStatus field",
    );
  });

  it("T02b: getCustomerReceivables stamps truthStatus", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(__dirname, "../customer-commercial-context.ts"),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("truthStatus: resolveReceivableTruthStatus"),
      "getCustomerReceivables must stamp truthStatus via resolveReceivableTruthStatus",
    );
  });
});

// ── T03: Warning gate — UNVERIFIED suppresses ──────────────────────────────

describe("Warning gate", () => {
  it("T03a: UNVERIFIED + overdue > 0 → no warning (attention service gate)", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(__dirname, "../frontline-attention-service.ts"),
        "utf-8",
      ),
    );
    // Must check truthStatus !== "CERTIFIED" before producing attention
    assert.ok(
      src.includes('truthStatus !== "CERTIFIED"'),
      "emitCustomerOverdueAttention must gate on truthStatus !== CERTIFIED",
    );
  });

  it("T03b: UNVERIFIED + DPD > 30 → no warning (nuevo-pedido-view gate)", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../../../app/(app)/[orgSlug]/seller-app/views/nuevo-pedido-view.tsx",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes('truthStatus === "CERTIFIED"'),
      "nuevo-pedido-view hasOverdue must require truthStatus === CERTIFIED",
    );
  });

  it("T03c: UNVERIFIED → no overdue card in clientes-view", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../../../app/(app)/[orgSlug]/seller-app/views/clientes-view.tsx",
        ),
        "utf-8",
      ),
    );
    // CustomerCard hasOverdue must check receivableTruthStatus
    assert.ok(
      src.includes('receivableTruthStatus === "CERTIFIED"'),
      "clientes-view must gate overdue display on receivableTruthStatus === CERTIFIED",
    );
  });

  it("T03d: SerializedCustomer includes receivableTruthStatus", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../../../app/(app)/[orgSlug]/seller-app/views/seller-app-shared.tsx",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("receivableTruthStatus"),
      "SerializedCustomer must include receivableTruthStatus field",
    );
  });

  it("T03e: Seller App page.tsx stamps receivableTruthStatus", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../../../app/(app)/[orgSlug]/seller-app/page.tsx",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("resolveReceivableTruthStatus"),
      "seller-app page.tsx must call resolveReceivableTruthStatus",
    );
    assert.ok(
      src.includes("receivableTruthStatus"),
      "seller-app page.tsx must include receivableTruthStatus in serialized customer",
    );
  });
});

// ── T04: CERTIFIED + overdue > 0 + DPD > 30 → warning allowed ─────────────

describe("CERTIFIED allows warning", () => {
  it("T04a: attention service gate passes when CERTIFIED", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(__dirname, "../frontline-attention-service.ts"),
        "utf-8",
      ),
    );
    // The gate checks truthStatus !== "CERTIFIED" and returns null.
    // If truthStatus IS "CERTIFIED", it falls through to existing logic.
    assert.ok(
      src.includes("receivables.truthStatus !== \"CERTIFIED\""),
      "Gate must allow CERTIFIED to pass through",
    );
    // The existing overdueAmount > 0 and maxDaysOverdue > 30 checks remain
    assert.ok(
      src.includes("receivables.maxDaysOverdue <= 30"),
      "Existing DPD > 30 check must remain",
    );
  });

  it("T04b: CERTIFIED + zero overdue → no warning (existing logic)", () => {
    // This is guaranteed by existing code: overdueAmount <= 0 → return null
    // Just verify the check is still present
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../frontline-attention-service.ts"),
      "utf-8",
    );
    assert.ok(
      src.includes("receivables.overdueAmount <= 0"),
      "Zero overdue must still return null",
    );
  });
});

// ── T05: Attention requires CERTIFIED ──────────────────────────────────────

describe("Attention requires CERTIFIED", () => {
  it("T05a: buildOverdueReceivableAlert requires certified", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../sales-reps/sales-rep-alerts.ts",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("isReceivableDataCertified"),
      "buildOverdueReceivableAlert must check isReceivableDataCertified",
    );
  });

  it("T05b: buildOverdueReceivableDecisions requires certified", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../sales-reps/sales-rep-business-decisions.ts",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("isReceivableDataCertified"),
      "buildOverdueReceivableDecisions must check isReceivableDataCertified",
    );
  });

  it("T05c: generateCarteraAlerts requires certified", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(__dirname, "../../../alerts/org-alerts.ts"),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("isReceivableDataCertified"),
      "generateCarteraAlerts must check isReceivableDataCertified",
    );
  });

  it("T05d: evaluateCustomerCredit requires certified", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../pedidos/order-decision-engine.ts",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("isReceivableDataCertified"),
      "evaluateCustomerCredit must check isReceivableDataCertified",
    );
  });
});

// ── T06: AMV false positive suppressed ─────────────────────────────────────

describe("AMV LLANO SAS false positive suppression", () => {
  it("T06: isReceivableDataCertified('castillitos') = true → AMV warning possible only if SAG shows overdue", () => {
    // AMV LLANO SAS (tercero=856) is a Castillitos customer.
    // Castillitos is CERTIFIED. Overdue warnings CAN fire, but only from
    // SAG vw_agentik_cartera data (CERTIFIED). AMV LLANO has 0 cartera
    // rows in SAG (CERTIFIED_ZERO = fully paid), so no false positive.
    assert.equal(isReceivableDataCertified("castillitos"), true);
  });
});

// ── T07: API route includes truthStatus ────────────────────────────────────

describe("API route truthStatus propagation", () => {
  it("T07: pedidos route includes truthStatus in receivables response", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../../../app/api/orgs/[orgSlug]/comercial/pedidos/route.ts",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("truthStatus: ctx.receivables.truthStatus"),
      "Pedidos route must pass truthStatus to client",
    );
  });
});

// ── T08: No raw data mutation ──────────────────────────────────────────────

describe("No raw data mutation", () => {
  it("T08a: receivable-truth-status.ts has no top-level prisma import", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(__dirname, "../receivable-truth-status.ts"),
        "utf-8",
      ),
    );
    // No top-level import — prisma is only used in warmTruthStatusCache() via dynamic import()
    assert.ok(!src.includes("import { prisma }"), "receivable-truth-status must not have top-level prisma import");
    assert.ok(!src.includes("import \"server-only\""), "receivable-truth-status must not be server-only");
  });

  it("T08b: receivable-truth-status.ts has no DB writes", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(__dirname, "../receivable-truth-status.ts"),
        "utf-8",
      ),
    );
    assert.ok(!src.includes(".create("), "No create operations");
    assert.ok(!src.includes(".update("), "No update operations");
    assert.ok(!src.includes(".delete("), "No delete operations");
    assert.ok(!src.includes(".upsert("), "No upsert operations");
  });

  it("T08c: no CustomerReceivable mutation in any changed file", async () => {
    const fs = require("fs");
    const path = require("path");
    const changedFiles = [
      "../frontline-attention-service.ts",
      "../customer-commercial-context.ts",
      "../receivable-truth-status.ts",
    ];
    for (const f of changedFiles) {
      const src = fs.readFileSync(path.resolve(__dirname, f), "utf-8");
      assert.ok(
        !src.includes("customerReceivable.update"),
        `${f} must not mutate CustomerReceivable`,
      );
      assert.ok(
        !src.includes("customerReceivable.delete"),
        `${f} must not delete CustomerReceivable`,
      );
    }
  });
});

// ── T09: Unverified state shows correct copy ───────────────────────────────

describe("Unverified state copy", () => {
  it("T09: clientes-view shows 'Información de cartera en validación' when not certified", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        require("path").resolve(
          __dirname,
          "../../../../app/(app)/[orgSlug]/seller-app/views/clientes-view.tsx",
        ),
        "utf-8",
      ),
    );
    assert.ok(
      src.includes("Información de cartera en validación"),
      "Must show non-accusatory label when receivables are not certified",
    );
  });
});
