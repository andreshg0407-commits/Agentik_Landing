/**
 * lib/castillitos/source-rules.ts
 *
 * Capa de configuración source-aware para Torre de Control (Executive OS).
 *
 * Gobierno de datos: FUENTES.xlsx (Castillitos, 2026-04-20)
 *
 *   codigoFuente (k_sc_codigo_fuente) = clave semántica de negocio.
 *     Es el código con el que opera la Torre de Control para clasificar
 *     documentos, filtrar queries y agrupar por vista. Un mismo codigoFuente
 *     puede tener varias filas técnicas (distintos kaNiFuente): eso significa
 *     que una fuente de negocio tiene múltiples variantes técnicas — no que
 *     el código sea ambiguo.
 *
 *   kaNiFuente (ka_ni_fuente) = identificador técnico de fila / trazabilidad.
 *     Siempre único en el Excel. Usar únicamente para trazar una regla concreta
 *     hasta su fila original. No usar como clave de clasificación operativa.
 *
 *   Regla: NUNCA identificar una fuente solo por nombre; los nombres pueden
 *          repetirse o venir mal escritos. Usar codigoFuente como clave de
 *          negocio; kaNiFuente para trazabilidad técnica.
 *
 * Este módulo es un wrapper semántico sobre CASTILLITOS_SOURCE_SEMANTIC_RULES.
 * NO duplica el registro — delega a lib/sag/master-data/source-semantic-rules.ts.
 *
 * Cada vista del Executive OS (Consolidado / Empresa / F2 / Tiendas / Web)
 * tiene su propio subconjunto de fuentes. Los helpers de este módulo permiten
 * obtener los códigos correctos por vista sin hardcodear listas en los queries.
 *
 * Toda fuente incompleta o sin confirmar lleva reviewStatus: "pending_castillitos".
 * Nunca asumir clasificación sin confirmación del equipo Castillitos.
 */

import {
  CASTILLITOS_SOURCE_SEMANTIC_RULES,
  type SourceSemanticRule,
  CODIGOS_EMPRESA_ACTIVOS,
  CODIGOS_ALMACEN_ACTIVOS,
  CODIGOS_WEB_ACTIVOS,
  CODIGOS_COBROS_EMPRESA,
  CODIGOS_COBROS_ALMACEN_ACTIVOS,
  CODIGOS_RETAIL_FINANCIERO,
  CODIGOS_ARKETOPS,
} from "@/lib/sag/master-data/source-semantic-rules";
import {
  PENDING_DEPOSIT_SOURCES,
  NA_ELIMINATED_CODES,
} from "@/lib/financial/source-registry";

// ── Vista ejecutiva ────────────────────────────────────────────────────────────

/**
 * Vistas del Executive OS (Torre de Control).
 * Espejo del tipo OperationalView en executive/page.tsx — definido aquí
 * para que la capa lib no dependa de un componente Next.js.
 */
export type ExecutiveView =
  | "consolidado"
  | "empresa"
  | "f2"
  | "tiendas"
  | "web";

// ── SourceRule: interfaz canónica por vista ────────────────────────────────────

/**
 * Regla de fuente vista desde el Executive OS.
 * Derivada de SourceSemanticRule; añade metadata de revisión.
 *
 * Clave de negocio: code (codigoFuente) — con la que opera la Torre de Control.
 *   Un mismo code puede tener varias filas técnicas (distintos sourceId): es
 *   correcto y esperado — representa variantes técnicas de una misma fuente.
 *
 * ID técnico: sourceId (kaNiFuente) — para trazabilidad hasta el Excel original.
 */
export interface SourceRule {
  /**
   * Código de negocio (k_sc_codigo_fuente).
   * Clave semántica principal para clasificación operativa y filtrado de queries.
   * Puede haber varias filas técnicas con el mismo code (distintos sourceId).
   */
  code:             string;
  /**
   * Identificador técnico de fila (ka_ni_fuente). Siempre único en el Excel.
   * Usar solo para trazabilidad — no como clave de clasificación de negocio.
   */
  sourceId:         number;
  /** Nombre descriptivo del documento (sc_nombre_fuente). */
  name:             string;
  /**
   * Clasificación de capa de dato.
   * Valores: SAG_OFICIAL | SAG_NO_OFICIAL | SAG_ARKETOPS | SAG_PRODUCCION |
   *          SAG_INVENTARIO | EXCLUIDO
   */
  classification:   string;
  /**
   * Canal / unidad operativa que genera el documento.
   * Valores: EMPRESA | ALMACEN | WEB | MIXTO | NO_APLICA
   */
  unit:             string;
  /**
   * Tipo de documento (familia contable).
   * Valores: VENTA | REMISION_DESPACHO | DEVOLUCION_VENTA | PAGO_CLIENTE |
   *          COMPRA | GASTO | BANCO | COBRO | etc.
   */
  type:             string;
  /** ¿Contribuye a métricas de ventas brutas? (participaEnVentas) */
  affectsSales:     boolean;
  /** ¿Participa en cobros / recaudo? (moduloDashboard === "COBROS") */
  affectsCollections: boolean;
  /** ¿Visible en el panel ejecutivo principal? false = ARKETOPS / excluido. */
  visible:          boolean;
  /** ¿Es una fuente activa hoy en operaciones normales? (estadoUso === "ACTIVE") */
  active:           boolean;
  /** ¿Solo tiene relevancia histórica? (estadoUso === "HISTORICAL") */
  historyOnly:      boolean;
  /** Nota del Excel (columna Nota). null si no aplica. */
  observation:      string | null;
  /**
   * Estado de revisión contable.
   *   "confirmed"           — clasificación confirmada con Castillitos.
   *   "pending_castillitos" — pendiente de confirmación; no usar en queries definitivas.
   *   "exclude"             — excluir siempre (ARKETOPS, obsoleto, N/A).
   */
  reviewStatus:     "confirmed" | "pending_castillitos" | "exclude";
}

// ── Adaptador ─────────────────────────────────────────────────────────────────

