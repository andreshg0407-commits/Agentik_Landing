/**
 * lib/operational-map/source-catalog/sag-real-source-catalog.ts
 *
 * Catálogo REAL de fuentes/tipos de documento SAG — Castillitos.
 *
 * IMPORTANTE: Estos NO son presets mock ni estimados.
 * Son los códigos reales de fuente del sistema SAG entregados en el CSV
 * histórico (k_sc_codigo_fuente / sc_nombre_fuente) de Castillitos.
 *
 * Diferencia crítica:
 *   codigoFuente = k_sc_codigo_fuente (e.g. "FE", "PD", "R1")
 *   tableSag     = tabla SAG real donde viven los registros (PENDIENTE confirmar con DBA)
 *
 * FE es un tipo/código de documento — la tabla física aún debe confirmarse.
 * No guardar en tableName a menos que el DBA SAG lo confirme.
 *
 * Sprint: AGENTIK-REAL-SAG-SOURCE-CATALOG-FIX-01
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SagClasificacion =
  | "OFICIAL"
  | "NO OFICIAL"
  | "INVENTARIO"
  | "PRODUCCION"
  | "HISTORICO"
  | "EXCLUIR";

export type SagImpacto = "+" | "-" | null;

export interface SagRealSource {
  sagId?:              string;            // ka_ni_fuente
  codigoFuente:        string;            // k_sc_codigo_fuente
  nombreFuente:        string;            // sc_nombre_fuente
  clasificacion:       SagClasificacion;
  subclasificacion?:   string;            // col 4 label (e.g. "FACTURA EMPRESA")
  unidad?:             string;
  tipoOperacional?:    string;            // TIPO field
  impactaVentas:       boolean;
  impactoVentasSigno?: SagImpacto;
  impactaCobros:       boolean;
  impactoCobrosSigno?: SagImpacto;
  observacion?:        string;
  /** Tabla SAG confirmada — null si aún NO confirmada con DBA */
  tablaSagConfirmada:  string | null;
  /** KPI keys this source is expected to feed */
  kpiKeysSugeridos:    string[];
}

// ─── Catálogo OFICIAL — Fuente 1 ─────────────────────────────────────────────

