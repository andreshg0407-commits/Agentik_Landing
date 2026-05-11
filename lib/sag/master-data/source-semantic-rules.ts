/**
 * lib/sag/master-data/source-semantic-rules.ts
 *
 * Segunda capa semántica contable sobre el gobierno de datos de Castillitos.
 *
 * FUENTES.xlsx define si un documento es OFICIAL/NO_OFICIAL/ARKETOPS/etc.
 * Eso es gobernanza. Este archivo añade la semántica financiera:
 *   - ¿Qué tipo de documento es (venta, compra, gasto, cobro…)?
 *   - ¿Qué módulo del dashboard alimenta?
 *   - ¿Tiene signo positivo o negativo sobre el indicador?
 *   - ¿Por qué canal opera (empresa, almacén, web)?
 *
 * Regla fundamental:
 *   CLASIFICACION = OFICIAL  ≠  es una venta.
 *   C1 (FACTURA DE COMPRA) es OFICIAL pero es CxP, no ingreso.
 *   La familiaDocumento + moduloDashboard determinan el tratamiento.
 *
 * Fuente primaria: FUENTES.xlsx (Castillitos, 2026-04-20)
 * Identificador único: kaNiFuente (integer, siempre único en el Excel)
 * Código de negocio: codigoFuente (k_sc_codigo_fuente, NO único — hay duplicados)
 */

// ── Tipos ──────────────────────────────────────────────────────────────────────

/** Estado operacional del documento en el sistema actual. */
export type EstadoUso =
  | "ACTIVE"      // Se genera hoy en operaciones normales
  | "HISTORICAL"  // "Se usó hace tiempo — se necesita para saldos anteriores"
  | "EXCLUDED";   // N/A — obsoleto, nunca relevante para analítica

/**
 * Capa de dato.
 * Todos los documentos en FUENTES son SAG; se distinguen por su naturaleza.
 */
export type CapaDato =
  | "SAG_OFICIAL"     // clasificacion = OFICIAL — documentos de reporte financiero
  | "SAG_NO_OFICIAL"  // clasificacion = NO_OFICIAL o REMISION — libro auxiliar
  | "SAG_ARKETOPS"    // clasificacion = ARKETOPS — asientos internos de contabilidad
  | "SAG_PRODUCCION"  // clasificacion = PRODUCCION — flujo de manufactura
  | "SAG_INVENTARIO"  // operaciones de inventario físico / ajustes
  | "EXCLUIDO";       // N/A — no procesar

/**
 * Familia contable del documento.
 * Determina cómo se agrupa en balances y dashboards.
 */
export type FamiliaDocumento =
  | "VENTA"               // Factura de venta — genera ingreso + cartera
  | "REMISION_DESPACHO"   // Remisión — despacho sin factura (F2), aún no ingreso
  | "DEVOLUCION_VENTA"    // Nota crédito / devolución — reduce ingreso y cartera
  | "PAGO_CLIENTE"        // Recibo de caja — reduce cartera, entra caja
  | "ANTICIPO_CLIENTE"    // Anticipo recibido de cliente
  | "COMPRA"              // Factura de compra — genera CxP
  | "DEVOLUCION_COMPRA"   // Devolución / nota débito proveedor — reduce CxP
  | "GASTO"               // Causación de gasto — genera CxP o egreso directo
  | "DEVOLUCION_GASTO"    // Reversión de gasto causado
  | "PAGO_PROVEEDOR"      // Egreso — paga CxP, sale caja
  | "ANTICIPO_PROVEEDOR"  // Anticipo pagado a proveedor
  | "PEDIDO"              // Pedido de cliente — pre-venta, sin impacto financiero aún
  | "COTIZACION"          // Cotización — pipeline, no financiero
  | "NOMINA"              // Provisión / pago de nómina
  | "AJUSTE_CONTABLE"     // Asiento de ajuste — no operacional
  | "NOTA_DEBITO_BANCO"   // Nota débito bancaria
  | "NOTA_CREDITO_BANCO"  // Nota crédito bancaria (Arketops)
  | "BANCO"               // Movimiento bancario / consignación pendiente
  | "INVENTARIO"          // Conteo físico / ajuste de inventario
  | "PRODUCCION"          // Órdenes y movimientos de producción
  | "SALDO_INICIAL"       // Saldo inicial contable (Arketops)
  | "DEPRECIACION"        // Depreciación (Arketops)
  | "CIERRE_CONTABLE"     // Cierre de año (Arketops)
  | "IMPORTACION"         // Factura / liquidación de importación (Arketops)
  | "ACTIVO_FIJO"         // Compra / adición de activo fijo
  | "DIFERIDO"            // Diferido contable (Arketops)
  | "SISTECREDIT"         // Pago vía Sistecredit (financiamiento cliente)
  | "BONO"                // Bonos / tarjetas de regalo
  | "OTRO";               // Sin clasificación específica

/**
 * Efecto en los estados financieros del dashboard.
 * Responde: ¿cómo afecta este documento los indicadores gerenciales?
 */
export type EfectoFinanciero =
  | "INGRESO"               // Aumenta ventas / ingresos
  | "REDUCCION_INGRESO"     // Reduce ventas (devoluciones, notas crédito)
  | "CUENTA_POR_COBRAR"     // Afecta CxC (crea o reduce cartera)
  | "CUENTA_POR_PAGAR"      // Afecta CxP (crea obligación con proveedor)
  | "REDUCCION_CXP"         // Reduce CxP (devolución compra / gasto)
  | "EGRESO"                // Salida de caja / banco
  | "AJUSTE"                // Ajuste sin impacto en P&L dashboard
  | "SIN_IMPACTO_DASHBOARD"; // No modifica ningún indicador del dashboard

/**
 * Módulo del dashboard donde debe aparecer este documento.
 * Guía el routing de datos en las queries de agregación.
 */
export type ModuloDashboard =
  | "VENTAS_DIA"        // Panel ejecutivo: ventas del día / período
  | "FACTURAS_DIA"      // Panel ejecutivo: facturas emitidas (incluye NC)
  | "CARTERA"           // Cartera y cobranza: saldo abierto
  | "COBROS"            // Cobros recibidos del período
  | "CUENTAS_POR_PAGAR" // Obligaciones con proveedores
  | "PAGOS_PROVEEDOR"   // Pagos realizados a proveedores
  | "BANCOS"            // Movimientos bancarios / tesorería
  | "INVENTARIO"        // Inventario físico / ajustes
  | "PRODUCCION"        // Módulo de producción
  | "NOMINA"            // Nómina y prestaciones
  | "SOLO_HISTORICO"    // Solo datos históricos, no panel activo
  | "EXCLUIDO";         // No aparece en ningún panel del dashboard

/** Signo financiero sobre el indicador al que contribuye. */
export type SignoFinanciero = 1 | -1 | 0;

/**
 * Línea comercial interna del tenant.
 *
 * Separación explícita del modelo:
 *   ≠ businessOwner  (propietario legal: CASTILLITOS vs ARKETOPS)
 *   ≠ canal          (EMPRESA | ALMACEN | ONLINE)
 *   ≠ unidad op.     (tienda física concreta)
 *   ≠ tipo financiero (F1/F2/POS/COBRO)
 *
 * Extensible — agregar nuevas líneas aquí cuando se confirmen con contabilidad.
 * "TOP LÍNEA" futuro del dashboard usará businessLine, no fuente ni canal.
 */
export type BusinessLine =
  | "CASTILLITOS"  // Marca principal — la mayoría de documentos
  | "LATIN_KIDS"   // Línea infantil interna de Castillitos (NO ARKETOPS, NO externo)
  | "PETS"         // Línea mascotas — futura, reservado
  | "OTHER";       // Sin clasificar o pendiente de confirmar con contabilidad

/**
 * Canal de operación que generó el documento.
 * Permite separar empresa, almacenes y web en ventas, top líneas y facturación.
 */
export type CanalOperacion =
  | "EMPRESA"   // Operación B2B desde la empresa (FE, clientes corporativos)
  | "ALMACEN"   // Punto de venta físico (San Diego, Centro, Gran Plaza, Caldas)
  | "WEB"       // E-commerce / página web (FW)
  | "MIXTO"     // Aplica a múltiples canales (ej. R1 general)
  | "NO_APLICA"; // No tiene canal comercial (compras, gastos, nómina, etc.)