function toSourceRule(r: SourceSemanticRule): SourceRule {
  const isArketops  = r.capaDato === "SAG_ARKETOPS" || r.businessOwner === "ARKETOPS";
  const isExcluded  = r.estadoUso === "EXCLUDED" || r.capaDato === "EXCLUIDO";
  const needsReview = r.needsAccountingReview === true;

  let reviewStatus: SourceRule["reviewStatus"];
  if (isArketops || isExcluded) {
    reviewStatus = "exclude";
  } else if (needsReview) {
    reviewStatus = "pending_castillitos";
  } else {
    reviewStatus = "confirmed";
  }

  return {
    code:               r.codigoFuente,
    sourceId:           r.kaNiFuente,
    name:               r.nombreFuente,
    classification:     r.capaDato,
    unit:               r.canalOperacion,
    type:               r.familiaDocumento,
    affectsSales:       r.participaEnVentas,
    affectsCollections: r.moduloDashboard === "COBROS",
    visible:            r.visibleInExecutive !== false,
    active:             r.estadoUso === "ACTIVE",
    historyOnly:        r.estadoUso === "HISTORICAL",
    observation:        r.nota,
    reviewStatus,
  };
}

// ── Registro completo mapeado ──────────────────────────────────────────────────

/** Todas las fuentes Castillitos como SourceRule[]. Derivado de CASTILLITOS_SOURCE_SEMANTIC_RULES. */
export const ALL_SOURCE_RULES: readonly SourceRule[] =
  CASTILLITOS_SOURCE_SEMANTIC_RULES.map(toSourceRule);

// ── Lookup rápido por código (codigoFuente) ───────────────────────────────────

// Índice de negocio: codigoFuente → SourceRule[].
// Un mismo código puede corresponder a N filas técnicas (distintos kaNiFuente):
// una fuente de negocio con variantes de configuración o períodos distintos.
const _byCode = new Map<string, SourceRule[]>();
for (const r of ALL_SOURCE_RULES) {
  const list = _byCode.get(r.code) ?? [];
  list.push(r);
  _byCode.set(r.code, list);
}

// Índice técnico: kaNiFuente → SourceRule. Único. Solo para trazabilidad.
const _bySourceId = new Map<number, SourceRule>();
for (const r of ALL_SOURCE_RULES) {
  _bySourceId.set(r.sourceId, r);
}

// ── Lookups públicos ───────────────────────────────────────────────────────────

/**
 * Lookup de negocio principal.
 * Devuelve todas las filas que comparten un codigoFuente.
 * Múltiples resultados = variantes técnicas de una misma fuente de negocio.
 */
export function rulesByCode(code: string): SourceRule[] {
  return _byCode.get(code.toUpperCase()) ?? _byCode.get(code) ?? [];
}

/**
 * Lookup de trazabilidad técnica.
 * Busca una fila concreta por su identificador único de Excel (kaNiFuente).
 * Usar solo para auditoría o debugging — no para lógica de clasificación.
 */
export function ruleBySourceId(sourceId: number): SourceRule | undefined {
  return _bySourceId.get(sourceId);
}

// ── Código → codigoFuente sets para filtrado rápido ──────────────────────────

const _codeSet = (codes: readonly string[]) => new Set(codes.map(c => c.toUpperCase()));

const SET_EMPRESA_VENTAS    = _codeSet(CODIGOS_EMPRESA_ACTIVOS);
const SET_ALMACEN_VENTAS    = _codeSet(CODIGOS_ALMACEN_ACTIVOS);
const SET_WEB_VENTAS        = _codeSet(CODIGOS_WEB_ACTIVOS);
const SET_COBROS_EMPRESA    = _codeSet(CODIGOS_COBROS_EMPRESA);
const SET_COBROS_ALMACEN    = _codeSet(CODIGOS_COBROS_ALMACEN_ACTIVOS);
// Filter CODIGOS_RETAIL_FINANCIERO through financial registry to exclude SI.
// SI (ka_ni=111) is NA_ELIMINATED_CODES — EXCLUIR TOTALMENTE per FUENTES.xlsx.
const SET_RETAIL_FINANCIERO = _codeSet(
  CODIGOS_RETAIL_FINANCIERO.filter(c => !NA_ELIMINATED_CODES.includes(c)),
);
const SET_CONSIGNACIONES    = _codeSet([...PENDING_DEPOSIT_SOURCES]);
const SET_ARKETOPS          = _codeSet(CODIGOS_ARKETOPS);

// ── Predicados de clasificación ───────────────────────────────────────────────

/**
 * ¿El código corresponde a una fuente oficial (FUENTE_1 / SAG_OFICIAL)?
 * Incluye facturas de venta activas e históricas de todos los canales.
 */
export function isOfficialSource(code: string): boolean {
  const upper = code.toUpperCase();
  const rules = _byCode.get(upper) ?? _byCode.get(code) ?? [];
  return rules.some(r => r.classification === "SAG_OFICIAL");
}

/**
 * ¿El código corresponde a una fuente F2 (FUENTE_2 / remisión-despacho)?
 * SAG_NO_OFICIAL con familiaDocumento REMISION_DESPACHO.
 */
export function isF2Source(code: string): boolean {
  const upper = code.toUpperCase();
  const rules = _byCode.get(upper) ?? _byCode.get(code) ?? [];
  return rules.some(r => r.classification === "SAG_NO_OFICIAL" && r.type === "REMISION_DESPACHO");
}

/**
 * ¿El código corresponde a una fuente de almacén (tiendas físicas)?
 * Incluye ventas y cobros de puntos de venta.
 */
export function isStoreSource(code: string): boolean {
  const upper = code.toUpperCase();
  return SET_ALMACEN_VENTAS.has(upper) || SET_COBROS_ALMACEN.has(upper) || SET_RETAIL_FINANCIERO.has(upper);
}

/**
 * ¿El código corresponde a una fuente web (e-commerce)?
 */
export function isWebSource(code: string): boolean {
  return SET_WEB_VENTAS.has(code.toUpperCase());
}

/**
 * ¿El código debe excluirse del dashboard ejecutivo?
 * True para ARKETOPS, fuentes excluidas, y códigos sin clasificación Castillitos.
 */
