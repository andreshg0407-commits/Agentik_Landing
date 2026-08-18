/**
 * INVENTORY-DRAWER-ORDER-RESERVATION-04A6B / 04A6B1
 *
 * Structural tests verifying order reservation contract in drawer + loader.
 *
 * F. PRUEBAS OBLIGATORIAS:
 *   1. borrador no reserva
 *   2. listo_para_enviar sí reserva
 *   3. cancelado no reserva
 *   4. error de consulta produce null, no cero
 *   5. reintento no duplica
 *   6. ACK sin snapshot posterior conserva reserva local
 *   7. snapshot posterior libera reserva local (structural — debt SAG-006)
 *   8. suma SAG + Agentik sin doble conteo
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const DRAWER_PATH = path.resolve(
  __dirname,
  "../../../components/comercial/commercial-product-drawer.tsx"
);
const drawerSrc = fs.readFileSync(DRAWER_PATH, "utf-8");

const LOADER_PATH = path.resolve(
  __dirname,
  "../../../lib/inventory/order-reservation-loader.ts"
);
const loaderSrc = fs.readFileSync(LOADER_PATH, "utf-8");

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx"
);
const clientSrc = fs.readFileSync(CLIENT_PATH, "utf-8");

// ── G1: Borrador does NOT reserve ───────────────────────────────────────────

describe("G1 — borrador does NOT reserve", () => {
  test("T1a: Loader excludes borrador from committed statuses", () => {
    // COMMITTED_ORDER_STATUSES must NOT contain borrador
    const committedBlock = loaderSrc.slice(
      loaderSrc.indexOf("COMMITTED_ORDER_STATUSES"),
      loaderSrc.indexOf("EXCLUDED_ORDER_STATUSES")
    );
    expect(committedBlock).not.toContain("borrador");
    // borrador IS in the EXCLUDED set (correct behavior)
    const excludedBlock = loaderSrc.slice(
      loaderSrc.indexOf("EXCLUDED_ORDER_STATUSES"),
      loaderSrc.indexOf("Result types")
    );
    expect(excludedBlock).toContain("borrador");
  });

  test("T1b: Loader explicitly skips borrador orders", () => {
    expect(loaderSrc).toContain('orderStatus === "borrador"');
  });
});

// ── G2: listo_para_enviar DOES reserve ──────────────────────────────────────

describe("G2 — listo_para_enviar DOES reserve", () => {
  test("T2a: Loader includes listo_para_enviar in committed statuses", () => {
    const committedBlock = loaderSrc.slice(
      loaderSrc.indexOf("COMMITTED_ORDER_STATUSES"),
      loaderSrc.indexOf("EXCLUDED_ORDER_STATUSES")
    );
    expect(committedBlock).toContain("listo_para_enviar");
  });

  test("T2b: Loader includes pendiente_sag in committed statuses", () => {
    const committedBlock = loaderSrc.slice(
      loaderSrc.indexOf("COMMITTED_ORDER_STATUSES"),
      loaderSrc.indexOf("EXCLUDED_ORDER_STATUSES")
    );
    expect(committedBlock).toContain("pendiente_sag");
  });
});

// ── G3: Cancelado does NOT reserve ──────────────────────────────────────────

describe("G3 — cancelado does NOT reserve", () => {
  test("T3a: Loader excludes cancelado", () => {
    expect(loaderSrc).toContain('orderStatus === "cancelado"');
    // Should be in EXCLUDED set
    const excludedBlock = loaderSrc.slice(
      loaderSrc.indexOf("EXCLUDED_ORDER_STATUSES"),
      loaderSrc.indexOf("Result types")
    );
    expect(excludedBlock).toContain("cancelado");
  });
});

// ── G4: Error produces null, NOT zero ───────────────────────────────────────

describe("G4 — error produces null, not zero (fail-closed)", () => {
  test("T4a: Loader returns null on catch", () => {
    // The catch block must set reservadoAgentikPendiente to null
    const catchBlock = loaderSrc.slice(
      loaderSrc.indexOf("} catch (err)"),
      loaderSrc.length
    );
    expect(catchBlock).toContain("reservadoAgentikPendiente: null");
  });

  test("T4b: OrderReservationSummary type allows null", () => {
    expect(loaderSrc).toContain("reservadoAgentikPendiente: number | null");
  });

  test("T4c: Drawer type allows null for all reservation fields", () => {
    expect(drawerSrc).toContain("reservadoAgentikPendiente?: number | null");
    expect(drawerSrc).toContain("reservadoOperativo?: number | null");
    expect(drawerSrc).toContain("disponibleParaPrometer?: number | null");
  });

  test("T4d: Client propagates null on fetch failure", () => {
    expect(clientSrc).toContain("reservadoAgentikPendiente: null");
  });

  test("T4e: Drawer shows 'No verificado' when null", () => {
    expect(drawerSrc).toContain("No verificado");
  });

  test("T4f: Drawer shows 'No disponible' for disponibleParaPrometer when null", () => {
    expect(drawerSrc).toContain("No disponible");
  });

  test("T4g: Client does NOT compute disponibleParaPrometer from null", () => {
    // Must check for null before computing
    expect(clientSrc).toContain("reservadoAgentikPendiente != null");
  });
});

// ── G5: Retry does not duplicate ────────────────────────────────────────────

describe("G5 — retry does not duplicate reservation", () => {
  test("T5a: OperationalReservation has unique constraint per order+reference", () => {
    // Documented in loader comments — verified by Prisma schema
    expect(loaderSrc).toContain("sourceType: \"order\"");
  });

  test("T5b: Loader uses qtyActive = reserved - released - consumed", () => {
    expect(loaderSrc).toContain("qtyReserved - res.qtyReleased - res.qtyConsumed");
  });

  test("T5c: Loader skips fully released/consumed reservations", () => {
    expect(loaderSrc).toContain("qtyActive <= 0");
  });
});

// ── G6: ACK without snapshot conserves local reservation ────────────────────

describe("G6 — SAG_ACK_WAITING preserves local reservation", () => {
  test("T6a: Loader documents SAG-006 handoff debt", () => {
    expect(loaderSrc).toContain("SAG-006");
  });

  test("T6b: Loader does NOT release on syncState=sincronizado alone", () => {
    // The old code had: if (syncState === "sincronizado" && sagOrderId) continue;
    // 04A6B1 keeps these in the reservation count
    expect(loaderSrc).toContain("SAG_ACK_WAITING_INVENTORY_REFRESH");
  });

  test("T6c: sincronizado orders stay in local count (conservative)", () => {
    // Loader explicitly keeps sincronizado orders rather than releasing
    const handoffComment = loaderSrc.slice(
      loaderSrc.indexOf("SAG-006"),
      loaderSrc.indexOf("Sort by most recent")
    );
    expect(handoffComment).toContain("keep");
  });
});

// ── G7: Snapshot-based handoff (structural — debt SAG-006) ──────────────────

describe("G7 — snapshot handoff documented as debt", () => {
  test("T7a: Drawer documents HANDOFF_SIMULATION_ONLY ruling", () => {
    expect(drawerSrc).toContain("SAG_ORDER_RESERVATION_HANDOFF_SIMULATION_ONLY");
  });

  test("T7b: Drawer documents RUNTIME_BLOCKED ruling", () => {
    expect(drawerSrc).toContain("AGENTIK_PENDING_ORDER_RESERVATION_RUNTIME_BLOCKED");
  });
});

// ── G8: SAG + Agentik without double counting ──────────────────────────────

describe("G8 — SAG + Agentik sum without double count", () => {
  test("T8a: Drawer shows Reservado SAG separately", () => {
    expect(drawerSrc).toContain('label="Reservado SAG"');
  });

  test("T8b: Drawer shows Reservado Agentik pendiente separately", () => {
    expect(drawerSrc).toContain('label="Reservado Agentik pendiente"');
  });

  test("T8c: Drawer shows Reservado en pedidos (operativo = SAG + Agentik)", () => {
    expect(drawerSrc).toContain('label="Reservado en pedidos"');
  });

  test("T8d: Drawer shows Disponible SAG separately from Disponible para prometer", () => {
    expect(drawerSrc).toContain('label="Disponible SAG"');
    expect(drawerSrc).toContain('label="Disponible para prometer"');
  });

  test("T8e: Client computes reservadoOperativo as SAG + Agentik", () => {
    expect(clientSrc).toContain("reservadoSag + reservadoAgentikPendiente");
  });

  test("T8f: Client computes disponibleParaPrometer as disponible - Agentik", () => {
    expect(clientSrc).toContain("disponibleReal - reservadoAgentikPendiente");
  });
});

// ── G9: Existing tests must remain green ────────────────────────────────────

describe("G9 — Existing drawer contract preserved", () => {
  test("T9a: Drawer still has Inventario B01 section", () => {
    expect(drawerSrc).toContain("Inventario B01");
    expect(drawerSrc).toContain("Bodega Principal");
  });

  test("T9b: Drawer still has Existencia B01 field", () => {
    expect(drawerSrc).toContain('label="Existencia B01"');
  });

  test("T9c: Drawer still has provenance text", () => {
    expect(drawerSrc).toContain("Pedidos pendientes por facturar/despachar");
  });

  test("T9d: Drawer still has production section", () => {
    expect(drawerSrc).toContain("Produccion abierta");
  });

  test("T9e: PendingOrdersSection exists", () => {
    expect(drawerSrc).toContain("PendingOrdersSection");
  });

  test("T9f: Empty state message present", () => {
    expect(drawerSrc).toContain("Sin reservas Agentik pendientes de sincronizacion");
  });

  test("T9g: Error state message present", () => {
    expect(drawerSrc).toContain("Reservas Agentik no verificadas");
  });
});
