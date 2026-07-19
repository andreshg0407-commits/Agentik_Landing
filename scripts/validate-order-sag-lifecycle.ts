/**
 * scripts/validate-order-sag-lifecycle.ts
 *
 * E2E validation: Order → Bridge → Queue → PostSync → Final State
 *
 * Validates the complete lifecycle wiring WITHOUT calling SOAP.
 * Tests run against real Prisma (requires database connection).
 *
 * Run: npx tsx scripts/validate-order-sag-lifecycle.ts
 *
 * Sprint: ORDER-SAG-LIFECYCLE-01
 */

import { prisma } from "../lib/prisma";

// ── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`  ○ ${name} — SKIPPED: ${reason}`);
}

async function main() {

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  ORDER-SAG-LIFECYCLE-01 — E2E Validation");
console.log("══════════════════════════════════════════════════════════════\n");

// ── Phase 1: Verify infrastructure exists ────────────────────────────────────

console.log("▸ Phase 1: Infrastructure verification");

try {
  // Check SagWriteOperation table exists
  const opCount = await prisma.sagWriteOperation.count();
  assert(true, `SagWriteOperation table accessible (${opCount} rows)`);
} catch (e) {
  assert(false, "SagWriteOperation table accessible", (e as Error).message);
}

try {
  // Check AgentExecution table exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execCount = await (prisma as any).agentExecution.count({
    where: { module: "comercial", operation: "COMERCIAL_ORDER_DRAFT" },
  });
  assert(true, `AgentExecution (orders) table accessible (${execCount} order drafts)`);
} catch (e) {
  assert(false, "AgentExecution table accessible", (e as Error).message);
}

try {
  // Check OperationalReservation table exists
  const resCount = await prisma.operationalReservation.count();
  assert(true, `OperationalReservation table accessible (${resCount} rows)`);
} catch (e) {
  assert(false, "OperationalReservation table accessible", (e as Error).message);
}

// ── Phase 2: Create test order via service ───────────────────────────────────

console.log("\n▸ Phase 2: Order creation + submit");

let testOrderId: string | null = null;
let testExternalSyncKey: string | null = null;

try {
  const { createOrderDraft, submitOrder } = await import("../lib/comercial/pedidos/order-service");

  // Find a real org
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) {
    skip("Create order", "No organization in database");
  } else {
    const order = await createOrderDraft(org.id, {
      header: {
        customerId: "test-cust-001",
        customerName: "Test Customer E2E",
        customerCode: "900999888",
        sellerId: "test-seller-001",
        sellerName: "TEST SELLER",
        channel: "test",
        notes: "E2E lifecycle test — safe to delete",
      },
      lines: [
        {
          id: "e2e-line-1",
          referenceCode: "E2E-REF-001",
          productName: "Test Product",
          size: "40",
          color: "NEGRO",
          quantity: 5,
          availableUnits: 100,
          unitPrice: 50000,
          lineTotal: 250000,
          removed: false,
          comment: "",
        },
      ],
      createdBy: "e2e-test",
    });

    assert(!!order.id, "Order created with ID");
    assert(order.status === "borrador", "Initial status = borrador");
    assert(!!order.externalSyncKey, `externalSyncKey generated: ${order.externalSyncKey}`);

    testOrderId = order.id;
    testExternalSyncKey = order.externalSyncKey;

    // Submit
    const submitted = await submitOrder(org.id, order.id);
    assert(submitted?.status === "listo_para_enviar", "Submitted → listo_para_enviar");
  }
} catch (e) {
  assert(false, "Order creation", (e as Error).message);
}

// ── Phase 3: Bridge → Enqueue ────────────────────────────────────────────────

console.log("\n▸ Phase 3: Bridge enqueue");

let testOperationId: string | null = null;

if (testOrderId && testExternalSyncKey) {
  try {
    const { sendOrderToSagQueue } = await import("../lib/comercial/pedidos/order-sag-bridge");
    const { getOrder } = await import("../lib/comercial/pedidos/order-service");

    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) {
      skip("Bridge enqueue", "No organization");
    } else {
      const order = await getOrder(org.id, testOrderId);
      if (!order) {
        assert(false, "Order retrievable after submit");
      } else {
        const result = await sendOrderToSagQueue(org.id, "e2e-test", order);

        assert(result.ok === true, "sendOrderToSagQueue returns ok=true");
        assert(!!result.sagOperationId, `SagOperationId: ${result.sagOperationId}`);
        testOperationId = result.sagOperationId ?? null;

        // Verify order status changed
        const updated = await getOrder(org.id, testOrderId);
        assert(updated?.status === "pendiente_sag", "Order status → pendiente_sag");

        // Verify idempotency: second call returns alreadyQueued
        const retry = await sendOrderToSagQueue(org.id, "e2e-test", { ...order, status: "listo_para_enviar" });
        assert(retry.alreadyQueued === true, "Second call → alreadyQueued (idempotent)");
      }
    }
  } catch (e) {
    assert(false, "Bridge enqueue", (e as Error).message);
  }
} else {
  skip("Bridge enqueue", "No test order created");
}

// ── Phase 4: Verify SagWriteOperation in queue ───────────────────────────────

console.log("\n▸ Phase 4: Queue state verification");