export function isExcludedSource(code: string): boolean {
  return SET_ARKETOPS.has(code.toUpperCase());
}

// ── Filtros por vista ─────────────────────────────────────────────────────────

/** SourceRule[] activos y confirmados para una vista ejecutiva. */
export function getSourceRulesForView(view: ExecutiveView): SourceRule[] {
  switch (view) {
    case "consolidado":
      // Toda fuente Castillitos visible y no excluida (activas + históricas)
      return ALL_SOURCE_RULES.filter(
        r => r.visible && r.reviewStatus !== "exclude",
      );

    case "empresa":
      // Ventas empresa (FE + históricas) + cobros empresa (R1, R2)
      return ALL_SOURCE_RULES.filter(r => {
        const up = r.code.toUpperCase();
        return (
          r.reviewStatus !== "exclude" &&
          (SET_EMPRESA_VENTAS.has(up) || SET_COBROS_EMPRESA.has(up))
        );
      });

    case "f2":
      // Remisiones / despachos F2 (SAG_NO_OFICIAL, familiaDocumento REMISION_DESPACHO)
      return ALL_SOURCE_RULES.filter(
        r => r.classification === "SAG_NO_OFICIAL" && r.type === "REMISION_DESPACHO",
      );

    case "tiendas":
      // Ventas almacén + cobros almacén + retail financiero (Addi / Sistecredit)
      return ALL_SOURCE_RULES.filter(r => {
        const up = r.code.toUpperCase();
        return (
          r.reviewStatus !== "exclude" &&
          (SET_ALMACEN_VENTAS.has(up) || SET_COBROS_ALMACEN.has(up) || SET_RETAIL_FINANCIERO.has(up))
        );
      });

    case "web":
      // Ventas web (FW + notas crédito web si existen)
      return ALL_SOURCE_RULES.filter(r => {
        const up = r.code.toUpperCase();
        return r.reviewStatus !== "exclude" && SET_WEB_VENTAS.has(up);
      });
  }
}

// ── Códigos por vista ─────────────────────────────────────────────────────────

/**
 * Códigos de fuente (codigoFuente) de ventas para una vista.
 * Usar en: `"comprobanteCode" IN (...)` dentro de queries de ventas.
 */
export function getSalesSourceCodes(view: ExecutiveView): string[] {
  switch (view) {
    case "consolidado":
      return ALL_SOURCE_RULES
        .filter(r => r.affectsSales && r.reviewStatus !== "exclude")
        .map(r => r.code);

    case "empresa":
      return [...CODIGOS_EMPRESA_ACTIVOS];

    case "f2":
      return ALL_SOURCE_RULES
        .filter(r => r.classification === "SAG_NO_OFICIAL" && r.type === "REMISION_DESPACHO")
        .map(r => r.code);

    case "tiendas":
      return [...CODIGOS_ALMACEN_ACTIVOS];

    case "web":
      return [...CODIGOS_WEB_ACTIVOS];
  }
}

/**
 * Códigos de fuente (codigoFuente) de cobros / recaudo para una vista.
 * Usar en: `"comprobanteCode" IN (...)` dentro de queries de cobros.
 *
 * Nota: F2 no tiene cobros formales propios (las remisiones no generan cartera).
 */
export function getCollectionSourceCodes(view: ExecutiveView): string[] {
  switch (view) {
    case "consolidado":
      return [
        ...CODIGOS_COBROS_EMPRESA,
        ...CODIGOS_COBROS_ALMACEN_ACTIVOS,
        ...CODIGOS_RETAIL_FINANCIERO.filter(c => !NA_ELIMINATED_CODES.includes(c)),
      ];

    case "empresa":
      return [...CODIGOS_COBROS_EMPRESA];

    case "f2":
      // Las remisiones F2 no generan cartera formal ni cobros directos.
      return [];

    case "tiendas":
      return [
        ...CODIGOS_COBROS_ALMACEN_ACTIVOS,
        ...CODIGOS_RETAIL_FINANCIERO.filter(c => !NA_ELIMINATED_CODES.includes(c)),
      ];

    case "web":
      // TODO: awaiting Castillitos source confirmation — cobros web no identificados aún.
      // Si existen recibos de caja web, agregarlos aquí cuando se confirmen.
      return [];
  }
}

/**
 * Códigos de consignaciones pendientes de identificar.
 * Dinero recibido pero NO conciliado — NO contar como cobro final en ninguna vista.
 * Presentar en panel de Bancos / Tesorería como "pendiente de identificar".
 */
export function getPendingDepositSourceCodes(): string[] {
  return [...PENDING_DEPOSIT_SOURCES];
}

// ══════════════════════════════════════════════════════════════════════════════
// PYA SOURCE GOVERNANCE — Sprint Data Foundation 2026-04-29
//
// PRINCIPIO:  PEDIDO ≠ VENTA ≠ FACTURA ≠ COBRO ≠ CAJA ≠ CONCILIACIÓN
//             EMPRESA ≠ ALMACENES ≠ WEB · F1 ≠ F2 (nunca sumar en misma métrica)
//
// Entregable 1: PyaSourceRecord — 20+ campos de gobierno por fuente
// Entregable 2: Helpers seguros por capa de negocio
// Entregable 3: Audit flags integrados (reviewStatus + notes)
// Entregable 4: reviewStatus "pending_castillitos" en fuentes sin confirmar
// Entregable 5: getSourceReadinessSummary() — qué está listo para B1/B2/B3/B4
// ══════════════════════════════════════════════════════════════════════════════

// ── Capa de negocio PYA ────────────────────────────────────────────────────

