/**
 * lib/integrations/sag/data-contract/sag-domain-contracts.ts
 *
 * SAG Domain Contracts — 10 domains with access metadata and field lists
 *
 * Status as of SAG validation meeting (2026-05):
 * - pagos: agreed (pagosnew confirmed, no historical restriction)
 * - ventas/recaudos/cartera: in_review
 * - remaining: draft
 *
 * Sprint: AGENTIK-SAG-DATA-CONTRACT-01
 */

import type { SagDomainContract, SagMasterContract, SagViewRequest } from "./sag-data-contract";

// ── 1. VENTAS ──────────────────────────────────────────────────────────────────
//
// Scope: vw_agentik_ventas es la fuente de verdad comercial de Agentik.
// No es solo para reportes financieros — es la base de:
//   Comercial, Cliente 360, Cartera, Cobranza, Finanzas, Inventario,
//   Torre de Control, Executive Dashboard, Copilot, Automatizaciones,
//   Comisiones y Comercio Exterior.
//
// COPILOT QUERIES HABILITADAS POR ESTA VISTA:
//   - "¿Quién vende más?"                        → ID_VENDEDOR + MONTO_NETO
//   - "¿Quién tiene mejor margen?"               → COSTO_VENTA + MONTO_NETO + ID_VENDEDOR
//   - "¿Quién genera más devoluciones?"          → DEVOLUCION_MONTO + DEVOLUCION_CANTIDAD + ID_VENDEDOR
//   - "¿Qué ciudad compra más?"                  → CIUDAD_CLIENTE + MONTO_BRUTO
//   - "¿Qué región cayó en ventas?"              → CIUDAD_CLIENTE + FECHA_VENTA (comparativo)
//   - "¿Cuánto tardamos en despachar?"           → FECHA_VENTA + FECHA_DESPACHO
//   - "¿Se cumplieron los tiempos de entrega?"   → FECHA_ENTREGA + SLA_ENTREGA
//   - "¿Qué facturas están anuladas?"            → TIPO_DOCUMENTO + ESTADO_VENTA
//   - "¿Cuál es el ticket promedio por canal?"   → CANAL_VENTA + MONTO_NETO / COUNT
//   - "¿Qué vendemos en USD o CNY?"              → MONEDA + MONTO_BRUTO + TASA_CAMBIO
//
// Sprint: AGENTIK-SAG-VENTAS-CONTRACT-HARDENING-01

