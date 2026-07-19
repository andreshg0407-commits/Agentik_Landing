/**
 * lib/integrations/sag/executive-pack/sag-view-request-doc.ts
 *
 * SAG Executive Pack — View Request Document
 *
 * Solicitud formal de vistas de base de datos dirigida al equipo técnico de SAG.
 * Contiene únicamente información necesaria para que SAG defina y cree las vistas.
 *
 * NO incluye: trazabilidad interna, KPIs, lógica derivada de Agentik, ni Copilot.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-EXECUTIVE-PACK-01
 */

// ── View request entry for SAG ─────────────────────────────────────────────────

export interface SagViewRequestEntry {
  nombreVista:        string;
  dominio:            string;
  proposito:          string;
  tablasFuente:       string[];
  fuentesConfirmadas?: boolean;  // true = SAG confirmó la tabla en reunión; false/undefined = identificada en análisis
  camposRequeridos:   SagViewColumn[];
  camposOpcionales:   SagViewColumn[];
  frecuenciaRecomendada: string;
  filtrosSugeridos:   string[];
  observaciones:      string[];
  prioridad:          "crítico" | "importante" | "deseable";
}

export interface SagViewColumn {
  campo:      string;
  tipo:       string;
  descripcion: string;
}

// ── View definitions ───────────────────────────────────────────────────────────