/**
 * Capa de negocio que afecta un documento SAG en el contexto Castillitos.
 *
 * Separación explícita de dimensiones:
 *   ORDERS      → pipeline de pedidos, sin efecto financiero (PD)
 *   DISPATCH    → despacho/ajuste logístico, sin efecto financiero (AP, F2)
 *   INVOICING_F1 → facturación oficial que genera cartera F1 (FE, FD, FC, FG, FA, FW)
 *   INVOICING_F2 → remisión/despacho — no es ingreso hasta conversión a factura
 *   COLLECTION_F1 → recaudo oficial que cierra cartera F1 (R1, A1, AN)
 *   COLLECTION_F2 → recaudo F2 operativo — NUNCA sumar a métricas F1 (R2, A2)
 *   STORE_RECON  → abonos Sistecredit tienda (RC/RS/RG/RA) — solo conciliación
 *   PENDING_CASH → consignaciones sin identificar (B1/B2/H1/H2/CP) — tránsito
 *   CREDIT_NOTE  → nota crédito / devolución — reduce cartera o ventas
 *   GIFT_CARD    → bonos/gift cards — poco confiable, excluir CEO cockpit
 */
export type PyaBusinessLayer =
  | "ORDERS"           // PD — compromiso de compra, sin efecto financiero
  | "DISPATCH"         // AP, F2 remisiones — logística, sin efecto financiero hasta conversión
  | "INVOICING_F1"     // FE, FD, FC, FG, FA, FW — factura oficial, genera cartera F1
  | "INVOICING_F2"     // Remisiones — no ingreso hasta conversión
  | "COLLECTION_F1"    // R1, A1, AN — cierra cartera F1
  | "COLLECTION_F2"    // R2, A2 — NUNCA sumar a F1
  | "STORE_RECON"      // RC, RS, RG, RA — solo conciliación, NO cobro cerrado
  | "PENDING_CASH"     // B1, B2, H1, H2, CP — tránsito bancario
  | "CREDIT_NOTE"      // ND, NF, NA, NG, NS, NT, NE, NC, NW, D1, D2 — reduce cartera/ventas
  | "GIFT_CARD"        // BN — no confiable para CEO cockpit
  | "BANKING"          // AJ, DB, CB — movimientos bancarios generales
  | "PURCHASING"       // C1, G1, E1, DC, DG — compras / CxP
  | "INVENTORY"        // IF, AI, TR — inventario físico
  | "PRODUCTION"       // OP, CN, PT, ... — producción interna
  | "PAYROLL"          // NO — nómina
  | "ARKETOPS"         // S1-S4, CI, DE, AD, ... — asientos internos, excluir siempre
  | "DEPRECATED"       // HISTORICAL — solo para saldos anteriores
  | "EXCLUDED";        // N/A, técnicos — excluir completamente

// ── Significados de negocio por código ────────────────────────────────────
// Overrides semánticos para los códigos clave identificados con Castillitos.

const _PYA_MEANINGS: Readonly<Record<string, string>> = {
  // Pedidos — NO financiero
  PD:  "PEDIDO CLIENTE — compromiso de compra. NO es venta ni factura. NO genera cartera. Solo entra a pipeline de pedidos.",
  PP:  "PRUEBAS PEDIDOS — histórico de pruebas. Deprecado. Nunca usar en dashboards activos.",
  AP:  "AJUSTE PEDIDO — tracking de despacho / modificación de orden. Informativo. NO genera movimiento financiero.",
  // Facturación F1
  FE:  "FACTURA ELECTRÓNICA EMPRESA — venta oficial B2B. Genera cartera F1 empresa.",
  FD:  "FACTURA ELECTRÓNICA SAN DIEGO — venta almacén San Diego. Genera cartera F1 tienda.",
  FC:  "FACTURA ELECTRÓNICA CENTRO — venta almacén Centro. Genera cartera F1 tienda.",
  FG:  "FACTURA ELECTRÓNICA GRAN PLAZA — venta almacén Gran Plaza. Genera cartera F1 tienda.",
  FA:  "FACTURA ELECTRÓNICA CALDAS — venta almacén Caldas. Genera cartera F1 tienda.",
  FW:  "FACTURA ELECTRÓNICA WEB — venta e-commerce. Genera cartera F1 web.",
  // Recaudo F1 oficial
  R1:  "RECIBO DE CAJA F1 — cobro oficial. Cierra cartera F1 (empresa + almacenes general).",
  A1:  "ANTICIPO EMPRESA F1 — anticipo recibido empresa. Caja real. Pendiente de cruzar con factura F1.",
  AN:  "ANTICIPO SISTECREDIT — anticipo financiamiento retail. Oficial. Pendiente de cruce con factura. REVISAR: confirmar separación empresa/tienda con Castillitos.",
  SI:  "SISTECREDIT — cobro vía financiador externo. Caja real, canal Sistecredit.",
  // Recaudo F2 — NUNCA sumar a F1
  R2:  "RECIBO DE CAJA F2 — cobro F2 operativo no oficial. NUNCA sumar a R1 en métricas CEO.",
  A2:  "ANTICIPO F2 — anticipo no oficial. Caja real. NUNCA sumar a anticipos F1.",
  // Abonos tienda — SOLO conciliación, NO cobro cerrado
  RC:  "RECIBO CAJA CENTRO — abono Sistecredit tienda Centro. SOLO conciliación. NO cobro cerrado. NO incluir en cobros CEO.",
  RS:  "RECIBO CAJA SAN DIEGO — abono Sistecredit tienda San Diego. SOLO conciliación. NO cobro cerrado.",
  RG:  "RECIBO CAJA GRAN PLAZA — abono Sistecredit tienda Gran Plaza. SOLO conciliación. NO cobro cerrado.",
  RA:  "RECIBO CAJA CALDAS — abono Sistecredit tienda Caldas. SOLO conciliación. NO cobro cerrado.",
  // Consignaciones pendientes — tránsito bancario
  B1:  "CONSIGNACIÓN PENDIENTE CRT 0711 — dinero recibido sin identificar. NO cobro cerrado hasta conciliar.",
  B2:  "CONSIGNACIÓN PENDIENTE CRT 9945 — dinero recibido sin identificar. NO cobro cerrado.",
  H1:  "CONSIGNACIÓN PENDIENTE AHO 0313 — ahorro pendiente de identificar. NO cobro cerrado.",
  H2:  "CONSIGNACIÓN PENDIENTE AHO 6827 — ahorro pendiente de identificar. NO cobro cerrado.",
  CP:  "CONSIGNACIONES PENDIENTES GENERAL — dinero recibido sin clasificar. Puente de conciliación.",
  // Notas crédito empresa — reducen cartera, NO son ventas nuevas
  ND:  "NOTA CRÉDITO EMPRESA — descuento financiero aplicado por cliente al pagar factura. NO es venta nueva. Reduce cartera F1.",
  NF:  "NOTA CRÉDITO EMPRESA — ajuste financiero por devolución o descuento. Reduce cartera F1.",
  NE:  "NOTA CRÉDITO ELECTRÓNICA EMPRESA — nota crédito oficial empresa. Reduce cartera F1.",
  NC:  "NOTA CRÉDITO ELECTRÓNICA EMPRESA — nota crédito oficial empresa. Reduce cartera F1.",
  // Notas crédito tiendas — solo lógica de tienda, NO empresa F1
  NA:  "NOTA CRÉDITO CALDAS — devolución cliente tienda Caldas. Ajuste cartera tienda. NO es empresa F1.",
  NG:  "NOTA CRÉDITO GRAN PLAZA — devolución cliente tienda Gran Plaza. Ajuste cartera tienda. NO empresa F1.",
  NS:  "NOTA CRÉDITO SAN DIEGO — devolución cliente tienda San Diego. Ajuste cartera tienda. NO empresa F1.",
  NT:  "NOTA CRÉDITO CENTRO — devolución cliente tienda Centro. Ajuste cartera tienda. NO empresa F1.",
  NW:  "NOTA CRÉDITO WEB — devolución cliente web. Ajuste cartera web.",
  // Bonos — excluir CEO cockpit
  BN:  "BONO / GIFT CARD — instrumento de pago por voucher. Confiabilidad baja para métricas. Excluir del cockpit CEO.",
  XX:  "SISTECREDIT AUXILIAR — código técnico auxiliar sin valor semántico de negocio. Excluir.",
};

