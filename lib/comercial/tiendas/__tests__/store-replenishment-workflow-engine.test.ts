/**
 * lib/comercial/tiendas/__tests__/store-replenishment-workflow-engine.test.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-FULFILLMENT-01 — certification tests (motor puro).
 * AGENTIK-STORES-SUPPLY-PLAN-RESERVATION-01 — RESERVADO status added.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-replenishment-workflow-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  WORKFLOW_TRANSITIONS,
  WORKFLOW_TRANSITION_VERBS,
  WORKFLOW_VERSION,
  resolveTransition,
  allowedTransitions,
  isTerminal,
  InvalidWorkflowTransitionError,
} from "../store-replenishment-workflow-engine";
import { REPLENISHMENT_DOCUMENT_STATUSES } from "../store-replenishment-document-types";
import type { ReplenishmentDocumentStatus } from "../store-replenishment-document-types";

// ═════════════════════════════════════════════════════════════════════════════
// 1. La cadena feliz completa
// ═════════════════════════════════════════════════════════════════════════════

describe("cadena certificada", () => {
  it("BORRADOR → RESERVADO → APROBADO → PREPARACION → DESPACHADO → RECIBIDO → CERRADO", () => {
    const chain: [ReplenishmentDocumentStatus, string, ReplenishmentDocumentStatus][] = [
      ["BORRADOR", "RESERVAR", "RESERVADO"],
      ["RESERVADO", "APROBAR", "APROBADO"],
      ["APROBADO", "INICIAR_PREPARACION", "PREPARACION"],
      ["PREPARACION", "DESPACHAR", "DESPACHADO"],
      ["DESPACHADO", "RECIBIR", "RECIBIDO"],
      ["RECIBIDO", "CERRAR", "CERRADO"],
    ];
    for (const [from, verb, to] of chain) {
      const r = resolveTransition(from, verb);
      assert.equal(r.fromStatus, from);
      assert.equal(r.transition, verb);
      assert.equal(r.toStatus, to);
      assert.equal(r.workflowVersion, WORKFLOW_VERSION);
    }
  });

  it("resolveTransition devuelve información completa, incluido terminal", () => {
    const r = resolveTransition("RECIBIDO", "CERRAR");
    assert.deepEqual(r, {
      fromStatus: "RECIBIDO",
      transition: "CERRAR",
      toStatus: "CERRADO",
      terminal: true,
      workflowVersion: 1,
    });
    assert.equal(resolveTransition("BORRADOR", "RESERVAR").terminal, false);
    assert.equal(resolveTransition("PREPARACION", "CANCELAR").terminal, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Matriz completa: 8 estados × 8 verbos — sin saltos ni retrocesos
// ═════════════════════════════════════════════════════════════════════════════

describe("matriz completa certificada", () => {
  const EXPECTED: Record<string, Record<string, string>> = {
    BORRADOR:    { RESERVAR: "RESERVADO", CANCELAR: "CANCELADO" },
    RESERVADO:   { APROBAR: "APROBADO", LIBERAR_RESERVA: "BORRADOR", CANCELAR: "CANCELADO" },
    APROBADO:    { INICIAR_PREPARACION: "PREPARACION", CANCELAR: "CANCELADO" },
    PREPARACION: { DESPACHAR: "DESPACHADO", CANCELAR: "CANCELADO" },
    DESPACHADO:  { RECIBIR: "RECIBIDO" },
    RECIBIDO:    { CERRAR: "CERRADO" },
    CERRADO:     {},
    CANCELADO:   {},
  };

  it("cada celda de la matriz 8×8 se comporta exactamente como lo certificado", () => {
    for (const status of REPLENISHMENT_DOCUMENT_STATUSES) {
      for (const verb of WORKFLOW_TRANSITION_VERBS) {
        const expected = EXPECTED[status][verb];
        if (expected) {
          assert.equal(resolveTransition(status, verb).toStatus, expected, `${status}+${verb}`);
        } else {
          assert.throws(
            () => resolveTransition(status, verb),
            (e: unknown) => e instanceof InvalidWorkflowTransitionError,
            `${status}+${verb} debió rechazarse`,
          );
        }
      }
    }
  });

  it("CANCELAR desde BORRADOR, RESERVADO, APROBADO y PREPARACION (nunca tras despachar)", () => {
    assert.equal(resolveTransition("RESERVADO", "CANCELAR").toStatus, "CANCELADO");
    assert.equal(resolveTransition("PREPARACION", "CANCELAR").toStatus, "CANCELADO");
    for (const s of ["DESPACHADO", "RECIBIDO", "CERRADO", "CANCELADO"] as const) {
      assert.throws(() => resolveTransition(s, "CANCELAR"));
    }
  });

  it("los estados terminales JAMÁS aceptan comandos", () => {
    for (const s of ["CERRADO", "CANCELADO"] as const) {
      assert.equal(isTerminal(s), true);
      assert.deepEqual([...allowedTransitions(s)], []);
      for (const verb of WORKFLOW_TRANSITION_VERBS) {
        assert.throws(() => resolveTransition(s, verb));
      }
    }
  });

  it("los no terminales no son terminales", () => {
    for (const s of ["BORRADOR", "RESERVADO", "APROBADO", "PREPARACION", "DESPACHADO", "RECIBIDO"] as const) {
      assert.equal(isTerminal(s), false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Coherencia dato ↔ función y API auxiliar
// ═════════════════════════════════════════════════════════════════════════════

describe("coherencia y API auxiliar", () => {
  it("WORKFLOW_TRANSITIONS y resolveTransition permanecen sincronizados", () => {
    for (const status of REPLENISHMENT_DOCUMENT_STATUSES) {
      const row = WORKFLOW_TRANSITIONS[status] as Record<string, string>;
      // todo lo declarado en la matriz resuelve igual
      for (const [verb, to] of Object.entries(row)) {
        assert.equal(resolveTransition(status, verb).toStatus, to);
      }
      // allowedTransitions ≡ claves de la matriz
      assert.deepEqual([...allowedTransitions(status)], Object.keys(row));
    }
  });

  it("la matriz cubre TODOS los estados del enum (ninguno huérfano)", () => {
    assert.deepEqual(
      Object.keys(WORKFLOW_TRANSITIONS).sort(),
      [...REPLENISHMENT_DOCUMENT_STATUSES].sort(),
    );
  });

  it("transición desconocida se rechaza con las permitidas en el error", () => {
    try {
      resolveTransition("BORRADOR", "TELETRANSPORTAR");
      assert.fail("debió lanzar");
    } catch (e) {
      assert.ok(e instanceof InvalidWorkflowTransitionError);
      assert.equal((e as InvalidWorkflowTransitionError).code, "INVALID_WORKFLOW_TRANSITION");
      assert.deepEqual([...(e as InvalidWorkflowTransitionError).allowed], ["RESERVAR", "CANCELAR"]);
    }
  });

  it("todo destino declarado existe en el enum de estados", () => {
    for (const status of REPLENISHMENT_DOCUMENT_STATUSES) {
      for (const to of Object.values(WORKFLOW_TRANSITIONS[status]) as string[]) {
        assert.ok((REPLENISHMENT_DOCUMENT_STATUSES as readonly string[]).includes(to));
      }
    }
  });

  it("no hay retrocesos excepto LIBERAR_RESERVA (RESERVADO → BORRADOR)", () => {
    const orderIdx: Record<string, number> = {
      BORRADOR: 0, RESERVADO: 1, APROBADO: 2, PREPARACION: 3, DESPACHADO: 4, RECIBIDO: 5, CERRADO: 6, CANCELADO: 99,
    };
    for (const status of REPLENISHMENT_DOCUMENT_STATUSES) {
      const row = WORKFLOW_TRANSITIONS[status] as Record<string, string>;
      for (const [verb, to] of Object.entries(row)) {
        // LIBERAR_RESERVA is the only authorized retroceso
        if (verb === "LIBERAR_RESERVA") continue;
        assert.ok(orderIdx[to] > orderIdx[status], `${status} → ${to} retrocede (via ${verb})`);
      }
    }
  });
});
