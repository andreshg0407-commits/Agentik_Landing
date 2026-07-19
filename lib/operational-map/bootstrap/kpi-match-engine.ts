/**
 * lib/operational-map/bootstrap/kpi-match-engine.ts
 *
 * KPI Match Engine — maps SAG document-type codes (k_sc_codigo_fuente)
 * and classification patterns to Agentik KPI keys.
 *
 * Mapping strategy (in order):
 *  1. Exact SAG code match
 *  2. Name pattern match
 *  3. Type/classification pattern match
 *  4. Unresolved
 *
 * Sprint: AGENTIK-SOURCE-MAP-BOOTSTRAP-01
 */

import type { NormalizedCsvRow } from "./source-map-csv-normalizer";

// ─── Match result ─────────────────────────────────────────────────────────────

export interface KpiMatchResult {
  kpiKeys:        string[];   // one source can feed multiple KPIs
  matchType:      "exact_code" | "name_pattern" | "type_pattern" | "manual" | "unresolved";
  matchConfidence: number;    // 0–1
  unresolvedFields?: string[];
}

// ─── Exact code → KPI map ─────────────────────────────────────────────────────
// Maps k_sc_codigo_fuente → KPI keys it feeds

const CODE_TO_KPI: Record<string, string[]> = {
  // Pedidos
  "PD": ["pedidos_dia", "pedidos_dia_sag", "pedidos_pendientes_despacho"],
  "AP": ["pedidos_dia_sag"],

  // Facturación electrónica (ventas oficiales)
  "FE": ["ventas_dia_fuente1", "ventas_brutas_fuente1", "ventas_netas", "documentos_dian"],
  "FD": ["ventas_dia_fuente1", "ventas_brutas_fuente1"],   // San Diego
  "FC": ["ventas_dia_fuente1", "ventas_brutas_fuente1"],   // Centro
  "FG": ["ventas_dia_fuente1", "ventas_brutas_fuente1"],   // Gran Plaza
  "FA": ["ventas_dia_fuente1", "ventas_brutas_fuente1"],   // Caldas
  "FW": ["ventas_dia_fuente1", "ventas_brutas_fuente1"],   // Web
  "RS": ["ventas_dia_fuente1"],                             // POS San Diego
  "RC": ["ventas_dia_fuente1"],                             // POS Centro

  // Notas crédito (devoluciones)
  "NE": ["ventas_netas", "devoluciones_activas"],
  "NC": ["ventas_netas", "devoluciones_activas"],
  "ND": ["ventas_netas"],
  "NF": ["ventas_netas", "devoluciones_activas"],
  "NA": ["ventas_netas", "devoluciones_activas"],   // Caldas
  "NG": ["ventas_netas", "devoluciones_activas"],   // Gran Plaza
  "NS": ["ventas_netas", "devoluciones_activas"],   // San Diego
  "NT": ["ventas_netas", "devoluciones_activas"],   // Centro
  "NW": ["ventas_netas", "devoluciones_activas"],   // Web
  "D1": ["ventas_netas", "devoluciones_activas"],
  "D2": ["ventas_netas", "devoluciones_activas"],

  // Recaudos / cobros
  "R1": ["recaudos_dia", "recaudos_dia_tesoreria", "historial_pagos", "cartera_cobrar_entradas"],
  "R2": ["recaudos_dia", "recaudos_dia_tesoreria"],   // F2
  "RG": ["recaudos_dia", "recaudos_dia_tesoreria"],   // Gran Plaza
  "RA": ["recaudos_dia", "recaudos_dia_tesoreria"],   // Caldas
  "RM": ["recaudos_dia"],                              // Mayorca (legacy)
  "AN": ["recaudos_dia", "recaudos_dia_tesoreria"],   // Anticipo Sistecredito

  // Anticipos clientes
  "A1": ["recaudos_dia", "cartera_cobrar_entradas"],
  "A2": ["recaudos_dia"],   // F2
  "AA": ["cartera_cobrar_entradas"],

  // Compras
  "C1": ["costo_ventas"],
  "C2": ["costo_ventas"],

  // Egresos / gastos
  "E1": ["gastos_operativos", "ebitda_estimado"],
  "E2": ["gastos_operativos"],
  "G1": ["gastos_operativos", "ebitda_estimado"],
  "G2": ["gastos_operativos"],

  // Anticipos proveedores
  "1V": ["pagos_programados_7d"],
  "2V": ["pagos_programados_7d"],
  "AL": ["pagos_programados_7d"],

  // Gastos causados (CxP)
  "10": ["gastos_operativos"],

  // Devoluciones de compras
  "DC": ["costo_ventas"],
  "DG": ["gastos_operativos"],

  // Ajustes contables
  "J1": ["cierre_mensual"],
  "J2": ["cierre_mensual"],

  // Nómina
  "NO": ["gastos_operativos", "ebitda_estimado"],

  // Traslados / movimientos internos
  "TR": ["score_salud_inventario"],
  "TM": ["score_salud_inventario"],

  // Ajustes de inventario
  "AI": ["score_salud_inventario"],
  "IF": ["score_salud_inventario"],
  "DS": ["score_salud_inventario"],

  // Remisión F2
  "F2": ["ventas_netas"],

  // Bank movements
  "DB": ["saldo_cuentas_bancarias", "disponible_banco_hoy"],
  "CB": ["saldo_cuentas_bancarias", "disponible_banco_hoy"],

  // Production
  "OP": ["score_salud_inventario"],
  "CN": ["costo_ventas"],
  "PT": ["score_salud_inventario"],
  "PC": ["score_salud_inventario"],
  "EC": ["score_salud_inventario"],

  // Bonos
  "BN": ["ventas_dia_fuente1", "recaudos_dia"],

  // DIAN
  "DE": ["documentos_dian"],
  "T3": ["documentos_dian"],

  // Despachos
  "RG2": ["despachos_en_transito"],
};

