/**
 * lib/sag/master-data/castillitos-fuentes.ts
 *
 * Castillitos FUENTES — registro canónico de todas las fuentes de facturación.
 *
 * Fuente de verdad: FUENTES.xlsx entregado por Castillitos (2026-04-20).
 * Clave primaria: ka_ni_fuente (entero — secuencia interna SAG, único).
 * Código de negocio: k_sc_codigo_fuente (texto — NO único; ver nota de duplicados).
 *
 * ── Reglas de gobierno (del Excel) ───────────────────────────────────────────
 *
 *   ka_ni_fuente    = campo interno de ellos; clave de join en MOVIMIENTOS.
 *   k_sc_codigo_fuente = código que usan en consultas y documentos.
 *   NA = obsoleto / excluido.
 *   ARKETOPS = control fiscal histórico (creado por Arketops).
 *
 * ── Categorías ────────────────────────────────────────────────────────────────
 *
 *   OFICIAL    — Activas, visibles en torre de control. Fuente principal de KPIs.
 *   NO_OFICIAL — Activas (libros secundarios), NO visibles en torre.
 *   PRODUCCION — Activas, flujo manufactura/confección, NO visibles en torre.
 *   INVENTARIO — Activas, operaciones de inventario físico y ajuste, NO visibles.
 *   HISTORICA  — Inactivas. Necesarias para consultas de saldos anteriores.
 *   OBSOLETA   — Inactivas. Excluidas de todo procesamiento y KPIs.
 *   ARKETOPS   — Control fiscal (Arketops). En DB, NO visibles en torre.
 *
 * ── Duplicados de k_sc_codigo_fuente ─────────────────────────────────────────
 *
 *   Códigos compartidos (todos ARKETOPS — COLGAP vs NIIF):
 *     DE → ka=18 (Depreciación COLGAP)    y ka=90  (Depreciación NIIF)
 *     CI → ka=22 (Cierre año COLGAP)      y ka=84  (Cierre año NIIF)
 *     S5 → ka=44 (S.I. Dep. COLGAP)       y ka=86  (S.I. Dep. NIIF)
 *     AD → ka=88 (Activos fijos COLGAP), ka=89 (Activos fijos NIIF), ka=126 (Producción)
 *   Para lookups sensibles a unicidad, usar siempre ka_ni_fuente, no el código.
 */

import type { SagDocumentFamilyMap } from "@/lib/sales/sag-document-type";

// ── Tipo de categoría ──────────────────────────────────────────────────────────

export type SagFuenteCategory =
  | "OFICIAL"      // activa, visible en torre de control
  | "NO_OFICIAL"   // activa, libros secundarios, no en torre
  | "PRODUCCION"   // activa, módulo de producción
  | "INVENTARIO"   // activa, operaciones de inventario
  | "HISTORICA"    // inactiva, requerida para saldos anteriores
  | "OBSOLETA"     // inactiva, excluida de todo
  | "ARKETOPS";    // control fiscal (Arketops), solo referencia

// ── Tipo de registro ───────────────────────────────────────────────────────────

export interface CastillitosFuente {
  /** ka_ni_fuente — PK único. Clave de join en MOVIMIENTOS.ka_ni_fuente */
  ka: number;
  /** Nombre del documento en SAG */
  nombre: string;
  /** k_sc_codigo_fuente — código de negocio. NO único (ver nota de duplicados). */
  codigo: string;
  /** Categoría operacional */
  category: SagFuenteCategory;
  /**
   * true = aparece en la capa visible de torre de control.
   * Solo fuentes OFICIAL tienen visibleInTorre = true.
   */
  visibleInTorre: boolean;
  /**
   * Nota adicional del Excel (5ª columna).
   * Ejemplos: "FACTURA EMPRESA", "RECIBOS SAN DIEGO", "NOTAS EMPRESA".
   */
  nota?: string;
}

// ── Registro completo ──────────────────────────────────────────────────────────
// 127 fuentes confirmadas 2026-04-20 desde FUENTES.xlsx.
// Ordenado por ka_ni_fuente ascendente.

