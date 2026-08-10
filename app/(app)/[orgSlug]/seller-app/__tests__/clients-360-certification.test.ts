/**
 * app/(app)/[orgSlug]/seller-app/__tests__/clients-360-certification.test.ts
 *
 * AGENTIK-SELLER-APP-CLIENTS-360-V1-01 — guardianes de certificación.
 *
 * Clientes = CRM móvil / Cliente 360 (NO picker). Verifica por fs:
 *   filtros V1 · safety-lock de cartera · acciones de contacto condicionadas ·
 *   flujo canónico de pedido preservado · ruta nueva con viewer scope y
 *   read-only · sin tocar exclusiones duras.
 *
 * Run: npx tsx --test "app/(app)/[orgSlug]/seller-app/__tests__/clients-360-certification.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");

const VIEW = read("../views/clientes-view.tsx");
const SHARED = read("../views/seller-app-shared.tsx");
const KIT = read("../views/seller-ui-kit.tsx");
const PAGE = read("../page.tsx");
const ROUTE = read("../../../../api/orgs/[orgSlug]/comercial/customer-recent-orders/route.ts");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

describe("V1 — filtros CRM (no picker)", () => {
  it("los 4 filtros del contrato existen", () => {
    for (const label of ["Todos", "Cartera vencida", "Top clientes", "+90 días sin comprar"]) {
      assert.ok(VIEW.includes(`"${label}"`) || VIEW.includes(`label: "${label}"`), `filtro: ${label}`);
    }
    assert.ok(VIEW.includes('"todos" | "cartera" | "top" | "inactivos"'), "tipo de filtro cerrado");
  });

  it("Cartera vencida SOLO con verdad certificada (SAFETY-LOCK-P0)", () => {
    const occurrences = [...VIEW.matchAll(/receivableTruthStatus === "CERTIFIED"/g)].length;
    assert.ok(occurrences >= 4, `gate CERTIFIED presente en filtro + card + 360 (${occurrences})`);
  });

  it("Top clientes rankea por ventas 12M del read model (no por nombre/heurística)", () => {
    assert.ok(VIEW.includes("b.sales12M - a.sales12M"), "orden por sales12M");
    assert.ok(VIEW.includes("TOP_CLIENTES_N"), "N acotado");
  });

  it("Clientes NO es selector de pedido: sin import del flujo de pedido", () => {
    assert.ok(!VIEW.includes("nuevo-pedido-view"), "sin import del editor de pedido");
    assert.ok(!VIEW.includes("preSelectedCustomerId"), "sin prop de picker");
  });
});

describe("Cliente 360 — contenido y acciones", () => {
  it("acciones: Crear pedido abre flujo canónico con cliente autorizado", () => {
    assert.ok(VIEW.includes("onCreateOrder(customerId)"), "handler canónico del shell");
  });

  it("Llamar/WhatsApp solo cuando el teléfono es válido (nunca botón muerto)", () => {
    assert.ok(VIEW.includes("digits.startsWith(\"3\")"), "regla celular CO para WhatsApp");
    assert.ok(VIEW.includes("digits.startsWith(\"573\")"), "indicativo ya incluido");
    assert.ok(VIEW.includes("{tel && ("), "Llamar condicionado");
    assert.ok(VIEW.includes("{wa && ("), "WhatsApp condicionado");
    assert.ok(VIEW.includes("https://wa.me/"), "deep link oficial");
  });

  it("360: estado comercial + ventas 12M + última compra + pedidos recientes", () => {
    for (const s of ["Estado comercial", "Ventas 12M", "Pedidos 12M", "Ult. compra", "Pedidos recientes", "Top productos"]) {
      assert.ok(VIEW.includes(s), `sección/KPI: ${s}`);
    }
  });

  it("tipos compartidos: contacto + ventas 12M en SerializedCustomer", () => {
    for (const f of ["phone: string | null", "email: string | null", "sales12M: number", "orders12M: number"]) {
      assert.ok(SHARED.includes(f), `campo: ${f}`);
    }
  });

  it("ui-kit: iconos phone y whatsapp presentes (SVG stroke, sin emojis)", () => {
    assert.ok(KIT.includes("phone: ("), "icono phone");
    assert.ok(KIT.includes("whatsapp: ("), "icono whatsapp");
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(KIT), "cero emojis en el kit");
  });
});

describe("Servidor — datos 12M y ruta de pedidos recientes", () => {
  it("page: ventas 12M desde CustomerOrderRecord FACTURADO (read model canónico)", () => {
    assert.ok(PAGE.includes('status: "FACTURADO"'), "solo facturado");
    assert.ok(PAGE.includes("_sum: { amount: true }"), "suma de amount");
    assert.ok(PAGE.includes("phone: true"), "contacto seleccionado");
  });

  it("ruta nueva: viewer scope REUTILIZADO (mismo patrón que customer-context)", () => {
    assert.ok(ROUTE.includes("resolveCurrentSeller"), "identidad certificada");
    assert.ok(ROUTE.includes("deriveSellerScope"), "scope derivado, no rediseñado");
    assert.ok(ROUTE.includes("canAccessAllCustomers"), "gate de alcance");
    assert.ok(ROUTE.includes('{ error: "forbidden" }, { status: 403 }'), "403 fuera de alcance");
  });

  it("ruta nueva: read-only, modelo local, join determinista por sagTerceroId", () => {
    const src = strip(ROUTE);
    assert.ok(ROUTE.includes("customerNit: String(customer.sagTerceroId)"), "join exacto");
    assert.ok(!src.includes(".create("), "cero creates");
    assert.ok(!src.includes(".update("), "cero updates");
    assert.ok(!src.includes(".delete("), "cero deletes");
    assert.ok(!src.includes("$executeRaw"), "cero SQL de escritura");
    assert.ok(!src.includes("consultaSagJson"), "cero SOAP");
    assert.ok(!src.includes("getSagConnection"), "cero selección de fuente SAG");
  });
});

describe("GAP GATE — +90 días exige historial de compra real", () => {
  it("server path: el set del filtro exige INACTIVE_90D + fecha + >90 días", () => {
    assert.ok(PAGE.includes('i.classification === "INACTIVE_90D"'), "clasificación del dominio");
    assert.ok(PAGE.includes("i.lastPurchaseDate !== null"), "fecha de compra obligatoria");
    assert.ok(PAGE.includes("(i.daysSinceLastPurchase ?? 0) > 90"), "umbral > 90 estricto");
    // El predicado vive en el server path, no en React:
    assert.ok(!VIEW.includes("NO_PURCHASE_HISTORY"), "la vista no re-clasifica");
  });

  it("360: sin historial NUNCA se muestra como +90 días (estado propio)", () => {
    assert.ok(VIEW.includes("hasPurchaseHistory"), "distinción explícita");
    assert.ok(VIEW.includes("Sin historial de compras"), "chip honesto para sin-historial");
    assert.ok(VIEW.includes(": false;"), "sin fecha → jamás +90d");
  });
});

describe("Top clientes — sanidad del ranking", () => {
  it("métrica sales12M · ventana 12M · FACTURADO · scope antes del ranking", () => {
    assert.ok(PAGE.includes("setUTCFullYear(twelveMonthsAgo.getUTCFullYear() - 1)"), "ventana móvil 12M");
    assert.ok(PAGE.includes('status: "FACTURADO"'), "solo facturado");
    // nitKeys nace de `customers`, que ya pasó por customerFilter (viewer scope):
    const scopeIdx = PAGE.indexOf("const customerFilter");
    const nitIdx = PAGE.indexOf("const nitKeys");
    const aggIdx = PAGE.indexOf("sales12MRows");
    assert.ok(scopeIdx > -1 && scopeIdx < nitIdx && nitIdx < aggIdx,
      "scope aplicado ANTES de derivar nitKeys y del agregado 12M");
  });
});

describe("Exclusiones duras del sprint — intactas por construcción", () => {
  it("la vista no importa servicios excluidos ni AR/routing", () => {
    for (const banned of ["seller-user-mapping", "frontline-attention-service", "canonical-ar", "sag-source-router", "current-order-ingestion"]) {
      assert.ok(!VIEW.includes(banned), `clientes-view sin dependencia de ${banned}`);
    }
  });

  it("la ruta consume el guard existente sin redefinirlo", () => {
    assert.ok(!strip(ROUTE).includes("function deriveSellerScope"), "no redefine el guard");
    assert.ok(!strip(ROUTE).includes("function resolveCurrentSeller"), "no redefine la identidad");
  });
});
