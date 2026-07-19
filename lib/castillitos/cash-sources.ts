/**
 * lib/castillitos/cash-sources.ts
 *
 * SPRINT 1 — CORE CASH: Capa de verdad financiera
 *
 * Pregunta que responde: ¿Dónde está el dinero?
 *
 * Fuente autoritativa: FUENTES 3 (1).csv — Castillitos, 2026-04-28
 *
 * ─── Ley fundamental ────────────────────────────────────────────────────────
 *
 *   F1 = universo oficial  (facturación real, cartera formal, cobros R1/A1)
 *   F2 = universo no oficial (remisiones, cobros R2/A2)
 *
 *   Nunca mezclar F1 + F2.
 *   Nunca sumar como si fueran lo mismo.
 *   Toda lógica respeta esta separación.
 *
 * ─── Fuentes de caja real ───────────────────────────────────────────────────
 *
 *   R1  — Recibo de Caja F1 (cobro oficial). Entra: recaudo, flujo, conciliación.
 *   R2  — Recibo de Caja F2 (cobro remisión). Entra: recaudo operativo F2. Separado.
 *   A1  — Anticipo Cliente Empresa (F1). Entra caja. NO es venta todavía.
 *   A2  — Anticipo Cliente F2.             Entra caja. NO es venta todavía.
 *   AN  — Anticipos Sistecredito (tiendas). Entra caja tienda. Concilia fin de mes.
 *
 * ─── Consignaciones pendientes (puente de conciliación) ─────────────────────
 *
 *   B1  — Consignación pendiente Bancolombia CRT 0711
 *   B2  — Consignación pendiente Banco Bogotá CRT 9945
 *   H1  — Consignación pendiente Bancolombia Ahorros 0313
 *   H2  — Consignación pendiente Bancolombia Ahorros 6827
 *   CP  — Consignaciones pendientes (genérico)
 *
 *   REGLA: dinero recibido SIN IDENTIFICAR.
 *   NO cuentan como cobro final.
 *   NO entran al headline financiero del CEO.
 *   Son puente de conciliación hasta identificarse.
 *
 * ─── Recibos de tienda — solo conciliación con Sistecredito ─────────────────
 *
 *   RC  — Recibo de Caja Centro  (abono Sistecredito en tienda)
 *   RS  — Recibo de Caja San Diego
 *   RG  — Recibo de Caja Gran Plaza
 *   RA  — Recibo de Caja Caldas
 *
 *   REGLA: NO son venta. NO duplican cobros.
 *   Son abonos que clientes hacen de Sistecredito en tienda.
 *   Se concilian con Sistecredito a fin de mes.
 *   excludeFromRevenue = true / excludeFromCashKpi = true
 *   Viven en Conciliación Inteligente, NO en headline ejecutivo.
 *
 * ─── Sistecredito (fuente externa de conciliación) ───────────────────────────
 *
 *   XX  — Sistecredito externo (fuente de conciliación, no fuente comercial)
 *
 *   REGLA: external_reconciliation_source.
 *   Sirve para validar abonos hechos en tienda.
 *   NO como fuente comercial principal.
 *   SÍ como control de recaudo Sistecredito.
 *
 * ─── Clave de negocio ────────────────────────────────────────────────────────
 *
 *   code     = k_sc_codigo_fuente  (clave semántica de negocio, usar para filtros)
 *   kaNiFuente = ka_ni_fuente        (ID técnico de fila — solo para trazabilidad)
 */

// ── Source layers ─────────────────────────────────────────────────────────────