export const CASTILLITOS_FUENTES_REGISTRY: CastillitosFuente[] = [

  // ══ OFICIAL — activas, visibles en torre ═════════════════════════════════════
  { ka: 1,   nombre: "FACTURA DE COMPRA",              codigo: "C1", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 3,   nombre: "EGRESOS",                        codigo: "E1", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 4,   nombre: "RECIBO DE CAJA",                 codigo: "R1", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 10,  nombre: "GASTOS CAUSADOS",                codigo: "G1", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 12,  nombre: "ANTICIPOS CLIENTES SISTECREDIT", codigo: "AN", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 17,  nombre: "AJUSTES CONTABLES",              codigo: "J1", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 21,  nombre: "NOTAS DÉBITO BANCARIAS",         codigo: "DB", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 25,  nombre: "DEVOLUCIÓN VENTAS",              codigo: "D1", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 27,  nombre: "DEVOLUCIÓN COMPRAS",             codigo: "DC", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 40,  nombre: "PEDIDOS CLIENTES",               codigo: "PD", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 41,  nombre: "AJUSTE PEDIDOS",                 codigo: "AP", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 68,  nombre: "ANTICIPO PROVEEDORES",           codigo: "1V", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 101, nombre: "FACTURA ELECTRONICA DE VENTA",   codigo: "FE", category: "OFICIAL",    visibleInTorre: true,  nota: "FACTURA EMPRESA"    },
  { ka: 102, nombre: "NOTA CREDITO ELECTRONICA",       codigo: "NE", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 105, nombre: "PROVISION DE NOMINA",            codigo: "NO", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 108, nombre: "RECIBO DE CAJA SANDIEGO",        codigo: "RS", category: "OFICIAL",    visibleInTorre: true,  nota: "RECIBOS SAN DIEGO" },
  { ka: 111, nombre: "SISTECREDIT",                    codigo: "SI", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 122, nombre: "ANTICIPO CLIENTE EMPRESA",       codigo: "A1", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 125, nombre: "AJUSTES MEDIOS DE PAGO",         codigo: "AJ", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 130, nombre: "DEVOLUCION EN GASTOS",           codigo: "DG", category: "OFICIAL",    visibleInTorre: true  },
  { ka: 139, nombre: "NOTA CREDITO ELECTRONICA",       codigo: "NC", category: "OFICIAL",    visibleInTorre: true,  nota: "NOTAS EMPRESA"     },

  // ══ NO_OFICIAL — activas, libros secundarios, no en torre ═══════════════════
  { ka: 2,   nombre: "REMISION",                       codigo: "F2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 94,  nombre: "RECIBO DE CAJA 2",               codigo: "R2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 95,  nombre: "FACTURA DE COMPRAS 2",           codigo: "C2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 96,  nombre: "GASTOS 2",                       codigo: "G2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 97,  nombre: "EGRESOS 2",                      codigo: "E2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 98,  nombre: "DEVOLUCIÓN VENTAS 2",            codigo: "D2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 113, nombre: "AJUSTE CONTABLE 2",              codigo: "J2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 128, nombre: "ANTICIPO CLIENTE 2",             codigo: "A2", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 131, nombre: "DEVOLUCION COMPRAS LATIN",       codigo: "DL", category: "NO_OFICIAL", visibleInTorre: false },
  { ka: 141, nombre: "ANTICIPO PROVEEDORES 2",         codigo: "2V", category: "NO_OFICIAL", visibleInTorre: false },

  // ══ PRODUCCION — activas, flujo manufactura, no en torre ════════════════════
  { ka: 33,  nombre: "ORDEN DE PRODUCCIÓN",            codigo: "OP", category: "PRODUCCION", visibleInTorre: false },
  { ka: 34,  nombre: "TRASLADO ENTRE BODEGAS",         codigo: "TR", category: "PRODUCCION", visibleInTorre: false },
  { ka: 80,  nombre: "CONSUMOS INSUMOS Y TELAS",       codigo: "CN", category: "PRODUCCION", visibleInTorre: false },
  { ka: 81,  nombre: "ENTRADA PT",                     codigo: "PT", category: "PRODUCCION", visibleInTorre: false },
  { ka: 99,  nombre: "SALIDA CONFECCIONISTAS",         codigo: "PC", category: "PRODUCCION", visibleInTorre: false },
  { ka: 100, nombre: "ENTRADA CONFECCIONISTAS",        codigo: "EC", category: "PRODUCCION", visibleInTorre: false },
  { ka: 114, nombre: "PRODUCTO EN PROCESO",            codigo: "4",  category: "PRODUCCION", visibleInTorre: false },
  { ka: 115, nombre: "TRASLADO DE MOVIMIENTOS PDN",    codigo: "MV", category: "PRODUCCION", visibleInTorre: false },
  { ka: 116, nombre: "ENTRADA PRODUCTO TERMINADO",     codigo: "ET", category: "PRODUCCION", visibleInTorre: false },
  { ka: 117, nombre: "CONSUMO DE MUESTRAS",            codigo: "CM", category: "PRODUCCION", visibleInTorre: false },
  { ka: 118, nombre: "GASTOS DE TERCEROS",             codigo: "T2", category: "PRODUCCION", visibleInTorre: false },
  { ka: 119, nombre: "CAUSACION DE SERVICIOS T",       codigo: "Y1", category: "PRODUCCION", visibleInTorre: false },
  { ka: 126, nombre: "ADICIONES Y FALTANTES",          codigo: "AD", category: "PRODUCCION", visibleInTorre: false },
  { ka: 127, nombre: "CONSUMOS DE MUESTRAS Y VARIOS",  codigo: "CV", category: "PRODUCCION", visibleInTorre: false },
  { ka: 129, nombre: "GASTOS TERCEROS",                codigo: "T1", category: "PRODUCCION", visibleInTorre: false },
  { ka: 133, nombre: "ENTRADA DE MUESTRAS",            codigo: "M2", category: "PRODUCCION", visibleInTorre: false },
  { ka: 140, nombre: "SALDO INICIAL RETAZOS",          codigo: "SR", category: "PRODUCCION", visibleInTorre: false },

  // ══ INVENTARIO — activas, operaciones de inventario, no en torre ═════════════
  { ka: 65,  nombre: "INV. FISICO",                    codigo: "IF", category: "INVENTARIO", visibleInTorre: false },
  { ka: 76,  nombre: "AJUSTE DE INVENTARIO",           codigo: "AI", category: "INVENTARIO", visibleInTorre: false },

  // ══ HISTORICA — inactivas, necesarias para saldos anteriores ════════════════
  { ka: 48,  nombre: "FACTURA DE VENTA POS",           codigo: "VC", category: "HISTORICA",  visibleInTorre: false },
  { ka: 52,  nombre: "APLICACION DE ANTIC Y NC CLTES", codigo: "AA", category: "HISTORICA",  visibleInTorre: false },
  { ka: 77,  nombre: "ENTRADA A ALMACEN",              codigo: "EA", category: "HISTORICA",  visibleInTorre: false },
  { ka: 92,  nombre: "FACTURA DE VETAS POS WI",        codigo: "V1", category: "HISTORICA",  visibleInTorre: false },
  { ka: 93,  nombre: "FACTURA DE VENTA",               codigo: "F1", category: "HISTORICA",  visibleInTorre: false },
  { ka: 103, nombre: "FACTURA DE VETAS POS SD",        codigo: "V2", category: "HISTORICA",  visibleInTorre: false },
  { ka: 104, nombre: "FACTURA DE VETAS POS M",         codigo: "V3", category: "HISTORICA",  visibleInTorre: false },
  { ka: 106, nombre: "DEVOLUCION VTAS SAN DIEGO",      codigo: "2D", category: "HISTORICA",  visibleInTorre: false },
  { ka: 107, nombre: "DEVOLUCION VTAS MAYORCA",        codigo: "3D", category: "HISTORICA",  visibleInTorre: false },
  { ka: 109, nombre: "RECIBO DE CAJA MAYORCA",         codigo: "RM", category: "HISTORICA",  visibleInTorre: false },
  { ka: 110, nombre: "NOTA CREDITO ELECTRONICA",       codigo: "NX", category: "HISTORICA",  visibleInTorre: false },
  { ka: 134, nombre: "DOCUMENTO SOPORTE COMPRAS",      codigo: "SC", category: "HISTORICA",  visibleInTorre: false },
  { ka: 135, nombre: "DOCUMENTO SOPORTE GASTOS",       codigo: "SG", category: "HISTORICA",  visibleInTorre: false },
  { ka: 136, nombre: "PRUEBAS PEDIDOS",                codigo: "PP", category: "HISTORICA",  visibleInTorre: false },
  { ka: 137, nombre: "ANTICIPOS AGAVAL",               codigo: "AG", category: "HISTORICA",  visibleInTorre: false },
  { ka: 143, nombre: "FACTURA ELECTRONICA DE VENTA",   codigo: "FX", category: "HISTORICA",  visibleInTorre: false },
  { ka: 145, nombre: "SALIDA DE ALMACEN",              codigo: "SA", category: "HISTORICA",  visibleInTorre: false },

  // ══ OBSOLETA — inactivas, excluidas (N/A en Excel) ═══════════════════════════
  { ka: 31,  nombre: "N.C. CLIENTES",                  codigo: "N2", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 32,  nombre: "N.C. PROVEEDORES",               codigo: "NP", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 49,  nombre: "COTIZACION",                     codigo: "CT", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 53,  nombre: "ORDEN DE COMPRA",                codigo: "OC", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 69,  nombre: "APLICACION ANTICIPOS PROV.",     codigo: "VV", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 78,  nombre: "APLICACION DE ANTIC Y NC PROV",  codigo: "AK", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 79,  nombre: "ORDEN DE TRABAJO",               codigo: "OT", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 82,  nombre: "PRESTAMOS",                      codigo: "T+", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 83,  nombre: "DEVOLUCION PTMOS",               codigo: "T-", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 87,  nombre: "COMPRAS ACTIVOS FIJOS",          codigo: "CA", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 112, nombre: "SISTECREDITO",                   codigo: "XX", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 123, nombre: "CUADRE SAN DIEGO",               codigo: "ES", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 124, nombre: "CUADRE MAYORCA",                 codigo: "EM", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 144, nombre: "CAMBIO TALLA COLOR",             codigo: "TC", category: "OBSOLETA",   visibleInTorre: false },
  { ka: 146, nombre: "INV FISICO",                     codigo: "I1", category: "OBSOLETA",   visibleInTorre: false },

  // ══ ARKETOPS — control fiscal (creado por Arketops), no en torre ═════════════
  // Nota: varios códigos duplicados (DE, CI, S5, AD) — usar ka para distinguir.
  { ka: 5,   nombre: "SALDOS INICIALES CONTABILIDAD",  codigo: "S1", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 6,   nombre: "SALDOS INICIALES INVENTARIO",    codigo: "S2", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 7,   nombre: "SALDOS INICIALES C X C",         codigo: "S3", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 8,   nombre: "SALDOS INICIALES C X P",         codigo: "S4", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 18,  nombre: "DEPRECIACIÓN COLGAP",            codigo: "DE", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 22,  nombre: "CIERRE FIN DE AÑO COLGAP",       codigo: "CI", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 28,  nombre: "NOTAS CRÉDITO BANCARIAS",        codigo: "CB", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 43,  nombre: "AJUSTE AL COSTO",                codigo: "AC", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 44,  nombre: "S.I. DEPRECIACIÓN COLGAP",       codigo: "S5", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 54,  nombre: "DIFERIDOS",                      codigo: "DF", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 84,  nombre: "CIERRE FIN DE AÑO NIIF",         codigo: "CI", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 86,  nombre: "S.I. DEPRECIACIÓN NIIF",         codigo: "S5", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 88,  nombre: "ADICIONES ACTIVOS FIJOS COLGAP", codigo: "AD", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 89,  nombre: "ADICIONES ACTIVOS FIJOS NIIF",   codigo: "AD", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 90,  nombre: "DEPRECIACIÓN NIIF",              codigo: "DE", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 91,  nombre: "DETERIORO ACTIVOS FIJOS - NIIF", codigo: "DN", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 120, nombre: "AJUSTE AL COSTO",                codigo: "K1", category: "ARKETOPS",   visibleInTorre: false },
  { ka: 121, nombre: "AJUSTE AL COSTO NO USAR",        codigo: "K",  category: "ARKETOPS",   visibleInTorre: false },
  { ka: 142, nombre: "AJUSTE DE IMPUESTOS",            codigo: "IC", category: "ARKETOPS",   visibleInTorre: false },
];

// ── Mapas de lookup ────────────────────────────────────────────────────────────

/** Indexado por ka_ni_fuente (único). Lookup primario. O(1). */
const BY_KA = new Map<number, CastillitosFuente>(
  CASTILLITOS_FUENTES_REGISTRY.map(f => [f.ka, f]),
);

/**
 * Indexado por k_sc_codigo_fuente (NO único).
 * Cuando hay duplicados retorna el primero en el registro (orden de definición).
 * Para lookups que requieren unicidad, usar byKa con ka_ni_fuente.
 */
const BY_CODE = new Map<string, CastillitosFuente>(
  // Iterar en reversa para que el primero (menor ka) quede como valor final
  [...CASTILLITOS_FUENTES_REGISTRY].reverse().map(f => [f.codigo.toUpperCase(), f]),
);

// ── API pública ────────────────────────────────────────────────────────────────

/** Lookup por ka_ni_fuente — siempre único. */
export function fuenteByKa(ka: number): CastillitosFuente | undefined {
  return BY_KA.get(ka);
}

/**
 * Lookup por k_sc_codigo_fuente (case-insensitive).
 * Cuando hay duplicados retorna el de menor ka_ni_fuente.
 * Preferir fuenteByKa() cuando se tiene la clave entera.
 */
export function fuenteByCodigo(codigo: string): CastillitosFuente | undefined {
  return BY_CODE.get(codigo.trim().toUpperCase());
}

/** Todas las fuentes de una categoría. */
export function fuentesByCategory(category: SagFuenteCategory): CastillitosFuente[] {
  return CASTILLITOS_FUENTES_REGISTRY.filter(f => f.category === category);
}

/**
 * Fuentes visibles en torre de control (solo OFICIAL).
 * Usar para poblar filtros, dropdowns y vistas en la UI operativa.
 */
export function fuentesVisiblesEnTorre(): CastillitosFuente[] {
  return CASTILLITOS_FUENTES_REGISTRY.filter(f => f.visibleInTorre);
}

/** Categoría de un ka_ni_fuente. null = desconocido (no está en el registro). */
export function categoryOfKa(ka: number): SagFuenteCategory | null {
  return BY_KA.get(ka)?.category ?? null;
}

/** Categoría de un k_sc_codigo_fuente. null = desconocido. */
export function categoryOfCodigo(codigo: string): SagFuenteCategory | null {
  return fuenteByCodigo(codigo)?.category ?? null;
}

/**
 * True cuando el ka_ni_fuente está activo (no es OBSOLETA ni HISTORICA).
 * ARKETOPS, PRODUCCION, INVENTARIO y NO_OFICIAL también retornan true —
 * están activos aunque no sean visibles en torre.
 */
export function isActiveFuente(ka: number): boolean {
  const cat = categoryOfKa(ka);
  return cat !== null && cat !== "OBSOLETA" && cat !== "HISTORICA";
}

/**
 * True cuando el ka_ni_fuente es OFICIAL.
 * Solo estas fuentes contribuyen a KPIs de ingresos en torre de control.
 */
export function isOficialFuente(ka: number): boolean {
  return categoryOfKa(ka) === "OFICIAL";
}

/**
 * True cuando el ka_ni_fuente corresponde a una factura de venta
 * (genera ingreso reconocido y cartera por cobrar).
 * Evalúa por nombre/código porque dentro de OFICIAL hay recibos, anticipos, etc.
 */
export function isFacturaVenta(ka: number): boolean {
  const FACTURA_KAS = new Set([
    101, // FE — Factura electrónica de venta (vigente)
    93,  // F1 — Factura de venta (histórica)
    48,  // VC — Factura de venta POS (histórica)
    92,  // V1 — Factura POS WI (histórica)
    103, // V2 — Factura POS SD (histórica)
    104, // V3 — Factura POS M (histórica)
    143, // FX — Factura electrónica de venta (histórica)
  ]);
  return FACTURA_KAS.has(ka);
}

// ── SagDocumentFamilyMap para el pipeline de ventas ───────────────────────────
//
// Mapea k_sc_codigo_fuente → SagDocumentFamily.
// Alcance: solo documentos relevantes para el módulo de VENTAS/INGRESOS.
// Producción, inventario, pagos, ajustes → quedan fuera del mapa (→ "OTHER").
//
// Este mapa se inyecta en Connector.config.documentFamilyMap y es leído
// por classifyDocumentFamily() en lib/sales/sag-document-type.ts.
//
// Confirmado 2026-04-20 desde FUENTES.xlsx.

export const CASTILLITOS_DOCUMENT_FAMILY_MAP: SagDocumentFamilyMap = {
  // Facturas de venta (generan ingreso + cartera por cobrar)
  "FE": "OFFICIAL_INVOICE",   // ka=101 — Factura electrónica (vigente)
  "F1": "OFFICIAL_INVOICE",   // ka=93  — Factura de venta (histórica)
  "VC": "OFFICIAL_INVOICE",   // ka=48  — Factura POS (histórica)
  "V1": "OFFICIAL_INVOICE",   // ka=92  — Factura POS WI (histórica)
  "V2": "OFFICIAL_INVOICE",   // ka=103 — Factura POS SD (histórica)
  "V3": "OFFICIAL_INVOICE",   // ka=104 — Factura POS M (histórica)
  "FX": "OFFICIAL_INVOICE",   // ka=143 — Factura electrónica (histórica)

  // Remisión / despacho (flujo operacional, sin cartera)
  "F2": "DISPATCH_REMISION",  // ka=2   — Remisión (vigente)

  // Notas crédito (reducen ingreso — devoluciones)
  "NE": "CREDIT_NOTE",        // ka=102 — Nota crédito electrónica (vigente)
  "NC": "CREDIT_NOTE",        // ka=139 — Nota crédito / notas empresa (vigente)
  "NX": "CREDIT_NOTE",        // ka=110 — Nota crédito electrónica (histórica)
  "D1": "CREDIT_NOTE",        // ka=25  — Devolución ventas (vigente)
  "D2": "CREDIT_NOTE",        // ka=98  — Devolución ventas 2 (no oficial)
  "2D": "CREDIT_NOTE",        // ka=106 — Devolución vtas San Diego (histórica)
  "3D": "CREDIT_NOTE",        // ka=107 — Devolución vtas Mayorca (histórica)

  // Notas débito bancarias
  "DB": "DEBIT_NOTE",         // ka=21  — Notas débito bancarias (vigente)
};

// ── Inferencia desde k_sc_codigo_fuente ───────────────────────────────────────
//
// Puente entre el registro de fuentes y el pipeline de inferencia.
// Usado cuando no hay documentFamilyMap configurado en el conector.

import type { SagSourceType } from "@/lib/sag/source-inference";

/**
 * Infiere SagSourceType desde k_sc_codigo_fuente de Castillitos.
 * Retorna null cuando el código no está mapeado (se delega al fallback de source-inference).
 *
 * Solo OFICIAL + NO_OFICIAL participan en FUENTE_1/FUENTE_2.
 * PRODUCCION, INVENTARIO, ARKETOPS, HISTORICA, OBSOLETA → null (excluidos del pipeline).
 */
export function inferSagSourceFromCodigo(codigo: string): SagSourceType | null {
  const fuente = fuenteByCodigo(codigo);
  if (!fuente) return null;
  if (fuente.category === "OFICIAL")    return "OFICIAL";
  if (fuente.category === "NO_OFICIAL") {
    // F2 (REMISION) → REMISION. El resto de NO_OFICIAL → OFICIAL conservadoramente.
    return fuente.codigo === "F2" ? "REMISION" : "OFICIAL";
  }
  return null;
}

// ── Compatibilidad con CastillitosValueSet (para castillitos-overrides.ts) ────

export const CASTILLITOS_FUENTES_VALUE_SET = {
  confirmed:   true as const,
  confirmedAt: "2026-04-20",
  values:      CASTILLITOS_FUENTES_REGISTRY.map(f => String(f.ka)),
  labels:      Object.fromEntries(
    CASTILLITOS_FUENTES_REGISTRY.map(f => [
      String(f.ka),
      `${f.codigo} — ${f.nombre} [${f.category}]`,
    ]),
  ) as Record<string, string>,
};

// ── Labels de categoría ────────────────────────────────────────────────────────

export const SAG_FUENTE_CATEGORY_LABELS: Record<SagFuenteCategory, string> = {
  OFICIAL:    "Oficial — Torre de Control",
  NO_OFICIAL: "No oficial — Libros secundarios",
  PRODUCCION: "Producción / Manufactura",
  INVENTARIO: "Inventario operativo",
  HISTORICA:  "Histórica — Saldos anteriores",
  OBSOLETA:   "Obsoleta — Excluida",
  ARKETOPS:   "Control fiscal Arketops",
};