// ─── Name pattern matchers ────────────────────────────────────────────────────

interface NamePattern {
  pattern:    RegExp;
  kpiKeys:    string[];
  confidence: number;
}

const NAME_PATTERNS: NamePattern[] = [
  { pattern: /FACTURA ELECTR[OÓ]NICA.*VENTA/i,  kpiKeys: ["ventas_dia_fuente1", "ventas_brutas_fuente1", "ventas_netas"], confidence: 0.85 },
  { pattern: /NOTA CR[EÉ]DITO ELECTR/i,          kpiKeys: ["ventas_netas", "devoluciones_activas"],                       confidence: 0.80 },
  { pattern: /RECIBO DE CAJA/i,                   kpiKeys: ["recaudos_dia", "recaudos_dia_tesoreria"],                    confidence: 0.80 },
  { pattern: /PEDIDOS? CLIENTES?/i,               kpiKeys: ["pedidos_dia", "pedidos_dia_sag"],                            confidence: 0.90 },
  { pattern: /DEVOLUCI[OÓ]N.*VENTAS?/i,           kpiKeys: ["ventas_netas", "devoluciones_activas"],                      confidence: 0.80 },
  { pattern: /DEVOLUCI[OÓ]N.*COMPRAS?/i,          kpiKeys: ["costo_ventas"],                                              confidence: 0.75 },
  { pattern: /ANTICIPO.*CLIENTES?/i,              kpiKeys: ["recaudos_dia", "cartera_cobrar_entradas"],                   confidence: 0.75 },
  { pattern: /ANTICIPO.*PROVEEDORES?/i,           kpiKeys: ["pagos_programados_7d"],                                      confidence: 0.75 },
  { pattern: /FACTURA.*COMPRA/i,                  kpiKeys: ["costo_ventas"],                                              confidence: 0.75 },
  { pattern: /GASTOS? CAUSADOS?/i,                kpiKeys: ["gastos_operativos", "ebitda_estimado"],                     confidence: 0.80 },
  { pattern: /EGRESOS?/i,                         kpiKeys: ["gastos_operativos"],                                         confidence: 0.70 },
  { pattern: /PROVISI[OÓ]N.*N[OÓ]MINA/i,         kpiKeys: ["gastos_operativos"],                                         confidence: 0.80 },
  { pattern: /AJUSTE.*CONTABLE/i,                 kpiKeys: ["cierre_mensual"],                                            confidence: 0.65 },
  { pattern: /NOTA.*(D[EÉ]BITO|BANCARIA)/i,       kpiKeys: ["saldo_cuentas_bancarias", "disponible_banco_hoy"],          confidence: 0.75 },
  { pattern: /TRASLADO.*BODEGAS?/i,               kpiKeys: ["score_salud_inventario"],                                   confidence: 0.80 },
  { pattern: /AJUSTE.*INVENTARIO/i,               kpiKeys: ["score_salud_inventario"],                                   confidence: 0.80 },
  { pattern: /INVENTARIO F[IÍ]SICO/i,             kpiKeys: ["score_salud_inventario"],                                   confidence: 0.80 },
  { pattern: /ORDEN.*PRODUCCI[OÓ]N/i,             kpiKeys: ["score_salud_inventario"],                                   confidence: 0.75 },
  { pattern: /DOC.*SOPORTE.*ELECTR/i,             kpiKeys: ["documentos_dian"],                                          confidence: 0.75 },
  { pattern: /REMISI[OÓ]N/i,                      kpiKeys: ["ventas_netas"],                                             confidence: 0.70 },
  { pattern: /BONOS?/i,                           kpiKeys: ["ventas_dia_fuente1", "recaudos_dia"],                       confidence: 0.65 },
];