/**
 * Capa de fuente para Sprint 1 Core Cash.
 *
 *   F1_OFICIAL          — Ecosistema de facturación oficial (cobros R1, anticipos A1)
 *   F2_NO_OFICIAL       — Ecosistema de remisiones no oficiales (cobros R2, anticipos A2)
 *   RETAIL_FINANCIERO   — Tiendas físicas con financiamiento externo (Sistecredito / Addi)
 *   PENDING_DEPOSIT     — Consignaciones sin identificar (B1/B2/H1/H2/CP)
 *   RECONCILIATION_ONLY — Abonos Sistecredito en tienda (RC/RS/RG/RA)
 *   EXTERNAL_RECON      — Sistecredito como fuente externa de validación (XX)
 *   EXCLUDED            — Fuentes excluidas del sistema operativo
 */
export type CashSourceLayer =
  | "F1_OFICIAL"
  | "F2_NO_OFICIAL"
  | "RETAIL_FINANCIERO"
  | "PENDING_DEPOSIT"
  | "RECONCILIATION_ONLY"
  | "EXTERNAL_RECON"
  | "EXCLUDED";

// ── Module visibility ─────────────────────────────────────────────────────────

/**
 * Módulos donde la fuente es visible y operativa.
 *
 *   executive     — Torre de Control / dashboard ejecutivo CEO
 *   finance       — Módulo Finanzas (documentos, cierre, cartera)
 *   collections   — Panel de cobranza y recaudo
 *   treasury      — Tesorería (caja real, anticipos por aplicar)
 *   reconciliation — Conciliación Inteligente (solo conciliación, no headline)
 */
export type CashModuleVisibility =
  | "executive"
  | "finance"
  | "collections"
  | "treasury"
  | "reconciliation";

// ── CashSourceRule interface ──────────────────────────────────────────────────

/**
 * Clasificación completa de una fuente de caja para Sprint 1.
 *
 * Clave de negocio: `code` (k_sc_codigo_fuente).
 * ID técnico:       `kaNiFuente` (ka_ni_fuente) — solo para trazabilidad.
 */
export interface CashSourceRule {
  /** Código de negocio (k_sc_codigo_fuente). Clave semántica para filtros. */
  code:                 string;
  /** Identificador técnico de fila (ka_ni_fuente). Solo para trazabilidad. */
  kaNiFuente:           number;
  /** Nombre descriptivo del comprobante. */
  name:                 string;
  /** Capa de fuente en el modelo de datos. */
  sourceLayer:          CashSourceLayer;

  // ── Impact flags ────────────────────────────────────────────────────────

  /**
   * ¿Afecta ingresos por ventas?
   * false para todos los cobros/anticipos/consignaciones (no son venta).
   */
  affectsRevenue:       boolean;
  /**
   * ¿Afecta el recaudo / cobro de cartera?
   * true para R1, R2, A1, A2, AN.
   * false para consignaciones pendientes y recibos de tienda.
   */
  affectsCollections:   boolean;
  /**
   * ¿Afecta la caja real (efectivo disponible)?
   * true para R1, R2, A1, A2, AN.
   * false para consignaciones B1/B2/H1/H2/CP (no identificado).
   * false para RC/RS/RG/RA (hasta conciliar con Sistecredito).
   */
  affectsCash:          boolean;
  /**
   * ¿Participa en conciliación?
   * true para consignaciones, recibos de tienda, R1, R2.
   */
  affectsReconciliation: boolean;

  // ── Exclusion flags ─────────────────────────────────────────────────────

  /**
   * ¿Excluir del headline ejecutivo CEO?
   * true para consignaciones pendientes, recibos de tienda, Sistecredito externo.
   * El CEO NO debe ver dinero no identificado como ingreso.
   */
  excludeFromCEO:       boolean;
  /**
   * ¿Excluir del KPI de revenue (ventas)?
   * true para todas las fuentes de cobro/anticipo/consignación.
   */
  excludeFromRevenue:   boolean;
  /**
   * ¿Excluir del KPI de caja headline?
   * true para consignaciones pendientes y recibos de tienda (hasta conciliar).
   */
  excludeFromCashKpi:   boolean;

  // ── Classification flags ────────────────────────────────────────────────