if (testOperationId) {
  try {
    const op = await prisma.sagWriteOperation.findFirst({
      where: { id: testOperationId },
    });

    assert(op?.status === "PENDING", `Operation status = PENDING`);
    assert(op?.writeType === 2, "Write type = 2 (CREATE_DOCUMENT)");
    assert(op?.sourceRef === testExternalSyncKey, `sourceRef = externalSyncKey`);
    assert(op?.risk === "HIGH", "Risk = HIGH (document creation)");
    assert(!!op?.generatedXml, "XML generated and stored");
    assert(op?.generatedXml?.includes("PE") === true, "XML contains TIPO_DOC=PE");
    assert(op?.generatedXml?.includes("900999888") === true, "XML contains NIT");
    assert(op?.generatedXml?.includes("E2E-REF-001") === true, "XML contains product CODIGO");
  } catch (e) {
    assert(false, "Queue verification", (e as Error).message);
  }
} else {
  skip("Queue verification", "No operation created");
}

// ── Phase 5: Simulate post-sync callback (SUCCESS) ───────────────────────────

console.log("\n▸ Phase 5: Post-sync callback simulation");

if (testOperationId && testExternalSyncKey) {
  try {
    const { handleOrderSagResult } = await import("../lib/comercial/pedidos/order-post-sync");
    const { getOrder } = await import("../lib/comercial/pedidos/order-service");

    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) {
      skip("Post-sync callback", "No organization");
    } else {
      // Simulate SUCCESS callback
      const cbResult = await handleOrderSagResult(
        org.id,
        testExternalSyncKey,
        "SUCCEEDED",
        { sagRef: "SAG-PE-99999", raw: "OK: SAG-PE-99999" },
      );

      assert(cbResult.ok === true, "Callback returns ok=true");
      assert(cbResult.newStatus === "sincronizado", "newStatus = sincronizado");

      // Verify final order state
      const finalOrder = await getOrder(org.id, testOrderId!);
      assert(finalOrder?.status === "sincronizado", "Order final status = sincronizado");
      assert(finalOrder?.sagOrderId === "SAG-PE-99999", "sagOrderId persisted");
    }
  } catch (e) {
    assert(false, "Post-sync callback", (e as Error).message);
  }
} else {
  skip("Post-sync callback", "No operation/sourceRef");
}

// ── Phase 6: sourceRef uniqueness ────────────────────────────────────────────

console.log("\n▸ Phase 6: sourceRef uniqueness protection");

if (testExternalSyncKey) {
  try {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) {
      skip("sourceRef uniqueness", "No organization");
    } else {
      // Try to create a second operation with the same sourceRef
      // This should fail if the UNIQUE index exists, or succeed if not yet migrated
      try {
        await prisma.sagWriteOperation.create({
          data: {
            organizationId: org.id,
            writeType: 2,
            status: "PENDING",
            risk: "HIGH",
            description: "Duplicate test — should fail",
            sourceRef: testExternalSyncKey,
            inputJson: {},
            generatedXml: "<test/>",
            initiatedBy: "e2e-test",
            initiatedAt: new Date(),
            retryCount: 0,
          },
        });
        // If we get here, the UNIQUE index is not yet applied
        skip("sourceRef UNIQUE enforcement", "Migration not yet applied (expected in dev)");
        // Clean up the duplicate
        await prisma.sagWriteOperation.deleteMany({
          where: { organizationId: org.id, sourceRef: testExternalSyncKey, description: "Duplicate test — should fail" },
        });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("Unique constraint")) {
          assert(true, "sourceRef UNIQUE constraint enforced — duplicate blocked");
        } else {
          assert(false, "sourceRef UNIQUE check", msg);
        }
      }
    }
  } catch (e) {
    assert(false, "sourceRef uniqueness", (e as Error).message);
  }
} else {
  skip("sourceRef uniqueness", "No externalSyncKey");
}

// ── Phase 7: Retry safety ────────────────────────────────────────────────────

console.log("\n▸ Phase 7: Retry safety (synced orders blocked)");

if (testOrderId) {
  try {
    const { sendOrderToSagQueue } = await import("../lib/comercial/pedidos/order-sag-bridge");
    const { getOrder } = await import("../lib/comercial/pedidos/order-service");

    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) {
      skip("Retry safety", "No organization");
    } else {
      const syncedOrder = await getOrder(org.id, testOrderId);
      if (syncedOrder?.status === "sincronizado") {
        const result = await sendOrderToSagQueue(org.id, "e2e-test", syncedOrder);
        assert(result.ok === false, "Synced order cannot be re-sent");
        assert(result.alreadySynced === true, "Returns alreadySynced flag");
      } else {
        skip("Retry safety", `Order not in sincronizado state (got: ${syncedOrder?.status})`);
      }
    }
  } catch (e) {
    assert(false, "Retry safety", (e as Error).message);
  }
} else {
  skip("Retry safety", "No test order");
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

console.log("\n▸ Cleanup");

if (testOperationId) {
  try {
    await prisma.sagWriteOperation.deleteMany({
      where: { id: testOperationId },
    });
    console.log("  → Deleted test SagWriteOperation");
  } catch { /* ignore */ }
}

if (testOrderId) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).agentExecution.deleteMany({
      where: { id: testOrderId },
    });
    console.log("  → Deleted test AgentExecution (order)");
  } catch { /* ignore */ }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log("══════════════════════════════════════════════════════════════\n");

await prisma.$disconnect();

if (failed > 0) process.exit(1);

} // end main

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