const _DEFAULT_MEANINGS: Readonly<Partial<Record<string, string>>> = {
  VENTA:             "Factura de venta — genera cartera",
  DEVOLUCION_VENTA:  "Nota crédito / devolución — reduce cartera o ventas",
  PAGO_CLIENTE:      "Cobro recibido de cliente",
  ANTICIPO_CLIENTE:  "Anticipo de cliente — caja recibida pendiente de aplicar a factura",
  PEDIDO:            "Pedido de cliente — compromiso, sin movimiento financiero",
  REMISION_DESPACHO: "Remisión de despacho — logístico, no financiero hasta conversión a factura",
  COMPRA:            "Factura de compra — genera cuentas por pagar",
  GASTO:             "Gasto causado — cuentas por pagar",
  PAGO_PROVEEDOR:    "Pago a proveedor — reduce cuentas por pagar",
  BANCO:             "Movimiento bancario / consignación",
  AJUSTE_CONTABLE:   "Ajuste contable — sin impacto operativo directo",
  INVENTARIO:        "Movimiento de inventario",
  PRODUCCION:        "Documento de producción",
  NOMINA:            "Nómina y prestaciones sociales",
  BONO:              "Bono / gift card",
};

// ── Sets internos de clasificación ────────────────────────────────────────

const _STORE_RECON_SET   = new Set(["RC", "RS", "RG", "RA"]);
const _PENDING_CASH_SET  = new Set(["B1", "B2", "H1", "H2", "CP"]);
const _RECON_ALL_SET     = new Set([..._STORE_RECON_SET, ..._PENDING_CASH_SET]);
// AP = dispatch tracking, no CEO headline; BN = bonos unreliables; XX = código técnico
const _CEO_EXCL_CODES    = new Set(["XX", "BN", "AP"]);

// ── Derivación de businessLayer ───────────────────────────────────────────

function _deriveBusinessLayer(r: SourceSemanticRule): PyaBusinessLayer {
  if (r.capaDato === "SAG_ARKETOPS" || r.businessOwner === "ARKETOPS") return "ARKETOPS";
  if (r.estadoUso === "EXCLUDED" || r.capaDato === "EXCLUIDO")          return "EXCLUDED";
  if (r.estadoUso === "HISTORICAL")                                      return "DEPRECATED";

  const cod = r.codigoFuente;

  switch (r.familiaDocumento) {
    case "PEDIDO":            return "ORDERS";
    case "REMISION_DESPACHO": return "INVOICING_F2";
    case "VENTA":             return r.capaDato === "SAG_NO_OFICIAL" ? "INVOICING_F2" : "INVOICING_F1";
    case "DEVOLUCION_VENTA":  return "CREDIT_NOTE";
    case "BONO":              return "GIFT_CARD";
    case "PAGO_CLIENTE":
      if (_STORE_RECON_SET.has(cod)) return "STORE_RECON";
      // NOTE: the cobro() helper in source-semantic-rules hardcodes capaDato="SAG_OFICIAL"
      // even when clasificacionCastillitos="NO_OFICIAL" (R2). Use clasificacion as tiebreaker.
      if (r.capaDato === "SAG_NO_OFICIAL" || r.clasificacionCastillitos === "NO_OFICIAL") return "COLLECTION_F2";
      return "COLLECTION_F1";
    case "ANTICIPO_CLIENTE":
      // A2 (ka=128) correctly sets capaDato="SAG_NO_OFICIAL". A1 (ka=122) is SAG_OFICIAL.
      if (r.capaDato === "SAG_NO_OFICIAL" || r.clasificacionCastillitos === "NO_OFICIAL") return "COLLECTION_F2";
      return "COLLECTION_F1";
    case "BANCO":
      if (_PENDING_CASH_SET.has(cod))      return "PENDING_CASH";
      return "BANKING";
    case "NOTA_DEBITO_BANCO":
    case "NOTA_CREDITO_BANCO":             return "BANKING";
    case "COMPRA":
    case "DEVOLUCION_COMPRA":
    case "ANTICIPO_PROVEEDOR":
    case "DEVOLUCION_GASTO":
    case "GASTO":
    case "PAGO_PROVEEDOR":                 return "PURCHASING";
    case "AJUSTE_CONTABLE":                return "EXCLUDED";
    case "INVENTARIO":                     return "INVENTORY";
    case "PRODUCCION":                     return "PRODUCTION";
    case "NOMINA":                         return "PAYROLL";
    default:                               return "EXCLUDED";
  }
}