  /**
   * ¿Dinero recibido pero AÚN sin identificar?
   * true para B1, B2, H1, H2, CP.
   * Presentar como "pendiente por aplicar", nunca como ingreso consolidado.
   */
  pendingIdentification: boolean;
  /**
   * ¿Anticipo pendiente de aplicación a factura?
   * true para A1, A2.
   * Caja sí, pero no cerrar como cobro hasta que se aplique al documento.
   */
  pendingApplication:   boolean;
  /**
   * ¿Pertenece exclusivamente al universo F1 oficial?
   */
  f1Universe:           boolean;
  /**
   * ¿Pertenece exclusivamente al universo F2 no oficial?
   */
  f2Universe:           boolean;
  /**
   * ¿Es fuente externa de conciliación (e.g. Sistecredito)?
   * No es fuente comercial. Sirve para validar abonos en tienda.
   */
  externalReconciliation: boolean;

  // ── Operational metadata ────────────────────────────────────────────────

  /** Unidad / canal propietario de la fuente. */
  owner:                string;
  /**
   * Prioridad operativa dentro del sprint (menor = más crítico para caja).
   * 1 = R1 (cobro oficial, impacto directo en cartera real)
   */
  priority:             number;
  /** Módulos donde la fuente es visible y operativa. */
  moduleVisibility:     CashModuleVisibility[];
  /** Nota de negocio (del Excel Castillitos). */
  note:                 string;
}

// ── Sprint 1 — Registro canónico ──────────────────────────────────────────────

/**
 * Fuentes de caja Sprint 1.
 * Clasificación basada en FUENTES 3 (1).csv — Castillitos 2026-04-28.
 *
 * Orden por prioridad operativa de caja.
 */