export const SAG_OFICIAL_F1: SagRealSource[] = [
  {
    sagId: "101", codigoFuente: "FE", nombreFuente: "FACTURA ELECTRÓNICA DE VENTA",
    clasificacion: "OFICIAL", subclasificacion: "FACTURA EMPRESA",
    tipoOperacional: "F1 OFICIAL", impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial empresa",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_brutas_fuente1", "ventas_netas", "documentos_dian"],
  },
  {
    sagId: "175", codigoFuente: "FD", nombreFuente: "FACTURACIÓN ELECTRÓNICA SAN DIEGO",
    clasificacion: "OFICIAL", subclasificacion: "FACTURA SAN DIEGO ALMACEN",
    tipoOperacional: "F1 OFICIAL", impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial tienda San Diego",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_brutas_fuente1"],
  },
  {
    sagId: "176", codigoFuente: "FC", nombreFuente: "FACTURA ELECTRÓNICA CENTRO",
    clasificacion: "OFICIAL", subclasificacion: "FACTURA CENTRO ALMACEN",
    tipoOperacional: "F1 OFICIAL", impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial tienda Centro",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_brutas_fuente1"],
  },
  {
    sagId: "177", codigoFuente: "FG", nombreFuente: "FACTURACIÓN ELECTRÓNICA GRAN PLAZA",
    clasificacion: "OFICIAL", subclasificacion: "FACTURA GRAN PLAZA ALMACEN",
    tipoOperacional: "F1 OFICIAL", impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial tienda Gran Plaza",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_brutas_fuente1"],
  },
  {
    sagId: "194", codigoFuente: "FA", nombreFuente: "FACTURA ELECTRÓNICA CALDAS",
    clasificacion: "OFICIAL", subclasificacion: "FACTURA CALDAS ALMACEN",
    tipoOperacional: "F1 OFICIAL", impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial tienda Caldas",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_brutas_fuente1"],
  },
  {
    sagId: "207", codigoFuente: "FW", nombreFuente: "FACTURA ELECTRÓNICA WEB",
    clasificacion: "OFICIAL", subclasificacion: "FACTURA PAGINA WEB",
    tipoOperacional: "F1 OFICIAL", impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial canal web",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_brutas_fuente1"],
  },
  {
    sagId: "40", codigoFuente: "PD", nombreFuente: "PEDIDOS CLIENTES",
    clasificacion: "OFICIAL", tipoOperacional: "PEDIDO COMERCIAL F1",
    impactaVentas: false, impactaCobros: false,
    observacion: "Orden formal de venta previa a facturación. PEDIDOS DEL DIA sale de esta fuente.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["pedidos_dia", "pedidos_dia_sag", "pedidos_pendientes_despacho"],
  },
  {
    sagId: "41", codigoFuente: "AP", nombreFuente: "AJUSTE PEDIDOS",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: false, impactaCobros: false,
    observacion: "Sirve para trazabilidad de despachos por pedido",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["pedidos_dia_sag"],
  },
  {
    sagId: "4", codigoFuente: "R1", nombreFuente: "RECIBO DE CAJA F1",
    clasificacion: "OFICIAL", tipoOperacional: "COBRO OFICIAL",
    impactaVentas: false, impactaCobros: true, impactoCobrosSigno: "+",
    observacion: "Pago recibido sobre facturación oficial F1. Impacta recaudo y flujo de caja.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia", "recaudos_dia_tesoreria", "historial_pagos", "cartera_cobrar_entradas"],
  },
  {
    sagId: "108", codigoFuente: "RS", nombreFuente: "RECIBO DE CAJA SAN DIEGO",
    clasificacion: "OFICIAL", subclasificacion: "RECIBOS SAN DIEGO", tipoOperacional: "POS",
    impactaVentas: false, impactaCobros: false,
    observacion: "Facturación oficial tienda física San Diego",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "recaudos_dia"],
  },
  {
    sagId: "174", codigoFuente: "RC", nombreFuente: "RECIBO DE CAJA CENTRO",
    clasificacion: "OFICIAL", subclasificacion: "RECIBOS CENTRO",
    impactaVentas: false, impactaCobros: false,
    observacion: "Recibo Sistecredito tiendas. Afecta efectivo tiendas, concilia fin de mes.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia", "recaudos_dia_tesoreria"],
  },
  {
    sagId: "178", codigoFuente: "RG", nombreFuente: "RECIBO DE CAJA GRAN PLAZA",
    clasificacion: "OFICIAL", subclasificacion: "RECIBOS GRAN PLAZA",
    impactaVentas: false, impactaCobros: false,
    observacion: "Recibo Sistecredito Gran Plaza",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia", "recaudos_dia_tesoreria"],
  },
  {
    sagId: "198", codigoFuente: "RA", nombreFuente: "RECIBO DE CAJA CALDAS",
    clasificacion: "OFICIAL", subclasificacion: "RECIBOS CALDAS",
    impactaVentas: false, impactaCobros: false,
    observacion: "Recibo Sistecredito Caldas",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia", "recaudos_dia_tesoreria"],
  },
  {
    sagId: "12", codigoFuente: "AN", nombreFuente: "ANTICIPOS CLIENTES SISTECREDITO",
    clasificacion: "OFICIAL", tipoOperacional: "ANTICIPO CLIENTE",
    impactaVentas: false, impactaCobros: true, impactoCobrosSigno: "+",
    observacion: "Afecta efectivo tiendas al momento del recaudo. Concilia fin de mes con Sistecredito.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia", "recaudos_dia_tesoreria"],
  },
  {
    sagId: "122", codigoFuente: "A1", nombreFuente: "ANTICIPO CLIENTE EMPRESA",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: false, impactaCobros: true, impactoCobrosSigno: "+",
    observacion: "Recibos oficiales anticipos clientes",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia", "cartera_cobrar_entradas"],
  },
  {
    sagId: "102", codigoFuente: "NE", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA (F1)",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial empresa. Afecta ventas netas.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas", "documentos_dian"],
  },
  {
    sagId: "139", codigoFuente: "NC", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA (NOTAS EMPRESA)",
    clasificacion: "OFICIAL", subclasificacion: "NOTAS EMPRESA", tipoOperacional: "AJUSTE FINANCIERO",
    impactaVentas: true, impactoVentasSigno: "-",
    impactaCobros: false, observacion: "Reduce facturación F1. No representa ingreso.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "170", codigoFuente: "ND", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA (DESCUENTOS FINANCIEROS)",
    clasificacion: "OFICIAL", subclasificacion: "NOTAS EMPRESA",
    impactaVentas: false, impactaCobros: true,
    observacion: "Para descuentos financieros que aplican clientes al pagar facturas",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas"],
  },
  {
    sagId: "171", codigoFuente: "NF", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA (DEVOLUCIONES CLIENTES)",
    clasificacion: "OFICIAL", subclasificacion: "NOTAS EMPRESA",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Notas crédito de devoluciones de clientes",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "196", codigoFuente: "NA", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA CALDAS",
    clasificacion: "OFICIAL", subclasificacion: "NOTA CREDITO CALDAS",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Notas crédito almacén — devoluciones clientes",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "197", codigoFuente: "NG", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA GRAN PLAZA",
    clasificacion: "OFICIAL", subclasificacion: "NOTA CREDITO GRAN PLAZA",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Notas crédito almacén Gran Plaza — devoluciones",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "200", codigoFuente: "NS", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA SAN DIEGO",
    clasificacion: "OFICIAL", subclasificacion: "NOTA CREDITO SAN DIEGO",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Notas crédito almacén San Diego — devoluciones",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "202", codigoFuente: "NT", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA CENTRO",
    clasificacion: "OFICIAL", subclasificacion: "NOTA CREDITO CENTRO",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Notas crédito almacén Centro — devoluciones",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "208", codigoFuente: "NW", nombreFuente: "NOTA CRÉDITO ELECTRÓNICA WEB",
    clasificacion: "OFICIAL", subclasificacion: "NOTAS PAGINAS WEB",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Notas crédito canal web — devoluciones",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "25", codigoFuente: "D1", nombreFuente: "DEVOLUCIÓN VENTAS F1",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: false, impactaCobros: false,
    observacion: "Devolución ventas oficiales F1",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "1", codigoFuente: "C1", nombreFuente: "FACTURA DE COMPRA",
    clasificacion: "OFICIAL", tipoOperacional: "COMPRA OFICIAL F1",
    impactaVentas: false, impactaCobros: false,
    observacion: "Compra Fuente 1 que genera una CxP",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["costo_ventas"],
  },
  {
    sagId: "27", codigoFuente: "DC", nombreFuente: "DEVOLUCIÓN COMPRAS",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: false, impactaCobros: false,
    observacion: "Devoluciones de compras oficiales. Afecta CxP.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["costo_ventas"],
  },
  {
    sagId: "3", codigoFuente: "E1", nombreFuente: "EGRESOS F1",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturación oficial empresa",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos", "ebitda_estimado"],
  },
  {
    sagId: "10", codigoFuente: "G1", nombreFuente: "GASTOS CAUSADOS",
    clasificacion: "OFICIAL", tipoOperacional: "GASTO OPERATIVO OFICIAL / CXP",
    impactaVentas: false, impactaCobros: false,
    observacion: "Obligación reconocida contablemente. Afecta utilidad y CxP aunque no haya pago inmediato.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos", "ebitda_estimado"],
  },
  {
    sagId: "130", codigoFuente: "DG", nombreFuente: "DEVOLUCIÓN EN GASTOS",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: false, impactaCobros: false,
    observacion: "Devoluciones de gastos causados. Afecta CxP en positivo.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos"],
  },
  {
    sagId: "68", codigoFuente: "1V", nombreFuente: "ANTICIPO PROVEEDORES F1",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: false, impactaCobros: false,
    observacion: "Anticipo a proveedor en facturación F1",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["pagos_programados_7d"],
  },
  {
    sagId: "105", codigoFuente: "NO", nombreFuente: "PROVISIÓN DE NÓMINA",
    clasificacion: "OFICIAL", tipoOperacional: "F1 OFICIAL",
    impactaVentas: false, impactaCobros: false,
    observacion: "Provisión de nómina de empleados. Se utiliza 1 vez cada fin de mes.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos", "ebitda_estimado"],
  },
  {
    sagId: "17", codigoFuente: "J1", nombreFuente: "AJUSTES CONTABLES F1",
    clasificacion: "OFICIAL", tipoOperacional: "AJUSTE FINANCIERO",
    impactaVentas: false, impactaCobros: false,
    observacion: "Corrección contable interna. Revisar si afecta ingresos, cartera o costos.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["cierre_mensual"],
  },
  {
    sagId: "21", codigoFuente: "DB", nombreFuente: "NOTAS DÉBITO BANCARIAS",
    clasificacion: "OFICIAL", tipoOperacional: "EGRESO FINANCIERO BANCARIO",
    impactaVentas: false, impactaCobros: false,
    observacion: "Débito realizado por banco: comisión, ajuste, cargo automático.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["saldo_cuentas_bancarias", "disponible_banco_hoy"],
  },
  {
    sagId: "156", codigoFuente: "BN", nombreFuente: "BONOS",
    clasificacion: "OFICIAL", impactaVentas: false, impactaCobros: false,
    observacion: "Registro de venta de bonos regalo",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "recaudos_dia"],
  },
  {
    sagId: "158", codigoFuente: "DE", nombreFuente: "DOC SOPORTE ELECTRÓNICO GASTO",
    clasificacion: "OFICIAL", impactaVentas: false, impactaCobros: false,
    observacion: "Se usa para causar gastos oficiales que no traen soporte externo",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos", "documentos_dian"],
  },
  {
    sagId: "163", codigoFuente: "T3", nombreFuente: "DOC SOPORTE ELECTRÓNICO",
    clasificacion: "OFICIAL", impactaVentas: false, impactaCobros: false,
    observacion: "Se usa para causar gastos oficiales que no traen soporte externo",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos", "documentos_dian"],
  },
];