// AP (familiaDocumento=PEDIDO) es ajuste de orden que implica despacho.
function _isDispatch(r: SourceSemanticRule): boolean {
  return r.familiaDocumento === "REMISION_DESPACHO" || r.codigoFuente === "AP";
}

// ── Derivación de isCEOVisible ─────────────────────────────────────────────

function _isCEOVisible(r: SourceSemanticRule, layer: PyaBusinessLayer): boolean {
  if (r.capaDato === "SAG_ARKETOPS" || r.businessOwner === "ARKETOPS") return false;
  if (r.estadoUso === "EXCLUDED" || r.capaDato === "EXCLUIDO")          return false;
  if (r.estadoUso === "HISTORICAL")                                      return false;
  if (r.needsAccountingReview)                                           return false;
  if (_CEO_EXCL_CODES.has(r.codigoFuente))                              return false;

  const nonCeo: PyaBusinessLayer[] = [
    "ARKETOPS", "EXCLUDED", "DEPRECATED",
    "STORE_RECON",   // RC/RS/RG/RA — solo conciliación bancaria
    "GIFT_CARD",     // BN — bonos no confiables
    "PURCHASING",    // compras/gastos — no es ingreso
    "INVENTORY",     // inventario
    "PRODUCTION",    // producción
    "PAYROLL",       // nómina
    "BANKING",       // movimientos bancarios generales
    "INVOICING_F2",  // remisiones — no son ingreso hasta conversión
  ];
  return !nonCeo.includes(layer);
}

// ── Derivación de notes de gobierno ───────────────────────────────────────

function _deriveNotes(r: SourceSemanticRule, layer: PyaBusinessLayer): string {
  const parts: string[] = [];

  if (r.needsAccountingReview) {
    parts.push("PENDIENTE REVISIÓN CONTABLE — no activar en dashboard hasta confirmar con contabilidad.");
  }
  switch (layer) {
    case "STORE_RECON":
      parts.push("Solo conciliación bancaria. NO contar como cobro cerrado en métricas CEO.");
      break;
    case "PENDING_CASH":
      parts.push("Dinero en tránsito bancario. NO es cobro cerrado. Alimenta Conciliación Inteligente.");
      break;
    case "ORDERS":
      parts.push("Pipeline de pedidos. Sin impacto financiero. No incluir en ventas ni cobros.");
      break;
    case "COLLECTION_F2":
      parts.push("Universo F2 — NUNCA sumar a métricas F1 oficiales.");
      break;
    case "INVOICING_F2":
      parts.push("Remisión F2 — no es ingreso hasta conversión a factura oficial. No incluir en ventas CEO.");
      break;
    case "GIFT_CARD":
      parts.push("Bonos/gift cards — confiabilidad baja. Excluir del cockpit CEO.");
      break;
  }
  if (r.estadoUso === "HISTORICAL") {
    parts.push("Solo histórico — necesario para saldos anteriores. No usar en cálculos corrientes.");
  }
  if (r.codigoFuente === "AN") {
    parts.push("Revisar con Castillitos: separación empresa/tienda para AN no confirmada.");
  }

  return parts.length > 0 ? parts.join(" | ") : "Clasificación confirmada.";
}

// ── PyaSourceRecord ────────────────────────────────────────────────────────

/**
 * Registro de gobierno PYA completo por fuente.
 *
 * Extiende SourceRule con las dimensiones de clasificación necesarias para
 * garantizar que cada fuente entre correctamente al dashboard CEO.
 *
 * REGLA: Nunca usar una fuente en una métrica CEO sin verificar:
 *   isCEOVisible === true  AND  reviewStatus !== "pending_castillitos"
 */
export interface PyaSourceRecord extends SourceRule {
  /** Significado del documento en términos de negocio PYA / Castillitos. */
  pyaMeaning:            string;
  /** Capa de negocio principal que afecta este documento. */
  businessLayer:         PyaBusinessLayer;
  /** ¿Entra al pipeline de pedidos? (PD). NO es movimiento financiero. */
  affectsOrders:         boolean;
  /** ¿Registra o ajusta despachos/logística? (AP, remisiones F2). NO financiero. */
  affectsDispatch:       boolean;
  /** ¿Crea o reduce una factura de venta? (ventas oficiales + devoluciones). */
  affectsInvoice:        boolean;
  /** ¿Mueve dinero real (caja / banco)? */
  affectsCash:           boolean;
  /** ¿Afecta cuentas por cobrar (cartera CxC)? */
  affectsAR:             boolean;
  /** ¿Participa en conciliación bancaria (tránsito / abonos tienda)? */
  affectsReconciliation: boolean;
  /** ¿Afecta inventario físico? */
  affectsInventory:      boolean;
  /** ¿Pertenece al módulo de producción? */
  affectsProduction:     boolean;
  /** ¿Canal almacén físico (POS)? */
  isStore:               boolean;
  /** ¿Canal empresa (B2B, facturas FE)? */
  isCompany:             boolean;
  /** ¿Canal web (e-commerce, FW)? */
  isWeb:                 boolean;
  /** ¿Universo oficial F1 (SAG_OFICIAL, no Arketops)? */
  isF1:                  boolean;
  /** ¿Universo no oficial F2 (SAG_NO_OFICIAL)? */
  isF2:                  boolean;
  /** ¿Es histórico o excluido? No usar en cálculos corrientes. */
  isDeprecated:          boolean;
  /**
   * ¿Debe aparecer en el cockpit CEO (Torre de Control)?
   *
   * false para: ARKETOPS · BN (bonos) · RC/RS/RG/RA (solo conciliación) ·
   *             HISTORICAL · EXCLUDED · needsAccountingReview · remisiones F2 ·
   *             compras/inventario/nómina/producción.
   */
  isCEOVisible:          boolean;
  /** Notas de gobierno sobre esta fuente. */
  notes:                 string;
}

// ── Adaptador completo ────────────────────────────────────────────────────