export const CASH_SOURCE_RULES: readonly CashSourceRule[] = [

  // ─── R1: Recibo de Caja F1 — cobro oficial ──────────────────────────────
  {
    code:                  "R1",
    kaNiFuente:            4,
    name:                  "Recibo de Caja F1",
    sourceLayer:           "F1_OFICIAL",
    affectsRevenue:        false,
    affectsCollections:    true,
    affectsCash:           true,
    affectsReconciliation: true,
    excludeFromCEO:        false,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    false,
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            true,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              1,
    moduleVisibility:      ["executive", "finance", "collections", "treasury", "reconciliation"],
    note:                  "Pago recibido sobre facturación oficial F1. Impacta recaudo real, flujo de caja y conciliación de cartera.",
  },

  // ─── R2: Recibo de Caja F2 — cobro sobre remisión ───────────────────────
  {
    code:                  "R2",
    kaNiFuente:            94,
    name:                  "Recibo de Caja F2",
    sourceLayer:           "F2_NO_OFICIAL",
    affectsRevenue:        false,
    affectsCollections:    true,
    affectsCash:           true,
    affectsReconciliation: true,
    excludeFromCEO:        false,   // visible pero separado de R1
    excludeFromRevenue:    true,
    excludeFromCashKpi:    false,
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            true,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              2,
    moduleVisibility:      ["finance", "collections", "treasury", "reconciliation"],
    note:                  "Pago recibido sobre remisión no oficial (F2). NO entra en facturación F1. Recaudo operativo F2 — mantener separado de R1 siempre.",
  },

  // ─── A1: Anticipo Cliente Empresa — F1 ──────────────────────────────────
  {
    code:                  "A1",
    kaNiFuente:            122,
    name:                  "Anticipo Cliente Empresa",
    sourceLayer:           "F1_OFICIAL",
    affectsRevenue:        false,   // NO es venta todavía
    affectsCollections:    true,
    affectsCash:           true,
    affectsReconciliation: false,
    excludeFromCEO:        false,   // visible como "anticipos por aplicar"
    excludeFromRevenue:    true,
    excludeFromCashKpi:    false,
    pendingIdentification: false,
    pendingApplication:    true,    // pendiente de aplicar a factura F1
    f1Universe:            true,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              3,
    moduleVisibility:      ["executive", "finance", "treasury"],
    note:                  "Dinero recibido antes de la factura oficial. Impacta tesorería y anticipos por aplicar. NO contar como venta hasta que se cruce con factura F1.",
  },

  // ─── A2: Anticipo Cliente F2 ─────────────────────────────────────────────
  {
    code:                  "A2",
    kaNiFuente:            128,
    name:                  "Anticipo Cliente F2",
    sourceLayer:           "F2_NO_OFICIAL",
    affectsRevenue:        false,   // NO es venta todavía
    affectsCollections:    true,
    affectsCash:           true,
    affectsReconciliation: false,
    excludeFromCEO:        false,   // visible como "anticipos F2 por aplicar"
    excludeFromRevenue:    true,
    excludeFromCashKpi:    false,
    pendingIdentification: false,
    pendingApplication:    true,    // pendiente de aplicar a remisión F2
    f1Universe:            false,
    f2Universe:            true,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              4,
    moduleVisibility:      ["finance", "treasury"],
    note:                  "Anticipo sobre remisión F2. Misma lógica que A1 pero en universo no oficial. NO venta todavía. Sí caja. Separado de A1.",
  },

  // ─── AN: Anticipos Clientes Sistecredito (tiendas) ───────────────────────
  {
    code:                  "AN",
    kaNiFuente:            12,
    name:                  "Anticipos Clientes Sistecredito",
    sourceLayer:           "RETAIL_FINANCIERO",
    affectsRevenue:        false,
    affectsCollections:    true,
    affectsCash:           true,
    affectsReconciliation: true,    // concilia a fin de mes con Sistecredito
    excludeFromCEO:        false,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    false,
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            true,    // fuente oficial
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "TIENDAS",
    priority:              5,
    moduleVisibility:      ["executive", "finance", "collections", "treasury", "reconciliation"],
    note:                  "Anticipos de clientes en tiendas físicas vía Sistecredito. Afecta efectivo de tiendas en el momento del recaudo. Se concilia a fin de mes con Sistecredito.",
  },

  // ─── B1: Consignación pendiente — Bancolombia CRT 0711 ───────────────────
  {
    code:                  "B1",
    kaNiFuente:            148,
    name:                  "Consignación Pendiente Bancolombia CRT 0711",
    sourceLayer:           "PENDING_DEPOSIT",
    affectsRevenue:        false,
    affectsCollections:    false,   // NO es cobro cerrado
    affectsCash:           false,   // NO caja confirmada hasta identificar
    affectsReconciliation: true,
    excludeFromCEO:        true,    // NUNCA como ingreso en headline ejecutivo
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: true,    // dinero recibido SIN IDENTIFICAR
    pendingApplication:    false,
    f1Universe:            false,   // puede ser F1 o F2, aún sin clasificar
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              10,
    moduleVisibility:      ["reconciliation", "treasury", "finance"],
    note:                  "Dinero recibido sin identificar en Bancolombia CRT 0711. NO cuenta como cobro final. Puente de conciliación — presentar como 'pendiente por aplicar' hasta conciliar.",
  },

  // ─── B2: Consignación pendiente — Banco Bogotá CRT 9945 ──────────────────
  {
    code:                  "B2",
    kaNiFuente:            149,
    name:                  "Consignación Pendiente Banco Bogotá CRT 9945",
    sourceLayer:           "PENDING_DEPOSIT",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: true,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              11,
    moduleVisibility:      ["reconciliation", "treasury", "finance"],
    note:                  "Dinero recibido sin identificar en Banco Bogotá CRT 9945. Misma regla que B1.",
  },

  // ─── H1: Consignación pendiente — Bancolombia Ahorros 0313 ───────────────
  {
    code:                  "H1",
    kaNiFuente:            150,
    name:                  "Consignación Pendiente Bancolombia Ahorros 0313",
    sourceLayer:           "PENDING_DEPOSIT",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: true,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              12,
    moduleVisibility:      ["reconciliation", "treasury", "finance"],
    note:                  "Dinero recibido sin identificar en Bancolombia Ahorros 0313. Misma regla que B1.",
  },

  // ─── H2: Consignación pendiente — Bancolombia Ahorros 6827 ───────────────
  {
    code:                  "H2",
    kaNiFuente:            151,
    name:                  "Consignación Pendiente Bancolombia Ahorros 6827",
    sourceLayer:           "PENDING_DEPOSIT",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: true,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              13,
    moduleVisibility:      ["reconciliation", "treasury", "finance"],
    note:                  "Dinero recibido sin identificar en Bancolombia Ahorros 6827. Misma regla que B1.",
  },

  // ─── CP: Consignaciones Pendientes (genérico) ────────────────────────────
  {
    code:                  "CP",
    kaNiFuente:            152,
    name:                  "Consignaciones Pendientes",
    sourceLayer:           "PENDING_DEPOSIT",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: true,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "EMPRESA",
    priority:              14,
    moduleVisibility:      ["reconciliation", "treasury", "finance"],
    note:                  "Consignaciones sin clasificar banco/cuenta. Genérico. Misma regla que B1/B2/H1/H2.",
  },

  // ─── RC: Recibo de Caja Centro — solo conciliación Sistecredito ──────────
  {
    code:                  "RC",
    kaNiFuente:            174,
    name:                  "Recibo de Caja Centro",
    sourceLayer:           "RECONCILIATION_ONLY",
    affectsRevenue:        false,
    affectsCollections:    false,   // NO duplicar cobros
    affectsCash:           false,   // excluir hasta conciliar con Sistecredito
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,    // hasta conciliación correcta
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "TIENDA_CENTRO",
    priority:              20,
    moduleVisibility:      ["reconciliation"],
    note:                  "Abono Sistecredito recibido en tienda Centro. Informativo. Afecta efectivo de tienda en el momento del recaudo. Se concilia a fin de mes con Sistecredito. NO es venta. NO duplicar cobros.",
  },

  // ─── RS: Recibo de Caja San Diego — solo conciliación ────────────────────
  {
    code:                  "RS",
    kaNiFuente:            108,
    name:                  "Recibo de Caja San Diego",
    sourceLayer:           "RECONCILIATION_ONLY",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "TIENDA_SANDIEGO",
    priority:              21,
    moduleVisibility:      ["reconciliation"],
    note:                  "Abono Sistecredito recibido en tienda San Diego. Misma regla que RC.",
  },

  // ─── RG: Recibo de Caja Gran Plaza — solo conciliación ───────────────────
  {
    code:                  "RG",
    kaNiFuente:            178,
    name:                  "Recibo de Caja Gran Plaza",
    sourceLayer:           "RECONCILIATION_ONLY",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "TIENDA_GRANPLAZA",
    priority:              22,
    moduleVisibility:      ["reconciliation"],
    note:                  "Abono Sistecredito recibido en tienda Gran Plaza. Misma regla que RC.",
  },

  // ─── RA: Recibo de Caja Caldas — solo conciliación ───────────────────────
  {
    code:                  "RA",
    kaNiFuente:            198,
    name:                  "Recibo de Caja Caldas",
    sourceLayer:           "RECONCILIATION_ONLY",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: false,
    owner:                 "TIENDA_CALDAS",
    priority:              23,
    moduleVisibility:      ["reconciliation"],
    note:                  "Abono Sistecredito recibido en tienda Caldas. Misma regla que RC.",
  },

  // ─── XX: Sistecredito — fuente externa de conciliación ───────────────────
  {
    code:                  "XX",
    kaNiFuente:            112,
    name:                  "Sistecredito",
    sourceLayer:           "EXTERNAL_RECON",
    affectsRevenue:        false,
    affectsCollections:    false,
    affectsCash:           false,
    affectsReconciliation: true,
    excludeFromCEO:        true,
    excludeFromRevenue:    true,
    excludeFromCashKpi:    true,
    pendingIdentification: false,
    pendingApplication:    false,
    f1Universe:            false,
    f2Universe:            false,
    externalReconciliation: true,   // fuente externa de conciliación
    owner:                 "SISTECREDITO",
    priority:              30,
    moduleVisibility:      ["reconciliation"],
    note:                  "Sistecredito como fuente externa de conciliación. NO fuente comercial. Sirve para validar abonos hechos en tienda. Control de recaudo. No es venta.",
  },
] as const;