// ─── Catálogo NO OFICIAL — Fuente 2 ──────────────────────────────────────────

export const SAG_NO_OFICIAL_F2: SagRealSource[] = [
  {
    sagId: "2", codigoFuente: "F2", nombreFuente: "REMISIÓN (FUENTE 2)",
    clasificacion: "NO OFICIAL", tipoOperacional: "REMISION",
    impactaVentas: true, impactoVentasSigno: "+",
    impactaCobros: false, observacion: "Facturas empresa Fuente 2",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_netas"],
  },
  {
    sagId: "94", codigoFuente: "R2", nombreFuente: "RECIBO DE CAJA F2",
    clasificacion: "NO OFICIAL", tipoOperacional: "COBRO F2/REMISION",
    impactaVentas: false, impactaCobros: true, impactoCobrosSigno: "+",
    observacion: "Pago recibido sobre remisión no oficial (F2). No entra en facturación F1.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia", "recaudos_dia_tesoreria"],
  },
  {
    sagId: "95", codigoFuente: "C2", nombreFuente: "FACTURA DE COMPRAS F2",
    clasificacion: "NO OFICIAL", tipoOperacional: "COMPRA FUENTE 2",
    impactaVentas: false, impactaCobros: false,
    observacion: "Compra Fuente 2 que genera una CxP",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["costo_ventas"],
  },
  {
    sagId: "96", codigoFuente: "G2", nombreFuente: "GASTOS 2",
    clasificacion: "NO OFICIAL", tipoOperacional: "GASTO OPERATIVO",
    impactaVentas: false, impactaCobros: false,
    observacion: "Gasto operativo no relacionado con ingreso",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos"],
  },
  {
    sagId: "97", codigoFuente: "E2", nombreFuente: "EGRESOS 2",
    clasificacion: "NO OFICIAL", tipoOperacional: "SALIDA DE DINERO",
    impactaVentas: false, impactaCobros: false,
    observacion: "Salida de dinero no afecta la venta. Solo el flujo de caja en egresos de tesorería.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["gastos_operativos", "liquidez_operativa_dia"],
  },
  {
    sagId: "98", codigoFuente: "D2", nombreFuente: "DEVOLUCIÓN VENTAS F2",
    clasificacion: "NO OFICIAL", tipoOperacional: "NOTA CREDITO",
    impactaVentas: true, impactoVentasSigno: "-",
    impactaCobros: false, observacion: "Afecta inventario en positivo y cartera en negativo",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["ventas_dia_fuente1", "ventas_netas", "devoluciones_activas"],
  },
  {
    sagId: "113", codigoFuente: "J2", nombreFuente: "AJUSTE CONTABLE F2",
    clasificacion: "NO OFICIAL", tipoOperacional: "AJUSTE FINANCIERO INTERNO",
    impactaVentas: false, impactaCobros: false,
    observacion: "Auditoría de contabilidad F2",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["cierre_mensual"],
  },
  {
    sagId: "128", codigoFuente: "A2", nombreFuente: "ANTICIPO CLIENTE F2",
    clasificacion: "NO OFICIAL", tipoOperacional: "COBRO ANTICIPADO",
    impactaVentas: false, impactaCobros: true, impactoCobrosSigno: "+",
    observacion: "Anticipo de dinero. Impacta tesorería.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["recaudos_dia"],
  },
  {
    sagId: "141", codigoFuente: "2V", nombreFuente: "ANTICIPO PROVEEDORES F2",
    clasificacion: "NO OFICIAL", tipoOperacional: "ANTICIPO PROVEEDOR / TESORERIA",
    impactaVentas: false, impactaCobros: false,
    observacion: "Salida de dinero adelantada a proveedor. Activo/anticipo hasta cruzarse con factura de compra.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["pagos_programados_7d"],
  },
];