/** Regla semántica completa para una fuente SAG de Castillitos. */
export interface SourceSemanticRule {
  /** Identificador único del Excel (ka_ni_fuente). Siempre único. */
  kaNiFuente:               number;
  /** Código SAG (k_sc_codigo_fuente). Puede haber duplicados — usar kaNiFuente como PK. */
  codigoFuente:             string;
  /** Nombre descriptivo del documento (sc_nombre_fuente). */
  nombreFuente:             string;
  /** Valor raw de CLASIFICACION CASTILLITOS del Excel. */
  clasificacionCastillitos: string;
  /** Nota adicional del Excel (columna Nota). */
  nota:                     string | null;
  /** Estado operacional actual. */
  estadoUso:                EstadoUso;
  /** Capa de dato en arquitectura de fuentes. */
  capaDato:                 CapaDato;
  /** Familia contable del documento. */
  familiaDocumento:         FamiliaDocumento;
  /** Efecto sobre los indicadores financieros del dashboard. */
  efectoFinanciero:         EfectoFinanciero;
  /** Módulo(s) del dashboard donde aparece. */
  moduloDashboard:          ModuloDashboard;
  /**
   * Signo financiero sobre el indicador principal.
   *  1 = aumenta el indicador (venta, cobro, compra crea CxP)
   * -1 = reduce el indicador (devolución, pago reduce CxP)
   *  0 = neutro / no aplica
   */
  signo:                    SignoFinanciero;
  /** ¿Afecta el saldo de cartera (CxC)? */
  participaEnCartera:       boolean;
  /** ¿Contribuye a métricas de ventas brutas? */
  participaEnVentas:        boolean;
  /** ¿Afecta cuentas por pagar? */
  participaEnCxp:           boolean;
  /** ¿Afecta posición de caja / bancos? */
  participaEnCaja:          boolean;
    /** Canal comercial que generó el documento. */
  canalOperacion:           CanalOperacion;
  /**
   * ¿Debe aparecer en el panel ejecutivo principal de Castillitos?
   * false = pertenece a ARKETOPS (tercero contable) — excluido del dashboard gerencial.
   * Omitido en entradas antiguas → implícitamente true (Castillitos).
   */
  visibleInExecutive?: boolean;
  /**
   * Propietario del negocio.
   * "ARKETOPS" = asientos contables internos que NO son operación Castillitos.
   * Omitido → implícitamente "CASTILLITOS".
   */
  businessOwner?: "CASTILLITOS" | "ARKETOPS";
  /**
   * Línea comercial interna a la que pertenece este documento.
   *
   * MODELO CONCEPTUAL (no mezclar con businessOwner, canal ni unidad operativa):
   *   Tenant:            Castillitos (el tenant, invariante)
   *   Unidad operativa:  Empresa, San Diego, Centro, Gran Plaza, Caldas, Web  → canalOperacion
   *   Canal:             EMPRESA, ALMACEN, ONLINE                             → SaleChannel / canalOperacion
   *   Tipo financiero:   F1, F2, POS, COBRO, AJUSTE, CXP, INVENTARIO          → familiaDocumento
   *   Línea comercial:   Castillitos, Latin Kids, Pets, Otra                  → businessLine ← este campo
   *
   * "LATIN_KIDS" es una línea interna de Castillitos (businessOwner = "CASTILLITOS").
   * NO es ARKETOPS ni proveedor externo.
   *
   * Omitido → implícitamente "CASTILLITOS".
   * La lógica de dashboard NO debe usarse hasta cerrar la tabla maestra de fuentes.
   */
  businessLine?: BusinessLine;
  /**
   * ¿Requiere revisión contable antes de clasificar definitivamente?
   * true = no sabemos aún si es devolución de cliente, devolución de compra
   *        o ajuste interno. Marcar hasta que contabilidad confirme.
   * Aplica especialmente a documentos dudosos de Latin Kids u otras líneas internas.
   */
  needsAccountingReview?: boolean;
}

// ── Helpers internos ───────────────────────────────────────────────────────────

function venta(
  ka: number, cod: string, nombre: string, clas: string, nota: string | null,
  canal: CanalOperacion, estadoUso: EstadoUso = "ACTIVE",
): SourceSemanticRule {
  return {
    kaNiFuente: ka, codigoFuente: cod, nombreFuente: nombre,
    clasificacionCastillitos: clas, nota,
    estadoUso, capaDato: estadoUso === "ACTIVE" ? "SAG_OFICIAL" : estadoUso === "HISTORICAL" ? "SAG_OFICIAL" : "EXCLUIDO",
    familiaDocumento: "VENTA", efectoFinanciero: "INGRESO",
    moduloDashboard: estadoUso === "ACTIVE" ? "VENTAS_DIA" : "SOLO_HISTORICO",
    signo: 1,
    participaEnCartera: true, participaEnVentas: true, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: canal,
  };
}

function devVenta(
  ka: number, cod: string, nombre: string, clas: string, nota: string | null,
  canal: CanalOperacion, estadoUso: EstadoUso = "ACTIVE",
): SourceSemanticRule {
  return {
    kaNiFuente: ka, codigoFuente: cod, nombreFuente: nombre,
    clasificacionCastillitos: clas, nota,
    estadoUso, capaDato: estadoUso === "ACTIVE" ? (clas === "NO_OFICIAL" ? "SAG_NO_OFICIAL" : "SAG_OFICIAL") : "SAG_OFICIAL",
    familiaDocumento: "DEVOLUCION_VENTA", efectoFinanciero: "REDUCCION_INGRESO",
    moduloDashboard: estadoUso === "ACTIVE" ? "FACTURAS_DIA" : "SOLO_HISTORICO",
    signo: -1,
    participaEnCartera: true, participaEnVentas: true, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: canal,
  };
}

function cobro(
  ka: number, cod: string, nombre: string, clas: string, nota: string | null,
  canal: CanalOperacion, familia: FamiliaDocumento = "PAGO_CLIENTE",
  estadoUso: EstadoUso = "ACTIVE",
): SourceSemanticRule {
  return {
    kaNiFuente: ka, codigoFuente: cod, nombreFuente: nombre,
    clasificacionCastillitos: clas, nota,
    estadoUso, capaDato: estadoUso === "ACTIVE" ? "SAG_OFICIAL" : "SAG_OFICIAL",
    familiaDocumento: familia, efectoFinanciero: "CUENTA_POR_COBRAR",
    moduloDashboard: estadoUso === "ACTIVE" ? "COBROS" : "SOLO_HISTORICO",
    signo: 1,
    participaEnCartera: true, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: canal,
  };
}

function excluido(
  ka: number, cod: string, nombre: string, clas: string,
  familia: FamiliaDocumento = "OTRO",
): SourceSemanticRule {
  return {
    kaNiFuente: ka, codigoFuente: cod, nombreFuente: nombre,
    clasificacionCastillitos: clas, nota: null,
    estadoUso: "EXCLUDED", capaDato: "EXCLUIDO",
    familiaDocumento: familia, efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  };
}

function produccion(
  ka: number, cod: string, nombre: string,
): SourceSemanticRule {
  return {
    kaNiFuente: ka, codigoFuente: cod, nombreFuente: nombre,
    clasificacionCastillitos: "PRODUCCION", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_PRODUCCION",
    familiaDocumento: "PRODUCCION", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "PRODUCCION", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  };
}

function arketops(
  ka: number, cod: string, nombre: string, familia: FamiliaDocumento,
): SourceSemanticRule {
  return {
    kaNiFuente: ka, codigoFuente: cod, nombreFuente: nombre,
    clasificacionCastillitos: "ARKETOPS", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_ARKETOPS",
    familiaDocumento: familia, efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
    visibleInExecutive: false,
    businessOwner: "ARKETOPS",
  };
}

// ── Registro completo — 161 fuentes ───────────────────────────────────────────
// Ordenadas por kaNiFuente (ka_ni_fuente del Excel).