// ── Índices de lookup ─────────────────────────────────────────────────────────

const _byCode = new Map<string, CashSourceRule>();
for (const r of CASH_SOURCE_RULES) {
  _byCode.set(r.code.toUpperCase(), r);
}

/** Busca una fuente de caja por código de negocio (k_sc_codigo_fuente). */
export function getCashSourceByCode(code: string): CashSourceRule | undefined {
  return _byCode.get(code.toUpperCase());
}

/** True si el código existe en el registro Sprint 1. */
export function isCashSource(code: string): boolean {
  return _byCode.has(code.toUpperCase());
}

// ── Sets de códigos por propósito ─────────────────────────────────────────────
// Usar estos sets directamente en queries SQL/Prisma para filtrar correctamente.

/**
 * Códigos que afectan CAJA REAL (effectiveCash = true).
 * Para KPI "Caja recibida": R1, R2, A1, A2, AN.
 * Separar por universo usando getF1CashCodes() / getF2CashCodes() si se necesita pureza.
 */
export const CASH_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.affectsCash).map(r => r.code),
);

/**
 * Códigos de caja F1 ÚNICAMENTE.
 * Para headline ejecutivo oficial: R1, A1.
 * NUNCA mezclar con F2.
 */
export const F1_CASH_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.affectsCash && r.f1Universe).map(r => r.code),
);