// ─── Inventario / Movimientos internos ───────────────────────────────────────

export const SAG_INVENTARIO: SagRealSource[] = [
  {
    sagId: "34", codigoFuente: "TR", nombreFuente: "TRASLADO ENTRE BODEGAS",
    clasificacion: "INVENTARIO", tipoOperacional: "INVENTARIO / LOGISTICA",
    impactaVentas: false, impactaCobros: false,
    observacion: "Movimiento interno de mercancía entre bodegas o puntos de venta. No genera ingreso ni recaudo.",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
  {
    sagId: "206", codigoFuente: "TM", nombreFuente: "TRASLADO DE MALETAS",
    clasificacion: "INVENTARIO", tipoOperacional: "INVENTARIO / LOGISTICA",
    impactaVentas: false, impactaCobros: false,
    observacion: "Movimiento interno de mercancía entre bodegas o puntos de venta",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
  {
    sagId: "76", codigoFuente: "AI", nombreFuente: "AJUSTE DE INVENTARIO",
    clasificacion: "INVENTARIO", impactaVentas: false, impactaCobros: false,
    observacion: "Afecta directamente el inventario",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
  {
    sagId: "65", codigoFuente: "IF", nombreFuente: "INVENTARIO FÍSICO",
    clasificacion: "INVENTARIO", impactaVentas: false, impactaCobros: false,
    observacion: "Afecta directamente el inventario",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
  {
    sagId: "157", codigoFuente: "DS", nombreFuente: "DESGLOSE DE MERCANCÍA",
    clasificacion: "INVENTARIO", impactaVentas: false, impactaCobros: false,
    observacion: "Movimiento interno en cuestión de inventario",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
];

// ─── Producción ───────────────────────────────────────────────────────────────

export const SAG_PRODUCCION: SagRealSource[] = [
  {
    sagId: "33", codigoFuente: "OP", nombreFuente: "ORDEN DE PRODUCCIÓN",
    clasificacion: "PRODUCCION", impactaVentas: false, impactaCobros: false,
    observacion: "Fuente que solo usa producción",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
  {
    sagId: "80", codigoFuente: "CN", nombreFuente: "CONSUMOS INSUMOS Y TELAS",
    clasificacion: "PRODUCCION", impactaVentas: false, impactaCobros: false,
    observacion: "Fuente que solo usa producción",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["costo_ventas"],
  },
  {
    sagId: "81", codigoFuente: "PT", nombreFuente: "ENTRADA PRODUCTO TERMINADO",
    clasificacion: "PRODUCCION", impactaVentas: false, impactaCobros: false,
    observacion: "Fuente que solo usa producción",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
  {
    sagId: "99", codigoFuente: "PC", nombreFuente: "SALIDA CONFECCIONISTAS",
    clasificacion: "PRODUCCION", impactaVentas: false, impactaCobros: false,
    observacion: "Fuente que solo usa producción",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
  {
    sagId: "100", codigoFuente: "EC", nombreFuente: "ENTRADA CONFECCIONISTAS",
    clasificacion: "PRODUCCION", impactaVentas: false, impactaCobros: false,
    observacion: "Fuente que solo usa producción",
    tablaSagConfirmada: null,
    kpiKeysSugeridos: ["score_salud_inventario"],
  },
];

// ─── Combined catalog ─────────────────────────────────────────────────────────

export const ALL_SAG_REAL_SOURCES: SagRealSource[] = [
  ...SAG_OFICIAL_F1,
  ...SAG_NO_OFICIAL_F2,
  ...SAG_INVENTARIO,
  ...SAG_PRODUCCION,
];

/** Lookup by codigoFuente (SAG code) */
export const SAG_SOURCE_BY_CODE: Record<string, SagRealSource> =
  Object.fromEntries(ALL_SAG_REAL_SOURCES.map(s => [s.codigoFuente, s]));

/** Groups for UI display */
export const SAG_REAL_GROUPS: { label: string; sources: SagRealSource[] }[] = [
  { label: "OFICIAL — Facturación F1",       sources: SAG_OFICIAL_F1.filter(s => ["FE","FD","FC","FG","FA","FW"].includes(s.codigoFuente)) },
  { label: "OFICIAL — Pedidos",               sources: SAG_OFICIAL_F1.filter(s => ["PD","AP"].includes(s.codigoFuente)) },
  { label: "OFICIAL — Cobros / Recibos F1",   sources: SAG_OFICIAL_F1.filter(s => ["R1","RS","RC","RG","RA","AN","A1"].includes(s.codigoFuente)) },
  { label: "OFICIAL — Notas Crédito F1",      sources: SAG_OFICIAL_F1.filter(s => ["NE","NC","ND","NF","NA","NG","NS","NT","NW","D1"].includes(s.codigoFuente)) },
  { label: "OFICIAL — Compras / Gastos F1",   sources: SAG_OFICIAL_F1.filter(s => ["C1","DC","E1","G1","DG","1V","NO","J1","DB","BN","DE","T3"].includes(s.codigoFuente)) },
  { label: "NO OFICIAL — Fuente 2 (F2)",      sources: SAG_NO_OFICIAL_F2 },
  { label: "INVENTARIO / LOGÍSTICA",          sources: SAG_INVENTARIO },
  { label: "PRODUCCIÓN",                       sources: SAG_PRODUCCION },
];

// ─── Build sourceName from a SagRealSource ────────────────────────────────────

export function buildSagSourceName(src: SagRealSource): string {
  return `${src.codigoFuente} — ${src.nombreFuente}`;
}

/** Build a description string suitable for storage */
export function buildSagSourceDescription(src: SagRealSource): string {
  const parts: string[] = [
    `Código SAG: ${src.codigoFuente}`,
    `Clasificación: ${src.clasificacion}`,
  ];
  if (src.tipoOperacional)  parts.push(`Tipo: ${src.tipoOperacional}`);
  if (src.impactaVentas)    parts.push(`Impacta ventas: SI (${src.impactoVentasSigno ?? "?"})`);
  if (src.impactaCobros)    parts.push(`Impacta cobros: SI (${src.impactoCobrosSigno ?? "?"})`);
  parts.push("Tabla SAG real: pendiente confirmar con DBA");
  if (src.observacion)      parts.push(`Obs: ${src.observacion}`);
  return parts.join(" | ");
}