export const SAG_VIEW_REQUEST_DOC: SagViewRequestEntry[] = [

  // ── 1. VENTAS ──────────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_ventas",
    dominio:       "Ventas",
    proposito:     "Consulta de documentos de venta con detalle por línea. " +
                   "Permite conocer el valor, producto, cliente, vendedor y estado de cada transacción de venta.",
    tablasFuente:  ["VENTAS_MAESTRO", "VENTAS_DETALLE", "CLIENTES", "VENDEDORES"],
    prioridad:     "crítico",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "FECHA_VENTA >= :fechaDesde AND FECHA_VENTA <= :fechaHasta",
      "EMPRESA = :empresaId",
    ],
    camposRequeridos: [
      { campo: "ID_VENTA",           tipo: "string",  descripcion: "Identificador único de la transacción de venta." },
      { campo: "NUMERO_FACTURA",     tipo: "string",  descripcion: "Número del documento de factura." },
      { campo: "FECHA_VENTA",        tipo: "datetime",descripcion: "Fecha y hora de registro de la venta." },
      { campo: "ID_CLIENTE",         tipo: "string",  descripcion: "Identificador del cliente." },
      { campo: "ID_VENDEDOR",        tipo: "string",  descripcion: "Identificador del ejecutivo de ventas." },
      { campo: "ID_PRODUCTO",        tipo: "string",  descripcion: "Identificador del producto." },
      { campo: "REFERENCIA",         tipo: "string",  descripcion: "Referencia comercial del producto." },
      { campo: "MONTO_BRUTO",        tipo: "decimal", descripcion: "Valor bruto antes de descuentos." },
      { campo: "MONTO_NETO",         tipo: "decimal", descripcion: "Valor neto después de descuentos." },
      { campo: "ESTADO_DOCUMENTO",   tipo: "enum",    descripcion: "Estado: activo, anulado, devuelto." },
      { campo: "EMPRESA",            tipo: "string",  descripcion: "Empresa emisora del documento." },
    ],
    camposOpcionales: [
      { campo: "NOMBRE_CLIENTE",     tipo: "string",  descripcion: "Nombre del cliente para presentación." },
      { campo: "NOMBRE_VENDEDOR",    tipo: "string",  descripcion: "Nombre del vendedor para presentación." },
      { campo: "NOMBRE_PRODUCTO",    tipo: "string",  descripcion: "Descripción del producto para presentación." },
      { campo: "CANTIDAD",           tipo: "number",  descripcion: "Unidades vendidas." },
      { campo: "PRECIO_UNITARIO",    tipo: "decimal", descripcion: "Precio unitario de venta." },
      { campo: "DESCUENTO_COMERCIAL",tipo: "decimal", descripcion: "Descuento aplicado en la negociación." },
      { campo: "COSTO_PRODUCTO",     tipo: "decimal", descripcion: "Costo del producto para cálculo de margen." },
      { campo: "BODEGA",             tipo: "string",  descripcion: "Bodega de despacho." },
      { campo: "CIUDAD",             tipo: "string",  descripcion: "Ciudad de entrega." },
      { campo: "CANAL_VENTA",        tipo: "string",  descripcion: "Canal de la venta: mostrador, distribuidor, etc." },
      { campo: "MONEDA",             tipo: "enum",    descripcion: "Moneda de la transacción: COP, USD, EUR." },
      { campo: "FECHA_ENTREGA_REAL", tipo: "date",    descripcion: "Fecha real de entrega al cliente." },
    ],
    observaciones: [
      "La granularidad por línea de detalle es el nivel de análisis identificado para este dominio.",
      "De existir una tabla separada de detalles de venta, se valoraría que el acceso consolide la información en una consulta.",
      "Sería conveniente validar si el campo REFERENCIA mantiene una estructura consistente entre los dominios de Inventario y Productos.",
    ],
  },

  // ── 2. PAGOS ───────────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_pagos",
    dominio:       "Pagos",
    proposito:     "Consulta de pagos asociados a documentos de cartera. " +
                   "Permite conocer qué facturas han recibido abonos, en qué fecha y por qué valor.",
    tablasFuente:       ["pagosnew"],
    fuentesConfirmadas: true,
    prioridad:          "crítico",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "FECHA_PAGO >= :fechaDesde",
      "EMPRESA = :empresaId",
    ],
    camposRequeridos: [
      { campo: "ID_PAGO",            tipo: "string",  descripcion: "Identificador único del pago." },
      { campo: "ID_FACTURA_REF",     tipo: "string",  descripcion: "Identificador de la factura asociada al pago." },
      { campo: "ID_CLIENTE",         tipo: "string",  descripcion: "Identificador del cliente." },
      { campo: "FECHA_PAGO",         tipo: "datetime",descripcion: "Fecha y hora del pago." },
      { campo: "MONTO_PAGADO",       tipo: "decimal", descripcion: "Valor pagado en la transacción." },
      { campo: "TIPO_PAGO",          tipo: "enum",    descripcion: "Tipo: abono, pago total, anticipo." },
      { campo: "ESTADO_PAGO",        tipo: "enum",    descripcion: "Estado: aplicado, pendiente, anulado." },
      { campo: "EMPRESA",            tipo: "string",  descripcion: "Empresa receptora del pago." },
    ],
    camposOpcionales: [
      { campo: "FECHA_VENCIMIENTO",  tipo: "date",    descripcion: "Fecha de vencimiento del documento pagado." },
      { campo: "CANAL_PAGO",         tipo: "string",  descripcion: "Canal de recepción: banco, caja, transferencia." },
      { campo: "SALDO_POSTERIOR",    tipo: "decimal", descripcion: "Saldo pendiente después de aplicar el pago." },
      { campo: "MONEDA",             tipo: "enum",    descripcion: "Moneda del pago: COP, USD, EUR." },
      { campo: "NOMBRE_CLIENTE",     tipo: "string",  descripcion: "Nombre del cliente para presentación." },
    ],
    observaciones: [
      "SAG confirmó que pagosnew no tiene restricción histórica de acceso.",
      "Sería conveniente validar si ID_FACTURA_REF puede relacionarse con el identificador de venta o factura disponible en el dominio de Ventas.",
      "Confirmar el nombre exacto de la tabla fuente de pagos vigente.",
    ],
  },

  // ── 3. CARTERA ─────────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_cartera",
    dominio:       "Cartera",
    proposito:     "Consulta de documentos pendientes de cobro por cliente. " +
                   "Una fila por documento pendiente, con estado de mora y saldo actual.",
    tablasFuente:  ["CARTERA_DOCUMENTOS", "CLIENTES", "VENDEDORES"],
    prioridad:     "crítico",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "SALDO_PENDIENTE > 0",
      "EMPRESA = :empresaId",
    ],
    camposRequeridos: [
      { campo: "ID_DOCUMENTO",       tipo: "string",  descripcion: "Identificador único del documento de cartera." },
      { campo: "NUMERO_FACTURA",     tipo: "string",  descripcion: "Número de la factura asociada." },
      { campo: "ID_CLIENTE",         tipo: "string",  descripcion: "Identificador del cliente." },
      { campo: "FECHA_EMISION",      tipo: "date",    descripcion: "Fecha de emisión del documento." },
      { campo: "FECHA_VENCIMIENTO",  tipo: "date",    descripcion: "Fecha de vencimiento de la obligación." },
      { campo: "VALOR_ORIGINAL",     tipo: "decimal", descripcion: "Valor original del documento." },
      { campo: "SALDO_PENDIENTE",    tipo: "decimal", descripcion: "Saldo vigente pendiente de cobro." },
      { campo: "DIAS_MORA",          tipo: "number",  descripcion: "Días transcurridos desde el vencimiento." },
      { campo: "EMPRESA",            tipo: "string",  descripcion: "Empresa del documento." },
    ],
    camposOpcionales: [
      { campo: "NOMBRE_CLIENTE",     tipo: "string",  descripcion: "Nombre del cliente." },
      { campo: "ID_VENDEDOR",        tipo: "string",  descripcion: "Vendedor responsable de la cuenta." },
      { campo: "NOMBRE_VENDEDOR",    tipo: "string",  descripcion: "Nombre del vendedor." },
      { campo: "ESTADO_CARTERA",     tipo: "enum",    descripcion: "Estado: corriente, vencida, castigada." },
      { campo: "CUPO_CREDITO",       tipo: "decimal", descripcion: "Cupo de crédito aprobado para el cliente." },
    ],
    observaciones: [
      "Una fila por documento pendiente es el nivel de granularidad identificado para el análisis de envejecimiento de cartera.",
      "El campo DIAS_MORA puede ser calculado como CURRENT_DATE − FECHA_VENCIMIENTO si SAG no lo expone directamente.",
      "Sería conveniente validar si NUMERO_FACTURA puede cruzarse con el dominio de Ventas para trazabilidad de documentos.",
    ],
  },

  // ── 4. RECAUDOS ────────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_recaudos",
    dominio:       "Recaudos",
    proposito:     "Consulta de ingresos registrados en el sistema de cartera. " +
                   "Permite conocer qué dinero fue capturado y si ya fue aplicado a documentos específicos.",
    tablasFuente:  ["RECAUDOS_CAJA", "RECAUDOS_BANCO"],
    prioridad:     "crítico",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "FECHA_RECAUDO >= :fechaDesde",
      "EMPRESA = :empresaId",
    ],
    camposRequeridos: [
      { campo: "ID_RECAUDO",         tipo: "string",  descripcion: "Identificador único del recaudo." },
      { campo: "FECHA_RECAUDO",      tipo: "datetime",descripcion: "Fecha y hora del recaudo." },
      { campo: "ID_CLIENTE",         tipo: "string",  descripcion: "Cliente asociado al recaudo." },
      { campo: "MONTO_RECAUDO",      tipo: "decimal", descripcion: "Valor recibido." },
      { campo: "ESTADO_RECAUDO",     tipo: "enum",    descripcion: "Estado: aplicado, pendiente, en_revision." },
      { campo: "EMPRESA",            tipo: "string",  descripcion: "Empresa receptora." },
    ],
    camposOpcionales: [
      { campo: "ID_DOCUMENTO_REF",   tipo: "string",  descripcion: "Documento al que se aplica el recaudo." },
      { campo: "CANAL_RECAUDO",      tipo: "string",  descripcion: "Canal: caja, banco, transferencia, PSE." },
      { campo: "CONCILIADO",         tipo: "boolean", descripcion: "Indica si el recaudo tiene confirmación bancaria." },
      { campo: "REFERENCIA_BANCARIA",tipo: "string",  descripcion: "Referencia del banco para cruce con extracto." },
      { campo: "ID_MOVIMIENTO_BANCO",tipo: "string",  descripcion: "Identificador del movimiento en extracto bancario." },
      { campo: "MONTO_NO_APLICADO",  tipo: "decimal", descripcion: "Parte del recaudo aún sin aplicar a documentos." },
    ],
    observaciones: [
      "Confirmar con SAG si recaudos y pagos están en la misma tabla o en tablas separadas.",
      "El campo REFERENCIA_BANCARIA podría facilitar la relación entre este dominio y la información bancaria disponible para procesos de conciliación y análisis.",
      "CONCILIADO permite saber si el ingreso tiene respaldo bancario confirmado.",
    ],
  },

  // ── 5. BANCOS ──────────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_bancos",
    dominio:       "Bancos",
    proposito:     "Consulta de movimientos del extracto bancario reportados por las entidades financieras. " +
                   "Referencia principal para la consulta y análisis de movimientos bancarios registrados en las cuentas de la organización.",
    tablasFuente:  ["MOVIMIENTOS_BANCO", "SALDOS_BANCO"],
    prioridad:     "crítico",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "FECHA_MOVIMIENTO >= :fechaDesde AND FECHA_MOVIMIENTO <= :fechaHasta",
      "EMPRESA = :empresaId",
    ],
    camposRequeridos: [
      { campo: "ID_MOVIMIENTO_BANCO",tipo: "string",  descripcion: "Identificador único del movimiento en extracto." },
      { campo: "ID_CUENTA_BANCO",    tipo: "string",  descripcion: "Identificador de la cuenta bancaria." },
      { campo: "BANCO",              tipo: "string",  descripcion: "Nombre del banco." },
      { campo: "FECHA_MOVIMIENTO",   tipo: "date",    descripcion: "Fecha del movimiento en el extracto." },
      { campo: "TIPO_MOVIMIENTO",    tipo: "enum",    descripcion: "Tipo: débito, crédito." },
      { campo: "VALOR_DEBITO",       tipo: "decimal", descripcion: "Valor del débito (si aplica)." },
      { campo: "VALOR_CREDITO",      tipo: "decimal", descripcion: "Valor del crédito (si aplica)." },
      { campo: "SALDO_POSTERIOR",    tipo: "decimal", descripcion: "Saldo de la cuenta después del movimiento." },
      { campo: "EMPRESA",            tipo: "string",  descripcion: "Empresa propietaria de la cuenta." },
    ],
    camposOpcionales: [
      { campo: "CONCEPTO_MOVIMIENTO",tipo: "string",  descripcion: "Descripción del movimiento según el banco." },
      { campo: "REFERENCIA_BANCARIA",tipo: "string",  descripcion: "Referencia del banco para cruce con recaudos." },
      { campo: "CONCILIADO",         tipo: "boolean", descripcion: "Indica si el movimiento ya fue conciliado." },
      { campo: "FECHA_VALOR",        tipo: "date",    descripcion: "Fecha valor (puede diferir de FECHA_MOVIMIENTO)." },
      { campo: "NUMERO_CUENTA",      tipo: "string",  descripcion: "Número de cuenta bancaria." },
    ],
    observaciones: [
      "El campo REFERENCIA_BANCARIA podría utilizarse para relacionar movimientos bancarios con registros de recaudo, sujeto a la validación del modelo de datos disponible en SAG.",
      "SALDO_POSTERIOR del último movimiento del día equivale al saldo real disponible.",
      "Confirmar disponibilidad del extracto bancario histórico desde 2020.",
    ],
  },

  // ── 6. INVENTARIO ──────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_inventario",
    dominio:       "Inventario",
    proposito:     "Consulta de saldos de inventario por referencia, talla y bodega. " +
                   "Fuente oficial: v_saldos_inventariotallanew (confirmada en reunión SAG mayo 2026).",
    tablasFuente:       ["v_saldos_inventariotallanew"],
    fuentesConfirmadas: true,
    prioridad:          "crítico",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "EXISTENCIA > 0 OR DISPONIBLE > 0",
      "CODIGO_BODEGA IN (:bodegasActivas)",
    ],
    camposRequeridos: [
      { campo: "ID_PRODUCTO",        tipo: "string",  descripcion: "Identificador del producto." },
      { campo: "REFERENCIA",         tipo: "string",  descripcion: "Referencia comercial del producto." },
      { campo: "TALLA",              tipo: "string",  descripcion: "Talla de la variante." },
      { campo: "CODIGO_BODEGA",      tipo: "string",  descripcion: "Código de la bodega." },
      { campo: "EXISTENCIA",         tipo: "number",  descripcion: "Unidades físicas en la bodega." },
      { campo: "DISPONIBLE",         tipo: "number",  descripcion: "Unidades disponibles para venta según configuración SAG." },
    ],
    camposOpcionales: [
      { campo: "CODIGO_ARTICULO",    tipo: "string",  descripcion: "Código externo o de barras del artículo." },
      { campo: "NOMBRE_ARTICULO",    tipo: "string",  descripcion: "Descripción del artículo." },
      { campo: "COLOR",              tipo: "string",  descripcion: "Color de la variante (si la vista lo incluye)." },
      { campo: "NOMBRE_BODEGA",      tipo: "string",  descripcion: "Nombre legible de la bodega." },
      { campo: "SUCURSAL",           tipo: "string",  descripcion: "Sucursal propietaria de la bodega." },
      { campo: "LINEA",              tipo: "string",  descripcion: "Línea de producto." },
      { campo: "RESERVADO",          tipo: "number",  descripcion: "Unidades reservadas para pedidos." },
      { campo: "TRANSITO",           tipo: "number",  descripcion: "Unidades en tránsito aún no recibidas." },
      { campo: "COSTO_PROMEDIO",     tipo: "decimal", descripcion: "Costo promedio ponderado del artículo." },
    ],
    observaciones: [
      "SAG confirmó que v_saldos_inventariotallanew es la fuente oficial para saldos con granularidad por talla.",
      "DISPONIBLE puede verse afectado por la parametrización de PD (Pedidos en Despacho). Confirmar fórmula exacta.",
      "RESERVADO puede no estar disponible como campo separado — se podría derivar como EXISTENCIA − DISPONIBLE.",
    ],
  },

  // ── 7. COMPRAS ─────────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_compras",
    dominio:       "Compras",
    proposito:     "Consulta de órdenes de compra con estado de recepción. " +
                   "Permite conocer qué se ha pedido, cuánto se ha recibido y qué está pendiente.",
    tablasFuente:  ["ORDENES_COMPRA", "RECEPCIONES_COMPRA", "MAESTRO_PROVEEDORES"],
    prioridad:     "importante",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "ESTADO_OC NOT IN ('cancelada', 'cerrada') OR FECHA_RECEPCION_REAL >= :fechaDesde",
      "EMPRESA = :empresaId",
    ],
    camposRequeridos: [
      { campo: "ID_COMPRA",          tipo: "string",  descripcion: "Identificador único de la orden de compra." },
      { campo: "NUMERO_OC",          tipo: "string",  descripcion: "Número visible de la OC." },
      { campo: "ID_PROVEEDOR",       tipo: "string",  descripcion: "Identificador del proveedor." },
      { campo: "NOMBRE_PROVEEDOR",   tipo: "string",  descripcion: "Nombre del proveedor." },
      { campo: "ID_PRODUCTO",        tipo: "string",  descripcion: "Identificador del producto." },
      { campo: "REFERENCIA",         tipo: "string",  descripcion: "Referencia del producto." },
      { campo: "CANTIDAD_ORDENADA",  tipo: "number",  descripcion: "Unidades solicitadas." },
      { campo: "CANTIDAD_RECIBIDA",  tipo: "number",  descripcion: "Unidades efectivamente recibidas." },
      { campo: "VALOR_TOTAL",        tipo: "decimal", descripcion: "Valor total de la orden." },
      { campo: "FECHA_OC",           tipo: "date",    descripcion: "Fecha de emisión de la OC." },
      { campo: "ESTADO_OC",          tipo: "enum",    descripcion: "Estado: aprobada, enviada, parcial, recibida, cancelada." },
      { campo: "EMPRESA",            tipo: "string",  descripcion: "Empresa compradora." },
    ],
    camposOpcionales: [
      { campo: "FECHA_COMPROMISO",   tipo: "date",    descripcion: "Fecha pactada de entrega con el proveedor." },
      { campo: "FECHA_RECEPCION_REAL",tipo: "date",   descripcion: "Fecha real de recepción en bodega." },
      { campo: "MONEDA",             tipo: "enum",    descripcion: "Moneda de la OC: COP, USD, EUR, CNY." },
      { campo: "BODEGA_DESTINO",     tipo: "string",  descripcion: "Bodega de destino de la recepción." },
      { campo: "TIPO_COMPRA",        tipo: "enum",    descripcion: "Tipo: nacional, internacional." },
    ],
    observaciones: [
      "Confirmar si las OC y las recepciones están en la misma tabla o si requieren JOIN.",
      "El campo ESTADO_OC puede tener codificación diferente en SAG — confirmar valores del enum.",
      "Sería conveniente validar si REFERENCIA puede cruzarse con el dominio de Inventario para trazabilidad de abastecimiento.",
    ],
  },

  // ── 8. PRODUCTOS ───────────────────────────────────────────────────────────
  {
    nombreVista:   "vw_agentik_productos",
    dominio:       "Productos",
    proposito:     "Consulta del maestro de artículos con atributos comerciales, operativos y logísticos. " +
                   "Fuente de referencia para enriquecer información de ventas, inventario y compras.",
    tablasFuente:  ["MAESTRO_PRODUCTOS", "PRECIOS_LISTA"],
    prioridad:     "importante",
    frecuenciaRecomendada: "Diaria al cierre del día (EOD)",
    filtrosSugeridos: [
      "ACTIVO = true",
    ],
    camposRequeridos: [
      { campo: "ID_PRODUCTO",        tipo: "string",  descripcion: "Identificador único del producto." },
      { campo: "REFERENCIA",         tipo: "string",  descripcion: "Referencia comercial — clave de cruce con otros dominios." },
      { campo: "NOMBRE_COMERCIAL",   tipo: "string",  descripcion: "Nombre del producto para presentación." },
      { campo: "ACTIVO",             tipo: "boolean", descripcion: "Indica si el producto está activo." },
      { campo: "UNIDAD_MEDIDA",      tipo: "string",  descripcion: "Unidad de medida: UND, KG, PAR, CAJA, etc." },
    ],
    camposOpcionales: [
      { campo: "CODIGO_PRODUCTO",    tipo: "string",  descripcion: "Código externo o de barras." },
      { campo: "LINEA",              tipo: "string",  descripcion: "Línea de producto." },
      { campo: "CATEGORIA",          tipo: "string",  descripcion: "Categoría de gestión." },
      { campo: "MARCA",              tipo: "string",  descripcion: "Marca comercial." },
      { campo: "PRECIO_LISTA",       tipo: "decimal", descripcion: "Precio de lista vigente." },
      { campo: "COSTO_PROMEDIO",     tipo: "decimal", descripcion: "Costo promedio ponderado." },
      { campo: "TALLA",              tipo: "string",  descripcion: "Talla (si el producto maneja variantes)." },
      { campo: "COLOR",              tipo: "string",  descripcion: "Color (si el producto maneja variantes)." },
      { campo: "MANEJA_TALLA_COLOR", tipo: "boolean", descripcion: "Indica si el artículo tiene variantes de talla/color." },
      { campo: "STOCK_MINIMO",       tipo: "number",  descripcion: "Nivel mínimo de stock requerido." },
      { campo: "DESCONTINUADO",      tipo: "boolean", descripcion: "Indica si el producto fue descontinuado." },
    ],
    observaciones: [
      "Sería conveniente validar si el campo REFERENCIA mantiene una estructura consistente entre los distintos dominios.",
      "Confirmar si PRECIO_LISTA está en MAESTRO_PRODUCTOS o en una tabla separada de listas de precios.",
      "Si el maestro tiene una fila por variante (talla × color), indicarlo para ajustar el modelo de datos.",
    ],
  },
];

// ── Convenience: get view entry by name ───────────────────────────────────────

export function getViewRequestEntry(nombreVista: string): SagViewRequestEntry | undefined {
  return SAG_VIEW_REQUEST_DOC.find(v => v.nombreVista === nombreVista);
}

// ── Convenience: summary for each view ───────────────────────────────────────

export function getViewRequestSummary(): Array<{
  nombreVista: string;
  prioridad: string;
  totalRequeridos: number;
  totalOpcionales: number;
  frecuencia: string;
}> {
  return SAG_VIEW_REQUEST_DOC.map(v => ({
    nombreVista:     v.nombreVista,
    prioridad:       v.prioridad,
    totalRequeridos: v.camposRequeridos.length,
    totalOpcionales: v.camposOpcionales.length,
    frecuencia:      v.frecuenciaRecomendada,
  }));
}