function toPyaSourceRecord(r: SourceSemanticRule): PyaSourceRecord {
  const base  = toSourceRule(r);
  const layer = _deriveBusinessLayer(r);
  const cod   = r.codigoFuente;

  const pyaMeaning =
    _PYA_MEANINGS[cod] ??
    _DEFAULT_MEANINGS[r.familiaDocumento] ??
    r.nombreFuente;

  return {
    ...base,
    pyaMeaning,
    businessLayer:         layer,
    affectsOrders:         r.familiaDocumento === "PEDIDO",
    affectsDispatch:       _isDispatch(r),
    affectsInvoice:        r.participaEnVentas || r.familiaDocumento === "DEVOLUCION_VENTA",
    affectsCash:           r.participaEnCaja,
    affectsAR:             r.participaEnCartera,
    affectsReconciliation: _RECON_ALL_SET.has(cod) || r.familiaDocumento === "BANCO",
    affectsInventory:      r.familiaDocumento === "INVENTARIO",
    affectsProduction:     r.familiaDocumento === "PRODUCCION",
    isStore:               r.canalOperacion === "ALMACEN",
    isCompany:             r.canalOperacion === "EMPRESA",
    isWeb:                 r.canalOperacion === "WEB",
    isF1:                  r.capaDato === "SAG_OFICIAL" && r.businessOwner !== "ARKETOPS",
    isF2:                  r.capaDato === "SAG_NO_OFICIAL",
    isDeprecated:          r.estadoUso === "HISTORICAL" || r.estadoUso === "EXCLUDED",
    isCEOVisible:          _isCEOVisible(r, layer),
    notes:                 _deriveNotes(r, layer),
  };
}

// ── PYA_SOURCE_REGISTRY ───────────────────────────────────────────────────

/**
 * Registro completo de gobierno PYA — 161 fuentes SAG Castillitos.
 *
 * Fuente de verdad para:
 *   - Clasificar cada documento SAG en el contexto de negocio Castillitos
 *   - Verificar qué fuentes entran al cockpit CEO y en qué panel
 *   - Auditar violaciones de mezcla (F1+F2, pedidos como ventas, etc.)
 *
 * Derivado de CASTILLITOS_SOURCE_SEMANTIC_RULES — no duplica datos.
 */
export const PYA_SOURCE_REGISTRY: readonly PyaSourceRecord[] =
  CASTILLITOS_SOURCE_SEMANTIC_RULES.map(toPyaSourceRecord);

// Índice rápido por codigoFuente (un código puede tener múltiples filas técnicas)
const _pyaByCode = new Map<string, PyaSourceRecord[]>();
for (const r of PYA_SOURCE_REGISTRY) {
  const list = _pyaByCode.get(r.code) ?? [];
  list.push(r);
  _pyaByCode.set(r.code, list);
}

/**
 * Lookup de gobierno por codigoFuente.
 * Múltiples resultados = variantes técnicas de una misma fuente de negocio.
 */
export function pyaRulesByCode(code: string): PyaSourceRecord[] {
  return _pyaByCode.get(code.toUpperCase()) ?? _pyaByCode.get(code) ?? [];
}

// ══════════════════════════════════════════════════════════════════════════════
// Entregable 2: Helpers de gobierno — getXxxSourceCodes()
//
// REGLA DE USO: Antes de conectar una fuente a una métrica CEO, verificar:
//   getCEOVisibleSourceCodes()  — ¿está permitida?
//   getOrderSourceCodes()       — PD no va en ventas ni cobros
//   getReconciliationSourceCodes() — RC/RS/RG/RA/B1-CP no van en cobros cerrados
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Códigos de pedidos de cliente activos (PD únicamente).
 * NO son venta. NO generan cartera. Solo entrada de pedido nuevo.
 *
 * AP queda EXCLUIDO — es trazabilidad/despacho, no pedido nuevo. Ver getDispatchSourceCodes().
 */
export function getOrderSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.affectsOrders && !r.isDeprecated && r.code !== "AP")
    .map(r => r.code);
}

/**
 * Códigos de despacho / tracking logístico (AP + remisiones F2).
 * NO son movimientos financieros.
 */
export function getDispatchSourceCodes(): string[] {
  return [
    ...new Set(
      PYA_SOURCE_REGISTRY
        .filter(r => r.affectsDispatch && !r.isDeprecated)
        .map(r => r.code),
    ),
  ];
}

/**
 * Códigos de ventas empresa activas (FE).
 * Generan cartera F1 empresa.
 */
export function getCompanySalesSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.isCompany && r.affectsInvoice && r.active && r.businessLayer === "INVOICING_F1")
    .map(r => r.code);
}

/**
 * Códigos de ventas tiendas físicas activas (FD, FC, FG, FA).
 * Generan cartera F1 tienda.
 */
export function getStoreSalesSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.isStore && r.affectsInvoice && r.active && r.businessLayer === "INVOICING_F1")
    .map(r => r.code);
}

/**
 * Códigos de ventas web activas (FW).
 * Generan cartera F1 web.
 */
export function getWebSalesSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.isWeb && r.affectsInvoice && r.active && r.businessLayer === "INVOICING_F1")
    .map(r => r.code);
}

/**
 * Códigos de facturación oficial F1 activa (empresa + tiendas + web).
 * Todo lo que genera cartera F1. Para queries de ventas CEO.
 */
export function getInvoiceSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.businessLayer === "INVOICING_F1" && r.active)
    .map(r => r.code);
}

/**
 * Códigos de caja ejecutiva (R1 + R2 + A1 + A2 + AN).
 * Incluye F1 y F2 para visión de tesorería global.
 * Para CEO headline separar con getF1CollectionSourceCodes() / getF2CollectionSourceCodes().
 *
 * Usa businessLayer como fuente de verdad (no participaEnCaja), porque el helper cobro()
 * en source-semantic-rules.ts hardcodea participaEnCaja=false para algunos anticipos (A2).
 *
 * SI excluded: EXCLUIR TOTALMENTE per financial source registry (FUENTES.xlsx ka_ni=111).
 */