// ─── Type/classification pattern matchers ────────────────────────────────────

interface TypePattern {
  tipoPattern:    RegExp;
  kpiKeys:        string[];
  confidence:     number;
}

const TYPE_PATTERNS: TypePattern[] = [
  { tipoPattern: /PEDIDO COMERCIAL/i,        kpiKeys: ["pedidos_dia", "pedidos_dia_sag"],            confidence: 0.75 },
  { tipoPattern: /COBRO OFICIAL/i,           kpiKeys: ["recaudos_dia", "recaudos_dia_tesoreria"],    confidence: 0.75 },
  { tipoPattern: /COBRO F2/i,               kpiKeys: ["recaudos_dia"],                              confidence: 0.70 },
  { tipoPattern: /COBRO ANTICIPADO/i,        kpiKeys: ["recaudos_dia", "cartera_cobrar_entradas"],   confidence: 0.70 },
  { tipoPattern: /NOTA CREDITO/i,            kpiKeys: ["ventas_netas", "devoluciones_activas"],      confidence: 0.70 },
  { tipoPattern: /GASTO OPERATIVO/i,         kpiKeys: ["gastos_operativos"],                         confidence: 0.70 },
  { tipoPattern: /COMPRA.*F1/i,              kpiKeys: ["costo_ventas"],                              confidence: 0.70 },
  { tipoPattern: /COMPRA.*F2/i,              kpiKeys: ["costo_ventas"],                              confidence: 0.65 },
  { tipoPattern: /SALIDA DE DINERO/i,        kpiKeys: ["gastos_operativos"],                         confidence: 0.65 },
  { tipoPattern: /ANTICIPO PROVEEDOR/i,      kpiKeys: ["pagos_programados_7d"],                      confidence: 0.70 },
  { tipoPattern: /AJUSTE FINANCIERO/i,       kpiKeys: ["cierre_mensual"],                            confidence: 0.65 },
  { tipoPattern: /EGRESO FINANCIERO/i,       kpiKeys: ["saldo_cuentas_bancarias"],                   confidence: 0.70 },
  { tipoPattern: /INVENTARIO.*LOGISTICA/i,   kpiKeys: ["score_salud_inventario"],                    confidence: 0.65 },
  { tipoPattern: /POS/i,                     kpiKeys: ["ventas_dia_fuente1"],                        confidence: 0.65 },
  { tipoPattern: /F1 OFICIAL/i,              kpiKeys: ["ventas_brutas_fuente1", "ventas_netas"],     confidence: 0.65 },
];

// ─── Match engine ─────────────────────────────────────────────────────────────

export function matchKpis(row: NormalizedCsvRow): KpiMatchResult {
  // 1. Exact code match
  const codeMatch = CODE_TO_KPI[row.normalizedCode];
  if (codeMatch && codeMatch.length > 0) {
    return {
      kpiKeys:         codeMatch,
      matchType:       "exact_code",
      matchConfidence: 0.95,
    };
  }

  // 2. Name pattern match
  for (const np of NAME_PATTERNS) {
    if (np.pattern.test(row.sourceName)) {
      return {
        kpiKeys:         np.kpiKeys,
        matchType:       "name_pattern",
        matchConfidence: np.confidence,
      };
    }
  }

  // 3. Type/classification pattern
  for (const tp of TYPE_PATTERNS) {
    if (tp.tipoPattern.test(row.tipo)) {
      return {
        kpiKeys:         tp.kpiKeys,
        matchType:       "type_pattern",
        matchConfidence: tp.confidence,
      };
    }
  }

  // 4. Unresolved
  return {
    kpiKeys:         [],
    matchType:       "unresolved",
    matchConfidence: 0,
    unresolvedFields: [
      `sagCode=${row.sagCode}`,
      `classification=${row.classification}`,
      `tipo=${row.tipo}`,
    ],
  };
}