/**
 * Códigos de caja F2 ÚNICAMENTE.
 * Para recaudo operativo F2: R2, A2.
 * NUNCA mezclar con F1.
 */
export const F2_CASH_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.affectsCash && r.f2Universe).map(r => r.code),
);

/**
 * Códigos de COBROS que afectan recaudo.
 * Para KPI "Recaudo aplicado": R1, R2, A1, A2, AN (con separación F1/F2).
 */
export const COLLECTION_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.affectsCollections).map(r => r.code),
);

/**
 * Códigos de cobros F1 oficiales.
 * Para recaudo formal de cartera: R1, A1, AN.
 */
export const F1_COLLECTION_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.affectsCollections && (r.f1Universe || r.sourceLayer === "RETAIL_FINANCIERO")).map(r => r.code),
);

/**
 * Códigos de cobros F2.
 * Para recaudo sobre remisiones: R2, A2.
 */
export const F2_COLLECTION_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.affectsCollections && r.f2Universe).map(r => r.code),
);

/**
 * Códigos de CONSIGNACIONES PENDIENTES.
 * Para KPI "Consignaciones pendientes": B1, B2, H1, H2, CP.
 * Presentar como "pendiente por aplicar", NUNCA como ingreso consolidado.
 */
export const PENDING_DEPOSIT_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.pendingIdentification).map(r => r.code),
);

/**
 * Códigos de ANTICIPOS por aplicar.
 * Para KPI "Anticipos por aplicar": A1, A2.
 * Son caja real pero NO cobro cerrado hasta cruzar con documento.
 */
export const PENDING_APPLICATION_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.pendingApplication).map(r => r.code),
);

/**
 * Códigos de SOLO CONCILIACIÓN (recibos de tienda Sistecredito).
 * Para Conciliación Inteligente: RC, RS, RG, RA.
 * NUNCA en headline financiero.
 */
export const RECONCILIATION_ONLY_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.sourceLayer === "RECONCILIATION_ONLY").map(r => r.code),
);