export function getCashSourceCodes(): string[] {
  return [
    ...new Set(
      PYA_SOURCE_REGISTRY
        .filter(r =>
          (r.businessLayer === "COLLECTION_F1" || r.businessLayer === "COLLECTION_F2") &&
          r.active,
        )
        .map(r => r.code)
        .filter(c => !NA_ELIMINATED_CODES.includes(c)),
    ),
  ];
}

/**
 * Códigos de recaudo F1 oficial (R1, A1, AN).
 * ÚNICA cifra para headline cobros CEO. NUNCA mezclar con F2.
 *
 * SI excluded: EXCLUIR TOTALMENTE per financial source registry (FUENTES.xlsx ka_ni=111).
 * SI is misclassified as COLLECTION_F1 in source-semantic-rules.ts (cobro(111,"SI","OFICIAL"...))
 * — corrected here via NA_ELIMINATED_CODES filter until root is fixed in source-semantic-rules.ts.
 */
export function getF1CollectionSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.businessLayer === "COLLECTION_F1" && r.active)
    .map(r => r.code)
    .filter(c => !NA_ELIMINATED_CODES.includes(c));
}

/**
 * Códigos de recaudo F2 operativo (R2, A2).
 * Para panel de contexto F2. NUNCA sumar a getF1CollectionSourceCodes().
 */
export function getF2CollectionSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.businessLayer === "COLLECTION_F2" && r.active)
    .map(r => r.code);
}

/**
 * Códigos de conciliación bancaria (RC/RS/RG/RA + B1/B2/H1/H2/CP).
 * NUNCA contar como cobros cerrados.
 * Solo visibles en Conciliación Inteligente y panel de Bancos.
 */
export function getReconciliationSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r =>
      (r.businessLayer === "STORE_RECON" || r.businessLayer === "PENDING_CASH") && r.active,
    )
    .map(r => r.code);
}

/**
 * Códigos de notas crédito / ajustes activos (ND, NF, NA, NG, NS, NT, NE, NC, NW, D1, D2...).
 * Reducen cartera o ventas. NO son ventas nuevas.
 */
export function getAdjustmentSourceCodes(): string[] {
  return PYA_SOURCE_REGISTRY
    .filter(r => r.businessLayer === "CREDIT_NOTE" && r.active)
    .map(r => r.code);
}

/**
 * Códigos deprecados / históricos.
 * Solo para queries de saldos anteriores. No usar en cálculos corrientes.
 */
export function getDeprecatedSourceCodes(): string[] {
  return [
    ...new Set(
      PYA_SOURCE_REGISTRY
        .filter(r => r.isDeprecated)
        .map(r => r.code),
    ),
  ];
}

/**
 * Códigos aptos para el cockpit CEO (Torre de Control).
 *
 * Excluye: ARKETOPS · BN · RC/RS/RG/RA · HISTORICAL · EXCLUDED ·
 *          needsAccountingReview · remisiones F2 · compras/inventario/nómina/producción.
 */
export function getCEOVisibleSourceCodes(): string[] {
  return [
    ...new Set(
      PYA_SOURCE_REGISTRY
        .filter(r => r.isCEOVisible)
        .map(r => r.code),
    ),
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// Entregable 5: Readiness summary — qué está listo para cada bloque CEO
// ══════════════════════════════════════════════════════════════════════════════

export interface SourceReadinessSummary {
  /** B1 — Cobros recibidos: fuentes F1 aptas para headline cobros CEO. */
  b1_cobros_f1:         string[];
  /** B1 — F2 operativo (contexto, nunca headline). */
  b1_cobros_f2:         string[];
  /** B2 — Ventas del día: fuentes activas para facturación CEO. */
  b2_ventas_activas:    string[];
  /** B3 — Cartera: fuentes que generan o reducen CxC. */
  b3_cartera:           string[];
  /** B4 — Radar comercial por canal. */
  b4_canal_empresa:     string[];
  b4_canal_tiendas:     string[];
  b4_canal_web:         string[];
  /** Pendientes de confirmación contable — no usar en queries definitivas. */
  pending_confirmation: { code: string; name: string; reason: string }[];
  /** Siempre excluidos (ARKETOPS, N/A, técnicos). */
  excluded:             string[];
  /** Solo conciliación — NUNCA en dashboard CEO como cobros. */
  reconciliation_only:  string[];
}

/**
 * Resumen de disponibilidad de fuentes por bloque del dashboard CEO.
 *
 * Uso: ejecutar en desarrollo o en un script de validación para verificar
 * qué fuentes están disponibles antes de conectar al dashboard.
 */
export function getSourceReadinessSummary(): SourceReadinessSummary {
  return {
    b1_cobros_f1: PYA_SOURCE_REGISTRY
      .filter(r => r.businessLayer === "COLLECTION_F1" && r.active && r.isCEOVisible)
      .map(r => r.code),

    b1_cobros_f2: PYA_SOURCE_REGISTRY
      .filter(r => r.businessLayer === "COLLECTION_F2" && r.active)
      .map(r => r.code),

    b2_ventas_activas: PYA_SOURCE_REGISTRY
      .filter(r => r.businessLayer === "INVOICING_F1" && r.active && r.isCEOVisible)
      .map(r => r.code),

    b3_cartera: [
      ...new Set(
        PYA_SOURCE_REGISTRY
          .filter(r => r.affectsAR && r.active && r.reviewStatus !== "exclude")
          .map(r => r.code),
      ),
    ],

    b4_canal_empresa: getCompanySalesSourceCodes(),
    b4_canal_tiendas: getStoreSalesSourceCodes(),
    b4_canal_web:     getWebSalesSourceCodes(),

    pending_confirmation: PYA_SOURCE_REGISTRY
      .filter(r => r.reviewStatus === "pending_castillitos")
      .map(r => ({ code: r.code, name: r.name, reason: r.notes })),

    excluded: [
      ...new Set(
        PYA_SOURCE_REGISTRY
          .filter(r => r.reviewStatus === "exclude")
          .map(r => r.code),
      ),
    ],

    reconciliation_only: PYA_SOURCE_REGISTRY
      .filter(r =>
        (r.businessLayer === "STORE_RECON" || r.businessLayer === "PENDING_CASH") && r.active,
      )
      .map(r => r.code),
  };
}