export const CASTILLITOS_SOURCE_SEMANTIC_RULES: readonly SourceSemanticRule[] = [

  // ── 1. COMPRA (C1) — OFICIAL pero NO es venta. Es CxP / proveedor. ──────────
  {
    kaNiFuente: 1, codigoFuente: "C1", nombreFuente: "FACTURA DE COMPRA",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "COMPRA", efectoFinanciero: "CUENTA_POR_PAGAR",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 2. REMISION (F2) — despacho sin factura, no es ingreso hasta conversión ──
  {
    kaNiFuente: 2, codigoFuente: "F2", nombreFuente: "REMISION",
    clasificacionCastillitos: "REMISION", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "REMISION_DESPACHO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "MIXTO",
  },

  // ── 3. EGRESOS (E1) — pagos a proveedores ────────────────────────────────────
  {
    kaNiFuente: 3, codigoFuente: "E1", nombreFuente: "EGRESOS",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "PAGO_PROVEEDOR", efectoFinanciero: "EGRESO",
    moduloDashboard: "PAGOS_PROVEEDOR", signo: -1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },

  // ── 4. RECIBO DE CAJA (R1) — cobros generales ────────────────────────────────
  cobro(4, "R1", "RECIBO DE CAJA", "OFICIAL", null, "MIXTO"),

  // ── 5-8. SALDOS INICIALES (Arketops) ─────────────────────────────────────────
  arketops(5,  "S1", "SALDOS INICIALES CONTABILIDAD", "SALDO_INICIAL"),
  arketops(6,  "S2", "SALDOS INICIALES INVENTARIO",   "SALDO_INICIAL"),
  arketops(7,  "S3", "SALDOS INICIALES C X C",        "SALDO_INICIAL"),
  arketops(8,  "S4", "SALDOS INICIALES C X P",        "SALDO_INICIAL"),

  // ── 10. GASTOS CAUSADOS (G1) — CxP / causaciones ────────────────────────────
  {
    kaNiFuente: 10, codigoFuente: "G1", nombreFuente: "GASTOS CAUSADOS",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "GASTO", efectoFinanciero: "CUENTA_POR_PAGAR",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 12. ANTICIPOS CLIENTES SISTECREDIT ────────────────────────────────────────
  cobro(12, "AN", "ANTICIPOS CLIENTES SISTECREDIT", "OFICIAL", null, "MIXTO", "ANTICIPO_CLIENTE"),

  // ── 17. AJUSTES CONTABLES (J1) ────────────────────────────────────────────────
  {
    kaNiFuente: 17, codigoFuente: "J1", nombreFuente: "AJUSTES CONTABLES",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "AJUSTE_CONTABLE", efectoFinanciero: "AJUSTE",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 18. DEPRECIACIÓN COLGAP (Arketops) ───────────────────────────────────────
  arketops(18, "DE", "DEPRECIACIÓN COLGAP", "DEPRECIACION"),

  // ── 21. NOTAS DÉBITO BANCARIAS ────────────────────────────────────────────────
  {
    kaNiFuente: 21, codigoFuente: "DB", nombreFuente: "NOTAS DÉBITO BANCARIAS",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "NOTA_DEBITO_BANCO", efectoFinanciero: "EGRESO",
    moduloDashboard: "BANCOS", signo: -1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },

  // ── 22. CIERRE FIN DE AÑO COLGAP (Arketops) ──────────────────────────────────
  arketops(22, "CI", "CIERRE FIN DE AÑO COLGAP", "CIERRE_CONTABLE"),

  // ── 25. DEVOLUCIÓN VENTAS (D1) ────────────────────────────────────────────────
  devVenta(25, "D1", "DEVOLUCIÓN VENTAS", "OFICIAL", null, "MIXTO"),

  // ── 27. DEVOLUCIÓN COMPRAS (DC) ───────────────────────────────────────────────
  {
    kaNiFuente: 27, codigoFuente: "DC", nombreFuente: "DEVOLUCIÓN COMPRAS",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "DEVOLUCION_COMPRA", efectoFinanciero: "REDUCCION_CXP",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: -1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 28. NOTAS CRÉDITO BANCARIAS (Arketops) ────────────────────────────────────
  arketops(28, "CB", "NOTAS CRÉDITO BANCARIAS", "NOTA_CREDITO_BANCO"),

  // ── 31-32. N.C. CLIENTES / PROVEEDORES (N/A) ─────────────────────────────────
  excluido(31, "N2", "N.C. CLIENTES",    "N/A", "DEVOLUCION_VENTA"),
  excluido(32, "NP", "N.C. PROVEEDORES", "N/A", "DEVOLUCION_COMPRA"),

  // ── 33-34. PRODUCCIÓN / INVENTARIO ───────────────────────────────────────────
  produccion(33, "OP", "ORDEN DE PRODUCCIÓN"),
  {
    kaNiFuente: 34, codigoFuente: "TR", nombreFuente: "TRASLADO ENTRE BODEGAS",
    clasificacionCastillitos: "ES MOVIENTO INTERNO DE INVENTARIO", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_INVENTARIO",
    familiaDocumento: "INVENTARIO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "INVENTARIO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 40-41. PEDIDOS CLIENTES / AJUSTE PEDIDOS ─────────────────────────────────
  {
    kaNiFuente: 40, codigoFuente: "PD", nombreFuente: "PEDIDOS CLIENTES",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "PEDIDO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "VENTAS_DIA", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "MIXTO",
  },
  {
    kaNiFuente: 41, codigoFuente: "AP", nombreFuente: "AJUSTE PEDIDOS",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "PEDIDO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 43-44. ARKETOPS ───────────────────────────────────────────────────────────
  arketops(43, "AC", "AJUSTE AL COSTO",          "AJUSTE_CONTABLE"),
  arketops(44, "S5", "S.I. DEPRECIACIÓN COLGAP",  "SALDO_INICIAL"),

  // ── 48. FACTURA DE VENTA POS (histórica) ──────────────────────────────────────
  venta(48, "VC", "FACTURA DE VENTA POS", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),

  // ── 49. COTIZACIÓN (N/A) ──────────────────────────────────────────────────────
  excluido(49, "CT", "COTIZACION", "N/A", "COTIZACION"),

  // ── 52. APLICACION ANTIC Y NC CLTES (histórica) ───────────────────────────────
  {
    kaNiFuente: 52, codigoFuente: "AA", nombreFuente: "APLICACION DE ANTIC Y NC CLTES",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "AJUSTE_CONTABLE", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 53. ORDEN DE COMPRA (N/A) ─────────────────────────────────────────────────
  excluido(53, "OC", "ORDEN DE COMPRA", "N/A", "COTIZACION"),

  // ── 54. DIFERIDOS (Arketops) ──────────────────────────────────────────────────
  arketops(54, "DF", "DIFERIDOS", "DIFERIDO"),

  // ── 65-76. INVENTARIO ────────────────────────────────────────────────────────
  {
    kaNiFuente: 65, codigoFuente: "IF", nombreFuente: "INVENTARIO FISICO",
    clasificacionCastillitos: "PARA DIGITACION DE LOS INVENTARIOS MES A MES", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_INVENTARIO",
    familiaDocumento: "INVENTARIO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "INVENTARIO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 68. ANTICIPO PROVEEDORES (1V) ─────────────────────────────────────────────
  {
    kaNiFuente: 68, codigoFuente: "1V", nombreFuente: "ANTICIPO PROVEEDORES",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "ANTICIPO_PROVEEDOR", efectoFinanciero: "CUENTA_POR_PAGAR",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },

  // ── 69. APLICACION ANTICIPOS PROV (N/A) ──────────────────────────────────────
  excluido(69, "VV", "APLICACION ANTICIPOS PROV.", "N/A"),

  // ── 76-77. AJUSTE INVENTARIO / ENTRADA ALMACÉN ───────────────────────────────
  {
    kaNiFuente: 76, codigoFuente: "AI", nombreFuente: "AJUSTE DE INVENTARIO",
    clasificacionCastillitos: "PARA AJUSTES DE INVENTARIOS", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_INVENTARIO",
    familiaDocumento: "INVENTARIO", efectoFinanciero: "AJUSTE",
    moduloDashboard: "INVENTARIO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 77, codigoFuente: "EA", nombreFuente: "ENTRADA A ALMACEN",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "INVENTARIO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 78-79. N/A ────────────────────────────────────────────────────────────────
  excluido(78, "AK", "APLICACION DE ANTIC Y NC PROV", "N/A"),
  excluido(79, "OT", "ORDEN DE TRABAJO", "N/A"),

  // ── 80-81. PRODUCCIÓN ────────────────────────────────────────────────────────
  produccion(80, "CN", "CONSUMOS INSUMOS Y TELAS"),
  produccion(81, "PT", "ENTRADA PT"),

  // ── 82-83. N/A ────────────────────────────────────────────────────────────────
  excluido(82, "T+", "PRESTAMOS",        "N/A"),
  excluido(83, "T-", "DEVOLUCION PTMOS", "N/A"),

  // ── 84-91. ARKETOPS ───────────────────────────────────────────────────────────
  arketops(84, "CI", "CIERRE FIN DE AÑO NIIF",        "CIERRE_CONTABLE"),
  arketops(86, "S5", "S.I. DEPRECIACIÓN NIIF",         "SALDO_INICIAL"),
  excluido(87, "CA", "COMPRAS ACTIVOS FIJOS",           "N/A",       "ACTIVO_FIJO"),
  arketops(88, "AD", "ADICIONES ACTIVOS FIJOS COLGAP",  "ACTIVO_FIJO"),
  arketops(89, "AD", "ADICIONES ACTIVOS FIJOS NIIF",    "ACTIVO_FIJO"),
  arketops(90, "DE", "DEPRECIACIÓN NIIF",               "DEPRECIACION"),
  arketops(91, "DN", "DETERIORO ACTIVOS FIJOS - NIIF",  "AJUSTE_CONTABLE"),

  // ── 92-93. VENTAS HISTÓRICAS ─────────────────────────────────────────────────
  venta(92, "V1", "FACTURA DE VETAS POS WI", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),
  venta(93, "F1", "FACTURA DE VENTA",        "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA",  "HISTORICAL"),

  // ── 94-98. NO OFICIALES ───────────────────────────────────────────────────────
  cobro(94, "R2", "RECIBO DE CAJA 2",      "NO_OFICIAL", null, "MIXTO"),
  {
    kaNiFuente: 95, codigoFuente: "C2", nombreFuente: "FACTURA DE COMPRAS 2",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "COMPRA", efectoFinanciero: "CUENTA_POR_PAGAR",
    moduloDashboard: "EXCLUIDO", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 96, codigoFuente: "G2", nombreFuente: "GASTOS 2",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "GASTO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 97, codigoFuente: "E2", nombreFuente: "EGRESOS 2",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "PAGO_PROVEEDOR", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  devVenta(98, "D2", "DEVOLUCIÓN VENTAS 2", "NO_OFICIAL", null, "MIXTO"),

  // ── 99-100. PRODUCCIÓN ────────────────────────────────────────────────────────
  produccion(99,  "PC", "SALIDA CONFECCIONISTAS"),
  produccion(100, "EC", "ENTRADA CONFECCIONISTAS"),

  // ── 101. FACTURA ELECTRÓNICA DE VENTA — EMPRESA ───────────────────────────────
  venta(101, "FE", "FACTURA ELECTRONICA DE VENTA", "OFICIAL", "FACTURA EMPRESA", "EMPRESA"),

  // ── 102. NOTA CRÉDITO ELECTRÓNICA — EMPRESA ───────────────────────────────────
  devVenta(102, "NE", "NOTA CREDITO ELECTRONICA", "OFICIAL", null, "EMPRESA"),

  // ── 103-104. VENTAS POS HISTÓRICAS ────────────────────────────────────────────
  venta(103, "V2", "FACTURA DE VETAS POS SD", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),
  venta(104, "V3", "FACTURA DE VETAS POS M",  "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),

  // ── 105. PROVISIÓN DE NÓMINA ──────────────────────────────────────────────────
  {
    kaNiFuente: 105, codigoFuente: "NO", nombreFuente: "PROVISÓN DE NOMINA",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "NOMINA", efectoFinanciero: "EGRESO",
    moduloDashboard: "NOMINA", signo: -1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 106-107. DEVOLUCIONES HISTÓRICAS ALMACENES ────────────────────────────────
  devVenta(106, "2D", "DEVOLUCION VTAS SAN DIEGO", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),
  devVenta(107, "3D", "DEVOLUCION VTAS MAYORCA",   "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),

  // ── 108. RECIBO DE CAJA SAN DIEGO ────────────────────────────────────────────
  cobro(108, "RS", "RECIBO DE CAJA SANDIEGO", "OFICIAL", "RECIBOS SAN DIEGO", "ALMACEN"),

  // ── 109-110. HISTÓRICAS ───────────────────────────────────────────────────────
  cobro(109, "RM", "RECIBO DE CAJA MAYORCA", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "PAGO_CLIENTE", "HISTORICAL"),
  devVenta(110, "NX", "NOTA CREDITO ELECTRONICA", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA", "HISTORICAL"),

  // ── 111-112. SISTECREDIT ──────────────────────────────────────────────────────
  cobro(111, "SI", "SISTECREDIT", "OFICIAL", null, "MIXTO"),
  excluido(112, "XX", "SISTECREDIT", "N/A"),

  // ── 113. AJUSTE CONTABLE 2 (NO OFICIAL) ──────────────────────────────────────
  {
    kaNiFuente: 113, codigoFuente: "J2", nombreFuente: "AJUSTE CONTABLE 2",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "AJUSTE_CONTABLE", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 114-119. PRODUCCIÓN ───────────────────────────────────────────────────────
  produccion(114, "4",  "PRODUCTO EN PROCESO"),
  produccion(115, "MV", "TRASLADO DE MOVIMIENTOS PDN"),
  produccion(116, "ET", "ENTRADA PRODUCTO TERMINADO"),
  produccion(117, "CM", "CONSUMO DE MUESTRAS"),
  produccion(118, "T2", "GASTOS DE TERCEROS"),
  produccion(119, "Y1", "CAUSACION DE SERVICIOS T"),

  // ── 120-121. ARKETOPS (ajuste al costo) ──────────────────────────────────────
  arketops(120, "K1", "AJUSTE AL COSTO",          "AJUSTE_CONTABLE"),
  arketops(121, "K",  "AJUSTE AL COSTO NO USAR",  "AJUSTE_CONTABLE"),

  // ── 122. ANTICIPO CLIENTE EMPRESA ─────────────────────────────────────────────
  cobro(122, "A1", "ANTICIPO CLIENTE EMPRESA", "OFICIAL", null, "EMPRESA", "ANTICIPO_CLIENTE"),

  // ── 123-124. N/A (cuadres) ────────────────────────────────────────────────────
  excluido(123, "ES", "CUADRE SAN DIEGO", "N/A"),
  excluido(124, "EM", "CUADRE MAYORCA",   "N/A"),

  // ── 125. AJUSTES MEDIOS DE PAGO ───────────────────────────────────────────────
  {
    kaNiFuente: 125, codigoFuente: "AJ", nombreFuente: "AJUSTES MEDIOS DE PAGO",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BANCO", efectoFinanciero: "AJUSTE",
    moduloDashboard: "BANCOS", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },

  // ── 126-127. PRODUCCIÓN ───────────────────────────────────────────────────────
  produccion(126, "AD", "ADICIONES Y FALTANTES"),
  produccion(127, "CV", "CONSUMOS DE MUESTRAS Y VARIOS"),

  // ── 128. ANTICIPO CLIENTE 2 (NO OFICIAL) ─────────────────────────────────────
  {
    kaNiFuente: 128, codigoFuente: "A2", nombreFuente: "ANTICIPO CLIENTE 2",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "ANTICIPO_CLIENTE", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 129. PRODUCCIÓN ───────────────────────────────────────────────────────────
  produccion(129, "T1", "GASTOS TERCEROS"),

  // ── 130. DEVOLUCIÓN EN GASTOS ────────────────────────────────────────────────
  {
    kaNiFuente: 130, codigoFuente: "DG", nombreFuente: "DEVOLUCION EN GASTOS",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "DEVOLUCION_GASTO", efectoFinanciero: "REDUCCION_CXP",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: -1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 131. DEVOLUCIÓN COMPRAS LATIN (NO OFICIAL) ───────────────────────────────
  // Latin Kids = línea interna de Castillitos. businessOwner = "CASTILLITOS".
  // needsAccountingReview: no está claro si es devolución de cliente, de compra
  // o ajuste interno entre líneas. Contabilidad debe confirmar antes de activar
  // en dashboard. NO clasificar como ARKETOPS ni como proveedor externo.
  {
    kaNiFuente: 131, codigoFuente: "DL", nombreFuente: "DEVOLUCION COMPRAS LATIN",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "DEVOLUCION_COMPRA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
    businessOwner: "CASTILLITOS",
    businessLine: "LATIN_KIDS",
    needsAccountingReview: true,
  },

  // ── 133. PRODUCCIÓN ───────────────────────────────────────────────────────────
  produccion(133, "M2", "ENTRADA DE MUESTRAS"),

  // ── 134-137. HISTÓRICAS ───────────────────────────────────────────────────────
  {
    kaNiFuente: 134, codigoFuente: "SC", nombreFuente: "DOCUMENTO SOPORTE COMPRAS",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "COMPRA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 135, codigoFuente: "SG", nombreFuente: "DOCUMENTO SOPORTE GASTOS",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "GASTO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 136, codigoFuente: "PP", nombreFuente: "PRUEBAS PEDIDOS",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "PEDIDO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  cobro(137, "AG", "ANTICIPOS AGAVAL", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA", "ANTICIPO_CLIENTE", "HISTORICAL"),

  // ── 139. NOTA CRÉDITO ELECTRÓNICA — EMPRESA (NC) ─────────────────────────────
  devVenta(139, "NC", "NOTA CREDITO ELECTRONICA", "OFICIAL", "NOTAS EMPRESA", "EMPRESA"),

  // ── 140. PRODUCCIÓN ───────────────────────────────────────────────────────────
  produccion(140, "SR", "SALDO INICIAL RETAZOS"),

  // ── 141. ANTICIPO PROVEEDORES 2 (NO OFICIAL) ──────────────────────────────────
  {
    kaNiFuente: 141, codigoFuente: "2V", nombreFuente: "ANTICIPO PROVEEDORES 2",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "ANTICIPO_PROVEEDOR", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 142. ARKETOPS ─────────────────────────────────────────────────────────────
  arketops(142, "IC", "AJUSTE DE IMPUESTOS", "AJUSTE_CONTABLE"),

  // ── 143. FACTURA ELECTRÓNICA VENTA (histórica FX) ────────────────────────────
  venta(143, "FX", "FACTURA ELECTRONICA DE VENTA", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA", "HISTORICAL"),

  // ── 144-147. N/A ──────────────────────────────────────────────────────────────
  excluido(144, "TC", "CAMBIO TALLA COLOR",  "N/A"),
  {
    kaNiFuente: 145, codigoFuente: "SA", nombreFuente: "SALIDA DE ALMACEN",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "INVENTARIO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  excluido(146, "I1", "INV FISICO",       "N/A", "INVENTARIO"),
  excluido(147, "TB", "TRASLADO BANCOS",  "N/A", "BANCO"),

  // ── 148-152. CONSIGNACIONES PENDIENTES (banco) ────────────────────────────────
  {
    kaNiFuente: 148, codigoFuente: "B1", nombreFuente: "CONG PEND BANC CRT 0711",
    clasificacionCastillitos: "SE UTILIZA PARA REGISTRAR CONSIGNACIONES X IDENTIFICAR OFICIAL Y NO OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BANCO", efectoFinanciero: "AJUSTE",
    moduloDashboard: "BANCOS", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 149, codigoFuente: "B2", nombreFuente: "CONG PEND BOGO CRT 9945",
    clasificacionCastillitos: "SE UTILIZA PARA REGISTRAR CONSIGNACIONES X IDENTIFICAR OFICIAL Y NO OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BANCO", efectoFinanciero: "AJUSTE",
    moduloDashboard: "BANCOS", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 150, codigoFuente: "H1", nombreFuente: "CONG PEND BANC AHO 0313",
    clasificacionCastillitos: "SE UTILIZA PARA REGISTRAR CONSIGNACIONES X IDENTIFICAR OFICIAL Y NO OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BANCO", efectoFinanciero: "AJUSTE",
    moduloDashboard: "BANCOS", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 151, codigoFuente: "H2", nombreFuente: "CONG PEND BANC AHO 6827",
    clasificacionCastillitos: "SE UTILIZA PARA REGISTRAR CONSIGNACIONES X IDENTIFICAR OFICIAL Y NO OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BANCO", efectoFinanciero: "AJUSTE",
    moduloDashboard: "BANCOS", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 152, codigoFuente: "CP", nombreFuente: "CONSIGNACIONES PENDIENTES",
    clasificacionCastillitos: "SE UTILIZA PARA REGISTRAR CONSIGNACIONES X IDENTIFICAR OFICIAL Y NO OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BANCO", efectoFinanciero: "AJUSTE",
    moduloDashboard: "BANCOS", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "NO_APLICA",
  },

  // ── 153-155. HISTÓRICAS ───────────────────────────────────────────────────────
  {
    kaNiFuente: 153, codigoFuente: "TF", nombreFuente: "TRASLADOS FLAMINGO",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BANCO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  // FL: POSIBLEMENTE relacionado con Latin Kids ("Factura Latin"?).
  // Clasificado N/A en tabla maestra — excluido hasta confirmar con contabilidad.
  // needsAccountingReview: true — no sabemos si es factura de venta Latin Kids
  // o un código retirado sin relación. Mantener excluido hasta resolución.
  {
    kaNiFuente: 154, codigoFuente: "FL", nombreFuente: "FACTURA ELECTRONICA VENTA",
    clasificacionCastillitos: "N/A", nota: null,
    estadoUso: "EXCLUDED", capaDato: "EXCLUIDO",
    familiaDocumento: "VENTA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
    businessOwner: "CASTILLITOS",
    businessLine: "LATIN_KIDS",
    needsAccountingReview: true,
  },
  venta(155, "FF", "FACTURA ELECTRONICA VENTA", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA", "HISTORICAL"),

  // ── 156. BONOS ────────────────────────────────────────────────────────────────
  {
    kaNiFuente: 156, codigoFuente: "BN", nombreFuente: "BONOS",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "BONO", efectoFinanciero: "CUENTA_POR_COBRAR",
    moduloDashboard: "COBROS", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: true,
    canalOperacion: "MIXTO",
  },

  // ── 157. DESGLOSE DE MERCANCÍA ────────────────────────────────────────────────
  {
    kaNiFuente: 157, codigoFuente: "DS", nombreFuente: "DESGLOSE DE MERCANCIA",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "COMPRA", efectoFinanciero: "CUENTA_POR_PAGAR",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 158. DOC SOPORTE ELECTRÓNICO GASTO ───────────────────────────────────────
  // NOTA: ka=158 tiene código "DE" pero es GASTO, no depreciación (ka=18/90 también tienen "DE")
  {
    kaNiFuente: 158, codigoFuente: "DE", nombreFuente: "DOC SOPORTE ELECTRONICO GASTO",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "GASTO", efectoFinanciero: "CUENTA_POR_PAGAR",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 159-161. HISTÓRICAS ───────────────────────────────────────────────────────
  {
    kaNiFuente: 159, codigoFuente: "ED", nombreFuente: "DOC SOPORTE ELECTRONICO COMPRA",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "COMPRA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 160, codigoFuente: "CE", nombreFuente: "NOTA DOC SOPOR ELECTRO COMPRA",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "DEVOLUCION_COMPRA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 161, codigoFuente: "GE", nombreFuente: "NOTA DOC SOPOR ELECTRO GASTOS",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "DEVOLUCION_GASTO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 162. ARKETOPS ─────────────────────────────────────────────────────────────
  arketops(162, "K2", "AJUSTE AL COSTO 2", "AJUSTE_CONTABLE"),

  // ── 163. DOC SOPORTE ELECTRÓNICO COMPRA ──────────────────────────────────────
  {
    kaNiFuente: 163, codigoFuente: "T3", nombreFuente: "DOC SOPORTE ELECTRONICO",
    clasificacionCastillitos: "OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_OFICIAL",
    familiaDocumento: "COMPRA", efectoFinanciero: "CUENTA_POR_PAGAR",
    moduloDashboard: "CUENTAS_POR_PAGAR", signo: 1,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: true, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 164-169. HISTÓRICAS ───────────────────────────────────────────────────────
  {
    kaNiFuente: 164, codigoFuente: "F3", nombreFuente: "REMISION EV",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "REMISION_DESPACHO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "EMPRESA",
  },
  cobro(165, "R3", "RECIBOS CAJA EV",      "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA", "PAGO_CLIENTE", "HISTORICAL"),
  devVenta(166, "D3", "DEVOLUCION VENTAS EV", "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA", "HISTORICAL"),
  cobro(167, "A3", "ANTICIPO CLIENTES EV",  "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "EMPRESA", "ANTICIPO_CLIENTE", "HISTORICAL"),
  {
    kaNiFuente: 168, codigoFuente: "P1", nombreFuente: "PROVISÓN PRESTACIONES SOCIALES",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "NOMINA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },
  {
    kaNiFuente: 169, codigoFuente: "P2", nombreFuente: "PROVISIÓN SEGURIDAD SOCIAL",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "NOMINA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 170-171. NOTAS CRÉDITO EMPRESA ────────────────────────────────────────────
  devVenta(170, "ND", "NOTA CREDITO ELECTRONICA", "OFICIAL", "NOTAS EMPRESA", "EMPRESA"),
  devVenta(171, "NF", "NOTA CREDITO ELECTRONICA", "OFICIAL", "NOTAS EMPRESA", "EMPRESA"),

  // ── 172-173. HISTÓRICAS ───────────────────────────────────────────────────────
  devVenta(172, "4D", "DEVOLUCIÓN VTAS CENTRO",       "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),
  venta(173,   "V4", "FACTURA DE VENTA POS CENTRO",   "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),

  // ── 174-178. ALMACENES ACTIVOS ────────────────────────────────────────────────
  cobro(174, "RC", "RECIBO DE CAJA CENTRO",     "OFICIAL", "RECIBOS CENTRO",      "ALMACEN"),
  venta(175, "FD", "FACTURACIÓN ELECTRÓNICA SANDIEGO", "OFICIAL", "FACTURA SAN DIEGO ALMACEN", "ALMACEN"),
  venta(176, "FC", "FACTURA ELECTRÓNICA CENTRO",       "OFICIAL", "FACTURA CENTRO ALMACEN",    "ALMACEN"),
  venta(177, "FG", "FACTURACIÓN ELECTRÓNICA GRAN PLAZA","OFICIAL", "FACTURA GRAN PLAZA ALMACEN","ALMACEN"),
  cobro(178, "RG", "RECIBO DE CAJA GRAN PLAZA",  "OFICIAL", "RECIBOS GRAN PLAZA",  "ALMACEN"),

  // ── 179-181. HISTÓRICAS ───────────────────────────────────────────────────────
  venta(179,   "V5", "FACTURA VENTA POS GRAN PLAZA",  "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),
  devVenta(180, "5D", "DEVOLUCIÓN VENTAS GRAN PLAZA",  "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),
  devVenta(181, "DT", "DEVOLUCION DE TERCEROS",        "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "MIXTO",   "HISTORICAL"),

  // ── 182-189. IMPORTACIÓN (Arketops) ──────────────────────────────────────────
  arketops(182, "FI", "FACTURA DE IMPORTACION NACIONAL",  "IMPORTACION"),
  arketops(183, "GI", "GASTOS DE IMPORTACION",            "IMPORTACION"),
  arketops(184, "PX", "PROVISION IMPORTACION 2",          "IMPORTACION"),
  arketops(185, "GX", "GASTO IMP 2",                     "IMPORTACION"),
  arketops(186, "LX", "LIQUIDACION IMPORTACION 2",        "IMPORTACION"),
  arketops(187, "DI", "DEVOLUCION IMPORTACION",           "IMPORTACION"),
  {
    kaNiFuente: 188, codigoFuente: "DX", nombreFuente: "NOTA ELECTRONICA TERCEROS",
    clasificacionCastillitos: "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", nota: null,
    estadoUso: "HISTORICAL", capaDato: "SAG_OFICIAL",
    familiaDocumento: "DEVOLUCION_VENTA", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "SOLO_HISTORICO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "EMPRESA",
  },
  arketops(189, "FT", "FACTURA COMPRA CHINA DIF MER2", "IMPORTACION"),

  // ── 190-192. N/A ──────────────────────────────────────────────────────────────
  excluido(190, "PS", "PLAN SEPARE",           "N/A"),
  excluido(191, "FS", "FACTURA ELECTRÓNICA SANDIEGO", "N/A", "VENTA"),
  excluido(192, "AS", "ANTICIPOS PLAN SEPARE", "N/A"),

  // ── 193-195. HISTÓRICAS ───────────────────────────────────────────────────────
  venta(193,   "V6", "FACTURA VENTA POS CALDAS",    "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),
  venta(194,   "FA", "FACTURA ELECTRÓNICA CALDAS",  "OFICIAL", "FACTURA CALDAS ALMACEN", "ALMACEN"),
  devVenta(195, "6D", "DEVOLUCIÓN VENTAS CALDAS",   "SE USO HACE TIEMPO - SE NECESITA PARA SALDOS ANTERIORES", null, "ALMACEN", "HISTORICAL"),

  // ── 196-198. NOTAS CRÉDITO Y RECIBOS ALMACENES ───────────────────────────────
  devVenta(196, "NA", "NOTA CRÉDITO ELECTRÓNICA CALDAS",      "OFICIAL", "NOTA CREDITO CALDAS",     "ALMACEN"),
  devVenta(197, "NG", "NOTA CRÉDITO ELECTRÓNICA GRAN PLAZA",  "OFICIAL", "NOTA CREDITO GRAN PLAZA", "ALMACEN"),
  cobro(198, "RA", "RECIBO DE CAJA CALDAS",                  "OFICIAL", "RECIBOS CALDAS",           "ALMACEN"),

  // ── 200-202. NOTAS CRÉDITO ALMACENES ─────────────────────────────────────────
  devVenta(200, "NS", "NOTA CREDITO ELECTRÓNICA SANDIEGO", "OFICIAL", "NOTA CREDITO SAN DIEGO", "ALMACEN"),
  arketops(201, "PI", "PROVISION IMPORTACION", "IMPORTACION"),
  devVenta(202, "NT", "NOTA CREDITO ELECTRÓNICA CENTRO",   "OFICIAL", "NOTA CREDITO CENTRO",    "ALMACEN"),

  // ── 203-206. VARIOS ───────────────────────────────────────────────────────────
  excluido(203, "VA", ".",                    "N/A"),
  arketops(204, "AX", "DEVOLUCION IMPORTACION 2",  "IMPORTACION"),
  arketops(205, "LI", "LIQUIDACION IMPORTACION",   "IMPORTACION"),
  {
    kaNiFuente: 206, codigoFuente: "TM", nombreFuente: "TRASLADO DE MALETAS",
    clasificacionCastillitos: "NO_OFICIAL", nota: null,
    estadoUso: "ACTIVE", capaDato: "SAG_NO_OFICIAL",
    familiaDocumento: "INVENTARIO", efectoFinanciero: "SIN_IMPACTO_DASHBOARD",
    moduloDashboard: "EXCLUIDO", signo: 0,
    participaEnCartera: false, participaEnVentas: false, participaEnCxp: false, participaEnCaja: false,
    canalOperacion: "NO_APLICA",
  },

  // ── 207-208. VENTA WEB ────────────────────────────────────────────────────────
  venta(207,   "FW", "FACTURA ELECTRÓNICA WEB",         "OFICIAL", "FACTURA PAGINA WEB",  "WEB"),
  devVenta(208, "NW", "NOTA CREDITO ELECTRONICA PAGINA WEB", "OFICIAL", "NOTAS PAGINAS WEB", "WEB"),
];

// ── API de consulta ────────────────────────────────────────────────────────────

/** Mapa por kaNiFuente (siempre único). Construido una vez. */
const _byKa = new Map<number, SourceSemanticRule>(
  CASTILLITOS_SOURCE_SEMANTIC_RULES.map(r => [r.kaNiFuente, r]),
);

/** Mapa por codigoFuente (puede haber varios). */
const _byCodigo = new Map<string, SourceSemanticRule[]>();
for (const r of CASTILLITOS_SOURCE_SEMANTIC_RULES) {
  const list = _byCodigo.get(r.codigoFuente) ?? [];
  list.push(r);
  _byCodigo.set(r.codigoFuente, list);
}

/** Lookup por kaNiFuente. Lanza si no existe. */
export function ruleByKa(ka: number): SourceSemanticRule {
  const r = _byKa.get(ka);
  if (!r) throw new Error(`SourceSemanticRule: ka=${ka} no encontrado en FUENTES`);
  return r;
}

/** Lookup por kaNiFuente. Retorna null si no existe. */
export function ruleByKaOrNull(ka: number): SourceSemanticRule | null {
  return _byKa.get(ka) ?? null;
}

/**
 * Lookup por codigoFuente.
 * Como el código puede ser no único, retorna el array completo.
 * Para uso en parseo de XML/CSV, preferir ruleByKa cuando ka esté disponible.
 */
export function rulesByCodigo(codigo: string): SourceSemanticRule[] {
  return _byCodigo.get(codigo.toUpperCase()) ?? [];
}

/**
 * Lookup por codigoFuente retornando la regla ACTIVA de mayor prioridad.
 * En caso de duplicado de código (ej. "DE") prefiere: ACTIVE > HISTORICAL > EXCLUDED.
 * Úsalo cuando solo tienes el código y necesitas inferir rápido.
 */
export function ruleByCodigoActive(codigo: string): SourceSemanticRule | null {
  const all = rulesByCodigo(codigo);
  if (all.length === 0) return null;
  return (
    all.find(r => r.estadoUso === "ACTIVE") ??
    all.find(r => r.estadoUso === "HISTORICAL") ??
    all[0]
  );
}

// ── Filtros para dashboards ────────────────────────────────────────────────────

/** Fuentes activas que participan en ventas brutas (excluye históricas, excluidas y no oficiales). */
export function reglasDeVentaOficialActiva(): SourceSemanticRule[] {
  return CASTILLITOS_SOURCE_SEMANTIC_RULES.filter(
    r => r.estadoUso === "ACTIVE" && r.participaEnVentas && r.capaDato === "SAG_OFICIAL",
  );
}

/** Fuentes activas que participan en cartera (CxC). */
export function reglasDeCartera(): SourceSemanticRule[] {
  return CASTILLITOS_SOURCE_SEMANTIC_RULES.filter(
    r => r.estadoUso === "ACTIVE" && r.participaEnCartera,
  );
}

/** Fuentes activas que participan en CxP (cuentas por pagar). */
export function reglasDeCxp(): SourceSemanticRule[] {
  return CASTILLITOS_SOURCE_SEMANTIC_RULES.filter(
    r => r.estadoUso === "ACTIVE" && r.participaEnCxp,
  );
}

/** Fuentes activas que participan en cobros (caja entrada). */
export function reglasDeCobros(): SourceSemanticRule[] {
  return CASTILLITOS_SOURCE_SEMANTIC_RULES.filter(
    r => r.estadoUso === "ACTIVE" && r.moduloDashboard === "COBROS",
  );
}

/** Fuentes activas por módulo de dashboard. */
export function reglasPorModulo(modulo: ModuloDashboard): SourceSemanticRule[] {
  return CASTILLITOS_SOURCE_SEMANTIC_RULES.filter(
    r => r.estadoUso === "ACTIVE" && r.moduloDashboard === modulo,
  );
}

/** Fuentes de venta activas separadas por canal. */
export function reglasDeVentaPorCanal(): Record<CanalOperacion, SourceSemanticRule[]> {
  const ventas = reglasDeVentaOficialActiva();
  return {
    EMPRESA:   ventas.filter(r => r.canalOperacion === "EMPRESA"),
    ALMACEN:   ventas.filter(r => r.canalOperacion === "ALMACEN"),
    WEB:       ventas.filter(r => r.canalOperacion === "WEB"),
    MIXTO:     ventas.filter(r => r.canalOperacion === "MIXTO"),
    NO_APLICA: ventas.filter(r => r.canalOperacion === "NO_APLICA"),
  };
}

/** Códigos de fuente que corresponden a ventas activas de empresa. */
export function codigosVentaEmpresa(): string[] {
  return reglasDeVentaPorCanal().EMPRESA.map(r => r.codigoFuente);
}

/** Códigos de fuente que corresponden a ventas activas de almacenes. */
export function codigosVentaAlmacen(): string[] {
  return reglasDeVentaPorCanal().ALMACEN.map(r => r.codigoFuente);
}

/** Códigos de fuente que corresponden a ventas web. */
export function codigosVentaWeb(): string[] {
  return reglasDeVentaPorCanal().WEB.map(r => r.codigoFuente);
}

// ── Constantes SQL para uso en $queryRaw ──────────────────────────────────────
//
// Estas constantes se usan directamente en los fragmentos SQL de las queries
// de reports.ts y fpa-queries.ts para evitar hardcodear códigos.
// Se computan una vez al importar el módulo.
//
// IMPORTANTE: incluyen tanto activas como históricas para que los reportes
// con data de años anteriores no pierdan información.

function _quoteCodigos(codes: string[]): string {
  return codes.map(c => `'${c}'`).join(", ");
}

/**
 * Todos los códigos de fuente que representan facturas de venta (OFFICIAL_INVOICE).
 * Activas + históricas. Usa `sagDocumentFamily = 'OFFICIAL_INVOICE'` en su lugar
 * cuando el campo esté correctamente poblado; este array es el fallback por comprobanteCode.
 */
export const CODIGOS_VENTA_TODOS: readonly string[] = CASTILLITOS_SOURCE_SEMANTIC_RULES
  .filter(r => r.familiaDocumento === "VENTA" && r.estadoUso !== "EXCLUDED")
  .map(r => r.codigoFuente);

/** Códigos de facturas de venta vigentes (activas solamente). */
export const CODIGOS_VENTA_ACTIVOS: readonly string[] = CASTILLITOS_SOURCE_SEMANTIC_RULES
  .filter(r => r.familiaDocumento === "VENTA" && r.estadoUso === "ACTIVE")
  .map(r => r.codigoFuente);

/** Códigos EMPRESA activos (FE + notas crédito empresa activas). */
export const CODIGOS_EMPRESA_ACTIVOS: readonly string[] = CASTILLITOS_SOURCE_SEMANTIC_RULES
  .filter(r => r.estadoUso === "ACTIVE" && r.participaEnVentas && r.canalOperacion === "EMPRESA")
  .map(r => r.codigoFuente);

/** Códigos ALMACEN activos (FD, FC, FG, FA + notas crédito almacén activas). */
export const CODIGOS_ALMACEN_ACTIVOS: readonly string[] = CASTILLITOS_SOURCE_SEMANTIC_RULES
  .filter(r => r.estadoUso === "ACTIVE" && r.participaEnVentas && r.canalOperacion === "ALMACEN")
  .map(r => r.codigoFuente);

/** Códigos WEB activos (FW + NW). */
export const CODIGOS_WEB_ACTIVOS: readonly string[] = CASTILLITOS_SOURCE_SEMANTIC_RULES
  .filter(r => r.estadoUso === "ACTIVE" && r.participaEnVentas && r.canalOperacion === "WEB")
  .map(r => r.codigoFuente);

// ── Cobros / Recaudos ──────────────────────────────────────────────────────────

/**
 * Códigos de cobros empresa:
 *   R1 = pago registrado para facturación oficial F1 (empresa)
 *   R2 = pago registrado para remisiones / F2 (empresa)
 * Ambos son PAGO_CLIENTE con signo:1, participaEnCartera:true.
 */
export const CODIGOS_COBROS_EMPRESA_R1 = ["R1"] as const;
export const CODIGOS_COBROS_EMPRESA_R2 = ["R2"] as const;
export const CODIGOS_COBROS_EMPRESA    = [...CODIGOS_COBROS_EMPRESA_R1, ...CODIGOS_COBROS_EMPRESA_R2] as const;

/** Recibos de caja almacenes (POS — recaudo operativo retail). No mezclar con cartera empresa. */
export const CODIGOS_COBROS_ALMACEN_ACTIVOS = ["RS", "RC", "RG", "RA"] as const;

/** Financiamiento retail: Addi / Sistecredit. Cartera retail separada. */
export const CODIGOS_RETAIL_FINANCIERO = ["SI", "AN"] as const;

/**
 * Consignaciones pendientes de identificar.
 * Dinero recibido pero NO conciliado — NO contar como cobro final.
 * familiaDocumento: BANCO, signo: 0, moduloDashboard: BANCOS.
 */
export const CODIGOS_CONSIGNACIONES_PENDIENTES = ["CP", "B1", "B2", "H1", "H2"] as const;

/** SQL fragment para cobros empresa (R1+R2). */
export const SQL_FILTER_COBROS_EMPRESA =
  `"comprobanteCode" IN (${_quoteCodigos([...CODIGOS_COBROS_EMPRESA])})` as const;

/** SQL fragment para recibos caja almacenes. */
export const SQL_FILTER_COBROS_ALMACEN =
  `"comprobanteCode" IN (${_quoteCodigos([...CODIGOS_COBROS_ALMACEN_ACTIVOS])})` as const;

/** SQL fragment para consignaciones pendientes. */
export const SQL_FILTER_CONSIGNACIONES_PENDIENTES =
  `"comprobanteCode" IN (${_quoteCodigos([...CODIGOS_CONSIGNACIONES_PENDIENTES])})` as const;

/**
 * Fragmento SQL listo para insertar en $queryRaw para filtrar SOLO facturas de venta.
 * Usa sagDocumentFamily cuando está disponible (más robusto que comprobanteCode).
 *
 * Regla: OFFICIAL_INVOICE + sagSourceType = OFICIAL
 * Esto garantiza que C1 (COMPRA), G1 (GASTO), R1 (RECIBO), etc.
 * nunca entren en métricas de ventas/top-líneas/top-clientes.
 */
export const SQL_FILTER_VENTAS_OFICIAL =
  `"sagDocumentFamily" = 'OFFICIAL_INVOICE' AND "sagSourceType" = 'OFICIAL'` as const;

/**
 * Variante incluyendo históricas (para consultas multi-año).
 * Agrega el fallback por comprobanteCode para registros importados antes
 * de que sagDocumentFamily estuviera correctamente poblado.
 */
export const SQL_FILTER_VENTAS_OFICIAL_FULL = `(
  ("sagDocumentFamily" = 'OFFICIAL_INVOICE' AND "sagSourceType" = 'OFICIAL')
  OR ("sagDocumentFamily" = 'OTHER' AND "sagSourceType" = 'OFICIAL'
      AND "comprobanteCode" IN (${_quoteCodigos([...CODIGOS_VENTA_TODOS])}))
)` as const;

/** Fragmento SQL para filtrar EMPRESA (solo ventas empresa activas). */
export const SQL_FILTER_CANAL_EMPRESA =
  `"comprobanteCode" IN (${_quoteCodigos([...CODIGOS_EMPRESA_ACTIVOS])})` as const;

/** Fragmento SQL para filtrar ALMACEN (solo ventas almacén activas). */
export const SQL_FILTER_CANAL_ALMACEN =
  `"comprobanteCode" IN (${_quoteCodigos([...CODIGOS_ALMACEN_ACTIVOS])})` as const;

/** Fragmento SQL para filtrar WEB (solo ventas web activas). */
export const SQL_FILTER_CANAL_WEB =
  `"comprobanteCode" IN (${_quoteCodigos([...CODIGOS_WEB_ACTIVOS])})` as const;

// ── ARKETOPS exclusion (Sprint 3.1) ───────────────────────────────────────────
//
// Fuentes ARKETOPS: asientos contables internos que NO son operación Castillitos.
// Deben quedar COMPLETAMENTE EXCLUIDAS del dashboard ejecutivo, cartera, cobros
// y cualquier métrica financiera presentada a la gerente.
// Disponibles en módulo futuro: Partner / Terceros / ARKETOPS.

/**
 * Códigos SAG de operación ARKETOPS.
 * Derivados de las reglas con capaDato = "SAG_ARKETOPS" (businessOwner = "ARKETOPS").
 * Deduplicados — algunos códigos (ej. CI, S5, DE, AD) aparecen en múltiples kaNiFuente.
 */
export const CODIGOS_ARKETOPS: readonly string[] = [
  ...new Set(
    CASTILLITOS_SOURCE_SEMANTIC_RULES
      .filter(r => r.capaDato === "SAG_ARKETOPS")
      .map(r => r.codigoFuente),
  ),
];

/**
 * SQL fragment (sin AND inicial) para excluir registros ARKETOPS.
 * Incluye el caso NULL — filas sin comprobanteCode son Castillitos.
 *
 * Uso:  AND ${SQL_FILTER_EXCLUIR_ARKETOPS}
 */
export const SQL_FILTER_EXCLUIR_ARKETOPS =
  `("comprobanteCode" IS NULL OR "comprobanteCode" NOT IN (${_quoteCodigos([...CODIGOS_ARKETOPS])}))` as const;

/**
 * Prisma ORM filter para excluir ARKETOPS en queries que usan el cliente ORM.
 * Preserva filas con comprobanteCode = NULL (son Castillitos por defecto).
 *
 * Uso:  where: { ...otrosFiltros, ...PRISMA_EXCLUIR_ARKETOPS }
 */
export const PRISMA_EXCLUIR_ARKETOPS = {
  OR: [
    { comprobanteCode: null as string | null },
    { comprobanteCode: { notIn: [...CODIGOS_ARKETOPS] as string[] } },
  ],
} as const;

// ── businessLine — dimensión comercial (Sprint 3.1+) ──────────────────────────
//
// MODELO:
//   businessLine ≠ businessOwner ≠ canal ≠ unidad operativa ≠ tipo financiero
//
// Latin Kids = línea INTERNA de Castillitos.
//   businessOwner = "CASTILLITOS"  (NO ARKETOPS, NO externo)
//   businessLine  = "LATIN_KIDS"
//   visibleInExecutive se define por tipo financiero cuando la tabla maestre esté completa.
//
// PENDIENTE: cerrar tabla maestra de fuentes antes de activar lógica de dashboard.
// needsAccountingReview = true indica documentos dudosos que requieren confirmación
// contable (¿dev cliente? ¿dev compra? ¿ajuste interno entre líneas?).

/**
 * Fuentes conocidas de Latin Kids (línea interna de Castillitos).
 * businessOwner = "CASTILLITOS" — NO son ARKETOPS ni proveedor externo.
 * needsAccountingReview = true en la mayoría — confirmar con contabilidad.
 *
 * NOTA: Esta lista crecerá cuando se complete la tabla maestra de fuentes.
 * No usar para filtros de dashboard hasta que needsAccountingReview = false en todas.
 */
export const CODIGOS_LATIN_KIDS: readonly string[] = [
  ...new Set(
    CASTILLITOS_SOURCE_SEMANTIC_RULES
      .filter(r => r.businessLine === "LATIN_KIDS")
      .map(r => r.codigoFuente),
  ),
];

/**
 * Fuentes que requieren revisión contable antes de activar en dashboard.
 * Incluye Latin Kids dudosos y cualquier otro código marcado como needsAccountingReview.
 */
export const CODIGOS_PENDING_ACCOUNTING_REVIEW: readonly string[] = [
  ...new Set(
    CASTILLITOS_SOURCE_SEMANTIC_RULES
      .filter(r => r.needsAccountingReview === true)
      .map(r => r.codigoFuente),
  ),
];

/**
 * Bridge de compatibilidad hacia atrás: infiere SagDocumentFamily del enum Prisma
 * a partir de la familiaDocumento de la regla semántica.
 */
export function toSagDocumentFamily(
  rule: SourceSemanticRule,
): "OFFICIAL_INVOICE" | "DISPATCH_REMISION" | "CREDIT_NOTE" | "DEBIT_NOTE" | "OTHER" {
  switch (rule.familiaDocumento) {
    case "VENTA":             return "OFFICIAL_INVOICE";
    case "REMISION_DESPACHO": return "DISPATCH_REMISION";
    case "DEVOLUCION_VENTA":  return "CREDIT_NOTE";
    case "NOTA_DEBITO_BANCO": return "DEBIT_NOTE";
    default:                  return "OTHER";
  }
}