/**
 * Todos los códigos que participan en conciliación (incluyendo pendientes y tienda).
 */
export const ALL_RECONCILIATION_CODES = new Set(
  CASH_SOURCE_RULES.filter(r => r.affectsReconciliation).map(r => r.code),
);

/**
 * Códigos que van al KPI ejecutivo de caja (excluye pendientes y recibos de tienda).
 * Para dashboard CEO: solo lo que se puede mostrar como caja real confirmada.
 */
export const EXECUTIVE_CASH_CODES = new Set(
  CASH_SOURCE_RULES
    .filter(r => r.affectsCash && !r.excludeFromCEO)
    .map(r => r.code),
);

// ── Helpers de clasificación ─────────────────────────────────────────────────

/** ¿El código afecta caja real? */
export function affectsCash(code: string): boolean {
  return CASH_CODES.has(code.toUpperCase());
}

/** ¿El código afecta recaudo/cobros? */
export function affectsCollections(code: string): boolean {
  return COLLECTION_CODES.has(code.toUpperCase());
}

/** ¿El código es una consignación pendiente sin identificar? */
export function isPendingDeposit(code: string): boolean {
  return PENDING_DEPOSIT_CODES.has(code.toUpperCase());
}

/** ¿El código es un anticipo pendiente de aplicar? */
export function isPendingApplication(code: string): boolean {
  return PENDING_APPLICATION_CODES.has(code.toUpperCase());
}

/** ¿El código es solo conciliación (recibo tienda Sistecredito)? */
export function isReconciliationOnly(code: string): boolean {
  return RECONCILIATION_ONLY_CODES.has(code.toUpperCase());
}

/** ¿El código debe excluirse del headline ejecutivo? */
export function isExcludedFromCEO(code: string): boolean {
  return getCashSourceByCode(code)?.excludeFromCEO ?? false;
}

/** ¿El código pertenece al universo F1 oficial? */
export function isF1CashCode(code: string): boolean {
  return F1_CASH_CODES.has(code.toUpperCase());
}

/** ¿El código pertenece al universo F2 no oficial? */
export function isF2CashCode(code: string): boolean {
  return F2_CASH_CODES.has(code.toUpperCase());
}

// ── Query helpers: arrays para filtros Prisma/SQL ────────────────────────────

/**
 * Array de códigos de caja real para usar en:
 * `WHERE "comprobanteCode" IN (${getCashCodeArray().map(() => '?').join(',')})`
 */
export function getCashCodeArray():          string[] { return [...CASH_CODES]; }
export function getF1CashCodeArray():        string[] { return [...F1_CASH_CODES]; }
export function getF2CashCodeArray():        string[] { return [...F2_CASH_CODES]; }
export function getCollectionCodeArray():    string[] { return [...COLLECTION_CODES]; }
export function getF1CollectionCodeArray():  string[] { return [...F1_COLLECTION_CODES]; }
export function getF2CollectionCodeArray():  string[] { return [...F2_COLLECTION_CODES]; }
export function getPendingDepositArray():    string[] { return [...PENDING_DEPOSIT_CODES]; }
export function getPendingApplicationArray(): string[] { return [...PENDING_APPLICATION_CODES]; }
export function getReconciliationOnlyArray(): string[] { return [...RECONCILIATION_ONLY_CODES]; }
export function getExecutiveCashArray():     string[] { return [...EXECUTIVE_CASH_CODES]; }

// ── Invariant documentation (no runtime enforcement needed) ──────────────────
//
//  F1_CASH_CODES  ∩  F2_CASH_CODES  = ∅   (nunca mezclar)
//  PENDING_DEPOSIT ∩ CASH_CODES     = ∅   (pendiente ≠ caja confirmada)
//  RECON_ONLY      ∩ CASH_CODES     = ∅   (recibos de tienda ≠ caja headline)
//  EXECUTIVE_CASH_CODES ⊆ CASH_CODES       (CEO ve subconjunto de caja)