const ventasContract: SagDomainContract = {
  id:             "ventas",
  nombre:         "Ventas",
  descripcion:    "Transacciones de venta registradas en SAG — facturas, notas crédito, remisiones, " +
                  "órdenes, devoluciones y descuentos comerciales. " +
                  "Fuente de verdad para Comercial, Cliente 360, Finanzas, Cobranza, Copilot y Comisiones.",
  status:         "in_review",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_ventas",
  primaryTables:  ["VENTAS_MAESTRO", "FACTURAS", "DETALLE_VENTAS", "DEVOLUCIONES_VENTAS"],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  historicalCutoff: "2020-01-01",
  prioridad:      1,
  kpisEnabled: [
    // Original
    "ventas_brutas", "ventas_netas", "devoluciones",
    "descuentos_comerciales", "costo_ventas", "margen_bruto",
    // Extended — commercial analytics
    "ventas_por_vendedor", "margen_por_vendedor", "ticket_promedio",
    "sla_entrega", "ventas_por_ciudad", "devoluciones_unidades",
    "ventas_por_canal",
  ],
  modulosEnabled: [
    // Original
    "conciliacion", "cierre", "planeacion", "executive_dashboard",
    // Extended
    "comercial", "cliente_360", "cartera", "cobranza",
    "inventario_operativo", "torre_control", "copilot",
    "comisiones", "logistica", "automatizaciones", "comercio_exterior",
  ],

  fields: [
    // ── Campos originales ────────────────────────────────────────────────
    {
      campo: "ID_VENTA",
      tipo: "string", obligatorio: true, status: "unconfirmed",
      descripcion: "Identificador único de la transacción de venta. Clave primaria de trazabilidad.",
      kpiTraceability: ["ventas_brutas", "ventas_netas"],
      modulosImpactados: ["conciliacion", "cierre", "cobranza", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
    },
    {
      campo: "FECHA_VENTA",
      tipo: "datetime", obligatorio: true, status: "unconfirmed",
      descripcion: "Fecha y hora de registro de la venta en SAG.",
      kpiTraceability: ["ventas_brutas", "ventas_netas", "ventas_por_canal"],
      modulosImpactados: ["conciliacion", "cierre", "planeacion", "comercial", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
    },
    {
      campo: "MONTO_BRUTO",
      tipo: "decimal", obligatorio: true, status: "unconfirmed",
      descripcion: "Valor bruto de la venta antes de descuentos e impuestos.",
      kpiTraceability: ["ventas_brutas", "ventas_por_ciudad", "ventas_por_canal"],
      modulosImpactados: ["conciliacion", "cierre", "executive_dashboard", "comercial", "torre_control"],
      fuenteSag: "VENTAS_MAESTRO",
    },
    {
      campo: "MONTO_NETO",
      tipo: "decimal", obligatorio: true, status: "unconfirmed",
      descripcion: "Valor neto tras descuentos, antes de impuestos.",
      kpiTraceability: ["ventas_netas", "ticket_promedio", "ventas_por_vendedor"],
      modulosImpactados: ["conciliacion", "cierre", "comercial", "comisiones"],
      fuenteSag: "VENTAS_MAESTRO",
    },
    {
      campo: "DESCUENTO_COMERCIAL",
      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Descuento aplicado en la negociación comercial.",
      kpiTraceability: ["descuentos_comerciales", "ventas_netas"],
      modulosImpactados: ["conciliacion", "planeacion", "comercial"],
      fuenteSag: "DETALLE_VENTAS",
    },
    {
      campo: "ID_CLIENTE",
      tipo: "string", obligatorio: true, status: "unconfirmed",
      descripcion: "Referencia al cliente — relaciona con dominio clientes y cartera.",
      kpiTraceability: ["ventas_brutas", "cartera_corriente", "ventas_por_ciudad"],
      modulosImpactados: ["cartera", "executive_dashboard", "cliente_360", "cobranza", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
    },
    {
      campo: "ID_PRODUCTO",
      tipo: "string", obligatorio: true, status: "unconfirmed",
      descripcion: "Referencia al producto vendido — relaciona con dominio productos.",
      kpiTraceability: ["costo_ventas", "margen_bruto", "devoluciones_unidades"],
      modulosImpactados: ["inventario_operativo", "cierre", "comercial", "copilot"],
      fuenteSag: "DETALLE_VENTAS",
    },
    {
      campo: "CANAL_VENTA",
      tipo: "enum", obligatorio: false, status: "unconfirmed",
      descripcion: "Canal comercial: mostrador, distribución, exportación, ecommerce, etc.",
      kpiTraceability: ["ventas_brutas", "ventas_por_canal", "ticket_promedio"],
      modulosImpactados: ["executive_dashboard", "planeacion", "comercial", "torre_control", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Confirmar valores del enum con SAG. Distinto de CANAL_PAGO.",
    },
    {
      campo: "DEVOLUCION_MONTO",
      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Monto total devuelto en notas crédito asociadas a esta venta.",
      kpiTraceability: ["devoluciones", "ventas_netas"],
      modulosImpactados: ["conciliacion", "cierre", "comercial", "copilot"],
      fuenteSag: "DEVOLUCIONES_VENTAS",
    },

    // ── Grupo 1 — Identificación del documento ───────────────────────────
    {
      campo: "NUMERO_DOCUMENTO",
      tipo: "string", obligatorio: true, status: "unconfirmed",
      descripcion: "Número visible del documento: factura, remisión, nota crédito, orden. " +
                   "Es la referencia humana de la transacción (distinta del ID_VENTA técnico).",
      kpiTraceability: ["ventas_brutas"],
      modulosImpactados: ["cobranza", "cliente_360", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Sin este campo Cobranza y Cliente 360 no pueden mostrar documentos al cliente. " +
             "Copilot necesita este campo para responder '¿qué factura fue esa?'",
    },
    {
      campo: "TIPO_DOCUMENTO",
      tipo: "enum", obligatorio: true, status: "unconfirmed",
      descripcion: "Tipo del documento comercial. Valores: factura, nota_credito, remision, orden, anulado.",
      kpiTraceability: ["ventas_brutas", "ventas_netas", "devoluciones"],
      modulosImpactados: ["conciliacion", "cierre", "cobranza", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Crítico para excluir notas crédito y anulados de KPIs de ventas reales. " +
             "Sin TIPO_DOCUMENTO Agentik puede sobrecontar ventas o incluir reversiones.",
    },
    {
      campo: "ESTADO_VENTA",
      tipo: "enum", obligatorio: true, status: "unconfirmed",
      descripcion: "Estado de la venta. Valores: vigente, anulada, en_proceso, devuelta.",
      kpiTraceability: ["ventas_brutas", "ventas_netas"],
      modulosImpactados: ["conciliacion", "cierre", "automatizaciones", "alertas"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Necesario para filtrar anuladas y evitar que afecten KPIs. " +
             "Automatizaciones pueden dispararse cuando ESTADO_VENTA cambia.",
    },

    // ── Grupo 2 — Responsable comercial ─────────────────────────────────
    {
      campo: "ID_VENDEDOR",
      tipo: "string", obligatorio: true, status: "unconfirmed",
      descripcion: "Identificador del vendedor o ejecutivo comercial responsable de la venta.",
      kpiTraceability: ["ventas_por_vendedor", "margen_por_vendedor"],
      modulosImpactados: ["comercial", "comisiones", "copilot", "executive_dashboard"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Campo clave para ranking de vendedores y cálculo de comisiones. " +
             "Copilot: '¿quién vende más?', '¿quién tiene mejor margen?'",
    },
    {
      campo: "NOMBRE_VENDEDOR",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre legible del vendedor. Evita joins adicionales en reportes.",
      kpiTraceability: ["ventas_por_vendedor"],
      modulosImpactados: ["comercial", "comisiones", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Incluir directamente en la vista para simplificar queries de Copilot y reportes comerciales.",
    },

    // ── Grupo 3 — Rentabilidad ────────────────────────────────────────────
    {
      campo: "COSTO_VENTA",
      tipo: "decimal", obligatorio: true, status: "unconfirmed",
      descripcion: "Costo de los productos vendidos (COGS) asociado a esta transacción.",
      kpiTraceability: ["costo_ventas", "margen_bruto", "margen_por_vendedor"],
      modulosImpactados: ["cierre", "executive_dashboard", "comisiones", "copilot", "planeacion"],
      fuenteSag: "DETALLE_VENTAS",
      notas: "Sin COSTO_VENTA no es posible calcular margen ni rentabilidad real. " +
             "Confirmar si SAG calcula costo promedio o costo específico por lote.",
    },
    {
      campo: "IMPUESTO_VENTA",
      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Valor del impuesto (IVA, INC u otro) aplicado a la venta.",
      kpiTraceability: ["ventas_brutas", "ventas_netas"],
      modulosImpactados: ["cierre", "conciliacion"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Necesario para calcular base gravable y cruzar con declaraciones tributarias.",
    },
    {
      campo: "MARGEN_BRUTO",
      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Margen bruto calculado por SAG (MONTO_NETO - COSTO_VENTA). " +
                   "Opcional si Agentik puede calcularlo, recomendado para reducir carga de cómputo.",
      kpiTraceability: ["margen_bruto", "margen_por_vendedor"],
      modulosImpactados: ["executive_dashboard", "comisiones", "copilot"],
      fuenteSag: "DETALLE_VENTAS",
      notas: "Incluir si SAG ya lo calcula. Si no, Agentik lo derivará de MONTO_NETO - COSTO_VENTA.",
    },

    // ── Grupo 4 — Cantidades ──────────────────────────────────────────────
    {
      campo: "CANTIDAD_VENDIDA",
      tipo: "number", obligatorio: true, status: "unconfirmed",
      descripcion: "Número de unidades vendidas en esta transacción.",
      kpiTraceability: ["ticket_promedio", "rotacion_inventario", "devoluciones_unidades"],
      modulosImpactados: ["inventario_operativo", "comercial", "copilot", "planeacion"],
      fuenteSag: "DETALLE_VENTAS",
      notas: "Necesario para rotación, cobertura y análisis de consumo por producto. " +
             "Fundamental para la capa de inventario operativo.",
    },
    {
      campo: "UNIDAD_MEDIDA",
      tipo: "enum", obligatorio: false, status: "unconfirmed",
      descripcion: "Unidad de medida del producto vendido. Ejemplos: unidad, caja, paquete, kilo, litro.",
      kpiTraceability: ["devoluciones_unidades"],
      modulosImpactados: ["inventario_operativo", "comercial"],
      fuenteSag: "DETALLE_VENTAS",
      notas: "Confirmar enum con SAG. Permite comparar ventas en unidades comparables.",
    },

    // ── Grupo 5 — Cliente 360 ─────────────────────────────────────────────
    {
      campo: "CIUDAD_CLIENTE",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Ciudad de facturación o entrega del cliente.",
      kpiTraceability: ["ventas_por_ciudad"],
      modulosImpactados: ["comercial", "cliente_360", "executive_dashboard", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Copilot: '¿Qué ciudad compra más?', '¿Qué región cayó en ventas?'",
    },
    {
      campo: "PAIS_CLIENTE",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "País del cliente. Relevante para exportaciones y comercio exterior.",
      kpiTraceability: ["ventas_por_ciudad", "ventas_brutas"],
      modulosImpactados: ["comercial", "cliente_360", "comercio_exterior", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Necesario cuando Castillitos exporte o venda a clientes internacionales.",
    },

    // ── Grupo 6 — Estructura empresarial ─────────────────────────────────
    {
      campo: "SUCURSAL",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Sede o punto de venta donde se originó la transacción.",
      kpiTraceability: ["ventas_brutas", "ventas_por_canal"],
      modulosImpactados: ["comercial", "torre_control", "executive_dashboard", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Permite comparativos de venta por sede. " +
             "Copilot: '¿Qué sucursal vendió más este mes?'",
    },
    {
      campo: "EMPRESA",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Empresa o unidad de negocio que realizó la venta. Para arquitectura multiempresa.",
      kpiTraceability: ["ventas_brutas"],
      modulosImpactados: ["cierre", "executive_dashboard"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Incluir desde el inicio para evitar una segunda versión de la vista al escalar.",
    },

    // ── Grupo 7 — Logística y operación ──────────────────────────────────
    {
      campo: "FECHA_DESPACHO",
      tipo: "date", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el pedido fue despachado desde bodega.",
      kpiTraceability: ["sla_entrega"],
      modulosImpactados: ["logistica", "torre_control", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Permite medir tiempo venta → despacho. " +
             "Sin este campo no es posible calcular SLA operacional.",
    },
    {
      campo: "FECHA_ENTREGA",
      tipo: "date", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el pedido fue entregado al cliente.",
      kpiTraceability: ["sla_entrega"],
      modulosImpactados: ["logistica", "torre_control", "cliente_360", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Copilot: '¿Se cumplieron los tiempos de entrega?', '¿Cuántos pedidos llegaron tarde?' " +
             "Necesario para SLA de servicio y análisis de satisfacción.",
    },

    // ── Grupo 8 — Devoluciones (extensión) ────────────────────────────────
    {
      campo: "DEVOLUCION_CANTIDAD",
      tipo: "number", obligatorio: false, status: "unconfirmed",
      descripcion: "Unidades físicas devueltas asociadas a esta venta. " +
                   "Complementa DEVOLUCION_MONTO para analizar devoluciones parciales.",
      kpiTraceability: ["devoluciones", "devoluciones_unidades"],
      modulosImpactados: ["inventario_operativo", "comercial", "copilot"],
      fuenteSag: "DEVOLUCIONES_VENTAS",
      notas: "DEVOLUCION_MONTO da el valor; DEVOLUCION_CANTIDAD da las unidades. " +
             "Ambos son necesarios para análisis completo de devoluciones.",
    },

    // ── Grupo 9 — Comercio exterior / multi-moneda ────────────────────────
    {
      campo: "MONEDA",
      tipo: "enum", obligatorio: false, status: "unconfirmed",
      descripcion: "MONEDA representa la moneda original del documento o transacción. Valores: COP | USD | EUR | CNY.",
      kpiTraceability: ["ventas_brutas"],
      modulosImpactados: ["comercio_exterior", "tesoreria", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Necesario para ventas de exportación y operaciones con clientes internacionales. " +
             "Castillitos tiene importaciones — algunas ventas pueden estar denominadas en USD o CNY.",
    },
    {
      campo: "TASA_CAMBIO",
      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "TASA_CAMBIO representa la tasa utilizada para convertir la operación a la moneda funcional " +
                   "o moneda de reporte. Referencia: FECHA_VENTA o FECHA_APLICACION_CONTABLE.",
      kpiTraceability: ["ventas_brutas", "margen_bruto"],
      modulosImpactados: ["comercio_exterior", "cierre", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Confirmar con SAG: ¿TRM del día de la venta o del día de aplicación contable?",
    },

    // ── Grupo 10 — Auditoría y gobernanza ─────────────────────────────────
    {
      campo: "FECHA_CREACION",
      tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora en que fue creado el registro en SAG.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Trazabilidad operacional. Copilot y auditoría necesitan saber cuándo nació la venta.",
    },
    {
      campo: "FECHA_ACTUALIZACION",
      tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora de la última modificación del registro en SAG.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "alertas"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Permite detectar registros modificados después del cierre contable. " +
             "Alertas pueden dispararse cuando una venta histórica es modificada.",
    },

    // ── FINAL HARDENING-01 — Trazabilidad documental y contexto ─────────
    {
      campo: "ID_FACTURA",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador financiero interno de la factura en SAG. " +
                   "Puede diferir de ID_VENTA (ID operacional) y de NUMERO_DOCUMENTO (consecutivo visible). " +
                   "Permite cruzar con el dominio PAGOS (ID_FACTURA_REF) y CARTERA.",
      kpiTraceability: ["ventas_brutas"],
      modulosImpactados: ["conciliacion", "cartera", "cobranza", "copilot"],
      fuenteSag: "FACTURAS",
      notas: "Clave para trazabilidad venta → factura → pago → cartera. " +
             "Sin este campo el cruce con pagosnew.ID_FACTURA_REF puede requerir lógica adicional.",
    },
    {
      campo: "CODIGO_PRODUCTO",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Código comercial o referencia del producto vendido. " +
                   "Puede diferir del ID_PRODUCTO técnico interno de SAG.",
      kpiTraceability: ["ventas_por_referencia", "margen_por_producto", "rotacion_producto"],
      modulosImpactados: ["inventario_operativo", "comercial", "comisiones", "copilot"],
      fuenteSag: "DETALLE_VENTAS",
      notas: "Incluir en la vista evita joins adicionales en queries de Copilot y análisis ABC. " +
             "Copilot: '¿Qué referencia se vende más?', '¿Cuál tiene mejor margen?'",
    },
    {
      campo: "NOMBRE_PRODUCTO",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre legible del producto vendido. " +
                   "Facilita revisión humana, reportes comerciales y respuestas de Copilot.",
      kpiTraceability: ["ventas_por_referencia"],
      modulosImpactados: ["inventario_operativo", "comercial", "cliente_360", "copilot"],
      fuenteSag: "DETALLE_VENTAS",
      notas: "Copilot puede responder preguntas con nombres reales sin depender de MAETRO_PRODUCTOS. " +
             "Recomendado incluirlo directamente en la vista para simplificar el modelo de contexto.",
    },
    {
      campo: "NOMBRE_CLIENTE",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre legible del cliente. " +
                   "Permite contexto humano inmediato en Comercial, Cobranza, Cliente 360 y Copilot.",
      kpiTraceability: ["ventas_por_cliente"],
      modulosImpactados: ["comercial", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Incluido directamente en la vista evita un join con MAESTRO_CLIENTES en cada query. " +
             "Copilot: '¿Qué compró el cliente [nombre] el mes pasado?'",
    },
    {
      campo: "ESTADO_LOGISTICO",
      tipo: "enum", obligatorio: false, status: "unconfirmed",
      descripcion: "Estado operativo del despacho. " +
                   "Valores: pendiente, despachado, en_transito, entregado, devuelto, cancelado.",
      kpiTraceability: ["sla_entrega", "cumplimiento_entrega"],
      modulosImpactados: ["logistica", "torre_control", "cliente_360", "alertas", "copilot", "automatizaciones"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Habilita seguimiento venta → despacho → entrega en Torre de Control. " +
             "Alertas automáticas cuando ESTADO_LOGISTICO no avanza según SLA. " +
             "Confirmar enum de valores con SAG.",
    },
    {
      campo: "LINEA_DETALLE_ID",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador único de la línea dentro del documento de venta. " +
                   "Requerido cuando la vista se entrega con granularidad por línea de detalle.",
      kpiTraceability: ["margen_por_producto", "rotacion_producto", "ventas_por_referencia"],
      modulosImpactados: ["inventario_operativo", "comercial", "cierre", "copilot"],
      fuenteSag: "DETALLE_VENTAS",
      notas: "Necesario para distinguir líneas del mismo documento. " +
             "Sin LINEA_DETALLE_ID no es posible hacer upsert correcto en carga incremental. " +
             "Incluir si SAG entrega granularidad por línea (recomendado).",
    },
    {
      campo: "GRANULARIDAD_REGISTRO",
      tipo: "enum", obligatorio: true, status: "unconfirmed",
      descripcion: "Indica si cada fila representa una factura completa o una línea de detalle. " +
                   "Valores: factura, linea_detalle.",
      kpiTraceability: ["ventas_brutas", "margen_por_producto", "costo_ventas"],
      modulosImpactados: ["conciliacion", "inventario_operativo", "cierre", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "CAMPO CRÍTICO — evita ambigüedad en todos los cálculos de Agentik. " +
             "Si es factura: MONTO_BRUTO es el total del documento. " +
             "Si es linea_detalle: MONTO_BRUTO es el valor de esa línea y debe sumarse por ID_VENTA para el total. " +
             "Agentik prefiere linea_detalle para habilitar análisis por producto, inventario, margen y rotación.",
    },

    // ── FINAL HARDENING-02 — Cierre definitivo dominio Ventas ────────────
    {
      campo: "FECHA_COMPROMISO_ENTREGA",
      tipo: "date", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha prometida al cliente para la entrega del pedido. " +
                   "Diferente de FECHA_ENTREGA (fecha real). " +
                   "Permite medir: SLA de entrega, retrasos operativos, cumplimiento logístico.",
      kpiTraceability: ["sla_entrega", "cumplimiento_entrega"],
      modulosImpactados: ["logistica", "torre_control", "cliente_360", "alertas", "copilot", "automatizaciones"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Sin FECHA_COMPROMISO_ENTREGA no es posible medir cumplimiento real contra la promesa realizada al cliente. " +
             "Diferencia clave: FECHA_ENTREGA = cuándo llegó. FECHA_COMPROMISO_ENTREGA = cuándo prometimos.",
    },
    {
      campo: "ID_BODEGA",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador de la bodega desde donde se surtió la venta. " +
                   "Permite análisis de rotación, cobertura y desempeño por bodega.",
      kpiTraceability: ["rotacion_inventario", "inventario_disponible"],
      modulosImpactados: ["inventario_operativo", "logistica", "torre_control", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Preparación para múltiples bodegas y expansión operativa futura. " +
             "Copilot: '¿Qué bodega surtió más ventas?' / '¿Qué bodega tiene mayor rotación?'",
    },
    {
      campo: "ID_PEDIDO",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador del pedido de origen antes de convertirse en factura. " +
                   "Trazabilidad: Pedido → Factura → Pago. No asumir que son el mismo documento.",
      kpiTraceability: ["ventas_brutas"],
      modulosImpactados: ["comercial", "cartera", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Campo clave para trazabilidad comercial completa desde la intención de compra hasta el recaudo. " +
             "Permite identificar pedidos pendientes por facturar, facturación parcial y cancelaciones.",
    },
    {
      campo: "ORIGEN_VENTA",
      tipo: "enum", obligatorio: false, status: "unconfirmed",
      descripcion: "Canal de marketing o fuente de adquisición que originó la venta. " +
                   "Valores: facebook_ads, google_ads, instagram, whatsapp, referido, " +
                   "marketplace, ecommerce, presencial. " +
                   "ORIGEN_VENTA ≠ CANAL_VENTA: CANAL_VENTA = ecommerce, ORIGEN_VENTA = facebook_ads.",
      kpiTraceability: ["ventas_brutas", "ventas_por_canal"],
      modulosImpactados: ["marketing_studio", "comercial", "cliente_360", "copilot", "executive_dashboard"],
      fuenteSag: "VENTAS_MAESTRO",
      notas: "Este campo conecta Marketing Studio con el resultado financiero real de las ventas. " +
             "Permite calcular ROI de campañas, atribución de ventas por canal digital " +
             "y segmentación para automatizaciones de marketing.",
    },
  ],

  bloqueadores: [
    "Confirmar nombre real de tablas fuente con equipo SAG",
    "CRÍTICO: Confirmar granularidad — ¿una fila por factura o por línea de detalle? (Agentik prefiere línea de detalle)",
    "Confirmar si SAG calcula COSTO_VENTA y MARGEN_BRUTO o deben derivarse",
    "Confirmar enum de TIPO_DOCUMENTO, ESTADO_VENTA, ESTADO_LOGISTICO y ORIGEN_VENTA",
    "Confirmar si ID_FACTURA y ID_VENTA son el mismo campo o campos distintos en SAG",
    "Confirmar si ID_PEDIDO existe como campo separado en SAG o si es equivalente a ID_VENTA",
  ],

  notas: "Vista ampliada en HARDENING-01, FINAL-HARDENING-01 y FINAL-HARDENING-02. " +
         "VERSIÓN DEFINITIVA del dominio Ventas antes de pasar a Recaudos, Cartera y Bancos. " +
         "Agentik prefiere granularidad por LÍNEA DE DETALLE para análisis por producto, margen e inventario. " +
         "41 campos — trazabilidad completa: Venta → Pedido → Documento → Factura → Línea → Producto → " +
         "Cliente → Vendedor → Margen → Inventario → Bodega → Despacho → Entrega → Pago → Cartera → " +
         "Atribución → Marketing → Copilot.",
};

// ── 2. PAGOS ───────────────────────────────────────────────────────────────────
//
// Scope: vw_agentik_pagos es la vista más estratégica del contrato SAG.
// No es solo para conciliación — es la fuente de verdad para:
//   Conciliación Inteligente, Finanzas, Tesorería, Cobranza, Comercial,
//   Cliente 360, Torre de Control, Executive Dashboard, Copilot, Alertas
//   y Automatizaciones futuras.
//
// COPILOT QUERIES HABILITADAS POR ESTA VISTA:
//   - "¿Quién pagó hoy?"                         → FECHA_PAGO + FECHA_APLICACION + ID_CLIENTE
//   - "¿Quién pagó tarde?"                        → FECHA_APLICACION vs FECHA_VENCIMIENTO_FACTURA
//   - "¿Qué clientes siguen debiendo?"            → SALDO_POSTERIOR > 0 + TIPO_APLICACION = parcial
//   - "¿Qué pagos siguen pendientes de aplicar?"  → ESTADO_PAGO = pendiente
//   - "¿Qué sucursal recaudó más?"                → SUCURSAL + MONTO_PAGO (sum)
//   - "¿Cuál es el historial de pago del cliente?" → FECHA_PAGO + TIPO_APLICACION + SALDO_POSTERIOR
//   - "¿Qué pagos presentan anomalías?"           → MONTO_PAGO outliers + OBSERVACION_PAGO
//
// Sprint: AGENTIK-SAG-PAYMENTS-CONTRACT-HARDENING-01

const pagosContract: SagDomainContract = {
  id:             "pagos",
  nombre:         "Pagos",
  descripcion:    "Pagos recibidos de clientes contra facturas de venta. " +
                  "Fuente de verdad para Conciliación, Tesorería, Cobranza, Cliente 360, " +
                  "Comercial, Torre de Control y Agentik Copilot. " +
                  "SAG confirmó que pagosnew no tiene restricción histórica y permite consultas batch.",
  status:         "agreed",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_pagos",
  primaryTables:  ["pagosnew", "PAGOS_DETALLE"],
  syncFrequency:  "daily_eod",
  dataCurrency:   "historical",
  historicalCutoff: "2015-01-01",
  prioridad:      1,
  owner:          "Equipo SAG (confirmado reunión 2026-05)",
  kpisEnabled: [
    // Original
    "pagos_recibidos", "cartera_vencida", "cartera_corriente", "dias_cartera",
    "flujo_caja_operativo", "saldo_bancos",
    // Extended — payment analytics
    "pagos_oportunos", "pagos_tardios", "dias_mora_promedio",
    "tasa_recaudo", "score_riesgo_cliente",
    "recaudo_por_sucursal", "recaudo_por_canal",
  ],
  modulosEnabled: [
    // Original
    "conciliacion", "tesoreria", "cierre", "cartera", "executive_dashboard",
    // Extended
    "cobranza", "comercial", "cliente_360", "torre_control",
    "copilot", "alertas", "automatizaciones",
  ],

  fields: [
    // ── Campos originales acordados ─────────────────────────────────────────
    {
      campo: "ID_PAGO",
      tipo: "string", obligatorio: true, status: "agreed",
      descripcion: "Identificador único del pago en pagosnew. Clave primaria de trazabilidad.",
      kpiTraceability: ["pagos_recibidos"],
      modulosImpactados: ["conciliacion", "tesoreria", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "pagosnew",
    },
    {
      campo: "FECHA_PAGO",
      tipo: "datetime", obligatorio: true, status: "agreed",
      descripcion: "Fecha y hora en que se registró el pago en SAG.",
      kpiTraceability: ["pagos_recibidos", "recaudos_dia", "tasa_recaudo"],
      modulosImpactados: ["conciliacion", "tesoreria", "cierre", "cobranza", "copilot"],
      fuenteSag: "pagosnew",
    },
    {
      campo: "MONTO_PAGO",
      tipo: "decimal", obligatorio: true, status: "agreed",
      descripcion: "Valor del pago recibido.",
      kpiTraceability: ["pagos_recibidos", "flujo_caja_operativo", "tasa_recaudo", "recaudo_por_sucursal", "recaudo_por_canal"],
      modulosImpactados: ["conciliacion", "tesoreria", "executive_dashboard", "comercial", "torre_control", "copilot"],
      fuenteSag: "pagosnew",
    },
    {
      campo: "ID_FACTURA_REF",
      tipo: "string", obligatorio: true, status: "agreed",
      descripcion: "Factura o documento de venta al que aplica este pago.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida"],
      modulosImpactados: ["conciliacion", "cartera", "cobranza", "cliente_360"],
      fuenteSag: "pagosnew",
    },
    {
      campo: "ID_CLIENTE",
      tipo: "string", obligatorio: true, status: "agreed",
      descripcion: "Cliente que realizó el pago.",
      kpiTraceability: ["cartera_vencida", "dias_cartera", "score_riesgo_cliente", "tasa_recaudo"],
      modulosImpactados: ["cartera", "executive_dashboard", "cobranza", "cliente_360", "copilot", "automatizaciones"],
      fuenteSag: "pagosnew",
    },
    {
      campo: "MEDIO_PAGO",
      tipo: "enum", obligatorio: false, status: "pending_view",
      descripcion: "Forma del instrumento de pago: transferencia, cheque, efectivo, PSE, etc.",
      kpiTraceability: ["pagos_recibidos"],
      modulosImpactados: ["tesoreria", "conciliacion"],
      fuenteSag: "pagosnew",
      notas: "Confirmar enum con SAG. MEDIO_PAGO = instrumento; CANAL_PAGO = origen operativo (ver abajo).",
    },
    {
      campo: "ESTADO_PAGO",
      tipo: "enum", obligatorio: true, status: "pending_view",
      descripcion: "Estado del pago: aplicado, pendiente, reversado, anulado.",
      kpiTraceability: ["pagos_recibidos", "cartera_corriente"],
      modulosImpactados: ["conciliacion", "cartera", "cobranza", "alertas", "automatizaciones"],
      fuenteSag: "pagosnew",
    },
    {
      campo: "BANCO_DESTINO",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Banco receptor del pago — para cruce con extracto bancario.",
      kpiTraceability: ["saldo_bancos", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "conciliacion"],
      fuenteSag: "pagosnew",
      notas: "Crítico para conciliación bancaria automatizada.",
    },

    // ── FASE 1 — Campos críticos nuevos ────────────────────────────────────
    {
      campo: "NUMERO_RECIBO",
      tipo: "string", obligatorio: true, status: "pending_view",
      descripcion: "Consecutivo o comprobante visible para usuarios y clientes. " +
                   "Referencia humana del pago (distinta del ID_PAGO técnico).",
      kpiTraceability: ["pagos_recibidos"],
      modulosImpactados: ["cobranza", "cliente_360", "copilot"],
      fuenteSag: "pagosnew",
      notas: "Sin este campo Cobranza y Cliente 360 no pueden mostrar comprobantes. " +
             "Auditoría e investigación de incidencias lo requieren.",
    },
    {
      campo: "FECHA_APLICACION",
      tipo: "datetime", obligatorio: true, status: "pending_view",
      descripcion: "Fecha real en que el pago fue aplicado al sistema SAG. " +
                   "Puede diferir de FECHA_PAGO cuando el registro se hace con retraso.",
      kpiTraceability: ["pagos_recibidos", "recaudos_dia", "pagos_oportunos", "pagos_tardios"],
      modulosImpactados: ["conciliacion", "tesoreria", "cierre", "cobranza", "copilot"],
      fuenteSag: "pagosnew",
      notas: "FECHA_PAGO ≠ FECHA_APLICACION. Ambas son necesarias. " +
             "FECHA_APLICACION define el período contable. " +
             "Sin este campo la conciliación de período puede quedar incorrecta.",
    },
    {
      campo: "SALDO_POSTERIOR",
      tipo: "decimal", obligatorio: true, status: "pending_view",
      descripcion: "Saldo pendiente de la factura después de aplicar este pago. " +
                   "Permite saber si el cliente saldó completamente o queda saldo.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida", "tasa_recaudo"],
      modulosImpactados: ["cartera", "cobranza", "cliente_360", "copilot", "alertas", "automatizaciones"],
      fuenteSag: "pagosnew",
      notas: "Campo clave para Copilot: responde '¿cuánto debe todavía el cliente?' " +
             "Sin SALDO_POSTERIOR Agentik debe recalcular de ventas - pagos, lo cual es costoso y puede tener desfases.",
    },
    {
      campo: "TIPO_APLICACION",
      tipo: "enum", obligatorio: true, status: "pending_view",
      descripcion: "Tipo de aplicación del pago. Valores: total, parcial, anticipo, nota_credito, cruce_saldo.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida", "tasa_recaudo", "dias_mora_promedio"],
      modulosImpactados: ["cartera", "cobranza", "conciliacion", "copilot", "automatizaciones"],
      fuenteSag: "pagosnew",
      notas: "Crítico para diferenciar pagos reales de cruces contables. " +
             "Un 'nota_credito' no debe contarse como recaudo efectivo en Tesorería.",
    },
    {
      campo: "REFERENCIA_BANCARIA",
      tipo: "string", obligatorio: true, status: "pending_view",
      descripcion: "Número de transferencia, consignación, comprobante PSE o referencia electrónica del banco. " +
                   "Trazabilidad entre SAG y el extracto bancario.",
      kpiTraceability: ["flujo_caja_operativo"],
      modulosImpactados: ["conciliacion", "tesoreria", "cobranza"],
      fuenteSag: "pagosnew",
      notas: "Sin REFERENCIA_BANCARIA la conciliación bancaria automatizada es imposible. " +
             "Es el campo de cruce entre pagosnew y el extracto del banco.",
    },
    {
      campo: "BANCO_ORIGEN",
      tipo: "string", obligatorio: false, status: "pending_view",
      descripcion: "Banco desde el cual salió el dinero (banco del cliente). " +
                   "Complementa BANCO_DESTINO para trazabilidad completa de la transferencia.",
      kpiTraceability: ["flujo_caja_operativo"],
      modulosImpactados: ["conciliacion", "tesoreria"],
      fuenteSag: "pagosnew",
      notas: "Útil para analítica financiera y detección de anomalías. " +
             "Junto con BANCO_DESTINO permite trazabilidad bancaria end-to-end.",
    },
    {
      campo: "FECHA_VENCIMIENTO_FACTURA",
      tipo: "date", obligatorio: true, status: "pending_view",
      descripcion: "Fecha de vencimiento de la factura asociada al pago. " +
                   "Permite calcular si el pago fue oportuno, tardío o en mora.",
      kpiTraceability: ["dias_cartera", "pagos_oportunos", "pagos_tardios", "dias_mora_promedio", "score_riesgo_cliente"],
      modulosImpactados: ["cartera", "cobranza", "cliente_360", "copilot", "alertas", "planeacion"],
      fuenteSag: "pagosnew",
      notas: "Campo fundamental para scoring de riesgo y comportamiento de pago. " +
             "Habilita: días de retraso = FECHA_APLICACION - FECHA_VENCIMIENTO_FACTURA. " +
             "Sin este campo no es posible calcular pagos_oportunos ni score_riesgo_cliente.",
    },

    // ── FASE 2 — Campos estratégicos ────────────────────────────────────────
    {
      campo: "SUCURSAL",
      tipo: "string", obligatorio: false, status: "pending_view",
      descripcion: "Sede, punto de venta o sucursal donde se recibió o registró el pago.",
      kpiTraceability: ["recaudo_por_sucursal"],
      modulosImpactados: ["comercial", "torre_control", "executive_dashboard", "copilot"],
      fuenteSag: "pagosnew",
      notas: "Habilita comparativos de recaudo por sede. " +
             "Copilot puede responder: '¿Qué sucursal recaudó más esta semana?'",
    },
    {
      campo: "EMPRESA",
      tipo: "string", obligatorio: false, status: "pending_view",
      descripcion: "Empresa o unidad de negocio a la que pertenece el pago. " +
                   "Necesario para consolidación financiera en arquitecturas multiempresa.",
      kpiTraceability: ["pagos_recibidos", "flujo_caja_operativo"],
      modulosImpactados: ["cierre", "executive_dashboard", "torre_control"],
      fuenteSag: "pagosnew",
      notas: "Aunque hoy Castillitos opera como una empresa, incluir este campo " +
             "desde el inicio evita una segunda versión de la vista al escalar.",
    },
    {
      campo: "CANAL_PAGO",
      tipo: "enum", obligatorio: false, status: "pending_view",
      descripcion: "Canal operativo por el que llegó el pago. " +
                   "Valores: caja, transferencia, pse, datafono, ecommerce, recaudo_externo. " +
                   "CANAL_PAGO es el origen operativo. MEDIO_PAGO es el instrumento financiero.",
      kpiTraceability: ["recaudo_por_canal", "pagos_recibidos"],
      modulosImpactados: ["comercial", "tesoreria", "copilot"],
      fuenteSag: "pagosnew",
      notas: "Distinto de MEDIO_PAGO. CANAL_PAGO responde dónde fue recibido el pago. " +
             "Crítico para analítica comercial y detección de canales de mayor recaudo.",
    },
    {
      campo: "USUARIO_APLICACION",
      tipo: "string", obligatorio: false, status: "pending_view",
      descripcion: "Usuario o operario de SAG que registró o aplicó el pago.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cobranza"],
      fuenteSag: "pagosnew",
      notas: "Necesario para auditoría, control interno e investigación de incidencias. " +
             "Permite identificar patrones anómalos por operario.",
    },
    {
      campo: "OBSERVACION_PAGO",
      tipo: "string", obligatorio: false, status: "pending_view",
      descripcion: "Comentario u observación operativa asociada al pago. " +
                   "Ejemplos: 'Pago aplicado manualmente', 'Cliente reportó transferencia', 'Acuerdo comercial'.",
      kpiTraceability: [],
      modulosImpactados: ["copilot", "cliente_360", "cobranza"],
      fuenteSag: "pagosnew",
      notas: "Campo de texto libre. Agentik Copilot puede indexar este campo para responder " +
             "preguntas sobre contexto de pagos específicos. " +
             "Útil en investigación de diferencias y gestión de incidencias.",
    },

    // ── Multi-moneda — MULTICURRENCY-01 ────────────────────────────────────
    {
      campo: "MONEDA",
      tipo: "enum", obligatorio: false, status: "pending_view",
      descripcion: "MONEDA representa la moneda original del documento o transacción. Valores: COP | USD | EUR | CNY.",
      kpiTraceability: ["flujo_caja_operativo", "pagos_recibidos"],
      modulosImpactados: ["tesoreria", "conciliacion", "comercio_exterior", "copilot", "torre_control"],
      fuenteSag: "pagosnew",
      notas: "Requerido para pagos en moneda extranjera: importaciones, proveedores internacionales, " +
             "operaciones con China (CNY/USD). " +
             "Si SAG no lo tiene en pagosnew, solicitar derivarlo desde la factura asociada.",
    },
    {
      campo: "TASA_CAMBIO",
      tipo: "decimal", obligatorio: false, status: "pending_view",
      descripcion: "TASA_CAMBIO representa la tasa utilizada para convertir la operación a la moneda funcional " +
                   "o moneda de reporte. Debe corresponder a la fecha de aplicación (FECHA_APLICACION).",
      kpiTraceability: ["flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "cierre", "comercio_exterior", "copilot"],
      fuenteSag: "pagosnew",
      notas: "Permite analizar pagos en moneda extranjera, importaciones y consolidación financiera " +
             "sin solicitar una segunda versión de la vista. " +
             "Si SAG usa TRM oficial, confirmar fuente: ¿TRM del día de pago o de aplicación contable?",
    },

    // ── MICRO-HARDENING-03 — Alineación cross-domain (Auditoría GAP-AUDIT-01) ──
    {
      campo: "NOMBRE_CLIENTE",
      tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre legible del cliente asociado al pago. " +
                   "Permite revisión humana, soporte, conciliación y respuestas naturales de Copilot " +
                   "sin depender de JOINs adicionales con vw_agentik_cartera o MAESTRO_CLIENTES.",
      kpiTraceability: ["pagos_recibidos", "score_riesgo_cliente"],
      modulosImpactados: ["cliente_360", "conciliacion", "cartera", "cobranza", "copilot"],
      fuenteSag: "pagosnew",
      notas: "Incluir directamente en la vista para alineación con vw_agentik_ventas y vw_agentik_cartera. " +
             "Copilot: '¿Quién pagó hoy?', '¿Qué pagó el cliente [nombre]?'",
    },
    {
      campo: "FECHA_CREACION",
      tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora de creación original del registro de pago en SAG. " +
                   "Permite auditoría, trazabilidad histórica y detección de registros tardíos.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cierre", "copilot"],
      fuenteSag: "pagosnew",
      notas: "Confirmar disponibilidad en pagosnew. " +
             "Si no existe, usar FECHA_APLICACION como proxy para auditoría.",
    },
    {
      campo: "FECHA_ACTUALIZACION",
      tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora de la última modificación del registro de pago en SAG. " +
                   "Permite sincronización incremental, auditoría y reprocesamiento eficiente.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cierre", "copilot"],
      fuenteSag: "pagosnew",
      notas: "FECHA_ACTUALIZACION debe poder utilizarse como watermark para sincronizaciones incrementales. " +
             "Sin este campo las cargas incrementales deben usar FECHA_APLICACION como proxy, " +
             "lo cual puede omitir reversiones o correcciones tardías.",
    },
  ],

  notas: "pagosnew confirmado sin restricción histórica. Acceso batch aprobado. " +
         "Vista vw_agentik_pagos pendiente de creación por parte de SAG. " +
         "IMPORTANTE: Esta vista no es solo para conciliación. Es la fuente de verdad operacional " +
         "para Cobranza, Cliente 360, Comercial, Torre de Control, Executive Dashboard y Agentik Copilot. " +
         "MULTICURRENCY-01: MONEDA y TASA_CAMBIO para soporte de comercio exterior e importaciones. " +
         "MICRO-HARDENING-03: NOMBRE_CLIENTE, FECHA_CREACION y FECHA_ACTUALIZACION " +
         "agregados para alineación cross-domain con vw_agentik_ventas y vw_agentik_cartera. " +
         "25 campos — núcleo financiero auditado y alineado listo para integración con SAG.",
};

// ── 3. RECAUDOS ────────────────────────────────────────────────────────────────
//
// PRINCIPIO ARQUITECTÓNICO: Recaudo ≠ Pago.
//
//   Pago:    documento/evento asociado al cliente y a una obligación (vw_agentik_pagos).
//   Recaudo: ingreso efectivo, captura o aplicación de dinero (vw_agentik_recaudos).
//   Banco:   movimiento financiero externo que confirma la entrada real (vw_agentik_bancos).
//   Cartera: estado pendiente de una obligación (vw_agentik_cartera).
//
// Esta separación es intencional y permanente. Agentik no será solo para Castillitos
// ni solo para SAG. En otras integraciones estos conceptos pueden vivir en sistemas
// completamente distintos.
//
// Copilot queries habilitados por esta vista:
//   1. "¿Cuánto recaudamos hoy / esta semana / este mes?"
//      → MONTO_RECAUDO + FECHA_RECAUDO (sum by period)
//   2. "¿Qué recaudos no han sido aplicados a documentos?"
//      → ESTADO_RECAUDO = 'pendiente_aplicacion' + MONTO_NO_APLICADO
//   3. "¿Qué recaudos no están conciliados con el banco?"
//      → CONCILIADO = false + ESTADO_CONCILIACION
//   4. "¿Cuánto dinero entró por transferencia vs. caja vs. PSE?"
//      → CANAL_RECAUDO + MEDIO_RECAUDO + MONTO_RECAUDO
//   5. "¿Qué sucursal recaudó más esta semana?"
//      → SUCURSAL + MONTO_RECAUDO (sum)
//   6. "¿Hay anticipos sin aplicar?"
//      → SALDO_PENDIENTE_APLICAR > 0 + TIPO_RECAUDO = 'anticipo'
//   7. "¿Qué pagos del cliente [X] han sido recibidos?"
//      → ID_CLIENTE + NOMBRE_CLIENTE + FECHA_RECAUDO + MONTO_RECAUDO
//   8. "¿Este recaudo está en el extracto bancario?"
//      → REFERENCIA_BANCARIA + ID_MOVIMIENTO_BANCO + CONCILIADO
//
// Sprint: AGENTIK-SAG-RECAUDOS-ENTERPRISE-HARDENING-01

const recaudosContract: SagDomainContract = {
  id:             "recaudos",
  nombre:         "Recaudos",
  descripcion:    "Ingresos efectivos, aplicaciones y capturas de dinero. " +
                  "Dominio independiente de Pagos: el recaudo confirma que el dinero entró; " +
                  "el pago es el evento de obligación asociado al cliente. " +
                  "Fuente de verdad para Tesorería, Conciliación, Flujo de Caja y Copilot.",
  status:         "in_review",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_recaudos",
  primaryTables:  [
    "RECAUDOS_CAJA",
    "RECAUDOS_BANCO",
    "pagosnew",
    "MAESTRO_CLIENTES",
    "MOVIMIENTOS_BANCO",
  ],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  historicalCutoff: "2020-01-01",
  prioridad:      1,
  kpisEnabled: [
    "recaudos_dia",
    "flujo_caja_operativo",
    "saldo_bancos",
    "recaudo_por_canal",
    "recaudo_por_sucursal",
    "recaudo_pendiente_aplicar",
    "recaudos_conciliados",
    "recaudos_no_conciliados",
    "tasa_recaudo",
  ],
  modulosEnabled: [
    "tesoreria",
    "conciliacion",
    "cartera",
    "cobranza",
    "cliente_360",
    "executive_dashboard",
    "torre_control",
    "alertas",
    "automatizaciones",
    "copilot",
    "cierre",
    "planeacion",
  ],
  fields: [
    // ── Bloque 1 — Identificación ──────────────────────────────────────────────
    {
      campo: "ID_RECAUDO",        tipo: "string",   obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador único del recaudo. Clave primaria de la vista. " +
                   "Permite idempotencia en carga incremental y cruce con otras vistas.",
      kpiTraceability: ["recaudos_dia", "recaudos_conciliados", "recaudos_no_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "NUMERO_RECIBO",     tipo: "string",   obligatorio: true,  status: "unconfirmed",
      descripcion: "Número o consecutivo del comprobante de recaudo visible para el cliente y el operador. " +
                   "Referencia humana del recaudo (distinto del ID_RECAUDO técnico).",
      kpiTraceability: ["recaudos_dia"],
      modulosImpactados: ["tesoreria", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Copilot: '¿En qué comprobante se recibió ese pago?' — sin este campo la respuesta solo es un ID interno.",
    },
    {
      campo: "ID_CLIENTE",        tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador del cliente que generó el recaudo. " +
                   "Opcional: un recaudo puede ser una consignación sin cliente identificado aún.",
      kpiTraceability: ["recaudos_dia", "tasa_recaudo"],
      modulosImpactados: ["tesoreria", "cartera", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Puede ser nulo si el recaudo es una consignación sin aplicar o un depósito no identificado.",
    },
    {
      campo: "NOMBRE_CLIENTE",    tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre legible del cliente asociado al recaudo. " +
                   "Permite revisión humana sin JOINs adicionales.",
      kpiTraceability: ["recaudos_dia"],
      modulosImpactados: ["tesoreria", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "MAESTRO_CLIENTES",
      notas: "Alineado con vw_agentik_ventas, vw_agentik_pagos y vw_agentik_cartera.",
    },
    {
      campo: "NIT_CLIENTE",       tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "NIT o documento de identidad del cliente. " +
                   "Útil para reportes fiscales, cruce con DIAN y cobranza formal.",
      kpiTraceability: [],
      modulosImpactados: ["tesoreria", "cobranza", "cliente_360", "cierre"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
    // ── Bloque 2 — Relación con documentos ───────────────────────────────────
    {
      campo: "ID_PAGO",           tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Pago en pagosnew al que está asociado este recaudo. " +
                   "Permite trazabilidad entre el recaudo (dinero capturado) y el pago (obligación aplicada). " +
                   "Puede ser nulo si el recaudo aún no ha sido aplicado a un pago.",
      kpiTraceability: ["recaudos_dia", "recaudos_conciliados"],
      modulosImpactados: ["conciliacion", "tesoreria", "cartera", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Relación: un recaudo puede aplicar a uno o múltiples pagos. " +
             "Confirmar con SAG si la relación es 1:1 o 1:N.",
    },
    {
      campo: "ID_FACTURA",        tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Factura específica a la que aplica este recaudo. " +
                   "Permite trazabilidad Recaudo → Factura → Cartera.",
      kpiTraceability: ["recaudos_dia", "tasa_recaudo"],
      modulosImpactados: ["conciliacion", "cartera", "cobranza", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Puede ser nulo si el recaudo es un anticipo o consignación sin asignar.",
    },
    {
      campo: "NUMERO_FACTURA",    tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Número visible de la factura asociada. " +
                   "Facilita revisión humana en Cobranza y Cliente 360.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "ID_CARTERA",        tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Obligación de cartera que es saldada total o parcialmente por este recaudo. " +
                   "Cruce directo con vw_agentik_cartera.ID_CARTERA.",
      kpiTraceability: ["tasa_recaudo", "recaudos_dia"],
      modulosImpactados: ["cartera", "conciliacion", "cobranza", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Confirmar con SAG si este cruce existe en RECAUDOS_CAJA o debe derivarse.",
    },
    {
      campo: "ID_PEDIDO",         tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Pedido de origen relacionado con el recaudo. " +
                   "Trazabilidad: Pedido → Factura → Cartera → Recaudo.",
      kpiTraceability: [],
      modulosImpactados: ["comercial", "cartera", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    // ── Bloque 3 — Fechas ─────────────────────────────────────────────────────
    {
      campo: "FECHA_RECAUDO",     tipo: "datetime", obligatorio: true,  status: "unconfirmed",
      descripcion: "Fecha y hora en que el recaudo fue registrado en el sistema. " +
                   "Base para KPIs de recaudo diario y series temporales de flujo.",
      kpiTraceability: ["recaudos_dia", "flujo_caja_operativo", "recaudo_por_sucursal", "recaudo_por_canal"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre", "executive_dashboard", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "FECHA_APLICACION",  tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha real en que el recaudo fue aplicado a uno o más documentos. " +
                   "Puede diferir de FECHA_RECAUDO si existe un proceso de aplicación posterior.",
      kpiTraceability: ["tasa_recaudo", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "FECHA_RECAUDO = cuándo entró el dinero. FECHA_APLICACION = cuándo se registró contablemente. " +
             "Ambas son necesarias para conciliación de período.",
    },
    {
      campo: "FECHA_CONSIGNACION", tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el dinero fue consignado físicamente en el banco. " +
                   "Puede diferir de FECHA_RECAUDO (registro) y FECHA_APLICACION (contable).",
      kpiTraceability: ["saldo_bancos", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "conciliacion", "copilot"],
      fuenteSag: "RECAUDOS_BANCO",
      notas: "Crítico para conciliación bancaria: es la fecha que aparece en el extracto del banco.",
    },
    {
      campo: "FECHA_CREACION",    tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Timestamp de creación del registro en SAG.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cierre"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "FECHA_ACTUALIZACION", tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Timestamp de última modificación. " +
                   "FECHA_ACTUALIZACION debe poder utilizarse como watermark para sincronizaciones incrementales.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cierre"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    // ── Bloque 4 — Valores ────────────────────────────────────────────────────
    {
      campo: "MONTO_RECAUDO",     tipo: "decimal",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Monto total del recaudo recibido en la moneda indicada por MONEDA.",
      kpiTraceability: ["recaudos_dia", "flujo_caja_operativo", "recaudo_por_canal", "recaudo_por_sucursal"],
      modulosImpactados: ["tesoreria", "conciliacion", "executive_dashboard", "planeacion", "torre_control", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "MONTO_APLICADO",    tipo: "decimal",  obligatorio: false, status: "unconfirmed",
      descripcion: "Porción del recaudo ya aplicada a documentos. " +
                   "MONTO_APLICADO ≤ MONTO_RECAUDO.",
      kpiTraceability: ["tasa_recaudo", "recaudos_conciliados"],
      modulosImpactados: ["tesoreria", "cartera", "conciliacion", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "MONTO_NO_APLICADO", tipo: "decimal",  obligatorio: false, status: "unconfirmed",
      descripcion: "Porción del recaudo aún sin aplicar a documentos específicos. " +
                   "MONTO_NO_APLICADO = MONTO_RECAUDO − MONTO_APLICADO. " +
                   "Permite detectar anticipos, depósitos flotantes y dinero pendiente de asignar.",
      kpiTraceability: ["recaudo_pendiente_aplicar"],
      modulosImpactados: ["tesoreria", "cartera", "alertas", "automatizaciones", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Copilot: '¿Hay anticipos sin aplicar?' → filtrar MONTO_NO_APLICADO > 0.",
    },
    {
      campo: "SALDO_PENDIENTE_APLICAR", tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Saldo del recaudo que no ha sido asignado a ningún documento. " +
                   "Similar a MONTO_NO_APLICADO pero calculado por SAG como campo derivado. " +
                   "Si SAG no lo provee, Agentik lo calcula internamente.",
      kpiTraceability: ["recaudo_pendiente_aplicar"],
      modulosImpactados: ["tesoreria", "cartera", "alertas", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Confirmar con SAG si este campo existe calculado o debe derivarse de MONTO_RECAUDO - MONTO_APLICADO.",
    },
    // ── Bloque 5 — Medio/Canal ────────────────────────────────────────────────
    {
      campo: "TIPO_RECAUDO",      tipo: "enum",     obligatorio: true,  status: "unconfirmed",
      descripcion: "Clasificación del tipo de ingreso. " +
                   "Valores: caja | transferencia | pse | consignacion | cheque | anticipos | cruce_nota_credito | reverso.",
      kpiTraceability: ["recaudos_dia", "recaudo_por_canal"],
      modulosImpactados: ["tesoreria", "conciliacion", "executive_dashboard", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Confirmar enum completo con SAG. Distinguir reversos y cruces de recaudos reales.",
    },
    {
      campo: "MEDIO_RECAUDO",     tipo: "enum",     obligatorio: false, status: "unconfirmed",
      descripcion: "Instrumento financiero del recaudo. " +
                   "Valores: efectivo | transferencia_electronica | cheque | tarjeta_debito | tarjeta_credito | pse.",
      kpiTraceability: ["recaudos_dia"],
      modulosImpactados: ["tesoreria", "conciliacion"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "MEDIO_RECAUDO = instrumento (cómo se movió el dinero). " +
             "CANAL_RECAUDO = canal operativo (dónde fue recibido).",
    },
    {
      campo: "CANAL_RECAUDO",     tipo: "enum",     obligatorio: false, status: "unconfirmed",
      descripcion: "Canal operativo por el que llegó el recaudo. " +
                   "Valores: caja_sucursal | banca_virtual | recaudador_externo | datafono | ecommerce | domiciliacion.",
      kpiTraceability: ["recaudo_por_canal", "recaudos_dia"],
      modulosImpactados: ["tesoreria", "comercial", "executive_dashboard", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "REFERENCIA_BANCARIA", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Número de transferencia, consignación o referencia electrónica del banco. " +
                   "Clave de cruce entre el recaudo en SAG y el extracto bancario.",
      kpiTraceability: ["recaudos_conciliados", "recaudos_no_conciliados"],
      modulosImpactados: ["conciliacion", "tesoreria"],
      fuenteSag: "RECAUDOS_BANCO",
      notas: "Sin REFERENCIA_BANCARIA la conciliación bancaria automática es imposible. " +
             "Es el campo que une vw_agentik_recaudos con vw_agentik_bancos.",
    },
    {
      campo: "NUMERO_COMPROBANTE", tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Número de comprobante interno o externo asociado al recaudo. " +
                   "Puede ser el número del voucher, remesa o comprobante de caja.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "tesoreria", "cobranza", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    // ── Bloque 6 — Banco ──────────────────────────────────────────────────────
    {
      campo: "ID_CUENTA_BANCO",   tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador interno de la cuenta bancaria destino. " +
                   "Clave de cruce con vw_agentik_bancos.",
      kpiTraceability: ["saldo_bancos", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "conciliacion"],
      fuenteSag: "RECAUDOS_BANCO",
    },
    {
      campo: "CUENTA_BANCO",      tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Número de cuenta bancaria destino del recaudo. " +
                   "Permite conciliación con extracto bancario.",
      kpiTraceability: ["saldo_bancos"],
      modulosImpactados: ["tesoreria", "conciliacion"],
      fuenteSag: "RECAUDOS_BANCO",
    },
    {
      campo: "BANCO_DESTINO",     tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre del banco receptor del recaudo. " +
                   "Permite análisis de distribución de recaudos por entidad bancaria.",
      kpiTraceability: ["saldo_bancos"],
      modulosImpactados: ["tesoreria", "conciliacion", "executive_dashboard"],
      fuenteSag: "RECAUDOS_BANCO",
    },
    {
      campo: "ID_MOVIMIENTO_BANCO", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador del movimiento bancario en el extracto que confirma este recaudo. " +
                   "Cruce directo con vw_agentik_bancos.",
      kpiTraceability: ["recaudos_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Si ID_MOVIMIENTO_BANCO está poblado, el recaudo tiene confirmación bancaria. " +
             "Si es nulo y FECHA_CONSIGNACION existe, el recaudo puede estar en tránsito.",
    },
    // ── Bloque 7 — Conciliación ───────────────────────────────────────────────
    {
      campo: "CONCILIADO",        tipo: "boolean",  obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el recaudo fue cruzado con un movimiento real en el extracto bancario. " +
                   "true = conciliado con banco. false = pendiente de conciliación.",
      kpiTraceability: ["recaudos_conciliados", "recaudos_no_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion", "alertas", "copilot"],
      fuenteSag: "RECAUDOS_BANCO",
      notas: "Pilar de la Conciliación Inteligente de Agentik. " +
             "Alertas automáticas cuando CONCILIADO = false más allá de N días.",
    },
    {
      campo: "FECHA_CONCILIACION", tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el recaudo fue marcado como conciliado con el extracto bancario.",
      kpiTraceability: ["recaudos_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre"],
      fuenteSag: "RECAUDOS_BANCO",
    },
    {
      campo: "ESTADO_CONCILIACION", tipo: "enum",   obligatorio: false, status: "unconfirmed",
      descripcion: "Estado detallado del proceso de conciliación. " +
                   "Valores: pendiente | en_revision | conciliado | diferencia_detectada | rechazado.",
      kpiTraceability: ["recaudos_conciliados", "recaudos_no_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion", "alertas", "copilot"],
      fuenteSag: "RECAUDOS_BANCO",
      notas: "ESTADO_CONCILIACION da más granularidad que CONCILIADO (boolean). " +
             "Permite distinguir pendientes activos de diferencias detectadas.",
    },
    // ── Bloque 8 — Operación ──────────────────────────────────────────────────
    {
      campo: "SUCURSAL",          tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Sede o punto de atención donde fue registrado el recaudo. " +
                   "Habilita KPI recaudo_por_sucursal.",
      kpiTraceability: ["recaudo_por_sucursal", "recaudos_dia"],
      modulosImpactados: ["tesoreria", "comercial", "executive_dashboard", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "EMPRESA",           tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Empresa o unidad de negocio propietaria del recaudo. " +
                   "Preparación para arquitectura multiempresa y consolidación financiera.",
      kpiTraceability: ["recaudos_dia", "flujo_caja_operativo"],
      modulosImpactados: ["cierre", "executive_dashboard", "torre_control", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Presente en vw_agentik_ventas, vw_agentik_pagos y vw_agentik_cartera — alineación cross-domain.",
    },
    {
      campo: "USUARIO_APLICACION", tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Usuario de SAG que registró o aplicó el recaudo. " +
                   "Trazabilidad de auditoría y detección de anomalías por operario.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "tesoreria"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    {
      campo: "OBSERVACION_RECAUDO", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Comentario operativo asociado al recaudo. " +
                   "Ejemplos: 'Consignación cliente 3', 'Cheque devuelto', 'Anticipo campaña'. " +
                   "Copilot puede indexar este campo para contexto conversacional.",
      kpiTraceability: [],
      modulosImpactados: ["copilot", "tesoreria", "conciliacion"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    // ── Bloque 9 — Multimoneda ────────────────────────────────────────────────
    {
      campo: "MONEDA",            tipo: "enum",     obligatorio: false, status: "unconfirmed",
      descripcion: "MONEDA representa la moneda original del documento o transacción. Valores: COP | USD | EUR | CNY.",
      kpiTraceability: ["flujo_caja_operativo", "recaudos_dia"],
      modulosImpactados: ["tesoreria", "conciliacion", "comercio_exterior", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "Estandarizado cross-domain con vw_agentik_ventas, vw_agentik_pagos y vw_agentik_cartera.",
    },
    {
      campo: "TASA_CAMBIO",       tipo: "decimal",  obligatorio: false, status: "unconfirmed",
      descripcion: "TASA_CAMBIO representa la tasa utilizada para convertir la operación a la moneda funcional " +
                   "o moneda de reporte. Referencia: FECHA_RECAUDO o FECHA_CONSIGNACION.",
      kpiTraceability: ["flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "cierre", "comercio_exterior", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
    },
    // ── Bloque 10 — Estado ────────────────────────────────────────────────────
    {
      campo: "ESTADO_RECAUDO",    tipo: "enum",     obligatorio: true,  status: "unconfirmed",
      descripcion: "Estado operativo del recaudo. " +
                   "Valores: registrado | aplicado | parcial | reversado | anulado | pendiente_aplicacion. " +
                   "Permite filtrar recaudos reales de reversiones, anulaciones y anticipos flotantes.",
      kpiTraceability: ["recaudos_dia", "recaudo_pendiente_aplicar", "recaudos_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion", "alertas", "automatizaciones", "copilot"],
      fuenteSag: "RECAUDOS_CAJA",
      notas: "CAMPO CRÍTICO — sin ESTADO_RECAUDO Agentik no puede distinguir recaudos reales " +
             "de reversiones. Un reverso sumado como recaudo real infla el KPI recaudos_dia. " +
             "Confirmar enum con SAG.",
    },
  ],
  bloqueadores: [
    "Confirmar si pagosnew incluye recaudos o solo pagos de cartera — arquitectura crítica",
    "Confirmar si existen RECAUDOS_CAJA y RECAUDOS_BANCO como tablas separadas en SAG",
    "Confirmar si un recaudo puede aplicar a múltiples facturas (relación 1:N)",
    "Confirmar si una transferencia puede quedar en estado pendiente_aplicacion sin asignarse",
    "Confirmar si existe relación entre recaudo y movimiento bancario en SAG (ID_MOVIMIENTO_BANCO)",
    "Confirmar si existen anticipos, cruces de notas crédito, reversos y anulaciones en RECAUDOS_CAJA",
    "Confirmar disponibilidad de FECHA_CONSIGNACION — es la fecha del extracto bancario",
    "Confirmar si MONTO_NO_APLICADO y SALDO_PENDIENTE_APLICAR existen calculados o deben derivarse",
  ],
  notas: "38 campos — dominio independiente de Pagos. " +
         "PRINCIPIO: Recaudo ≠ Pago. El recaudo confirma el ingreso de dinero; el pago es la obligación. " +
         "Esta separación es permanente: Agentik no será solo para Castillitos ni solo para SAG. " +
         "Trazabilidad: Consignación Bancaria → Recaudo → Aplicación → Factura → Cartera → Pago → Cierre.",
};

// ── 4. CARTERA ─────────────────────────────────────────────────────────────────
//
// Scope: vw_agentik_cartera es la fuente empresarial de cuentas por cobrar.
//   Granularidad: UNA FILA POR DOCUMENTO/FACTURA PENDIENTE — no por cliente agregado.
//   Soporta: Cobranza Inteligente, Cliente 360, Riesgo, Copilot, Finanzas,
//   Torre de Control, Alertas, Planeación Financiera, Flujo de Caja, Automatizaciones.
//
// Copilot queries habilitados por esta vista:
//   1. "¿Qué clientes tienen mayor riesgo?" → RIESGO_CLIENTE, SALDO_VENCIDO, DIAS_MORA
//   2. "¿Qué facturas vencen esta semana?" → FECHA_VENCIMIENTO, SALDO_PENDIENTE
//   3. "¿Qué clientes incumplieron promesas de pago?" → ESTADO_COBRANZA='incumplida', PROMESA_PAGO_FECHA
//   4. "¿Qué vendedor tiene la cartera más sana?" → ID_VENDEDOR, SALDO_VENCIDO, DIAS_MORA
//   5. "¿Cuál es la cartera vencida por rango de mora?" → RANGO_MORA, SALDO_VENCIDO
//   6. "¿Cuánto dinero está en riesgo?" → SALDO_VENCIDO WHERE RIESGO_CLIENTE IN ('alto','critico')
//   7. "¿Qué clientes deberían bloquearse para nuevas ventas?" → CUPO_DISPONIBLE <= 0, RIESGO_CLIENTE='critico'
//   8. "¿Qué clientes pagan tarde de forma recurrente?" → dias_mora_promedio, pagos_tardios por cliente
//
// Sprint: AGENTIK-SAG-CARTERA-ENTERPRISE-HARDENING-01

const carteraContract: SagDomainContract = {
  id:             "cartera",
  nombre:         "Cartera",
  descripcion:    "Cuentas por cobrar a nivel de obligación/factura pendiente — cartera corriente, vencida, " +
                  "rango de mora, cobranza inteligente, riesgo de crédito y cupo disponible. " +
                  "Granularidad: una fila por documento pendiente. " +
                  "Fuente de verdad para Cobranza, Cliente 360, Riesgo, Planeación y Copilot.",
  status:         "in_review",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_cartera",
  primaryTables:  [
    "CARTERA_CLIENTES",
    "SALDOS_FACTURA",
    "COBRANZA_GESTIONES",
    "CREDITO_CLIENTES",
    "MAESTRO_CLIENTES",
    "VENDEDORES",
  ],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  historicalCutoff: "2020-01-01",
  prioridad:      1,
  kpisEnabled: [
    "cartera_corriente",
    "cartera_vencida",
    "dias_cartera",
    "cartera_critica",
    "envejecimiento_cartera",
    "promesas_pago_cumplidas",
    "promesas_pago_incumplidas",
    "cobertura_cupo",
    "cartera_por_vendedor",
    "cartera_por_sucursal",
    "dias_mora_promedio",
    "score_riesgo_cliente",
    "tasa_recaudo",
    "flujo_caja_operativo",
    "cuentas_por_pagar",
  ],
  modulosEnabled: [
    "cartera",
    "cobranza",
    "cliente_360",
    "executive_dashboard",
    "planeacion",
    "alertas",
    "torre_control",
    "copilot",
    "automatizaciones",
    "conciliacion",
    "cierre",
  ],
  bloqueadores: [
    "Confirmar que COBRANZA_GESTIONES existe como tabla separada en SAG o si gestiones se registran en otro sistema",
    "Confirmar si CREDITO_CLIENTES tiene CUPO_CREDITO y RIESGO_CLIENTE disponibles o requieren cálculo externo",
    "Confirmar granularidad: ¿SAG expone saldos por factura o solo por cliente? — crítico para Cobranza Inteligente",
    "Confirmar si PROMESA_PAGO_FECHA y RESULTADO_ULTIMA_GESTION existen en SAG o solo en CRM externo",
  ],
  fields: [
    // ── Bloque 1 — Identificación ──────────────────────────────────────────────
    {
      campo: "ID_CARTERA",       tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador único de la obligación de cartera (clave primaria de la vista). " +
                   "Permite idempotencia en carga incremental y upsert correcto.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida", "envejecimiento_cartera"],
      modulosImpactados: ["cartera", "cobranza", "conciliacion", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
      notas: "Si SAG no tiene un ID de cartera separado, usar ID_FACTURA como PK de la vista.",
    },
    {
      campo: "ID_FACTURA",       tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Factura específica con saldo pendiente. " +
                   "Permite cruce con vw_agentik_ventas y vw_agentik_pagos para trazabilidad completa: " +
                   "Venta → Factura → Saldo pendiente → Gestión de cobro.",
      kpiTraceability: ["cartera_vencida", "cartera_corriente"],
      modulosImpactados: ["conciliacion", "cartera", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "NUMERO_FACTURA",   tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Número de factura legible para el cliente. " +
                   "Copilot y Cobranza necesitan mostrar el número de factura al agente de cobro o al cliente.",
      kpiTraceability: ["cartera_vencida"],
      modulosImpactados: ["cobranza", "cliente_360", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "ID_PEDIDO",        tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Pedido de origen que generó esta factura. " +
                   "Trazabilidad: Pedido → Factura → Cartera → Gestión de cobro.",
      kpiTraceability: ["cartera_vencida"],
      modulosImpactados: ["cartera", "cobranza", "cliente_360", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "ID_CLIENTE",       tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador del cliente deudor. " +
                   "Permite agrupar todas las obligaciones del mismo cliente para vista 360°.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida", "score_riesgo_cliente"],
      modulosImpactados: ["cartera", "cobranza", "cliente_360", "executive_dashboard", "copilot"],
      fuenteSag: "CARTERA_CLIENTES",
    },
    {
      campo: "NOMBRE_CLIENTE",   tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Nombre o razón social del cliente. " +
                   "Necesario para Cobranza (identificar al cliente en gestión) y Copilot (respuestas en lenguaje natural).",
      kpiTraceability: ["cartera_vencida", "cartera_por_sucursal"],
      modulosImpactados: ["cobranza", "cliente_360", "torre_control", "copilot"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
    {
      campo: "NIT_CLIENTE",      tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "NIT o documento de identidad del cliente. " +
                   "Clave de cruce entre módulos y para reportes fiscales.",
      kpiTraceability: ["cartera_vencida"],
      modulosImpactados: ["cobranza", "cliente_360", "cierre", "copilot"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
    // ── Bloque 2 — Fechas ─────────────────────────────────────────────────────
    {
      campo: "FECHA_FACTURA",    tipo: "date",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Fecha de emisión de la factura. " +
                   "Permite análisis histórico de cartera y antigüedad del documento.",
      kpiTraceability: ["envejecimiento_cartera", "cartera_vencida"],
      modulosImpactados: ["cartera", "cobranza", "cierre", "planeacion", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "FECHA_VENCIMIENTO", tipo: "date",   obligatorio: true,  status: "unconfirmed",
      descripcion: "Fecha límite de pago acordada con el cliente. " +
                   "Campo fundamental: DIAS_MORA = CURRENT_DATE − FECHA_VENCIMIENTO. " +
                   "Permite proyectar vencimientos futuros para flujo de caja.",
      kpiTraceability: ["dias_cartera", "cartera_vencida", "envejecimiento_cartera", "flujo_caja_operativo"],
      modulosImpactados: ["cartera", "cobranza", "planeacion", "alertas", "torre_control", "copilot", "automatizaciones"],
      fuenteSag: "SALDOS_FACTURA",
      notas: "Sin FECHA_VENCIMIENTO no es posible calcular mora real ni proyectar flujo de caja. CRÍTICO.",
    },
    {
      campo: "FECHA_ULTIMO_PAGO", tipo: "date",   obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha del último abono registrado contra esta factura. " +
                   "Permite detectar clientes inactivos y medir cadencia de pago.",
      kpiTraceability: ["pagos_tardios", "pagos_oportunos", "score_riesgo_cliente"],
      modulosImpactados: ["cobranza", "cliente_360", "alertas", "copilot"],
      fuenteSag: "CARTERA_CLIENTES",
    },
    {
      campo: "FECHA_CORTE",      tipo: "date",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Fecha de corte del saldo reportado. " +
                   "Todos los saldos de la vista son válidos a esta fecha.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida"],
      modulosImpactados: ["cartera", "cierre", "executive_dashboard"],
      fuenteSag: "CARTERA_CLIENTES",
    },
    // ── Bloque 3 — Valores ────────────────────────────────────────────────────
    {
      campo: "VALOR_FACTURA",    tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Valor total original de la factura al momento de emisión.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida", "envejecimiento_cartera"],
      modulosImpactados: ["cartera", "cobranza", "cliente_360", "cierre", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "VALOR_PAGADO",     tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Monto total ya abonado a esta factura. " +
                   "SALDO_PENDIENTE = VALOR_FACTURA − VALOR_PAGADO.",
      kpiTraceability: ["tasa_recaudo", "cartera_corriente"],
      modulosImpactados: ["cartera", "conciliacion", "cobranza", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "SALDO_PENDIENTE",  tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Saldo actual pendiente de cobro en esta factura. " +
                   "Campo principal para KPIs de cartera y cobranza.",
      kpiTraceability: ["cartera_corriente", "cartera_vencida", "envejecimiento_cartera", "cartera_critica"],
      modulosImpactados: ["cartera", "cobranza", "planeacion", "torre_control", "executive_dashboard", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "SALDO_CORRIENTE",  tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Porción del saldo pendiente que aún no ha vencido (en plazo).",
      kpiTraceability: ["cartera_corriente", "flujo_caja_operativo"],
      modulosImpactados: ["cartera", "planeacion", "executive_dashboard"],
      fuenteSag: "CARTERA_CLIENTES",
    },
    {
      campo: "SALDO_VENCIDO",    tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Porción del saldo pendiente que ha superado la fecha de vencimiento.",
      kpiTraceability: ["cartera_vencida", "dias_cartera", "cartera_critica", "envejecimiento_cartera"],
      modulosImpactados: ["cartera", "executive_dashboard", "alertas", "cobranza", "torre_control", "copilot"],
      fuenteSag: "CARTERA_CLIENTES",
    },
    {
      campo: "VALOR_CASTIGADO",  tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Monto provisionado o castigado contablemente. " +
                   "Indica obligaciones que se consideran irrecuperables o con alta probabilidad de pérdida.",
      kpiTraceability: ["cartera_critica", "cartera_vencida"],
      modulosImpactados: ["cartera", "cierre", "planeacion", "executive_dashboard"],
      fuenteSag: "CARTERA_CLIENTES",
      notas: "Confirmar si SAG lleva VALOR_CASTIGADO por factura o solo a nivel cliente/portafolio.",
    },
    // ── Bloque 4 — Mora ───────────────────────────────────────────────────────
    {
      campo: "DIAS_MORA",        tipo: "number",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Días transcurridos desde FECHA_VENCIMIENTO. " +
                   "Si SAG lo calcula: días desde vencimiento de la cuota más antigua sin pagar. " +
                   "Si no: Agentik lo calcula como CURRENT_DATE − FECHA_VENCIMIENTO.",
      kpiTraceability: ["dias_cartera", "cartera_vencida", "envejecimiento_cartera"],
      modulosImpactados: ["cartera", "alertas", "cobranza", "torre_control", "copilot"],
      fuenteSag: "CARTERA_CLIENTES",
    },
    {
      campo: "RANGO_MORA",       tipo: "enum",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Clasificación del saldo por antigüedad de mora. " +
                   "Valores: corriente | 1_30 | 31_60 | 61_90 | 91_180 | 180_mas. " +
                   "Permite análisis de envejecimiento de cartera y alertas escalonadas.",
      kpiTraceability: ["envejecimiento_cartera", "cartera_critica", "cartera_vencida"],
      modulosImpactados: ["cartera", "cobranza", "alertas", "torre_control", "executive_dashboard", "planeacion", "copilot"],
      fuenteSag: "CARTERA_CLIENTES",
      notas: "Si SAG no expone RANGO_MORA, Agentik lo deriva de DIAS_MORA. " +
             "Confirmar si SAG ya tiene este campo calculado (preferible para consistencia).",
    },
    // ── Bloque 5 — Cobranza Inteligente ───────────────────────────────────────
    {
      campo: "ESTADO_COBRANZA",  tipo: "enum",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Estado actual del proceso de cobro para esta obligación. " +
                   "Valores: sin_gestion | gestionando | promesa_pago | incumplida | judicial | castigada. " +
                   "Alimenta el módulo de Cobranza, las Alertas y las Automatizaciones.",
      kpiTraceability: ["promesas_pago_cumplidas", "promesas_pago_incumplidas", "cartera_critica"],
      modulosImpactados: ["cobranza", "alertas", "automatizaciones", "torre_control", "copilot"],
      fuenteSag: "COBRANZA_GESTIONES",
      notas: "CAMPO CRÍTICO para Cobranza Inteligente. " +
             "Confirmar si SAG tiene este campo o si las gestiones se registran en un CRM externo. " +
             "Sin ESTADO_COBRANZA no es posible distinguir cartera gestionada de cartera abandonada.",
    },
    {
      campo: "FECHA_ULTIMA_GESTION", tipo: "date", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha de la última gestión de cobro registrada (llamada, visita, notificación). " +
                   "Permite detectar cartera sin gestión reciente y generar alertas.",
      kpiTraceability: ["promesas_pago_incumplidas"],
      modulosImpactados: ["cobranza", "alertas", "automatizaciones", "copilot"],
      fuenteSag: "COBRANZA_GESTIONES",
      notas: "Si esta fecha es nula o > 30 días, Agentik clasifica la obligación como sin_gestion activa.",
    },
    {
      campo: "RESULTADO_ULTIMA_GESTION", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Resultado o nota de la última gestión de cobro. " +
                   "Ejemplos: cliente_no_contesta, promesa_aceptada, rechazó_pago, número_incorrecto.",
      kpiTraceability: ["promesas_pago_cumplidas", "promesas_pago_incumplidas"],
      modulosImpactados: ["cobranza", "cliente_360", "copilot"],
      fuenteSag: "COBRANZA_GESTIONES",
    },
    {
      campo: "PROMESA_PAGO_FECHA", tipo: "date",  obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha comprometida por el cliente para realizar el pago. " +
                   "Si CURRENT_DATE > PROMESA_PAGO_FECHA y ESTADO_COBRANZA = 'promesa_pago', " +
                   "Agentik escala a 'incumplida' automáticamente.",
      kpiTraceability: ["promesas_pago_cumplidas", "promesas_pago_incumplidas"],
      modulosImpactados: ["cobranza", "alertas", "automatizaciones", "copilot"],
      fuenteSag: "COBRANZA_GESTIONES",
      notas: "Sin este campo no es posible medir el KPI promesas_pago_cumplidas. " +
             "Confirmar si SAG o el CRM de cobranza registra promesas de pago.",
    },
    {
      campo: "PROMESA_PAGO_VALOR", tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Monto acordado en la promesa de pago. " +
                   "Puede ser parcial (menor a SALDO_PENDIENTE).",
      kpiTraceability: ["promesas_pago_cumplidas", "promesas_pago_incumplidas", "flujo_caja_operativo"],
      modulosImpactados: ["cobranza", "planeacion", "alertas", "copilot"],
      fuenteSag: "COBRANZA_GESTIONES",
      notas: "Permite proyectar el flujo de caja comprometido para las próximas semanas.",
    },
    // ── Bloque 6 — Riesgo ─────────────────────────────────────────────────────
    {
      campo: "CUPO_CREDITO",     tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Cupo máximo de crédito aprobado para el cliente. " +
                   "Base para calcular CUPO_DISPONIBLE y decidir bloqueo de nuevas ventas.",
      kpiTraceability: ["cobertura_cupo", "score_riesgo_cliente"],
      modulosImpactados: ["cartera", "comercial", "cliente_360", "automatizaciones", "copilot"],
      fuenteSag: "CREDITO_CLIENTES",
      notas: "Confirmar si SAG o el módulo de crédito externo registra el cupo aprobado por cliente.",
    },
    {
      campo: "CUPO_DISPONIBLE",  tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Cupo de crédito disponible para nuevas ventas. " +
                   "CUPO_DISPONIBLE = CUPO_CREDITO − SALDO_PENDIENTE_TOTAL_CLIENTE. " +
                   "Si ≤ 0, el cliente debe ser bloqueado para nuevas ventas.",
      kpiTraceability: ["cobertura_cupo"],
      modulosImpactados: ["cartera", "comercial", "automatizaciones", "alertas", "copilot"],
      fuenteSag: "CREDITO_CLIENTES",
    },
    {
      campo: "RIESGO_CLIENTE",   tipo: "enum",    obligatorio: false, status: "unconfirmed",
      descripcion: "Clasificación de riesgo del cliente basada en comportamiento de pago y mora. " +
                   "Valores: bajo | medio | alto | critico. " +
                   "Permite alertas automáticas y decisiones comerciales inteligentes.",
      kpiTraceability: ["score_riesgo_cliente", "cartera_critica"],
      modulosImpactados: ["cartera", "cobranza", "comercial", "cliente_360", "torre_control", "automatizaciones", "copilot"],
      fuenteSag: "CREDITO_CLIENTES",
      notas: "Si SAG no tiene este campo calculado, Agentik lo derivará de DIAS_MORA + VALOR_CASTIGADO + historial. " +
             "Confirmar si SAG o un sistema externo de scoring ya clasifica clientes por riesgo.",
    },
    // ── Bloque 7 — Comercial ──────────────────────────────────────────────────
    {
      campo: "ID_VENDEDOR",      tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Ejecutivo comercial responsable de la cuenta. " +
                   "Permite medir calidad de cartera por vendedor (saldo vencido generado, promesas cumplidas).",
      kpiTraceability: ["cartera_por_vendedor"],
      modulosImpactados: ["cartera", "cobranza", "comercial", "copilot"],
      fuenteSag: "VENDEDORES",
    },
    {
      campo: "NOMBRE_VENDEDOR",  tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre del ejecutivo comercial. " +
                   "Necesario para Copilot y reportes de calidad de cartera por vendedor.",
      kpiTraceability: ["cartera_por_vendedor"],
      modulosImpactados: ["cartera", "cobranza", "comercial", "copilot"],
      fuenteSag: "VENDEDORES",
    },
    {
      campo: "SUCURSAL",         tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Sucursal o sede que originó la venta. " +
                   "Permite distribución geográfica de cartera y cobranza por sede.",
      kpiTraceability: ["cartera_por_sucursal"],
      modulosImpactados: ["cartera", "cobranza", "executive_dashboard", "copilot"],
      fuenteSag: "VENTAS_MAESTRO",
    },
    // ── Bloque 8 — Internacional ──────────────────────────────────────────────
    {
      campo: "MONEDA",           tipo: "enum",    obligatorio: false, status: "unconfirmed",
      descripcion: "MONEDA representa la moneda original del documento o transacción. Valores: COP | USD | EUR | CNY.",
      kpiTraceability: ["cartera_vencida", "cartera_corriente"],
      modulosImpactados: ["cartera", "comercio_exterior", "cierre", "planeacion", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
      notas: "Castillitos puede operar con clientes o proveedores en monedas distintas al COP. " +
             "Agregar CNY alineado con Ventas y Pagos.",
    },
    {
      campo: "TASA_CAMBIO",      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Tasa de cambio usada para conversión a COP en FECHA_CORTE. " +
                   "Permite reportes consolidados en moneda funcional.",
      kpiTraceability: ["cartera_vencida", "flujo_caja_operativo"],
      modulosImpactados: ["cartera", "comercio_exterior", "cierre", "planeacion"],
      fuenteSag: "SALDOS_FACTURA",
    },
    // ── Bloque 9 — Auditoría ──────────────────────────────────────────────────
    {
      campo: "FECHA_CREACION",   tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Timestamp de creación del registro en SAG.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cierre"],
      fuenteSag: "SALDOS_FACTURA",
    },
    {
      campo: "FECHA_ACTUALIZACION", tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Timestamp de última modificación del registro. " +
                   "Permite carga incremental eficiente (solo rows modificadas desde última sync).",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "cierre"],
      fuenteSag: "SALDOS_FACTURA",
    },
    // ── Bloque 10 — Bloqueo crediticio ────────────────────────────────────────
    {
      campo: "CLIENTE_BLOQUEADO_CREDITO", tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el cliente está bloqueado para generar nuevas ventas a crédito. " +
                   "Complementa CUPO_DISPONIBLE: puede existir bloqueo activo aunque haya cupo disponible " +
                   "(bloqueos manuales, jurídicos, por incumplimiento reiterado, etc.). " +
                   "Copilot: '¿podemos venderle?', '¿requiere aprobación?', '¿tiene bloqueo activo?'.",
      kpiTraceability: ["cobertura_cupo", "score_riesgo_cliente", "cartera_critica"],
      modulosImpactados: ["comercial", "cartera", "cobranza", "cliente_360", "automatizaciones", "alertas", "copilot"],
      fuenteSag: "CREDITO_CLIENTES",
      notas: "Sin este campo Copilot no puede responder si se puede vender a un cliente bloqueado por razón no financiera. " +
             "Confirmar si SAG registra el estado de bloqueo en CREDITO_CLIENTES o en tabla separada.",
    },
    {
      campo: "FECHA_BLOQUEO_CREDITO",  tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en la que el cliente fue bloqueado para nuevas operaciones de crédito. " +
                   "Permite auditoría del historial crediticio, análisis de tiempos de recuperación " +
                   "y medición de efectividad del proceso de desbloqueado.",
      kpiTraceability: ["cartera_critica", "envejecimiento_cartera"],
      modulosImpactados: ["cartera", "cliente_360", "cierre", "copilot"],
      fuenteSag: "CREDITO_CLIENTES",
    },
    {
      campo: "MOTIVO_BLOQUEO",        tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Razón del bloqueo crediticio activo. " +
                   "Ejemplos: mora_120_dias | cupo_excedido | judicial | incumplimiento_reiterado | riesgo_crediticio. " +
                   "Copilot debe poder explicar por qué un cliente está bloqueado y qué acción desbloquea la cuenta.",
      kpiTraceability: ["cartera_critica", "promesas_pago_incumplidas"],
      modulosImpactados: ["cobranza", "comercial", "cliente_360", "alertas", "automatizaciones", "copilot"],
      fuenteSag: "CREDITO_CLIENTES",
      notas: "Sin MOTIVO_BLOQUEO Copilot solo puede decir 'bloqueado' sin explicar la causa ni sugerir la acción correctiva.",
    },
    // ── Bloque 11 — Scoring predictivo ────────────────────────────────────────
    {
      campo: "SCORE_RIESGO_NUMERICO", tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Score numérico de riesgo del cliente en escala 0–100. " +
                   "Complementa el campo textual RIESGO_CLIENTE con una escala continua para análisis predictivo. " +
                   "Clasificación sugerida: 0–25 bajo | 26–50 medio | 51–75 alto | 76–100 crítico. " +
                   "La IA necesita escala continua para modelos de scoring, alertas escalonadas y automatizaciones.",
      kpiTraceability: ["score_riesgo_cliente", "cartera_critica", "cobertura_cupo"],
      modulosImpactados: ["cartera", "cobranza", "cliente_360", "torre_control", "executive_dashboard", "automatizaciones", "copilot"],
      fuenteSag: "CREDITO_CLIENTES",
      notas: "Si SAG no dispone del score calculado, Agentik lo derivará internamente usando: " +
             "DIAS_MORA (peso 40%) + RANGO_MORA (peso 30%) + VALOR_CASTIGADO/VALOR_FACTURA (peso 20%) + " +
             "historial de incumplimiento de promesas de pago (peso 10%).",
    },
    // ── Bloque 12 — Proyección de flujo ───────────────────────────────────────
    {
      campo: "FECHA_PRIMER_VENCIMIENTO", tipo: "date",  obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha del próximo vencimiento relevante de la obligación. " +
                   "Permite proyectar el flujo de recaudo esperado: cuánto vence esta semana, " +
                   "este mes, en los próximos 30/60/90 días. " +
                   "Copilot: '¿qué dinero vence esta semana?', '¿cuánto recaudo esperamos en los próximos 30 días?'.",
      kpiTraceability: ["flujo_caja_operativo", "cartera_corriente", "tasa_recaudo", "envejecimiento_cartera"],
      modulosImpactados: ["planeacion", "cartera", "alertas", "torre_control", "tesoreria", "copilot"],
      fuenteSag: "SALDOS_FACTURA",
      notas: "Si la obligación tiene un único vencimiento, FECHA_PRIMER_VENCIMIENTO = FECHA_VENCIMIENTO. " +
             "Si tiene cuotas, este campo es el vencimiento de la próxima cuota pendiente. " +
             "Sin este campo Planeación Financiera no puede construir proyecciones de recaudo semanales o mensuales.",
    },
  ],
  notas: "39 campos — vista enterprise-ready de cuentas por cobrar a nivel de obligación/factura. " +
         "Granularidad: UNA FILA POR DOCUMENTO PENDIENTE. " +
         "Trazabilidad completa: Venta → Factura → Saldo → Mora → Gestión → Promesa → Pago → Riesgo → Cupo → " +
         "Bloqueo Crediticio → Score IA → Proyección Flujo → Copilot.",
};

// ── 5. INVENTARIO ──────────────────────────────────────────────────────────────
//
// Sprint: AGENTIK-SAG-INVENTARIO-ENTERPRISE-HARDENING-01
//
// PRINCIPIO ARQUITECTÓNICO: Existencia ≠ Disponible ≠ Reservado.
//   Existencia:  Lo que físicamente existe en la bodega (conteo real de unidades).
//   Disponible:  Lo que realmente puede venderse — depende de la parametrización SAG
//                (PD puede afectar el disponible según configuración).
//   Reservado:   Lo comprometido por pedidos activos pendientes de surtir.
//   Comprometido: Unidades bloqueadas para un pedido específico ya confirmado.
//   Tránsito:    Unidades compradas en camino — no recibidas, no disponibles aún.
//
// NOTA SOBRE FUENTE SAG:
//   v_saldos_inventariotallanew es la fuente oficial actual confirmada por SAG.
//   No existe una vista consolidada operacional para Agentik.
//   Agentik deberá calcular parte de la inteligencia operacional (cobertura,
//   quiebres, referencias sin movimiento) cruzando esta vista con vw_agentik_ventas.
//
// Copilot queries habilitados por esta vista:
//   1. "¿Qué referencias están por agotarse?"
//      → DISPONIBLE bajo + RESERVADO + ventas históricas recientes
//   2. "¿Qué productos tienen exceso de inventario?"
//      → EXISTENCIA alta + ULTIMO_MOVIMIENTO antiguo + DISPONIBLE/ventas ratio
//   3. "¿Qué pedidos no pueden surtirse?"
//      → COMPROMETIDO > DISPONIBLE por referencia/bodega
//   4. "¿Qué debo comprar?"
//      → DISPONIBLE < cobertura_objetivo + TRANSITO + rotación histórica
//   5. "¿Qué debo producir?"
//      → COMPROMETIDO sin cubrimiento en ninguna bodega activa
//   6. "¿Qué referencias llevan meses sin rotar?"
//      → FECHA_ULTIMO_MOVIMIENTO > N días + EXISTENCIA > 0 + ACTIVO = true
//
// Sprint: AGENTIK-SAG-INVENTARIO-ENTERPRISE-HARDENING-01

const inventarioContract: SagDomainContract = {
  id:             "inventario",
  nombre:         "Inventario",
  descripcion:    "Existencias operacionales de productos por referencia, talla, color y bodega. " +
                  "Fuente de verdad del stock disponible, reservado y en tránsito. " +
                  "Base de la inteligencia de abastecimiento, quiebres de stock y cobertura.",
  status:         "in_review",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_inventario",
  primaryTables:  ["v_saldos_inventariotallanew"],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  historicalCutoff: "2020-01-01",
  prioridad:      1,
  kpisEnabled: [
    "inventario_disponible",
    "inventario_en_transito",
    "rotacion_inventario",
    "cobertura_inventario",
    "quiebres_stock",
    "inventario_comprometido",
    "inventario_transito",
    "referencias_sin_movimiento",
    "valor_inventario",
    "capital_trabajo",
    "inventario_inmovilizado",
  ],
  modulosEnabled: [
    "inventario_operativo",
    "finanzas",
    "planeacion",
    "comercial",
    "logistica",
    "compras",
    "executive_dashboard",
    "torre_control",
    "alertas",
    "copilot",
  ],
  bloqueadores: [
    "Confirmar el cálculo exacto del campo DISPONIBLE en v_saldos_inventariotallanew: " +
    "¿incluye o excluye reservas? ¿afecta PD (Pedidos en Despacho)?",
    "Confirmar si SAG expone RESERVADO como campo separado de EXISTENCIA y DISPONIBLE, " +
    "o si debe calcularse como EXISTENCIA - DISPONIBLE.",
    "Confirmar si los pedidos pendientes de surtir (COMPROMETIDO) están en la misma vista " +
    "o en una tabla separada de compromisos.",
    "Confirmar disponibilidad de ULTIMO_MOVIMIENTO y FECHA_ULTIMO_MOVIMIENTO en la vista " +
    "v_saldos_inventariotallanew o en una tabla de movimientos relacionada.",
    "Confirmar si el campo ACTIVO / estado de referencia (activo, descontinuado, bloqueado) " +
    "está disponible en la vista o en el maestro de artículos.",
  ],
  notas: "Fuente oficial SAG: v_saldos_inventariotallanew (confirmada en correo SAG). " +
         "No existe vista consolidada operacional — Agentik debe construir la inteligencia. " +
         "Disponible depende de parametrización SAG (PD puede afectar según configuración). " +
         "24 campos en 7 bloques — granularidad por referencia × talla × color × bodega.",
  fields: [
    // ── Bloque 1 — Producto ──────────────────────────────────────────────────
    {
      campo: "ID_PRODUCTO",      tipo: "string",  obligatorio: true,  status: "agreed",
      descripcion: "Identificador interno del producto/artículo en SAG. " +
                   "Clave primaria de la vista — une inventario con vw_agentik_ventas y maestro de productos.",
      kpiTraceability: ["inventario_disponible", "quiebres_stock", "cobertura_inventario"],
      modulosImpactados: ["inventario_operativo", "comercial", "planeacion", "logistica", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "CODIGO_ARTICULO",  tipo: "string",  obligatorio: true,  status: "agreed",
      descripcion: "Código externo o de barras del artículo. " +
                   "Puede diferir de ID_PRODUCTO — es el código visible en documentos comerciales.",
      kpiTraceability: ["inventario_disponible", "ventas_por_referencia"],
      modulosImpactados: ["inventario_operativo", "comercial", "logistica"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Confirmar si CODIGO_ARTICULO coincide con el campo REFERENCIA de vw_agentik_ventas.",
    },
    {
      campo: "REFERENCIA",       tipo: "string",  obligatorio: true,  status: "agreed",
      descripcion: "Referencia comercial del producto — código usado por el equipo de ventas y compras. " +
                   "Clave de cruce con REFERENCIA en vw_agentik_ventas para análisis de cobertura.",
      kpiTraceability: ["rotacion_inventario", "rotacion_producto", "referencias_sin_movimiento"],
      modulosImpactados: ["inventario_operativo", "comercial", "planeacion", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "NOMBRE_ARTICULO",  tipo: "string",  obligatorio: true,  status: "agreed",
      descripcion: "Nombre descriptivo del artículo. " +
                   "Campo de presentación en Copilot y alertas operacionales.",
      kpiTraceability: [],
      modulosImpactados: ["inventario_operativo", "comercial", "torre_control", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    // ── Bloque 2 — Clasificación ─────────────────────────────────────────────
    {
      campo: "LINEA",            tipo: "string",  obligatorio: false, status: "agreed",
      descripcion: "Línea o familia de producto. " +
                   "Permite análisis de inventario por categoría comercial.",
      kpiTraceability: ["inventario_disponible", "rotacion_inventario"],
      modulosImpactados: ["inventario_operativo", "comercial", "planeacion"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "SUBLINEA",         tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Sublínea o subcategoría dentro de la línea. " +
                   "Granularidad adicional para segmentación de inventario.",
      kpiTraceability: ["inventario_disponible"],
      modulosImpactados: ["inventario_operativo", "comercial"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Confirmar si SUBLINEA está disponible en v_saldos_inventariotallanew o solo en el maestro de artículos.",
    },
    {
      campo: "MARCA",            tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Marca del producto. " +
                   "Clave para análisis de inventario por marca y negociación con proveedores.",
      kpiTraceability: ["inventario_disponible", "rotacion_inventario"],
      modulosImpactados: ["inventario_operativo", "comercial", "planeacion"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "CATEGORIA",        tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Categoría de compra o clasificación logística del producto. " +
                   "Permite priorizar órdenes de compra por segmento.",
      kpiTraceability: ["cobertura_inventario"],
      modulosImpactados: ["inventario_operativo", "planeacion", "logistica"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    // ── Bloque 3 — Variantes ─────────────────────────────────────────────────
    {
      campo: "TALLA",            tipo: "string",  obligatorio: false, status: "agreed",
      descripcion: "Talla del artículo — parte de la clave compuesta de variante. " +
                   "Junto con COLOR y REFERENCIA forma la unidad mínima de inventario (SKU). " +
                   "v_saldos_inventariotallanew fue diseñada específicamente para granularidad talla.",
      kpiTraceability: ["inventario_disponible", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "comercial", "logistica", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "COLOR",            tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Color del artículo — complementa TALLA para identificar variante completa. " +
                   "Confirmar si la vista desagrega por color o solo por talla.",
      kpiTraceability: ["inventario_disponible", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "comercial"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Confirmar con SAG si v_saldos_inventariotallanew incluye COLOR o solo TALLA.",
    },
    // ── Bloque 4 — Ubicación ─────────────────────────────────────────────────
    {
      campo: "CODIGO_BODEGA",    tipo: "string",  obligatorio: true,  status: "agreed",
      descripcion: "Código interno de la bodega o punto de almacenamiento. " +
                   "Clave de segmentación para análisis de inventario por ubicación.",
      kpiTraceability: ["inventario_disponible", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "logistica", "planeacion"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "NOMBRE_BODEGA",    tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre legible de la bodega para presentación en UI y Copilot. " +
                   "Elimina la necesidad de un join con maestro de bodegas en consultas frecuentes.",
      kpiTraceability: [],
      modulosImpactados: ["inventario_operativo", "torre_control", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "SUCURSAL",         tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Sucursal o sede a la que pertenece la bodega. " +
                   "Permite análisis de inventario disponible por punto de venta.",
      kpiTraceability: ["inventario_disponible"],
      modulosImpactados: ["inventario_operativo", "comercial", "executive_dashboard"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    // ── Bloque 5 — Existencias ───────────────────────────────────────────────
    {
      campo: "EXISTENCIA",       tipo: "number",  obligatorio: true,  status: "agreed",
      descripcion: "Unidades físicas que existen en la bodega según el sistema. " +
                   "No necesariamente vendibles — puede incluir reservado y comprometido.",
      kpiTraceability: ["inventario_disponible", "rotacion_inventario", "referencias_sin_movimiento"],
      modulosImpactados: ["inventario_operativo", "planeacion", "cierre", "executive_dashboard"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "DISPONIBLE",       tipo: "number",  obligatorio: true,  status: "agreed",
      descripcion: "Unidades que realmente pueden venderse según el cálculo SAG. " +
                   "Depende de la parametrización: puede excluir reservas, compromisos y PD. " +
                   "BLOQUEADOR: confirmar fórmula exacta con SAG — ¿DISPONIBLE = EXISTENCIA - RESERVADO - PD?",
      kpiTraceability: ["inventario_disponible", "quiebres_stock", "cobertura_inventario"],
      modulosImpactados: ["inventario_operativo", "comercial", "logistica", "torre_control", "alertas", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Campo crítico. El cálculo de DISPONIBLE en SAG depende de configuración de parámetros. " +
             "PD (Pedidos en Despacho) puede afectar DISPONIBLE según configuración del tenant.",
    },
    {
      campo: "RESERVADO",        tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Unidades reservadas para pedidos activos — ya asignadas pero no despachadas. " +
                   "BLOQUEADOR: confirmar si SAG expone RESERVADO como campo o si debe calcularse.",
      kpiTraceability: ["inventario_comprometido"],
      modulosImpactados: ["inventario_operativo", "logistica", "planeacion", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Si RESERVADO no está disponible: RESERVADO = EXISTENCIA - DISPONIBLE (aproximación).",
    },
    {
      campo: "COMPROMETIDO",     tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Unidades comprometidas por pedidos confirmados pendientes de surtir. " +
                   "Puede diferir de RESERVADO — COMPROMETIDO es nivel de pedido, RESERVADO puede ser picking. " +
                   "BLOQUEADOR: confirmar si existe este campo o si se cruza con tabla de pedidos.",
      kpiTraceability: ["inventario_comprometido", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "logistica", "copilot", "alertas"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "TRANSITO",         tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Unidades en tránsito: pedidas al proveedor y en camino, aún no recibidas en bodega. " +
                   "Permite calcular inventario futuro disponible para planeación de compras.",
      kpiTraceability: ["inventario_transito", "inventario_en_transito", "cobertura_inventario"],
      modulosImpactados: ["inventario_operativo", "planeacion", "logistica", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    // ── Bloque 6 — Operación ─────────────────────────────────────────────────
    {
      campo: "ULTIMO_MOVIMIENTO",      tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Tipo o código del último movimiento registrado para esta referencia/bodega. " +
                   "Permite clasificar el último evento: entrada, salida, ajuste, traslado.",
      kpiTraceability: ["referencias_sin_movimiento"],
      modulosImpactados: ["inventario_operativo", "planeacion"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "BLOQUEADOR: confirmar si ULTIMO_MOVIMIENTO está en v_saldos_inventariotallanew " +
             "o si requiere join con tabla de movimientos de inventario.",
    },
    {
      campo: "FECHA_ULTIMO_MOVIMIENTO", tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha del último movimiento registrado — salida, entrada, ajuste o traslado. " +
                   "Campo crítico para detectar referencias estancadas (sin movimiento en N días).",
      kpiTraceability: ["referencias_sin_movimiento", "rotacion_inventario"],
      modulosImpactados: ["inventario_operativo", "planeacion", "alertas", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Si FECHA_ULTIMO_MOVIMIENTO no está disponible en la vista, " +
             "Agentik deberá derivarla desde la tabla de movimientos con MAX(FECHA) por referencia/bodega.",
    },
    {
      campo: "TIPO_ULTIMO_MOVIMIENTO",  tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Clasificación del último movimiento: ENTRADA, SALIDA, AJUSTE, TRASLADO, DEVOLUCION. " +
                   "Complementa FECHA_ULTIMO_MOVIMIENTO para interpretar si la última actividad fue consumo o reposición.",
      kpiTraceability: ["referencias_sin_movimiento"],
      modulosImpactados: ["inventario_operativo", "planeacion"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    // ── Bloque 7 — Estado ────────────────────────────────────────────────────
    {
      campo: "ACTIVO",           tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si la referencia está activa y puede ser vendida o producida. " +
                   "Referencias inactivas no deben aparecer en quiebres de stock ni alertas de compra.",
      kpiTraceability: ["quiebres_stock", "referencias_sin_movimiento"],
      modulosImpactados: ["inventario_operativo", "comercial", "alertas"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "BLOQUEADOR: confirmar si ACTIVO está en v_saldos_inventariotallanew o solo en maestro de artículos.",
    },
    {
      campo: "DESCONTINUADO",    tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el artículo fue descontinuado por decisión comercial. " +
                   "Descontinuado y ACTIVO = false → excluir de alertas de reposición. " +
                   "Descontinuado y EXISTENCIA > 0 → incluir en análisis de liquidación.",
      kpiTraceability: ["referencias_sin_movimiento"],
      modulosImpactados: ["inventario_operativo", "comercial", "planeacion"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    {
      campo: "BLOQUEADO_VENTA",  tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el artículo está bloqueado para venta por cuarentena, calidad u otro motivo. " +
                   "BLOQUEADO_VENTA = true → DISPONIBLE debería ser 0 independientemente de EXISTENCIA.",
      kpiTraceability: ["quiebres_stock", "inventario_disponible"],
      modulosImpactados: ["inventario_operativo", "logistica", "alertas", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
    },
    // ── Bloque 8 — Valorización y Abastecimiento ─────────────────────────────
    // Sprint: AGENTIK-SAG-INVENTARIO-FINANCIAL-HARDENING-01
    {
      campo: "COSTO_PROMEDIO",        tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Costo promedio ponderado vigente de la referencia. " +
                   "Base para valorización de inventario, cálculo de margen potencial, " +
                   "capital de trabajo e inventario inmovilizado. " +
                   "Campo financiero más crítico del dominio de inventario.",
      kpiTraceability: ["valor_inventario", "margen_bruto", "capital_trabajo", "inventario_inmovilizado"],
      modulosImpactados: ["inventario_operativo", "finanzas", "planeacion", "executive_dashboard", "torre_control", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Confirmar con SAG si el costo promedio existe por REFERENCIA o por REFERENCIA+BODEGA. " +
             "Si es por bodega, el costo puede variar entre ubicaciones por órdenes de compra distintas.",
    },
    {
      campo: "COSTO_TOTAL_EXISTENCIA", tipo: "decimal", obligatorio: false, status: "derived",
      descripcion: "Valor monetario total del inventario existente para esta referencia/bodega. " +
                   "Fórmula: EXISTENCIA × COSTO_PROMEDIO. " +
                   "Si SAG no entrega este campo directamente, Agentik lo calcula en la capa de inteligencia.",
      kpiTraceability: ["valor_inventario", "capital_trabajo", "inventario_inmovilizado"],
      modulosImpactados: ["finanzas", "executive_dashboard", "torre_control", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Campo derivado — no requiere confirmación SAG si EXISTENCIA y COSTO_PROMEDIO están disponibles. " +
             "Agentik puede calcularlo como EXISTENCIA × COSTO_PROMEDIO en la capa de transformación.",
    },
    {
      campo: "PROVEEDOR_PRINCIPAL",    tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Proveedor habitual o preferente de la referencia. " +
                   "Permite responder: ¿a quién le compro esta referencia?, ¿qué proveedor debo contactar?, " +
                   "¿qué productos dependen del mismo proveedor?",
      kpiTraceability: ["cobertura_inventario"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion", "comercio_exterior", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Confirmar si existe relación producto-proveedor en v_saldos_inventariotallanew o si debe " +
             "derivarse cruzando con vw_agentik_compras (tabla de órdenes de compra). " +
             "Si existe más de un proveedor por referencia, usar el proveedor con mayor volumen en los últimos 12 meses.",
    },
    {
      campo: "DIAS_COBERTURA",         tipo: "number",  obligatorio: false, status: "derived",
      descripcion: "Días estimados antes del agotamiento de la referencia en esta bodega. " +
                   "Fórmula sugerida: DISPONIBLE ÷ consumo_promedio_diario (calculado por Agentik desde vw_agentik_ventas). " +
                   "Permite responder: ¿qué se agotará primero?, ¿qué debo comprar esta semana?, " +
                   "¿qué referencias tienen cobertura crítica?",
      kpiTraceability: ["cobertura_inventario", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "compras", "planeacion", "alertas", "copilot"],
      fuenteSag: "v_saldos_inventariotallanew",
      notas: "Campo derivado — Agentik calcula DIAS_COBERTURA cruzando DISPONIBLE (inventario) con " +
             "promedio de salidas diarias (vw_agentik_ventas). " +
             "Umbral crítico sugerido: DIAS_COBERTURA < 7 → alerta de quiebre inminente.",
    },
  ],
};

// ── 6. CLIENTES ────────────────────────────────────────────────────────────────

const clientesContract: SagDomainContract = {
  id:             "clientes",
  nombre:         "Clientes",
  descripcion:    "Maestro de clientes: NIT, nombre, segmento, condiciones comerciales, zona.",
  status:         "draft",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_clientes",
  primaryTables:  ["MAESTRO_CLIENTES"],
  syncFrequency:  "weekly",
  dataCurrency:   "T-1",
  prioridad:      2,
  kpisEnabled: ["cartera_corriente", "cartera_vencida", "ventas_brutas"],
  modulosEnabled: ["cartera", "executive_dashboard"],
  fields: [
    {
      campo: "ID_CLIENTE",     tipo: "string",  obligatorio: true,
      status: "unconfirmed",
      descripcion: "Identificador único del cliente en SAG",
      kpiTraceability: ["cartera_corriente", "ventas_brutas"],
      modulosImpactados: ["cartera", "executive_dashboard"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
    {
      campo: "NIT",            tipo: "string",  obligatorio: true,
      status: "unconfirmed",
      descripcion: "NIT o cédula del cliente",
      kpiTraceability: [],
      modulosImpactados: ["cartera"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
    {
      campo: "RAZON_SOCIAL",   tipo: "string",  obligatorio: true,
      status: "unconfirmed",
      descripcion: "Nombre o razón social del cliente",
      kpiTraceability: [],
      modulosImpactados: ["cartera", "executive_dashboard"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
    {
      campo: "SEGMENTO",       tipo: "enum",    obligatorio: false,
      status: "unconfirmed",
      descripcion: "Segmento comercial del cliente",
      kpiTraceability: ["ventas_brutas"],
      modulosImpactados: ["planeacion", "executive_dashboard"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
    {
      campo: "PLAZO_CREDITO",  tipo: "number",  obligatorio: false,
      status: "unconfirmed",
      descripcion: "Días de plazo acordado para pago",
      kpiTraceability: ["dias_cartera"],
      modulosImpactados: ["cartera", "alertas"],
      fuenteSag: "MAESTRO_CLIENTES",
    },
  ],
};

// ── 7. PRODUCTOS ───────────────────────────────────────────────────────────────
//
// Sprint: AGENTIK-SAG-PRODUCTOS-ENTERPRISE-HARDENING-01
//
// PRINCIPIO ARQUITECTÓNICO PRINCIPAL: Producto ≠ Variante.
//   Producto Maestro: entidad única con identidad, clasificación y atributos globales.
//   Variante:         instancia específica del producto (talla × color × presentación).
//   Un producto puede generar N variantes. Un SKU identifica una variante concreta.
//
// PRINCIPIO ARQUITECTÓNICO SECUNDARIO: Producto = Fuente de Verdad Empresarial.
//   Compras, Inventario, Marketing, Producción, Ventas y E-commerce
//   NO definen el producto. Lo CONSUMEN desde esta vista.
//
// Trazabilidad completa (tres cadenas):
//   Producto → Compra → Inventario → Venta → Cliente → Finanzas
//   Producto → Marketing → E-commerce → Venta
//   Producto → Producción → Inventario → Venta
//
// Copilot queries habilitados:
//   1. "¿Qué productos generan más margen?"       → MARGEN_OBJETIVO + ventas_por_referencia
//   2. "¿Qué productos están próximos a agotarse?" → DISPONIBLE bajo + PUNTO_REORDEN cruzado con inventario
//   3. "¿Qué productos tienen sobreinventario?"    → EXISTENCIA >> STOCK_MAXIMO + sin rotación
//   4. "¿Qué productos necesitan contenido?"       → DESCRIPCION_MARKETING vacía + ACTIVO = true
//   5. "¿Qué productos tienen mejor rotación?"     → rotacion_producto cruzado con ventas
//   6. "¿Qué productos debo promocionar?"          → margen alto + stock alto + rotación baja
//   7. "¿Qué productos debo reabastecer?"          → DISPONIBLE < PUNTO_REORDEN
//   8. "¿Qué productos dependen de un único proveedor?" → dependencia_proveedor por REFERENCIA
//   9. "¿Qué productos son candidatos para exportación?" → CODIGO_ARANCELARIO + PAIS_ORIGEN + estado activo
//
// Sprint: AGENTIK-SAG-PRODUCTOS-ENTERPRISE-HARDENING-01

const productosContract: SagDomainContract = {
  id:             "productos",
  nombre:         "Productos",
  descripcion:    "Master Product Data de Agentik — fuente de verdad empresarial que alimenta " +
                  "Compras, Inventario, Ventas, Marketing Studio, Producción, E-commerce, " +
                  "Comercio Exterior, Cliente 360 y Copilot. " +
                  "Soporta la separación entre Producto Maestro y Variante desde el origen.",
  status:         "in_review",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_productos",
  primaryTables:  ["MAESTRO_PRODUCTOS", "VARIANTES_PRODUCTO", "PRECIOS_LISTA"],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  historicalCutoff: "2020-01-01",
  prioridad:      1,
  kpisEnabled: [
    "costo_ventas",
    "margen_bruto",
    "rotacion_inventario",
    "rotacion_producto",
    "margen_por_producto",
    "ventas_por_referencia",
    "productos_activos",
    "productos_descontinuados",
    "productos_sin_rotacion",
    "productos_alto_margen",
    "productos_bajo_margen",
    "productos_sobrestock",
    "productos_quiebre_stock",
    "productos_por_categoria",
    "productos_por_marca",
    "porcentaje_portafolio_importado",
    "productos_estrategicos",
    "productos_sin_publicacion",
  ],
  modulosEnabled: [
    "inventario_operativo",
    "comercial",
    "planeacion",
    "compras",
    "marketing_studio",
    "ecommerce",
    "produccion",
    "comercio_exterior",
    "logistica",
    "cliente_360",
    "executive_dashboard",
    "torre_control",
    "alertas",
    "copilot",
  ],
  bloqueadores: [
    "Confirmar si la separación Producto Maestro / Variante existe en SAG o si " +
    "MAESTRO_PRODUCTOS tiene una fila por cada combinación talla × color.",
    "Confirmar si PRECIO_LISTA y PRECIO_MINIMO están en MAESTRO_PRODUCTOS o en PRECIOS_LISTA " +
    "y si hay múltiples listas de precios por producto/cliente/canal.",
    "Confirmar si los campos de marketing (DESCRIPCION_MARKETING, TAGS_MARKETING, PALABRAS_CLAVE) " +
    "existen en SAG o si son campos administrados exclusivamente por Agentik.",
    "Confirmar disponibilidad de CODIGO_ARANCELARIO, PESO, LARGO, ANCHO, ALTO " +
    "en el maestro de productos SAG o si se mantienen en una tabla de logística separada.",
    "Confirmar si MANEJA_TALLA_COLOR es un atributo configurable por producto en SAG " +
    "o si se infiere desde la existencia de variantes.",
  ],
  notas: "62 campos en 17 bloques — Master Product Data DEFINITIVO. " +
         "Principio: Producto ≠ Variante. Producto = Fuente de Verdad Empresarial. " +
         "Sprint: AGENTIK-SAG-PRODUCTOS-ENTERPRISE-HARDENING-01 + FINAL-HARDENING-02.",
  fields: [
    // ── Bloque 1 — Identidad Maestra ─────────────────────────────────────────
    {
      campo: "ID_PRODUCTO",        tipo: "string",  obligatorio: true,  status: "agreed",
      descripcion: "Identificador único interno del producto en SAG. " +
                   "Clave primaria de la vista y campo de cruce con todos los dominios: " +
                   "vw_agentik_inventario.ID_PRODUCTO, vw_agentik_compras.ID_PRODUCTO, vw_agentik_ventas.",
      kpiTraceability: ["costo_ventas", "margen_bruto", "productos_activos", "rotacion_producto"],
      modulosImpactados: ["inventario_operativo", "compras", "comercial", "planeacion", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "CODIGO_PRODUCTO",    tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Código externo o de barras del producto. " +
                   "Puede diferir de ID_PRODUCTO. Usado en documentos comerciales, etiquetas y catálogos.",
      kpiTraceability: ["ventas_por_referencia"],
      modulosImpactados: ["comercial", "logistica", "ecommerce"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "REFERENCIA",         tipo: "string",  obligatorio: true,  status: "agreed",
      descripcion: "Referencia comercial — clave de trazabilidad central de Agentik. " +
                   "Une: vw_agentik_productos ↔ vw_agentik_inventario ↔ vw_agentik_ventas ↔ vw_agentik_compras.",
      kpiTraceability: ["ventas_por_referencia", "rotacion_producto", "margen_por_producto", "productos_por_categoria"],
      modulosImpactados: ["inventario_operativo", "comercial", "compras", "planeacion", "marketing_studio", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "REFERENCIA es el campo de cruce principal entre dominios en Agentik. " +
             "Todas las vistas deben exponer REFERENCIA con el mismo valor y formato.",
    },
    {
      campo: "SKU",                tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Stock Keeping Unit — identificador único de la variante específica " +
                   "(combinación REFERENCIA × TALLA × COLOR). Nivel mínimo de inventario gestionable.",
      kpiTraceability: ["inventario_disponible", "quiebres_stock", "productos_quiebre_stock"],
      modulosImpactados: ["inventario_operativo", "ecommerce", "logistica", "copilot"],
      fuenteSag: "VARIANTES_PRODUCTO",
      notas: "Si SAG no maneja SKU, Agentik puede derivarlo: REFERENCIA + '-' + TALLA + '-' + COLOR.",
    },
    {
      campo: "NOMBRE_COMERCIAL",   tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Nombre del producto visible para el cliente final. " +
                   "Usado en catálogos, e-commerce, facturas y respuestas de Copilot.",
      kpiTraceability: [],
      modulosImpactados: ["comercial", "ecommerce", "marketing_studio", "cliente_360", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "NOMBRE_INTERNO",     tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre técnico o interno usado por el equipo operativo. " +
                   "Puede diferir de NOMBRE_COMERCIAL — es el identificador en sistemas internos.",
      kpiTraceability: [],
      modulosImpactados: ["inventario_operativo", "compras", "produccion"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "MARCA",              tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Marca comercial del producto. " +
                   "Base para productos_por_marca y análisis de portafolio por marca.",
      kpiTraceability: ["productos_por_marca", "margen_por_producto"],
      modulosImpactados: ["comercial", "marketing_studio", "planeacion", "executive_dashboard", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 2 — Clasificación Comercial ───────────────────────────────────
    {
      campo: "LINEA",              tipo: "string",  obligatorio: false, status: "agreed",
      descripcion: "Línea o familia de producto — primer nivel de clasificación comercial.",
      kpiTraceability: ["productos_por_categoria", "rotacion_inventario"],
      modulosImpactados: ["comercial", "inventario_operativo", "planeacion", "marketing_studio"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "SUBLINEA",           tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Sublínea — segundo nivel de clasificación dentro de la línea.",
      kpiTraceability: ["productos_por_categoria"],
      modulosImpactados: ["comercial", "marketing_studio"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "CATEGORIA",          tipo: "string",  obligatorio: false, status: "agreed",
      descripcion: "Categoría de gestión — usada para segmentación de portafolio, compras y análisis.",
      kpiTraceability: ["productos_por_categoria", "margen_por_producto"],
      modulosImpactados: ["comercial", "compras", "planeacion", "executive_dashboard", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "SUBCATEGORIA",       tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Subcategoría — granularidad adicional de la categoría para análisis de nicho.",
      kpiTraceability: ["productos_por_categoria"],
      modulosImpactados: ["comercial", "marketing_studio", "planeacion"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "COLECCION",          tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Colección a la que pertenece el producto — aplica para moda, temporada y lanzamientos. " +
                   "Permite agrupar productos de una misma campaña o colección de diseño.",
      kpiTraceability: ["productos_por_categoria"],
      modulosImpactados: ["comercial", "marketing_studio", "ecommerce"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "TEMPORADA",          tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Temporada comercial del producto (ej: SS2026, AW2025, Verano, etc.). " +
                   "Permite análisis de inventario estacional y planeación de compras por temporada.",
      kpiTraceability: ["productos_sobrestock", "productos_sin_rotacion"],
      modulosImpactados: ["comercial", "planeacion", "compras", "marketing_studio"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 3 — Variantes ─────────────────────────────────────────────────
    {
      campo: "ID_VARIANTE",        tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador de la variante específica dentro del producto maestro. " +
                   "Relación: ID_PRODUCTO (1) → ID_VARIANTE (N). Un producto puede tener múltiples variantes.",
      kpiTraceability: ["inventario_disponible", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "ecommerce", "logistica"],
      fuenteSag: "VARIANTES_PRODUCTO",
      notas: "Confirmar si SAG tiene tabla de variantes separada o si cada fila de MAESTRO_PRODUCTOS " +
             "ya representa una variante (modelo de fila por talla/color).",
    },
    {
      campo: "COLOR",              tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Color de la variante. Junto con TALLA define el SKU mínimo de inventario.",
      kpiTraceability: ["inventario_disponible", "productos_quiebre_stock"],
      modulosImpactados: ["inventario_operativo", "ecommerce", "marketing_studio"],
      fuenteSag: "VARIANTES_PRODUCTO",
    },
    {
      campo: "TALLA",              tipo: "string",  obligatorio: false, status: "agreed",
      descripcion: "Talla de la variante. Clave de granularidad para gestión de inventario por SKU.",
      kpiTraceability: ["inventario_disponible", "quiebres_stock", "productos_quiebre_stock"],
      modulosImpactados: ["inventario_operativo", "logistica", "ecommerce", "copilot"],
      fuenteSag: "VARIANTES_PRODUCTO",
    },
    {
      campo: "PRESENTACION",       tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Presentación del producto: unidad, caja, paquete, blíster, etc. " +
                   "Aplica para productos que se venden en múltiples empacados o formatos.",
      kpiTraceability: [],
      modulosImpactados: ["inventario_operativo", "compras", "logistica"],
      fuenteSag: "VARIANTES_PRODUCTO",
    },
    {
      campo: "UNIDAD_MEDIDA",      tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Unidad de medida del producto: UND, KG, LT, MT, PAR, CAJA, etc. " +
                   "Requerido para valorización de inventario y análisis de cantidades.",
      kpiTraceability: ["inventario_disponible", "costo_ventas"],
      modulosImpactados: ["inventario_operativo", "compras", "produccion", "logistica"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 4 — Comercial ─────────────────────────────────────────────────
    {
      campo: "PRECIO_LISTA",       tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Precio de lista vigente — precio base de venta antes de descuentos. " +
                   "Base para análisis de margen y ventas.",
      kpiTraceability: ["ventas_brutas", "margen_bruto", "margen_por_producto"],
      modulosImpactados: ["comercial", "planeacion", "ecommerce", "copilot"],
      fuenteSag: "PRECIOS_LISTA",
      notas: "Confirmar si SAG maneja una única lista de precios o listas múltiples por cliente/canal.",
    },
    {
      campo: "PRECIO_MINIMO",      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Precio mínimo de venta autorizado — piso de margen. " +
                   "Permite detectar ventas por debajo del mínimo y alertas de descuento excesivo.",
      kpiTraceability: ["margen_bruto", "productos_bajo_margen"],
      modulosImpactados: ["comercial", "finanzas", "alertas", "copilot"],
      fuenteSag: "PRECIOS_LISTA",
    },
    {
      campo: "MONEDA",             tipo: "enum",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Moneda de los precios: COP | USD | EUR | CNY. " +
                   "Necesario para conversión en análisis multimoneda.",
      kpiTraceability: ["margen_bruto"],
      modulosImpactados: ["comercial", "finanzas", "comercio_exterior"],
      fuenteSag: "PRECIOS_LISTA",
    },
    {
      campo: "MARGEN_OBJETIVO",    tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Margen bruto objetivo definido para el producto. " +
                   "Base para productos_alto_margen, productos_bajo_margen y recomendaciones de Copilot.",
      kpiTraceability: ["productos_alto_margen", "productos_bajo_margen", "margen_por_producto"],
      modulosImpactados: ["comercial", "finanzas", "planeacion", "marketing_studio", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Si SAG no tiene MARGEN_OBJETIVO, Agentik puede derivarlo desde (PRECIO_LISTA − COSTO_PROMEDIO) / PRECIO_LISTA.",
    },
    {
      campo: "ESTADO_COMERCIAL",   tipo: "enum",    obligatorio: false, status: "unconfirmed",
      descripcion: "Estado comercial del producto. " +
                   "Valores sugeridos: activo | en_liquidacion | agotado | no_disponible | proximamente.",
      kpiTraceability: ["productos_activos", "productos_descontinuados"],
      modulosImpactados: ["comercial", "ecommerce", "marketing_studio", "alertas"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 5 — Inventario ────────────────────────────────────────────────
    {
      campo: "MANEJA_INVENTARIO",   tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el producto es inventariable. " +
                   "false = servicios o productos de venta directa sin stock físico.",
      kpiTraceability: ["inventario_disponible"],
      modulosImpactados: ["inventario_operativo", "compras", "planeacion"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "MANEJA_TALLA_COLOR",  tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el producto se gestiona con variantes de talla y color. " +
                   "true = el inventario se lleva por SKU (REFERENCIA × TALLA × COLOR).",
      kpiTraceability: ["inventario_disponible", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "ecommerce", "logistica"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "STOCK_MINIMO",        tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nivel mínimo de stock requerido — umbral de alerta de quiebre inminente.",
      kpiTraceability: ["quiebres_stock", "productos_quiebre_stock"],
      modulosImpactados: ["inventario_operativo", "compras", "alertas", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "STOCK_MAXIMO",        tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nivel máximo de stock admisible — umbral de sobreinventario.",
      kpiTraceability: ["productos_sobrestock"],
      modulosImpactados: ["inventario_operativo", "compras", "planeacion", "alertas"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "PUNTO_REORDEN",       tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nivel de stock en que se debe generar una orden de compra de reposición. " +
                   "Clave para recomendaciones automáticas de Copilot: ¿qué debo reabastecer?",
      kpiTraceability: ["cobertura_inventario", "compras_pendientes"],
      modulosImpactados: ["inventario_operativo", "compras", "planeacion", "alertas", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 6 — Marketing ─────────────────────────────────────────────────
    {
      campo: "DESCRIPCION_MARKETING", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Descripción orientada al marketing y la venta — diferente de NOMBRE_INTERNO. " +
                   "Usada en catálogos, páginas de producto, campañas y respuestas de Copilot.",
      kpiTraceability: [],
      modulosImpactados: ["marketing_studio", "ecommerce", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Si SAG no tiene este campo, será administrado directamente en Agentik y sincronizado de vuelta.",
    },
    {
      campo: "BENEFICIOS_CLAVE",    tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Lista de beneficios principales del producto para comunicación de marketing. " +
                   "Alimenta Marketing Studio para generación de contenido y campañas.",
      kpiTraceability: [],
      modulosImpactados: ["marketing_studio", "ecommerce", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "TAGS_MARKETING",      tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Etiquetas de marketing separadas por coma: uso, ocasión, público objetivo, etc. " +
                   "Permite segmentar productos para campañas específicas.",
      kpiTraceability: [],
      modulosImpactados: ["marketing_studio", "ecommerce"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "PALABRAS_CLAVE",      tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Keywords de SEO y búsqueda interna separadas por coma. " +
                   "Usadas para posicionamiento web y búsqueda en catálogo digital.",
      kpiTraceability: [],
      modulosImpactados: ["ecommerce", "marketing_studio"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 7 — E-commerce ────────────────────────────────────────────────
    {
      campo: "SEO_TITLE",           tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Título SEO de la página de producto — optimizado para motores de búsqueda. " +
                   "Máximo 60 caracteres recomendado.",
      kpiTraceability: [],
      modulosImpactados: ["ecommerce", "marketing_studio"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "SEO_DESCRIPTION",     tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Meta descripción SEO de la página de producto. " +
                   "Máximo 155 caracteres recomendado.",
      kpiTraceability: [],
      modulosImpactados: ["ecommerce", "marketing_studio"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "URL_SLUG",            tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "URL amigable de la página de producto en el sitio web. " +
                   "Ejemplo: /productos/camiseta-clasica-blanca-s. Debe ser único por variante.",
      kpiTraceability: [],
      modulosImpactados: ["ecommerce"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 8 — Producción ────────────────────────────────────────────────
    {
      campo: "REQUIERE_PRODUCCION", tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el producto se fabrica internamente. " +
                   "true = activar flujo de órdenes de producción. false = producto comprado.",
      kpiTraceability: ["inventario_disponible"],
      modulosImpactados: ["produccion", "inventario_operativo", "planeacion"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "TIEMPO_PRODUCCION",   tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Días promedio de fabricación desde inicio de orden hasta producto terminado. " +
                   "Permite ajustar el PUNTO_REORDEN considerando tiempo de fabricación.",
      kpiTraceability: ["cobertura_inventario"],
      modulosImpactados: ["produccion", "planeacion", "compras"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "TIPO_PRODUCCION",     tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Tipo de producción: propia | tercerizada | ensamble | importacion. " +
                   "Condiciona el flujo de abastecimiento y los campos de comercio exterior.",
      kpiTraceability: [],
      modulosImpactados: ["produccion", "comercio_exterior", "compras"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 9 — Comercio Exterior ─────────────────────────────────────────
    {
      campo: "PAIS_ORIGEN",         tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "País de fabricación o producción del artículo. " +
                   "Requerido para declaraciones aduaneras e importaciones.",
      kpiTraceability: ["compras_internacionales"],
      modulosImpactados: ["comercio_exterior", "compras", "logistica"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "CODIGO_ARANCELARIO",  tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Código de posición arancelaria (partida arancelaria). " +
                   "Requerido para importaciones, exportaciones y liquidaciones aduaneras.",
      kpiTraceability: ["compras_internacionales"],
      modulosImpactados: ["comercio_exterior", "finanzas", "compras"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Formato estándar: 10 dígitos según nomenclatura andina / TARIC. " +
             "Confirmar si SAG almacena partida arancelaria en MAESTRO_PRODUCTOS.",
    },
    {
      campo: "PESO",                tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Peso del producto en kilogramos. " +
                   "Requerido para cálculo de fletes, logística internacional y INCOTERM.",
      kpiTraceability: [],
      modulosImpactados: ["logistica", "comercio_exterior"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "LARGO",               tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Dimensión largo en centímetros. Necesario para cálculo de capacidad de contenedor.",
      kpiTraceability: [],
      modulosImpactados: ["logistica", "comercio_exterior"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "ANCHO",               tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Dimensión ancho en centímetros.",
      kpiTraceability: [],
      modulosImpactados: ["logistica", "comercio_exterior"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "ALTO",                tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Dimensión alto en centímetros.",
      kpiTraceability: [],
      modulosImpactados: ["logistica", "comercio_exterior"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 10 — IA y Copilot ─────────────────────────────────────────────
    {
      campo: "TIPO_CONTENIDO_RECOMENDADO", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Tipo de contenido de marketing recomendado para este producto por Agentik IA. " +
                   "Ejemplos: reels, carrusel, foto_producto, video_unboxing, comparativa.",
      kpiTraceability: [],
      modulosImpactados: ["marketing_studio", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Campo administrado por Agentik IA — puede no estar en SAG. " +
             "Se sincroniza desde Marketing Studio al maestro de productos.",
    },
    {
      campo: "PLANTILLA_RECOMENDADA", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Plantilla de diseño recomendada por Marketing Studio para este producto. " +
                   "Permite pre-seleccionar el template óptimo al crear contenido.",
      kpiTraceability: [],
      modulosImpactados: ["marketing_studio"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "TAGS_IA",             tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Etiquetas generadas por IA para clasificación automática del producto. " +
                   "Alimenta segmentación inteligente de portafolio y campañas automáticas.",
      kpiTraceability: [],
      modulosImpactados: ["marketing_studio", "copilot", "comercial"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "CATEGORIA_IA",        tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Categoría asignada por IA basada en atributos, ventas y comportamiento. " +
                   "Puede diferir de CATEGORIA (asignada manualmente) — es la clasificación inteligente.",
      kpiTraceability: ["productos_por_categoria"],
      modulosImpactados: ["marketing_studio", "copilot", "comercial"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 11 — Estado y Ciclo de Vida ───────────────────────────────────
    {
      campo: "ACTIVO",              tipo: "boolean", obligatorio: true,  status: "unconfirmed",
      descripcion: "Indica si el producto está activo y puede ser vendido, comprado o producido. " +
                   "false = excluir de operaciones, alertas de stock y recomendaciones.",
      kpiTraceability: ["productos_activos", "quiebres_stock"],
      modulosImpactados: ["inventario_operativo", "comercial", "compras", "ecommerce", "alertas"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "DESCONTINUADO",       tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el producto fue descontinuado por decisión comercial. " +
                   "DESCONTINUADO = true + EXISTENCIA > 0 → candidato a liquidación.",
      kpiTraceability: ["productos_descontinuados", "productos_sobrestock"],
      modulosImpactados: ["comercial", "planeacion", "marketing_studio", "alertas"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "FECHA_LANZAMIENTO",   tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha oficial de lanzamiento al mercado. " +
                   "Permite análisis de ciclo de vida y desempeño post-lanzamiento.",
      kpiTraceability: ["productos_activos"],
      modulosImpactados: ["comercial", "marketing_studio", "planeacion"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "FECHA_DESCONTINUACION", tipo: "date",  obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el producto fue descontinuado formalmente. " +
                   "Junto con FECHA_LANZAMIENTO define el ciclo de vida completo del producto.",
      kpiTraceability: ["productos_descontinuados"],
      modulosImpactados: ["comercial", "planeacion", "finanzas"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 12 — Auditoría ────────────────────────────────────────────────
    {
      campo: "FECHA_CREACION",      tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora de creación del registro del producto en SAG. " +
                   "Watermark para sincronizaciones incrementales del maestro.",
      kpiTraceability: [],
      modulosImpactados: ["compras", "inventario_operativo"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "FECHA_ACTUALIZACION", tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora de la última modificación del registro. " +
                   "Campo crítico para detectar cambios de precio, estado, categoría o atributos.",
      kpiTraceability: [],
      modulosImpactados: ["inventario_operativo", "comercial", "ecommerce"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "FECHA_ACTUALIZACION debe usarse como watermark para replicación incremental del maestro.",
    },
    {
      campo: "USUARIO_CREACION",    tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Usuario SAG que creó el registro del producto.",
      kpiTraceability: [],
      modulosImpactados: ["inventario_operativo"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 13 — Abastecimiento Estratégico ───────────────────────────────
    // Sprint: AGENTIK-SAG-PRODUCTOS-FINAL-HARDENING-02
    {
      campo: "ID_PROVEEDOR_PRINCIPAL", tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Identificador del proveedor principal de la referencia. " +
                   "Clave de cruce con vw_agentik_compras.ID_PROVEEDOR y maestro de proveedores. " +
                   "Permite responder sin reconstruir desde órdenes históricas.",
      kpiTraceability: ["dependencia_proveedor", "compras_pendientes"],
      modulosImpactados: ["compras", "inventario_operativo", "comercio_exterior", "planeacion", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Confirmar si SAG mantiene la relación producto-proveedor en MAESTRO_PRODUCTOS " +
             "o si debe derivarse desde la OC más reciente en ORDENES_COMPRA.",
    },
    {
      campo: "PROVEEDOR_PRINCIPAL",    tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre del proveedor habitual de la referencia. " +
                   "Campo de presentación en Copilot — permite responder: ¿quién abastece este producto?, " +
                   "¿qué productos dependen de un único proveedor?",
      kpiTraceability: ["dependencia_proveedor"],
      modulosImpactados: ["compras", "inventario_operativo", "comercio_exterior", "copilot", "alertas"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    {
      campo: "LEAD_TIME_ABASTECIMIENTO", tipo: "number", obligatorio: false, status: "unconfirmed",
      descripcion: "Tiempo promedio real en días desde emisión de OC hasta disponibilidad operativa en bodega. " +
                   "Incluye: tiempo de aprobación + tránsito + recepción + almacenamiento. " +
                   "Permite responder: ¿cuánto tarda reabastecerse?, ¿qué productos tienen mayor riesgo de ruptura?",
      kpiTraceability: ["lead_time_proveedor", "cobertura_inventario", "compras_pendientes"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion", "alertas", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Si SAG no almacena LEAD_TIME_ABASTECIMIENTO, Agentik lo calcula como promedio de " +
             "(FECHA_RECEPCION_REAL − FECHA_OC) de las últimas N órdenes del proveedor principal.",
    },
    // ── Bloque 14 — Costeo Estratégico ───────────────────────────────────────
    {
      campo: "COSTO_ESTANDAR",         tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Costo estándar del producto — valor de referencia para análisis de rentabilidad. " +
                   "Permite calcular el margen teórico: PRECIO_LISTA − COSTO_ESTANDAR. " +
                   "Base para que Copilot priorice referencias rentables y Comercial compare " +
                   "margen esperado vs margen real de ventas.",
      kpiTraceability: ["margen_bruto", "margen_por_producto", "productos_alto_margen", "productos_bajo_margen", "capital_trabajo"],
      modulosImpactados: ["finanzas", "comercial", "planeacion", "executive_dashboard", "torre_control", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Si SAG no tiene COSTO_ESTANDAR explícito, derivar como: " +
             "último COSTO_PROMEDIO válido desde vw_agentik_inventario, o " +
             "promedio ponderado de VALOR_UNITARIO de las últimas N órdenes de compra.",
    },
    // ── Bloque 15 — Comercio Exterior Operativo ───────────────────────────────
    {
      campo: "ES_IMPORTADO",           tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el producto es de origen importado — distinto de PAIS_ORIGEN. " +
                   "PAIS_ORIGEN puede ser extranjero sin que el producto sea activamente importado. " +
                   "ES_IMPORTADO = true activa flujos de comercio exterior, costos logísticos y " +
                   "análisis de dependencia de importaciones. " +
                   "Permite responder: ¿qué porcentaje del portafolio es importado?, " +
                   "¿qué productos dependen de importaciones?",
      kpiTraceability: ["porcentaje_portafolio_importado", "compras_internacionales"],
      modulosImpactados: ["comercio_exterior", "compras", "finanzas", "planeacion", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
    },
    // ── Bloque 16 — Publicación Digital ──────────────────────────────────────
    {
      campo: "ESTADO_PUBLICACION",     tipo: "enum",    obligatorio: false, status: "unconfirmed",
      descripcion: "Estado de publicación digital del producto. " +
                   "Valores: no_publicado | web | marketplace | omnicanal. " +
                   "Un único campo agrupa todos los canales digitales para mantener el contrato limpio. " +
                   "Marketing Studio y E-commerce usan este campo para priorizar contenido pendiente. " +
                   "Permite responder: ¿qué productos no están publicados?, " +
                   "¿qué referencias faltan por cargar a la web?, " +
                   "¿qué productos tienen inventario pero no presencia digital?",
      kpiTraceability: ["productos_sin_publicacion"],
      modulosImpactados: ["ecommerce", "marketing_studio", "comercial", "alertas", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Preferir un único campo de estado sobre múltiples flags booleanos " +
             "(PUBLICADO_WEB, PUBLICADO_MARKETPLACE, etc.) para mantener el maestro extensible.",
    },
    // ── Bloque 17 — Priorización Estratégica ─────────────────────────────────
    {
      campo: "PRODUCTO_ESTRATEGICO",   tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el producto tiene carácter estratégico para el negocio. " +
                   "true = top sellers, productos ancla, referencias críticas, productos de alto margen. " +
                   "Gobierna priorización en campañas, disponibilidad máxima de stock y alertas. " +
                   "Permite responder: ¿qué productos requieren máxima disponibilidad?, " +
                   "¿qué productos deben priorizarse en campañas?",
      kpiTraceability: ["productos_estrategicos"],
      modulosImpactados: ["comercial", "marketing_studio", "inventario_operativo", "compras", "torre_control", "alertas", "copilot"],
      fuenteSag: "MAESTRO_PRODUCTOS",
      notas: "Si SAG no gestiona este atributo, será administrado directamente en Agentik " +
             "y sincronizado al maestro de productos para persistencia cross-sesión.",
    },
  ],
};

// ── 8. BANCOS ──────────────────────────────────────────────────────────────────
//
// PRINCIPIO ARQUITECTÓNICO: Banco ≠ Recaudo ≠ Pago.
//
//   Banco:   movimiento financiero REAL reportado por la entidad bancaria.
//   Recaudo: ingreso capturado y aplicado dentro de la operación (vw_agentik_recaudos).
//   Pago:    documento o obligación asociada al cliente (vw_agentik_pagos).
//
// Un único movimiento bancario puede:
//   - corresponder a un recaudo (1:1)
//   - corresponder a múltiples recaudos (1:N — ej. consignación global)
//   - no corresponder aún a ningún recaudo (movimiento sin identificar)
//
// Agentik debe soportar los tres escenarios para Conciliación Inteligente real.
//
// Copilot queries habilitados por esta vista:
//   1. "¿Qué dinero ingresó hoy?" → VALOR_CREDITO + FECHA_MOVIMIENTO (WHERE TIPO_MOVIMIENTO = 'credito')
//   2. "¿Qué movimientos no están conciliados?" → CONCILIADO = false + ESTADO_CONCILIACION
//   3. "¿Qué recaudos no aparecen en banco?" → recaudos_sin_respaldo_bancario (cross-domain)
//   4. "¿Cuál es el saldo real por cuenta?" → SALDO_POSTERIOR último movimiento por ID_CUENTA_BANCO
//   5. "¿Qué diferencias existen entre banco y recaudos?" → diferencias_conciliacion
//
// Sprint: AGENTIK-SAG-BANCOS-ENTERPRISE-HARDENING-01

const bancosContract: SagDomainContract = {
  id:             "bancos",
  nombre:         "Bancos",
  descripcion:    "Movimientos financieros reales reportados por las entidades bancarias. " +
                  "Fuente de verdad del dinero real disponible — distinto de los recaudos registrados en SAG. " +
                  "Pilar de la Conciliación Inteligente: cruce entre movimientos bancarios y recaudos/pagos.",
  status:         "in_review",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_bancos",
  primaryTables:  ["MOVIMIENTOS_BANCO", "SALDOS_BANCO", "EXTRACTOS_BANCO"],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  historicalCutoff: "2020-01-01",
  prioridad:      1,
  kpisEnabled: [
    "saldo_bancos",
    "saldo_bancario_actual",
    "ingresos_bancarios_dia",
    "egresos_bancarios_dia",
    "flujo_caja_operativo",
    "movimientos_no_conciliados",
    "recaudos_sin_respaldo_bancario",
    "diferencias_conciliacion",
  ],
  modulosEnabled: [
    "tesoreria",
    "conciliacion",
    "cierre",
    "planeacion",
    "executive_dashboard",
    "torre_control",
    "alertas",
    "copilot",
  ],
  fields: [
    // ── Bloque 1 — Identificación ──────────────────────────────────────────────
    {
      campo: "ID_MOVIMIENTO_BANCO", tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador único del movimiento en el extracto bancario. " +
                   "Clave primaria de la vista y campo de cruce con vw_agentik_recaudos.ID_MOVIMIENTO_BANCO.",
      kpiTraceability: ["saldo_bancario_actual", "ingresos_bancarios_dia", "egresos_bancarios_dia", "movimientos_no_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Confirmar con SAG si existe un ID único por movimiento en el extracto. " +
             "Sin este campo la conciliación automática no puede ser idempotente.",
    },
    {
      campo: "ID_CUENTA_BANCO",     tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador interno de la cuenta bancaria en SAG. " +
                   "Clave de cruce con vw_agentik_recaudos.ID_CUENTA_BANCO.",
      kpiTraceability: ["saldo_bancario_actual", "saldo_bancos"],
      modulosImpactados: ["tesoreria", "conciliacion", "executive_dashboard"],
      fuenteSag: "SALDOS_BANCO",
    },
    {
      campo: "BANCO",               tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Nombre de la entidad bancaria. " +
                   "Ejemplos: Bancolombia, Davivienda, BBVA, Banco de Bogotá.",
      kpiTraceability: ["saldo_bancario_actual", "saldo_bancos"],
      modulosImpactados: ["tesoreria", "executive_dashboard", "copilot"],
      fuenteSag: "SALDOS_BANCO",
    },
    {
      campo: "NUMERO_CUENTA",       tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Número de cuenta bancaria. " +
                   "Referencia humana para conciliación y gestión de tesorería.",
      kpiTraceability: ["saldo_bancos"],
      modulosImpactados: ["tesoreria", "conciliacion", "copilot"],
      fuenteSag: "SALDOS_BANCO",
    },
    {
      campo: "EMPRESA",             tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Empresa o unidad de negocio propietaria de la cuenta bancaria. " +
                   "Preparación para arquitectura multiempresa y consolidación.",
      kpiTraceability: ["saldo_bancario_actual", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "cierre", "executive_dashboard", "copilot"],
      fuenteSag: "SALDOS_BANCO",
      notas: "Estandarizado cross-domain con vw_agentik_ventas, vw_agentik_pagos, " +
             "vw_agentik_cartera y vw_agentik_recaudos.",
    },
    // ── Bloque 2 — Movimiento ─────────────────────────────────────────────────
    {
      campo: "FECHA_MOVIMIENTO",    tipo: "datetime", obligatorio: true, status: "unconfirmed",
      descripcion: "Fecha y hora del movimiento según el extracto bancario. " +
                   "Es la fecha oficial del banco — puede diferir de la fecha de registro en SAG.",
      kpiTraceability: ["ingresos_bancarios_dia", "egresos_bancarios_dia", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre", "executive_dashboard", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Fecha del extracto bancario. Usar esta fecha para conciliación de período, " +
             "no la fecha de registro interno.",
    },
    {
      campo: "FECHA_CONTABLE",      tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el movimiento fue registrado contablemente en los libros de la empresa. " +
                   "Puede diferir de FECHA_MOVIMIENTO por demoras en el registro.",
      kpiTraceability: ["flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "cierre", "conciliacion"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "FECHA_MOVIMIENTO = extracto bancario. FECHA_CONTABLE = registro contable. " +
             "Diferencias entre ambas son fuente frecuente de discrepancias de conciliación.",
    },
    {
      campo: "FECHA_VALOR",         tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el dinero está efectivamente disponible (fecha valor). " +
                   "Relevante para instrumentos con flotación: cheques, PSE, transferencias interbancarias.",
      kpiTraceability: ["saldo_bancario_actual"],
      modulosImpactados: ["tesoreria", "planeacion", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "La diferencia entre FECHA_MOVIMIENTO y FECHA_VALOR define los días de flotación. " +
             "Para proyecciones de disponibilidad de caja usar FECHA_VALOR, no FECHA_MOVIMIENTO.",
    },
    {
      campo: "TIPO_MOVIMIENTO",     tipo: "enum",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Dirección del movimiento. Valores: credito | debito. " +
                   "credito = ingreso de dinero a la cuenta. debito = salida de dinero.",
      kpiTraceability: ["ingresos_bancarios_dia", "egresos_bancarios_dia", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre", "executive_dashboard", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    {
      campo: "CONCEPTO_MOVIMIENTO", tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Descripción o glosa del movimiento según el extracto bancario. " +
                   "Copilot puede usar este campo para clasificar movimientos y detectar patrones.",
      kpiTraceability: [],
      modulosImpactados: ["tesoreria", "conciliacion", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Ejemplos: 'CONSIGNACION CLIENTE', 'PAGO PROVEEDOR', 'COMISION BANCARIA', 'IMPUESTO GMF'. " +
             "Campo de texto libre — útil para conciliación asistida por IA.",
    },
    // ── Bloque 3 — Valores ────────────────────────────────────────────────────
    {
      campo: "VALOR_DEBITO",        tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Monto del débito (salida de dinero). " +
                   "Null o cero si el movimiento es crédito.",
      kpiTraceability: ["egresos_bancarios_dia", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre", "planeacion", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Usar VALOR_DEBITO + VALOR_CREDITO en lugar de un único campo de valor " +
             "permite análisis de flujo de caja neto sin lógica condicional en queries.",
    },
    {
      campo: "VALOR_CREDITO",       tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Monto del crédito (ingreso de dinero). " +
                   "Null o cero si el movimiento es débito.",
      kpiTraceability: ["ingresos_bancarios_dia", "flujo_caja_operativo", "saldo_bancario_actual"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre", "planeacion", "executive_dashboard", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    {
      campo: "SALDO_ANTERIOR",      tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Saldo de la cuenta antes de aplicar este movimiento. " +
                   "Permite reconstruir el estado de la cuenta en cualquier punto histórico.",
      kpiTraceability: ["saldo_bancario_actual"],
      modulosImpactados: ["tesoreria", "conciliacion", "planeacion"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    {
      campo: "SALDO_POSTERIOR",     tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Saldo de la cuenta después de aplicar este movimiento. " +
                   "El SALDO_POSTERIOR del último movimiento del día = saldo real disponible.",
      kpiTraceability: ["saldo_bancario_actual", "saldo_bancos"],
      modulosImpactados: ["tesoreria", "executive_dashboard", "planeacion", "torre_control", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Campo más importante del bloque. Copilot: '¿Cuál es el saldo real de la cuenta [X]?' " +
             "→ MAX(FECHA_MOVIMIENTO) por ID_CUENTA_BANCO → SALDO_POSTERIOR.",
    },
    // ── Bloque 4 — Conciliación ───────────────────────────────────────────────
    {
      campo: "CONCILIADO",          tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si este movimiento bancario fue cruzado con un recaudo o pago en SAG. " +
                   "true = conciliado. false = sin cruce — puede ser recaudo no registrado, " +
                   "comisión bancaria, impuesto u otro movimiento.",
      kpiTraceability: ["movimientos_no_conciliados", "diferencias_conciliacion"],
      modulosImpactados: ["tesoreria", "conciliacion", "alertas", "automatizaciones", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Pilar de la Conciliación Inteligente. " +
             "Alertas automáticas cuando CONCILIADO = false después de N días.",
    },
    {
      campo: "FECHA_CONCILIACION",  tipo: "date",    obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha en que el movimiento fue marcado como conciliado.",
      kpiTraceability: ["movimientos_no_conciliados"],
      modulosImpactados: ["tesoreria", "conciliacion", "cierre"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    {
      campo: "ID_RECAUDO",          tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Recaudo en vw_agentik_recaudos al que corresponde este movimiento bancario. " +
                   "Cruce directo: bancos.ID_RECAUDO = recaudos.ID_RECAUDO.",
      kpiTraceability: ["recaudos_sin_respaldo_bancario", "diferencias_conciliacion"],
      modulosImpactados: ["tesoreria", "conciliacion", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Puede ser nulo para movimientos que no corresponden a recaudos de clientes: " +
             "comisiones, impuestos GMF, pagos a proveedores, transferencias internas.",
    },
    {
      campo: "REFERENCIA_BANCARIA", tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Referencia externa del banco (número de transferencia, código de transacción). " +
                   "Clave de cruce con vw_agentik_recaudos.REFERENCIA_BANCARIA.",
      kpiTraceability: ["recaudos_sin_respaldo_bancario", "diferencias_conciliacion"],
      modulosImpactados: ["tesoreria", "conciliacion"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Estandarizado cross-domain con vw_agentik_recaudos y vw_agentik_pagos.",
    },
    {
      campo: "ESTADO_CONCILIACION", tipo: "enum",    obligatorio: false, status: "unconfirmed",
      descripcion: "Estado detallado del proceso de conciliación. " +
                   "Valores: pendiente | en_revision | conciliado | diferencia_detectada | sin_contrapartida.",
      kpiTraceability: ["movimientos_no_conciliados", "diferencias_conciliacion"],
      modulosImpactados: ["tesoreria", "conciliacion", "alertas", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "sin_contrapartida = movimiento bancario real sin ningún registro en SAG. " +
             "diferencia_detectada = hay registro en SAG pero los montos no coinciden.",
    },
    // ── Bloque 5 — Trazabilidad ───────────────────────────────────────────────
    {
      campo: "ID_CLIENTE",          tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Cliente identificado en el movimiento bancario. " +
                   "Permite trazabilidad: Movimiento Bancario → Cliente → Cartera → Obligación.",
      kpiTraceability: ["saldo_bancario_actual"],
      modulosImpactados: ["tesoreria", "conciliacion", "cartera", "cobranza", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Puede ser nulo para movimientos que no corresponden a pagos de clientes.",
    },
    {
      campo: "ID_FACTURA",          tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Factura específica asociada al movimiento bancario. " +
                   "Trazabilidad: Movimiento Bancario → Factura → Cartera.",
      kpiTraceability: ["diferencias_conciliacion"],
      modulosImpactados: ["conciliacion", "cartera", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    {
      campo: "ID_CARTERA",          tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Obligación de cartera saldada por este movimiento bancario. " +
                   "Cruce directo: bancos.ID_CARTERA = cartera.ID_CARTERA.",
      kpiTraceability: ["diferencias_conciliacion"],
      modulosImpactados: ["conciliacion", "cartera", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    {
      campo: "ID_PAGO",             tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Pago en vw_agentik_pagos al que corresponde este movimiento. " +
                   "Cruce: bancos.ID_PAGO = pagos.ID_PAGO.",
      kpiTraceability: ["recaudos_sin_respaldo_bancario"],
      modulosImpactados: ["conciliacion", "tesoreria", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    // ── Bloque 6 — Multimoneda ────────────────────────────────────────────────
    {
      campo: "MONEDA",              tipo: "enum",    obligatorio: false, status: "unconfirmed",
      descripcion: "MONEDA representa la moneda original del documento o transacción. Valores: COP | USD | EUR | CNY.",
      kpiTraceability: ["saldo_bancario_actual", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "cierre", "comercio_exterior", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Estandarizado cross-domain con todos los dominios financieros.",
    },
    {
      campo: "TASA_CAMBIO",         tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "TASA_CAMBIO representa la tasa utilizada para convertir la operación a la moneda funcional " +
                   "o moneda de reporte. Referencia: FECHA_MOVIMIENTO.",
      kpiTraceability: ["saldo_bancario_actual", "flujo_caja_operativo"],
      modulosImpactados: ["tesoreria", "cierre", "comercio_exterior"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
    // ── Bloque 7 — Operación ──────────────────────────────────────────────────
    {
      campo: "SUCURSAL",            tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Sede o sucursal de la empresa asociada a esta cuenta bancaria.",
      kpiTraceability: ["ingresos_bancarios_dia"],
      modulosImpactados: ["tesoreria", "executive_dashboard", "copilot"],
      fuenteSag: "SALDOS_BANCO",
    },
    {
      campo: "USUARIO_CONCILIACION", tipo: "string", obligatorio: false, status: "unconfirmed",
      descripcion: "Usuario de SAG que realizó o validó la conciliación de este movimiento.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "tesoreria"],
      fuenteSag: "MOVIMIENTOS_BANCO",
      notas: "Trazabilidad de auditoría: quién concilió cada movimiento y cuándo.",
    },
    {
      campo: "OBSERVACIONES",       tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Notas operativas sobre el movimiento o su estado de conciliación. " +
                   "Copilot puede indexar este campo para contexto conversacional.",
      kpiTraceability: [],
      modulosImpactados: ["conciliacion", "tesoreria", "copilot"],
      fuenteSag: "MOVIMIENTOS_BANCO",
    },
  ],
  bloqueadores: [
    "Confirmar la fuente oficial de extractos bancarios en SAG: ¿tabla MOVIMIENTOS_BANCO o integración externa?",
    "Confirmar si SAG almacena histórico de extractos o solo el período reciente",
    "Confirmar si existe un ID único por movimiento bancario (clave primaria de conciliación)",
    "Confirmar disponibilidad de REFERENCIA_BANCARIA en el extracto SAG",
    "Confirmar frecuencia de actualización: ¿diaria, intradía o solo fin de mes?",
    "Confirmar si el extracto SAG incluye SALDO_ANTERIOR y SALDO_POSTERIOR por movimiento",
    "Confirmar si SAG distingue fecha del extracto (FECHA_MOVIMIENTO) de fecha contable (FECHA_CONTABLE)",
  ],
  notas: "28 campos en 7 bloques — fuente de verdad del dinero real disponible. " +
         "PRINCIPIO: Banco ≠ Recaudo ≠ Pago. Un movimiento bancario puede corresponder a " +
         "0, 1 o N recaudos. Agentik soporta los tres escenarios. " +
         "Trazabilidad: Extracto Bancario → Conciliación → Recaudo → Pago → Factura → Cartera → Cierre.",
};

// ── 9. COMPRAS ─────────────────────────────────────────────────────────────────
//
// Sprint: AGENTIK-SAG-COMPRAS-ENTERPRISE-HARDENING-01
//
// PRINCIPIO ARQUITECTÓNICO: Compra ≠ Recepción ≠ Inventario.
//   Compra:     Orden de compra emitida al proveedor (puede no haberse recibido).
//   Recepción:  Ingreso físico a bodega — puede ser parcial o total.
//   Inventario: Resultado de la recepción — actualiza EXISTENCIA y DISPONIBLE.
//
// Una compra puede:
//   - No haberse recibido aún (en tránsito nacional o internacional)
//   - Recibirse parcialmente (CANTIDAD_RECIBIDA < CANTIDAD_ORDENADA)
//   - Alimentar múltiples bodegas (BODEGA_DESTINO puede variar por línea)
//   - Ser de origen nacional o internacional (TIPO_COMPRA, INCOTERM, CONTENEDOR)
//
// Trazabilidad completa: Proveedor → Compra → Recepción → Inventario → Venta
//   ID_PROVEEDOR     → maestro de proveedores
//   REFERENCIA       → vw_agentik_inventario.REFERENCIA, vw_agentik_ventas.REFERENCIA
//   ID_PRODUCTO      → vw_agentik_inventario.ID_PRODUCTO
//   BODEGA_DESTINO   → vw_agentik_inventario.CODIGO_BODEGA
//
// Copilot queries habilitados por esta vista:
//   1. "¿Qué debo comprar esta semana?"
//      → DISPONIBLE bajo + DIAS_COBERTURA < umbral + sin OC pendiente por referencia
//   2. "¿Qué proveedor está incumpliendo?"
//      → OC_VENCIDA = true agrupado por NOMBRE_PROVEEDOR + DIAS_RETRASO promedio
//   3. "¿Qué compras vienen retrasadas?"
//      → FECHA_COMPROMISO < HOY AND ESTADO_OC NOT IN ('recibida', 'cerrada', 'cancelada')
//   4. "¿Qué compras siguen en tránsito?"
//      → ESTADO_OC = 'enviada' or 'parcial' + TIPO_COMPRA = 'internacional'
//   5. "¿Qué órdenes aún no se reciben?"
//      → RECEPCION_COMPLETA = false AND ESTADO_OC IN ('aprobada', 'enviada', 'parcial')
//   6. "¿Qué proveedor abastece más referencias?"
//      → COUNT(DISTINCT REFERENCIA) GROUP BY NOMBRE_PROVEEDOR → dependencia_proveedor
//   7. "¿Cuánto dinero tengo comprometido en compras?"
//      → SUM(VALOR_TOTAL) WHERE ESTADO_OC IN ('aprobada', 'enviada', 'parcial')
//   8. "¿Qué compras internacionales están pendientes?"
//      → TIPO_COMPRA = 'internacional' AND RECEPCION_COMPLETA = false
//
// Sprint: AGENTIK-SAG-COMPRAS-ENTERPRISE-HARDENING-01

const comprasContract: SagDomainContract = {
  id:             "compras",
  nombre:         "Compras",
  descripcion:    "Ciclo completo de abastecimiento: proveedor → orden de compra → tránsito → recepción → inventario. " +
                  "Soporta compras nacionales e internacionales, recepciones parciales y trazabilidad completa " +
                  "hacia inventario y ventas.",
  status:         "in_review",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_compras",
  primaryTables:  ["ORDENES_COMPRA", "RECEPCIONES_COMPRA", "MAESTRO_PROVEEDORES"],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  historicalCutoff: "2020-01-01",
  prioridad:      1,
  kpisEnabled: [
    "cuentas_por_pagar",
    "flujo_caja_operativo",
    "compras_pendientes",
    "compras_vencidas",
    "cumplimiento_proveedores",
    "lead_time_proveedor",
    "valor_compras_transito",
    "compras_por_recibir",
    "dependencia_proveedor",
    "compras_internacionales",
    "tiempo_aprobacion_oc",
  ],
  modulosEnabled: [
    "compras",
    "inventario_operativo",
    "finanzas",
    "tesoreria",
    "planeacion",
    "comercio_exterior",
    "logistica",
    "executive_dashboard",
    "torre_control",
    "alertas",
    "copilot",
  ],
  bloqueadores: [
    "Confirmar si las órdenes de compra y las recepciones están en la misma tabla SAG " +
    "o en tablas separadas (ORDENES_COMPRA vs RECEPCIONES_COMPRA).",
    "Confirmar si CANTIDAD_RECIBIDA y CANTIDAD_PENDIENTE están disponibles en la vista " +
    "o si deben calcularse cruzando OC con recepciones.",
    "Confirmar si ESTADO_OC tiene los valores enumerados propuestos " +
    "(borrador, aprobada, enviada, parcial, recibida, cancelada, cerrada) " +
    "o si SAG usa codificación numérica/alfanumérica diferente.",
    "Confirmar si los campos de logística (CONTENEDOR, GUIA_EMBARQUE, INCOTERM) " +
    "existen en SAG o solo están disponibles para importaciones vía módulo de comercio exterior.",
    "Confirmar si PROVEEDOR_ACTIVO y datos del maestro de proveedores " +
    "(NIT_PROVEEDOR, PAIS_PROVEEDOR, CIUDAD_PROVEEDOR) están disponibles en la vista " +
    "o solo en la tabla MAESTRO_PROVEEDORES por join.",
  ],
  notas: "47 campos en 12 bloques — ciclo completo Proveedor → Compra → Recepción → Inventario → Venta. " +
         "Campos derivados: CANTIDAD_PENDIENTE, PORCENTAJE_CUMPLIMIENTO, OC_VENCIDA, DIAS_RETRASO, " +
         "RECEPCION_COMPLETA, DIAS_APROBACION, STOCK_PROYECTADO_POST_RECEPCION, COMPRA_SUGERIDA_POR_AGENTIK. " +
         "Sprint: AGENTIK-SAG-COMPRAS-ENTERPRISE-HARDENING-01 + FINAL-HARDENING-02.",
  fields: [
    // ── Bloque 1 — Identificación ────────────────────────────────────────────
    {
      campo: "ID_COMPRA",          tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador único de la orden de compra en SAG. " +
                   "Clave primaria de la vista — campo de cruce con recepciones e inventario.",
      kpiTraceability: ["compras_pendientes", "compras_por_recibir", "valor_compras_transito"],
      modulosImpactados: ["compras", "inventario_operativo", "tesoreria", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "NUMERO_OC",          tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Número visible de la orden de compra — código usado por el equipo de compras y proveedor. " +
                   "Puede ser alfanumérico. Es el identificador externo que aparece en documentos enviados al proveedor.",
      kpiTraceability: ["compras_pendientes", "compras_vencidas"],
      modulosImpactados: ["compras", "logistica", "comercio_exterior", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Confirmar si NUMERO_OC es distinto de ID_COMPRA en SAG o si son el mismo valor.",
    },
    {
      campo: "EMPRESA",            tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Empresa o razón social que emite la orden de compra. " +
                   "Clave de partición para arquitecturas multiempresa.",
      kpiTraceability: ["compras_pendientes", "compras_internacionales"],
      modulosImpactados: ["compras", "finanzas", "executive_dashboard"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "SUCURSAL",           tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Sucursal o sede que genera la orden de compra. " +
                   "Permite análisis de compras por punto operativo.",
      kpiTraceability: ["compras_pendientes"],
      modulosImpactados: ["compras", "inventario_operativo", "executive_dashboard"],
      fuenteSag: "ORDENES_COMPRA",
    },
    // ── Bloque 2 — Proveedor ─────────────────────────────────────────────────
    {
      campo: "ID_PROVEEDOR",       tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador interno del proveedor en SAG. " +
                   "Clave de cruce con el maestro de proveedores. " +
                   "Une vw_agentik_compras con vw_agentik_inventario.PROVEEDOR_PRINCIPAL.",
      kpiTraceability: ["cuentas_por_pagar", "cumplimiento_proveedores", "dependencia_proveedor", "lead_time_proveedor"],
      modulosImpactados: ["compras", "finanzas", "tesoreria", "comercio_exterior", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "NOMBRE_PROVEEDOR",   tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Nombre o razón social del proveedor. " +
                   "Campo de presentación en Copilot y alertas de incumplimiento.",
      kpiTraceability: ["cumplimiento_proveedores", "dependencia_proveedor"],
      modulosImpactados: ["compras", "logistica", "comercio_exterior", "copilot", "alertas"],
      fuenteSag: "MAESTRO_PROVEEDORES",
    },
    {
      campo: "NIT_PROVEEDOR",      tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "NIT o número de identificación fiscal del proveedor. " +
                   "Necesario para cruce con documentos contables y facturación electrónica.",
      kpiTraceability: ["cuentas_por_pagar"],
      modulosImpactados: ["compras", "finanzas", "conciliacion"],
      fuenteSag: "MAESTRO_PROVEEDORES",
    },
    {
      campo: "PAIS_PROVEEDOR",     tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "País de origen del proveedor. " +
                   "Clave para clasificar compras nacionales vs internacionales y para comercio exterior.",
      kpiTraceability: ["compras_internacionales", "dependencia_proveedor"],
      modulosImpactados: ["compras", "comercio_exterior", "planeacion", "copilot"],
      fuenteSag: "MAESTRO_PROVEEDORES",
      notas: "Si PAIS_PROVEEDOR != 'CO' (Colombia), la OC puede tener INCOTERM, GUIA_EMBARQUE y CONTENEDOR.",
    },
    {
      campo: "CIUDAD_PROVEEDOR",   tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Ciudad del proveedor — útil para análisis logístico y estimación de lead times nacionales.",
      kpiTraceability: ["lead_time_proveedor"],
      modulosImpactados: ["compras", "logistica"],
      fuenteSag: "MAESTRO_PROVEEDORES",
    },
    {
      campo: "PROVEEDOR_ACTIVO",   tipo: "boolean", obligatorio: false, status: "unconfirmed",
      descripcion: "Indica si el proveedor está activo en el maestro SAG. " +
                   "Proveedores inactivos no deben aparecer en recomendaciones de compra.",
      kpiTraceability: ["dependencia_proveedor"],
      modulosImpactados: ["compras", "alertas"],
      fuenteSag: "MAESTRO_PROVEEDORES",
    },
    // ── Bloque 3 — Producto ──────────────────────────────────────────────────
    {
      campo: "ID_PRODUCTO",        tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Identificador del producto en SAG. " +
                   "Clave de cruce con vw_agentik_inventario.ID_PRODUCTO.",
      kpiTraceability: ["compras_pendientes", "compras_por_recibir", "dependencia_proveedor"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "CODIGO_PRODUCTO",    tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Código externo del producto — puede ser el código del proveedor. " +
                   "Permite reconciliar referencias propias con códigos del proveedor.",
      kpiTraceability: ["compras_pendientes"],
      modulosImpactados: ["compras", "logistica"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "REFERENCIA",         tipo: "string",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Referencia comercial del producto — clave de trazabilidad central. " +
                   "Une vw_agentik_compras ↔ vw_agentik_inventario ↔ vw_agentik_ventas.",
      kpiTraceability: ["compras_pendientes", "compras_por_recibir", "cobertura_inventario", "dependencia_proveedor"],
      modulosImpactados: ["compras", "inventario_operativo", "comercial", "planeacion", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Campo de cruce principal: REFERENCIA en compras = REFERENCIA en inventario = REFERENCIA en ventas.",
    },
    {
      campo: "NOMBRE_PRODUCTO",    tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Nombre descriptivo del producto. " +
                   "Presentación en Copilot y alertas de abastecimiento sin necesidad de joins adicionales.",
      kpiTraceability: [],
      modulosImpactados: ["compras", "copilot", "alertas"],
      fuenteSag: "ORDENES_COMPRA",
    },
    // ── Bloque 4 — Cantidades ────────────────────────────────────────────────
    {
      campo: "CANTIDAD_ORDENADA",   tipo: "number",  obligatorio: true,  status: "unconfirmed",
      descripcion: "Unidades totales solicitadas en la orden de compra.",
      kpiTraceability: ["compras_pendientes", "compras_por_recibir", "cumplimiento_proveedores"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "CANTIDAD_RECIBIDA",   tipo: "number",  obligatorio: false, status: "unconfirmed",
      descripcion: "Unidades efectivamente recibidas en bodega. " +
                   "Si CANTIDAD_RECIBIDA < CANTIDAD_ORDENADA, la OC tiene recepción parcial.",
      kpiTraceability: ["compras_por_recibir", "cumplimiento_proveedores"],
      modulosImpactados: ["compras", "inventario_operativo", "logistica"],
      fuenteSag: "RECEPCIONES_COMPRA",
      notas: "Puede ser 0 si la OC aún no tiene ninguna recepción registrada.",
    },
    {
      campo: "CANTIDAD_PENDIENTE",  tipo: "number",  obligatorio: false, status: "derived",
      descripcion: "Unidades aún no recibidas. " +
                   "Fórmula: CANTIDAD_ORDENADA − CANTIDAD_RECIBIDA. " +
                   "Si SAG no entrega este campo, Agentik lo calcula en la capa de transformación.",
      kpiTraceability: ["compras_pendientes", "compras_por_recibir", "inventario_transito"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion", "alertas", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "PORCENTAJE_CUMPLIMIENTO", tipo: "decimal", obligatorio: false, status: "derived",
      descripcion: "Porcentaje de la OC recibido. " +
                   "Fórmula: (CANTIDAD_RECIBIDA / CANTIDAD_ORDENADA) × 100. " +
                   "Base para el KPI cumplimiento_proveedores.",
      kpiTraceability: ["cumplimiento_proveedores"],
      modulosImpactados: ["compras", "logistica", "torre_control", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    // ── Bloque 5 — Valores ───────────────────────────────────────────────────
    {
      campo: "VALOR_UNITARIO",     tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Precio pactado por unidad en la OC. " +
                   "Base para valorización del tránsito y análisis de costo de abastecimiento.",
      kpiTraceability: ["valor_compras_transito", "cuentas_por_pagar"],
      modulosImpactados: ["compras", "finanzas", "tesoreria"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "VALOR_TOTAL",        tipo: "decimal", obligatorio: true,  status: "unconfirmed",
      descripcion: "Valor total de la OC: CANTIDAD_ORDENADA × VALOR_UNITARIO. " +
                   "Base para cuentas_por_pagar y valor_compras_transito.",
      kpiTraceability: ["cuentas_por_pagar", "flujo_caja_operativo", "valor_compras_transito", "compras_internacionales"],
      modulosImpactados: ["compras", "finanzas", "tesoreria", "executive_dashboard", "torre_control"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "MONEDA",             tipo: "enum",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Moneda de la OC: COP | USD | EUR | CNY. " +
                   "OC en moneda extranjera requieren TASA_CAMBIO para valorización en COP.",
      kpiTraceability: ["compras_internacionales", "valor_compras_transito"],
      modulosImpactados: ["compras", "finanzas", "comercio_exterior", "tesoreria"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "MONEDA != COP implica compra internacional — activar lógica de TASA_CAMBIO e INCOTERM.",
    },
    {
      campo: "TASA_CAMBIO",        tipo: "decimal", obligatorio: false, status: "unconfirmed",
      descripcion: "Tasa utilizada para convertir la OC a la moneda funcional (COP). " +
                   "Si MONEDA = COP, TASA_CAMBIO = 1.",
      kpiTraceability: ["valor_compras_transito", "compras_internacionales"],
      modulosImpactados: ["compras", "finanzas", "comercio_exterior"],
      fuenteSag: "ORDENES_COMPRA",
    },
    // ── Bloque 6 — Fechas ────────────────────────────────────────────────────
    {
      campo: "FECHA_OC",                   tipo: "date", obligatorio: true,  status: "unconfirmed",
      descripcion: "Fecha de emisión o creación de la orden de compra. " +
                   "Punto de inicio del lead time.",
      kpiTraceability: ["compras_pendientes", "lead_time_proveedor"],
      modulosImpactados: ["compras", "planeacion", "finanzas"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "FECHA_COMPROMISO",           tipo: "date", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha pactada de entrega con el proveedor. " +
                   "Base para calcular OC_VENCIDA y DIAS_RETRASO.",
      kpiTraceability: ["compras_vencidas", "cumplimiento_proveedores", "lead_time_proveedor"],
      modulosImpactados: ["compras", "logistica", "alertas", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "FECHA_COMPROMISO es el campo más crítico del bloque — sin él no es posible medir cumplimiento.",
    },
    {
      campo: "FECHA_RECEPCION_ESTIMADA",   tipo: "date", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha estimada de llegada a bodega — puede diferir de FECHA_COMPROMISO. " +
                   "Útil para planeación de inventario y alertas proactivas.",
      kpiTraceability: ["compras_por_recibir", "cobertura_inventario"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion", "alertas"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "FECHA_RECEPCION_REAL",       tipo: "date", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha real en que se registró la recepción en bodega. " +
                   "Con FECHA_OC calcula lead time real. Con FECHA_COMPROMISO determina cumplimiento.",
      kpiTraceability: ["lead_time_proveedor", "cumplimiento_proveedores"],
      modulosImpactados: ["compras", "logistica", "inventario_operativo"],
      fuenteSag: "RECEPCIONES_COMPRA",
    },
    // ── Bloque 7 — Estado ────────────────────────────────────────────────────
    {
      campo: "ESTADO_OC",          tipo: "enum",    obligatorio: true,  status: "unconfirmed",
      descripcion: "Estado de la orden de compra. " +
                   "Valores esperados: borrador | aprobada | enviada | parcial | recibida | cancelada | cerrada. " +
                   "Gobierna si la OC cuenta para compras_pendientes, compras_por_recibir y valor_compras_transito.",
      kpiTraceability: ["compras_pendientes", "compras_por_recibir", "valor_compras_transito", "compras_vencidas"],
      modulosImpactados: ["compras", "inventario_operativo", "logistica", "tesoreria", "alertas", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Confirmar con SAG los valores exactos del enum — puede usar codificación numérica.",
    },
    {
      campo: "OC_VENCIDA",         tipo: "boolean", obligatorio: false, status: "derived",
      descripcion: "Indica si la OC superó su FECHA_COMPROMISO sin recepción completa. " +
                   "Fórmula: FECHA_COMPROMISO < HOY AND ESTADO_OC NOT IN ('recibida', 'cerrada', 'cancelada').",
      kpiTraceability: ["compras_vencidas", "cumplimiento_proveedores"],
      modulosImpactados: ["compras", "logistica", "alertas", "torre_control", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "DIAS_RETRASO",       tipo: "number",  obligatorio: false, status: "derived",
      descripcion: "Días transcurridos desde FECHA_COMPROMISO sin recepción. " +
                   "Fórmula: MAX(0, HOY − FECHA_COMPROMISO) cuando OC_VENCIDA = true. " +
                   "Base para priorizar seguimiento a proveedores.",
      kpiTraceability: ["compras_vencidas", "lead_time_proveedor"],
      modulosImpactados: ["compras", "logistica", "alertas", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    // ── Bloque 8 — Logística y Comercio Exterior ─────────────────────────────
    {
      campo: "TIPO_COMPRA",        tipo: "enum",    obligatorio: false, status: "unconfirmed",
      descripcion: "Tipo de compra: nacional | internacional. " +
                   "Clasifica la OC para análisis de compras_internacionales y activación de flujos de comercio exterior.",
      kpiTraceability: ["compras_internacionales"],
      modulosImpactados: ["compras", "comercio_exterior", "finanzas", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "ORIGEN_COMPRA",      tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "País o región de origen de la mercancía. " +
                   "Para importaciones: país de fabricación o embarque.",
      kpiTraceability: ["compras_internacionales"],
      modulosImpactados: ["compras", "comercio_exterior"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "CONTENEDOR",         tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Número o referencia del contenedor de transporte. " +
                   "Permite trazabilidad de cargamentos internacionales hasta recepción en bodega.",
      kpiTraceability: ["compras_internacionales", "valor_compras_transito"],
      modulosImpactados: ["compras", "comercio_exterior", "logistica"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Solo aplica para compras internacionales (TIPO_COMPRA = 'internacional').",
    },
    {
      campo: "GUIA_EMBARQUE",      tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Número de guía de embarque (Bill of Lading / AWB). " +
                   "Documento de trazabilidad del transporte internacional.",
      kpiTraceability: ["compras_internacionales"],
      modulosImpactados: ["compras", "comercio_exterior", "logistica"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "INCOTERM",           tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Término de comercio internacional (FOB, CIF, DDP, EXW, etc.). " +
                   "Define responsabilidad de costos y riesgo entre comprador y vendedor. " +
                   "Impacta el cálculo del costo total de importación.",
      kpiTraceability: ["compras_internacionales", "valor_compras_transito"],
      modulosImpactados: ["compras", "comercio_exterior", "finanzas"],
      fuenteSag: "ORDENES_COMPRA",
    },
    // ── Bloque 9 — Inventario ────────────────────────────────────────────────
    {
      campo: "BODEGA_DESTINO",     tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Bodega de destino de la recepción. " +
                   "Clave de cruce con vw_agentik_inventario.CODIGO_BODEGA — " +
                   "permite proyectar el impacto de la recepción en el inventario disponible.",
      kpiTraceability: ["compras_por_recibir", "cobertura_inventario"],
      modulosImpactados: ["compras", "inventario_operativo", "logistica", "planeacion"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "UBICACION_DESTINO",  tipo: "string",  obligatorio: false, status: "unconfirmed",
      descripcion: "Zona o ubicación específica dentro de la bodega. " +
                   "Granularidad adicional para gestión de almacenamiento.",
      kpiTraceability: [],
      modulosImpactados: ["compras", "logistica"],
      fuenteSag: "RECEPCIONES_COMPRA",
    },
    {
      campo: "RECEPCION_COMPLETA", tipo: "boolean", obligatorio: false, status: "derived",
      descripcion: "Indica si la OC fue recibida en su totalidad. " +
                   "Fórmula: CANTIDAD_RECIBIDA >= CANTIDAD_ORDENADA OR ESTADO_OC IN ('recibida', 'cerrada'). " +
                   "Gobierna si la OC sale de las colas de seguimiento.",
      kpiTraceability: ["compras_por_recibir", "compras_pendientes"],
      modulosImpactados: ["compras", "inventario_operativo", "logistica", "alertas"],
      fuenteSag: "ORDENES_COMPRA",
    },
    // ── Bloque 10 — Auditoría ────────────────────────────────────────────────
    {
      campo: "USUARIO_CREACION",    tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Usuario SAG que creó la orden de compra.",
      kpiTraceability: [],
      modulosImpactados: ["compras"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "FECHA_CREACION",      tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora de creación del registro de la OC en SAG. " +
                   "Watermark para sincronizaciones incrementales.",
      kpiTraceability: ["compras_pendientes"],
      modulosImpactados: ["compras", "finanzas"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "FECHA_ACTUALIZACION", tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora de la última modificación del registro. " +
                   "Campo crítico para sincronizaciones incrementales — permite detectar cambios de estado.",
      kpiTraceability: ["compras_pendientes", "compras_vencidas"],
      modulosImpactados: ["compras", "finanzas"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "FECHA_ACTUALIZACION debe usarse como watermark para actualizaciones incrementales de la vista.",
    },
    // ── Bloque 11 — Gobierno y Aprobaciones ──────────────────────────────────
    // Sprint: AGENTIK-SAG-COMPRAS-FINAL-HARDENING-02
    {
      campo: "FECHA_APROBACION_OC",      tipo: "datetime", obligatorio: false, status: "unconfirmed",
      descripcion: "Fecha y hora en que la orden de compra fue aprobada formalmente. " +
                   "Con FECHA_OC calcula DIAS_APROBACION — métrica de eficiencia del proceso de compras.",
      kpiTraceability: ["tiempo_aprobacion_oc", "compras_pendientes"],
      modulosImpactados: ["compras", "finanzas", "torre_control", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Confirmar con SAG si el flujo de aprobación está registrado en ORDENES_COMPRA " +
             "o en una tabla separada de workflow/aprobaciones.",
    },
    {
      campo: "USUARIO_APROBADOR",         tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Usuario SAG que aprobó la orden de compra. " +
                   "Permite auditar el proceso de aprobación y responder: ¿quién aprobó esta compra?",
      kpiTraceability: ["tiempo_aprobacion_oc"],
      modulosImpactados: ["compras", "finanzas"],
      fuenteSag: "ORDENES_COMPRA",
    },
    {
      campo: "ESTADO_APROBACION",         tipo: "enum",     obligatorio: false, status: "unconfirmed",
      descripcion: "Estado del flujo de aprobación de la OC. " +
                   "Valores esperados: pendiente | aprobada | rechazada. " +
                   "Permite identificar cuellos de botella administrativos y OC bloqueadas.",
      kpiTraceability: ["compras_pendientes", "tiempo_aprobacion_oc"],
      modulosImpactados: ["compras", "finanzas", "alertas", "torre_control", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Copilot usa ESTADO_APROBACION para responder: ¿qué compras están pendientes de aprobación?, " +
             "¿qué órdenes están bloqueadas?, ¿cuánto tardó la aprobación?",
    },
    {
      campo: "DIAS_APROBACION",           tipo: "number",   obligatorio: false, status: "derived",
      descripcion: "Días transcurridos entre la creación y la aprobación de la OC. " +
                   "Fórmula: FECHA_APROBACION_OC − FECHA_OC. " +
                   "KPI de eficiencia del proceso interno de compras.",
      kpiTraceability: ["tiempo_aprobacion_oc"],
      modulosImpactados: ["compras", "finanzas", "torre_control", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Si FECHA_APROBACION_OC es nula y ESTADO_APROBACION = 'pendiente', " +
             "DIAS_APROBACION = días desde FECHA_OC hasta hoy — mide tiempo en cola de aprobación.",
    },
    // ── Bloque 12 — Planeación y Abastecimiento ───────────────────────────────
    {
      campo: "STOCK_PROYECTADO_POST_RECEPCION", tipo: "number", obligatorio: false, status: "derived",
      descripcion: "Inventario esperado una vez se reciba completamente la orden de compra. " +
                   "Fórmula: vw_agentik_inventario.DISPONIBLE (por REFERENCIA+BODEGA_DESTINO) + CANTIDAD_PENDIENTE. " +
                   "Permite responder: si recibo esta compra ¿cuánto inventario tendré?, " +
                   "¿esta compra realmente cubre la necesidad?",
      kpiTraceability: ["cobertura_inventario", "compras_por_recibir"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Campo cross-domain: requiere cruce con vw_agentik_inventario por REFERENCIA y BODEGA_DESTINO. " +
             "Agentik calcula este valor en la capa de inteligencia operacional.",
    },
    {
      campo: "COMPRA_SUGERIDA_POR_AGENTIK", tipo: "boolean", obligatorio: false, status: "derived",
      descripcion: "Indicador booleano generado por las reglas de abastecimiento de Agentik. " +
                   "true = Agentik recomienda esta compra basado en DIAS_COBERTURA, quiebres proyectados " +
                   "y consumo histórico. Copilot puede justificar: por qué recomienda comprar, " +
                   "qué riesgo evita, qué referencias están en cobertura crítica.",
      kpiTraceability: ["compras_pendientes", "quiebres_stock", "cobertura_inventario"],
      modulosImpactados: ["compras", "inventario_operativo", "planeacion", "alertas", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Campo generado internamente por Agentik — no proviene de SAG. " +
             "Se persiste en la vista para trazabilidad y auditoría de recomendaciones.",
    },
    {
      campo: "MOTIVO_COMPRA",              tipo: "string",   obligatorio: false, status: "unconfirmed",
      descripcion: "Motivo o categoría que justifica la orden de compra. " +
                   "Valores sugeridos: reposicion | temporada | promocion | importacion | lanzamiento | seguridad_stock. " +
                   "Permite análisis posterior de efectividad y distribución de compras por propósito.",
      kpiTraceability: ["compras_internacionales", "compras_pendientes"],
      modulosImpactados: ["compras", "planeacion", "comercial", "comercio_exterior", "copilot"],
      fuenteSag: "ORDENES_COMPRA",
      notas: "Confirmar si MOTIVO_COMPRA existe en SAG o si debe ser un campo adicional ingresado " +
             "por el equipo de compras al momento de crear la OC.",
    },
  ],
};

// ── 10. PRODUCCIÓN ─────────────────────────────────────────────────────────────

const produccionContract: SagDomainContract = {
  id:             "produccion",
  nombre:         "Producción",
  descripcion:    "Órdenes de producción, consumo de materias primas y unidades producidas.",
  status:         "draft",
  accessMethod:   "view",
  suggestedView:  "vw_agentik_produccion",
  primaryTables:  ["ORDENES_PRODUCCION", "CONSUMO_MP", "PRODUCCION_TERMINADA"],
  syncFrequency:  "daily_eod",
  dataCurrency:   "T-1",
  prioridad:      3,
  kpisEnabled: ["costo_ventas", "inventario_disponible"],
  modulosEnabled: ["inventario_operativo", "cierre", "planeacion"],
  fields: [
    {
      campo: "ID_OP",          tipo: "string",  obligatorio: true,
      status: "unconfirmed",
      descripcion: "Número de orden de producción",
      kpiTraceability: ["costo_ventas"],
      modulosImpactados: ["cierre"],
      fuenteSag: "ORDENES_PRODUCCION",
    },
    {
      campo: "PRODUCTO_TERM",  tipo: "string",  obligatorio: true,
      status: "unconfirmed",
      descripcion: "Producto terminado resultante de la OP",
      kpiTraceability: ["inventario_disponible"],
      modulosImpactados: ["inventario_operativo"],
      fuenteSag: "PRODUCCION_TERMINADA",
    },
    {
      campo: "CANTIDAD_PROD",  tipo: "number",  obligatorio: true,
      status: "unconfirmed",
      descripcion: "Unidades producidas y aprobadas",
      kpiTraceability: ["inventario_disponible", "rotacion_inventario"],
      modulosImpactados: ["inventario_operativo", "planeacion"],
      fuenteSag: "PRODUCCION_TERMINADA",
    },
    {
      campo: "COSTO_OP",       tipo: "decimal", obligatorio: false,
      status: "unconfirmed",
      descripcion: "Costo total de la orden de producción",
      kpiTraceability: ["costo_ventas", "margen_bruto"],
      modulosImpactados: ["cierre"],
      fuenteSag: "ORDENES_PRODUCCION",
    },
  ],
};

// ── View requests catalog ──────────────────────────────────────────────────────

export const SAG_VIEW_REQUESTS: SagViewRequest[] = [
  {
    viewName:    "vw_agentik_ventas",
    domain:      "ventas",
    status:      "not_submitted",
    columns: [
      // ── Campos originales ─────────────────────────────────────────────
      "ID_VENTA", "FECHA_VENTA", "MONTO_BRUTO", "MONTO_NETO",
      "DESCUENTO_COMERCIAL", "ID_CLIENTE", "ID_PRODUCTO",
      "CANAL_VENTA", "DEVOLUCION_MONTO",
      // ── Grupo 1 — Identificación ─────────────────────────────────────
      "NUMERO_DOCUMENTO", "TIPO_DOCUMENTO", "ESTADO_VENTA",
      // ── Grupo 2 — Responsable comercial ──────────────────────────────
      "ID_VENDEDOR", "NOMBRE_VENDEDOR",
      // ── Grupo 3 — Rentabilidad ────────────────────────────────────────
      "COSTO_VENTA", "IMPUESTO_VENTA", "MARGEN_BRUTO",
      // ── Grupo 4 — Cantidades ──────────────────────────────────────────
      "CANTIDAD_VENDIDA", "UNIDAD_MEDIDA",
      // ── Grupo 5 — Cliente 360 ─────────────────────────────────────────
      "CIUDAD_CLIENTE", "PAIS_CLIENTE",
      // ── Grupo 6 — Estructura empresarial ─────────────────────────────
      "SUCURSAL", "EMPRESA",
      // ── Grupo 7 — Logística ───────────────────────────────────────────
      "FECHA_DESPACHO", "FECHA_ENTREGA",
      // ── Grupo 8 — Devoluciones ────────────────────────────────────────
      "DEVOLUCION_CANTIDAD",
      // ── Grupo 9 — Comercio exterior ───────────────────────────────────
      "MONEDA", "TASA_CAMBIO",
      // ── Grupo 10 — Auditoría ──────────────────────────────────────────
      "FECHA_CREACION", "FECHA_ACTUALIZACION",
      // ── FINAL HARDENING-01 — Trazabilidad completa ────────────────────
      "ID_FACTURA", "CODIGO_PRODUCTO", "NOMBRE_PRODUCTO",
      "NOMBRE_CLIENTE", "ESTADO_LOGISTICO",
      "LINEA_DETALLE_ID", "GRANULARIDAD_REGISTRO",
      // ── FINAL HARDENING-02 — Logística, Bodega, Pedido, Atribución ───────
      "FECHA_COMPROMISO_ENTREGA", "ID_BODEGA", "ID_PEDIDO", "ORIGEN_VENTA",
    ],
    frequency:   "daily_eod",
    notas: "HARDENING-01 + FINAL-HARDENING-01 + FINAL-HARDENING-02: " +
           "Agentik prefiere granularidad por LÍNEA DE DETALLE para análisis por producto, margen e inventario. " +
           "41 campos — trazabilidad completa: Venta → Pedido → Documento → Factura → Línea → Producto → " +
           "Cliente → Vendedor → Margen → Inventario → Bodega → Despacho → Entrega → Pago → Cartera → Atribución → Marketing → Copilot.",
  },
  {
    viewName:    "vw_agentik_pagos",
    domain:      "pagos",
    status:      "submitted",
    columns: [
      // ── Campos originales acordados ─────────────────────────────────
      "ID_PAGO",
      "FECHA_PAGO",
      "MONTO_PAGO",
      "ID_FACTURA_REF",
      "ID_CLIENTE",
      "MEDIO_PAGO",
      "ESTADO_PAGO",
      "BANCO_DESTINO",
      // ── Fase 1 — Campos críticos (HARDENING-01) ─────────────────────
      "NUMERO_RECIBO",
      "FECHA_APLICACION",
      "SALDO_POSTERIOR",
      "TIPO_APLICACION",
      "REFERENCIA_BANCARIA",
      "BANCO_ORIGEN",
      "FECHA_VENCIMIENTO_FACTURA",
      // ── Fase 2 — Campos estratégicos (HARDENING-01) ─────────────────
      "SUCURSAL",
      "EMPRESA",
      "CANAL_PAGO",
      "USUARIO_APLICACION",
      "OBSERVACION_PAGO",
      // ── Multi-moneda (MULTICURRENCY-01) ─────────────────────────────────
      "MONEDA",
      "TASA_CAMBIO",
      // ── MICRO-HARDENING-03 — Alineación cross-domain ────────────────────
      "NOMBRE_CLIENTE", "FECHA_CREACION", "FECHA_ACTUALIZACION",
    ],
    frequency:   "daily_eod",
    notas: "SAG confirmó tabla pagosnew sin restricción histórica. Vista pendiente creación. " +
           "HARDENING-01: Vista ampliada para soportar Conciliación, Tesorería, Cobranza, " +
           "Cliente 360, Comercial, Torre de Control y Agentik Copilot. " +
           "MULTICURRENCY-01: MONEDA y TASA_CAMBIO para comercio exterior e importaciones. " +
           "MICRO-HARDENING-03: NOMBRE_CLIENTE, FECHA_CREACION y FECHA_ACTUALIZACION " +
           "para alineación cross-domain con vw_agentik_ventas y vw_agentik_cartera. " +
           "25 campos — núcleo financiero auditado y alineado.",
  },
  {
    viewName:    "vw_agentik_recaudos",
    domain:      "recaudos",
    status:      "not_submitted",
    columns: [
      // ── Bloque 1 — Identificación ──────────────────────────────────────────
      "ID_RECAUDO", "NUMERO_RECIBO", "ID_CLIENTE", "NOMBRE_CLIENTE", "NIT_CLIENTE",
      // ── Bloque 2 — Relación con documentos ────────────────────────────────
      "ID_PAGO", "ID_FACTURA", "NUMERO_FACTURA", "ID_CARTERA", "ID_PEDIDO",
      // ── Bloque 3 — Fechas ─────────────────────────────────────────────────
      "FECHA_RECAUDO", "FECHA_APLICACION", "FECHA_CONSIGNACION",
      "FECHA_CREACION", "FECHA_ACTUALIZACION",
      // ── Bloque 4 — Valores ────────────────────────────────────────────────
      "MONTO_RECAUDO", "MONTO_APLICADO", "MONTO_NO_APLICADO", "SALDO_PENDIENTE_APLICAR",
      // ── Bloque 5 — Medio/Canal ────────────────────────────────────────────
      "TIPO_RECAUDO", "MEDIO_RECAUDO", "CANAL_RECAUDO",
      "REFERENCIA_BANCARIA", "NUMERO_COMPROBANTE",
      // ── Bloque 6 — Banco ──────────────────────────────────────────────────
      "ID_CUENTA_BANCO", "CUENTA_BANCO", "BANCO_DESTINO", "ID_MOVIMIENTO_BANCO",
      // ── Bloque 7 — Conciliación ───────────────────────────────────────────
      "CONCILIADO", "FECHA_CONCILIACION", "ESTADO_CONCILIACION",
      // ── Bloque 8 — Operación ──────────────────────────────────────────────
      "SUCURSAL", "EMPRESA", "USUARIO_APLICACION", "OBSERVACION_RECAUDO",
      // ── Bloque 9 — Multimoneda ────────────────────────────────────────────
      "MONEDA", "TASA_CAMBIO",
      // ── Bloque 10 — Estado ────────────────────────────────────────────────
      "ESTADO_RECAUDO",
    ],
    filters:     [
      "ESTADO_RECAUDO NOT IN ('anulado', 'reversado') -- excluir por defecto; incluir en modo auditoría",
    ],
    frequency:   "daily_eod",
    notas: "ENTERPRISE-HARDENING-01: Dominio independiente de Pagos. " +
           "PRINCIPIO: Recaudo ≠ Pago — el recaudo confirma el ingreso; el pago es la obligación. " +
           "38 campos en 10 bloques — soporta Tesorería, Conciliación Inteligente, Flujo de Caja, " +
           "Copilot y arquitecturas multiempresa/multicliente. " +
           "Confirmar con SAG: (1) separación real entre pagosnew y RECAUDOS_CAJA; " +
           "(2) relación 1:N entre recaudo y facturas; (3) disponibilidad de CONCILIADO e ID_MOVIMIENTO_BANCO.",
  },
  {
    viewName:    "vw_agentik_cartera",
    domain:      "cartera",
    status:      "not_submitted",
    columns: [
      // ── Bloque 1 — Identificación ──────────────────────────────────────────
      "ID_CARTERA", "ID_FACTURA", "NUMERO_FACTURA", "ID_PEDIDO",
      "ID_CLIENTE", "NOMBRE_CLIENTE", "NIT_CLIENTE",
      // ── Bloque 2 — Fechas ─────────────────────────────────────────────────
      "FECHA_FACTURA", "FECHA_VENCIMIENTO", "FECHA_ULTIMO_PAGO", "FECHA_CORTE",
      // ── Bloque 3 — Valores ────────────────────────────────────────────────
      "VALOR_FACTURA", "VALOR_PAGADO", "SALDO_PENDIENTE",
      "SALDO_CORRIENTE", "SALDO_VENCIDO", "VALOR_CASTIGADO",
      // ── Bloque 4 — Mora ───────────────────────────────────────────────────
      "DIAS_MORA", "RANGO_MORA",
      // ── Bloque 5 — Cobranza Inteligente ───────────────────────────────────
      "ESTADO_COBRANZA", "FECHA_ULTIMA_GESTION", "RESULTADO_ULTIMA_GESTION",
      "PROMESA_PAGO_FECHA", "PROMESA_PAGO_VALOR",
      // ── Bloque 6 — Riesgo ─────────────────────────────────────────────────
      "CUPO_CREDITO", "CUPO_DISPONIBLE", "RIESGO_CLIENTE",
      // ── Bloque 7 — Comercial ──────────────────────────────────────────────
      "ID_VENDEDOR", "NOMBRE_VENDEDOR", "SUCURSAL",
      // ── Bloque 8 — Internacional ──────────────────────────────────────────
      "MONEDA", "TASA_CAMBIO",
      // ── Bloque 9 — Auditoría ──────────────────────────────────────────────
      "FECHA_CREACION", "FECHA_ACTUALIZACION",
      // ── FINAL HARDENING-02 — Bloqueo crediticio + Scoring IA + Flujo ─────
      "CLIENTE_BLOQUEADO_CREDITO", "FECHA_BLOQUEO_CREDITO", "MOTIVO_BLOQUEO",
      "SCORE_RIESGO_NUMERICO", "FECHA_PRIMER_VENCIMIENTO",
    ],
    filters:     [
      "SALDO_PENDIENTE > 0",
      "FECHA_CORTE = CURRENT_DATE - 1",
    ],
    frequency:   "daily_eod",
    notas: "ENTERPRISE-HARDENING-01 + FINAL-HARDENING-02: Vista enterprise-ready de cartera a nivel de factura/obligación. " +
           "Granularidad: UNA FILA POR DOCUMENTO PENDIENTE — no por cliente agregado. " +
           "39 campos — soporta Cobranza Inteligente, Cliente 360, Riesgo, Copilot, Scoring IA, " +
           "Planeación Financiera, Flujo de Caja, Torre de Control y Automatizaciones. " +
           "Confirmar con SAG: (1) tabla COBRANZA_GESTIONES existe; (2) CUPO_CREDITO + CLIENTE_BLOQUEADO_CREDITO en CREDITO_CLIENTES; " +
           "(3) granularidad por factura disponible; (4) SCORE_RIESGO_NUMERICO calculado o a derivar en Agentik.",
  },
  {
    viewName:    "vw_agentik_inventario",
    domain:      "inventario",
    status:      "not_submitted",
    columns: [
      // Bloque 1 — Producto
      "ID_PRODUCTO", "CODIGO_ARTICULO", "REFERENCIA", "NOMBRE_ARTICULO",
      // Bloque 2 — Clasificación
      "LINEA", "SUBLINEA", "MARCA", "CATEGORIA",
      // Bloque 3 — Variantes
      "TALLA", "COLOR",
      // Bloque 4 — Ubicación
      "CODIGO_BODEGA", "NOMBRE_BODEGA", "SUCURSAL",
      // Bloque 5 — Existencias
      "EXISTENCIA", "DISPONIBLE", "RESERVADO", "COMPROMETIDO", "TRANSITO",
      // Bloque 6 — Operación
      "ULTIMO_MOVIMIENTO", "FECHA_ULTIMO_MOVIMIENTO", "TIPO_ULTIMO_MOVIMIENTO",
      // Bloque 7 — Estado
      "ACTIVO", "DESCONTINUADO", "BLOQUEADO_VENTA",
      // Bloque 8 — Valorización y Abastecimiento
      "COSTO_PROMEDIO", "COSTO_TOTAL_EXISTENCIA", "PROVEEDOR_PRINCIPAL", "DIAS_COBERTURA",
    ],
    filters: [
      "EXISTENCIA > 0 OR DISPONIBLE > 0 OR RESERVADO > 0 OR TRANSITO > 0",
      "CODIGO_BODEGA IN (:bodegasActivas)",
    ],
    frequency:   "daily_eod",
    notas: "28 campos en 8 bloques. Fuente oficial SAG: v_saldos_inventariotallanew. " +
           "Disponible depende de parametrización SAG (PD puede afectar según configuración). " +
           "COSTO_TOTAL_EXISTENCIA y DIAS_COBERTURA son campos derivados — Agentik los calcula si SAG no los entrega. " +
           "Sprint: AGENTIK-SAG-INVENTARIO-ENTERPRISE-HARDENING-01 + FINANCIAL-HARDENING-01.",
  },
  {
    viewName:    "vw_agentik_bancos",
    domain:      "bancos",
    status:      "not_submitted",
    columns: [
      // Bloque 1 — Identificación
      "ID_MOVIMIENTO_BANCO", "ID_CUENTA_BANCO", "BANCO", "NUMERO_CUENTA", "EMPRESA",
      // Bloque 2 — Movimiento
      "FECHA_MOVIMIENTO", "FECHA_CONTABLE", "FECHA_VALOR", "TIPO_MOVIMIENTO", "CONCEPTO_MOVIMIENTO",
      // Bloque 3 — Valores
      "VALOR_DEBITO", "VALOR_CREDITO", "SALDO_ANTERIOR", "SALDO_POSTERIOR",
      // Bloque 4 — Conciliación
      "CONCILIADO", "FECHA_CONCILIACION", "ID_RECAUDO", "REFERENCIA_BANCARIA", "ESTADO_CONCILIACION",
      // Bloque 5 — Trazabilidad
      "ID_CLIENTE", "ID_FACTURA", "ID_CARTERA", "ID_PAGO",
      // Bloque 6 — Multimoneda
      "MONEDA", "TASA_CAMBIO",
      // Bloque 7 — Operación
      "SUCURSAL", "USUARIO_CONCILIACION", "OBSERVACIONES",
    ],
    filters: [
      "FECHA_MOVIMIENTO >= :desde AND FECHA_MOVIMIENTO <= :hasta",
      "EMPRESA = :empresaId",
    ],
    frequency:   "daily_eod",
    notas: "28 campos en 7 bloques — fuente de verdad del dinero real disponible. " +
           "Sprint: AGENTIK-SAG-BANCOS-ENTERPRISE-HARDENING-01.",
  },
  {
    viewName:    "vw_agentik_compras",
    domain:      "compras",
    status:      "not_submitted",
    columns: [
      // Bloque 1 — Identificación
      "ID_COMPRA", "NUMERO_OC", "EMPRESA", "SUCURSAL",
      // Bloque 2 — Proveedor
      "ID_PROVEEDOR", "NOMBRE_PROVEEDOR", "NIT_PROVEEDOR", "PAIS_PROVEEDOR", "CIUDAD_PROVEEDOR", "PROVEEDOR_ACTIVO",
      // Bloque 3 — Producto
      "ID_PRODUCTO", "CODIGO_PRODUCTO", "REFERENCIA", "NOMBRE_PRODUCTO",
      // Bloque 4 — Cantidades
      "CANTIDAD_ORDENADA", "CANTIDAD_RECIBIDA", "CANTIDAD_PENDIENTE", "PORCENTAJE_CUMPLIMIENTO",
      // Bloque 5 — Valores
      "VALOR_UNITARIO", "VALOR_TOTAL", "MONEDA", "TASA_CAMBIO",
      // Bloque 6 — Fechas
      "FECHA_OC", "FECHA_COMPROMISO", "FECHA_RECEPCION_ESTIMADA", "FECHA_RECEPCION_REAL",
      // Bloque 7 — Estado
      "ESTADO_OC", "OC_VENCIDA", "DIAS_RETRASO",
      // Bloque 8 — Logística y Comercio Exterior
      "TIPO_COMPRA", "ORIGEN_COMPRA", "CONTENEDOR", "GUIA_EMBARQUE", "INCOTERM",
      // Bloque 9 — Inventario
      "BODEGA_DESTINO", "UBICACION_DESTINO", "RECEPCION_COMPLETA",
      // Bloque 10 — Auditoría
      "USUARIO_CREACION", "FECHA_CREACION", "FECHA_ACTUALIZACION",
      // Bloque 11 — Gobierno y Aprobaciones
      "FECHA_APROBACION_OC", "USUARIO_APROBADOR", "ESTADO_APROBACION", "DIAS_APROBACION",
      // Bloque 12 — Planeación y Abastecimiento
      "STOCK_PROYECTADO_POST_RECEPCION", "COMPRA_SUGERIDA_POR_AGENTIK", "MOTIVO_COMPRA",
    ],
    filters: [
      "ESTADO_OC NOT IN ('cancelada', 'cerrada') OR FECHA_RECEPCION_REAL >= :desde",
      "EMPRESA = :empresaId",
    ],
    frequency:   "daily_eod",
    notas: "47 campos en 12 bloques — ciclo completo Proveedor → Compra → Recepción → Inventario → Venta. " +
           "Campos derivados: CANTIDAD_PENDIENTE, PORCENTAJE_CUMPLIMIENTO, OC_VENCIDA, DIAS_RETRASO, " +
           "RECEPCION_COMPLETA, DIAS_APROBACION, STOCK_PROYECTADO_POST_RECEPCION, COMPRA_SUGERIDA_POR_AGENTIK. " +
           "Sprint: AGENTIK-SAG-COMPRAS-ENTERPRISE-HARDENING-01 + FINAL-HARDENING-02.",
  },
  {
    viewName:    "vw_agentik_productos",
    domain:      "productos",
    status:      "not_submitted",
    columns: [
      // Bloque 1 — Identidad Maestra
      "ID_PRODUCTO", "CODIGO_PRODUCTO", "REFERENCIA", "SKU", "NOMBRE_COMERCIAL", "NOMBRE_INTERNO", "MARCA",
      // Bloque 2 — Clasificación Comercial
      "LINEA", "SUBLINEA", "CATEGORIA", "SUBCATEGORIA", "COLECCION", "TEMPORADA",
      // Bloque 3 — Variantes
      "ID_VARIANTE", "COLOR", "TALLA", "PRESENTACION", "UNIDAD_MEDIDA",
      // Bloque 4 — Comercial
      "PRECIO_LISTA", "PRECIO_MINIMO", "MONEDA", "MARGEN_OBJETIVO", "ESTADO_COMERCIAL",
      // Bloque 5 — Inventario
      "MANEJA_INVENTARIO", "MANEJA_TALLA_COLOR", "STOCK_MINIMO", "STOCK_MAXIMO", "PUNTO_REORDEN",
      // Bloque 6 — Marketing
      "DESCRIPCION_MARKETING", "BENEFICIOS_CLAVE", "TAGS_MARKETING", "PALABRAS_CLAVE",
      // Bloque 7 — E-commerce
      "SEO_TITLE", "SEO_DESCRIPTION", "URL_SLUG",
      // Bloque 8 — Producción
      "REQUIERE_PRODUCCION", "TIEMPO_PRODUCCION", "TIPO_PRODUCCION",
      // Bloque 9 — Comercio Exterior
      "PAIS_ORIGEN", "CODIGO_ARANCELARIO", "PESO", "LARGO", "ANCHO", "ALTO",
      // Bloque 10 — IA y Copilot
      "TIPO_CONTENIDO_RECOMENDADO", "PLANTILLA_RECOMENDADA", "TAGS_IA", "CATEGORIA_IA",
      // Bloque 11 — Estado y Ciclo de Vida
      "ACTIVO", "DESCONTINUADO", "FECHA_LANZAMIENTO", "FECHA_DESCONTINUACION",
      // Bloque 12 — Auditoría
      "FECHA_CREACION", "FECHA_ACTUALIZACION", "USUARIO_CREACION",
      // Bloque 13 — Abastecimiento Estratégico
      "ID_PROVEEDOR_PRINCIPAL", "PROVEEDOR_PRINCIPAL", "LEAD_TIME_ABASTECIMIENTO",
      // Bloque 14 — Costeo Estratégico
      "COSTO_ESTANDAR",
      // Bloque 15 — Comercio Exterior Operativo
      "ES_IMPORTADO",
      // Bloque 16 — Publicación Digital
      "ESTADO_PUBLICACION",
      // Bloque 17 — Priorización Estratégica
      "PRODUCTO_ESTRATEGICO",
    ],
    filters: [
      "ACTIVO = true OR DESCONTINUADO = false",
    ],
    frequency:   "daily_eod",
    notas: "62 campos en 17 bloques — Master Product Data DEFINITIVO de Agentik. " +
           "Principio: Producto ≠ Variante. Producto = Fuente de Verdad Empresarial. " +
           "Trazabilidad: Producto → Compra → Inventario → Venta → Cliente → Finanzas. " +
           "Sprint: AGENTIK-SAG-PRODUCTOS-ENTERPRISE-HARDENING-01 + FINAL-HARDENING-02.",
  },
];

// ── Master contract ────────────────────────────────────────────────────────────

export const SAG_MASTER_CONTRACT: SagMasterContract = {
  version:                        "2.6.0",
  lastReviewedDate:               "2026-05-29",
  accessMethodAgreed:             "view",
  syncFrequencyAgreed:            "daily_eod",
  dataWarehouseRecommended:       true,
  pagosnewHistoricalConfirmed:    true,
  domains: [
    pagosContract,
    ventasContract,
    recaudosContract,
    carteraContract,
    bancosContract,
    inventarioContract,
    comprasContract,
    clientesContract,
    productosContract,
    produccionContract,
  ],
  viewRequests: SAG_VIEW_REQUESTS,
};

// ── Convenience accessors ──────────────────────────────────────────────────────

export function getDomainContract(id: string) {
  return SAG_MASTER_CONTRACT.domains.find(d => d.id === id) ?? null;
}

export function getDomainsForModule(module: string) {
  return SAG_MASTER_CONTRACT.domains.filter(d =>
    d.modulosEnabled.includes(module as never)
  );
}

export function getAgreedDomains() {
  return SAG_MASTER_CONTRACT.domains.filter(d =>
    d.status === "agreed" || d.status === "view_created" || d.status === "integrated"
  );
}

export function getCriticalDomains() {
  return SAG_MASTER_CONTRACT.domains.filter(d => d.prioridad === 1);
}
