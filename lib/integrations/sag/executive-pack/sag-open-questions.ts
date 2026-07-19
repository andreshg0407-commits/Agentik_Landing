/**
 * lib/integrations/sag/executive-pack/sag-open-questions.ts
 *
 * SAG Executive Pack — Open Questions Register
 *
 * Registro consolidado de preguntas pendientes por dominio.
 * Extraído de los bloqueadores documentados en cada contrato de dominio.
 *
 * Orientado a la reunión de validación técnica con SAG.
 * Lenguaje: técnico-funcional, sin terminología interna de Agentik.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-EXECUTIVE-PACK-01
 */

// ── Question types ─────────────────────────────────────────────────────────────

export type QuestionPriority = "crítica" | "importante" | "informativa";
export type QuestionDomain =
  | "ventas"
  | "pagos"
  | "cartera"
  | "recaudos"
  | "bancos"
  | "inventario"
  | "compras"
  | "productos"
  | "acceso_general";

export type QuestionStatus =
  | "pendiente"       // Not yet asked or answered
  | "en_discusion"    // Being discussed with SAG
  | "respondida"      // SAG has provided a definitive answer
  | "bloqueante";     // Blocks integration until resolved

export interface OpenQuestion {
  id:           string;       // e.g. "VEN-01"
  dominio:      QuestionDomain;
  prioridad:    QuestionPriority;
  status:       QuestionStatus;
  pregunta:     string;
  contexto?:    string;       // Why we need this — without internal refs
  impacto:      string;       // What is blocked until resolved
  respuesta?:   string;       // SAG's answer (if received)
}

// ── Questions by domain ────────────────────────────────────────────────────────

const preguntasVentas: OpenQuestion[] = [
  {
    id:       "VEN-01",
    dominio:  "ventas",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿La vista vw_agentik_ventas incluirá tanto facturas como notas débito/crédito en una misma vista, o se manejarán en vistas separadas?",
    contexto: "El análisis de ventas netas requiere cruzar facturas con sus notas de ajuste para calcular el valor real de la transacción.",
    impacto:  "Sin confirmación, el cálculo de ventas netas puede duplicar o subestimar valores si los tipos de documento no están correctamente separados.",
  },
  {
    id:       "VEN-02",
    dominio:  "ventas",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo DESCUENTO_COMERCIAL en la línea de detalle refleja el descuento aplicado al ítem o el descuento en el encabezado del documento prorrateado?",
    contexto: "Para análisis de rentabilidad por producto, necesitamos el descuento a nivel de línea.",
    impacto:  "Afecta el cálculo de margen bruto por referencia si el descuento está consolidado en el encabezado.",
  },
  {
    id:       "VEN-03",
    dominio:  "ventas",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo CIUDAD_DESTINO está disponible en la vista de ventas o se debe obtener cruzando con la tabla de clientes?",
    impacto:  "La segmentación geográfica de ventas requiere este campo directamente en la vista para evitar JOINs adicionales.",
  },
];

const preguntasPagos: OpenQuestion[] = [
  {
    id:       "PAG-01",
    dominio:  "pagos",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo ESTADO_PAGO en la tabla pagosnew distingue entre pago aplicado, pago pendiente de aplicar y pago reversado?",
    contexto: "Para el seguimiento de cartera es crítico saber si un pago ya fue aplicado al documento de cobro.",
    impacto:  "Sin esta distinción, el saldo pendiente de cartera puede reportar valores incorrectos.",
  },
  {
    id:       "PAG-02",
    dominio:  "pagos",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿La fecha histórica más antigua disponible en pagosnew es accesible sin restricciones? SAG confirmó en reunión de mayo 2026 que no hay restricción histórica — ¿esto aplica también para el ambiente de producción actual?",
    impacto:  "La ventana histórica disponible determina la profundidad del análisis de comportamiento de pago por cliente.",
  },
  {
    id:       "PAG-03",
    dominio:  "pagos",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿Los pagos en efectivo y los pagos electrónicos (transferencias, PSE) se registran en la misma tabla o en tablas separadas dentro de pagosnew?",
    impacto:  "Afecta la construcción del análisis por canal de pago.",
  },
];

const preguntasCartera: OpenQuestion[] = [
  {
    id:       "CAR-01",
    dominio:  "cartera",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo FECHA_VENCIMIENTO en la cartera pendiente refleja la fecha original de vencimiento del documento o la fecha renegociada si hubo refinanciación?",
    impacto:  "El cálculo de días de mora y el análisis de envejecimiento de cartera depende de esta distinción.",
  },
  {
    id:       "CAR-02",
    dominio:  "cartera",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El cupo de crédito del cliente (CUPO_CREDITO) está disponible en la misma vista de cartera o en una tabla de maestro de clientes separada?",
    impacto:  "La cobertura de cupo de crédito requiere cruzar saldo pendiente con el cupo asignado.",
  },
  {
    id:       "CAR-03",
    dominio:  "cartera",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿SAG registra las promesas de pago como campo en la cartera o se gestionan en un módulo separado de gestión de cobros?",
    impacto:  "Determina si el indicador de cumplimiento de promesas de pago puede obtenerse de SAG directamente.",
  },
];

const preguntasRecaudos: OpenQuestion[] = [
  {
    id:       "REC-01",
    dominio:  "recaudos",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo CONCILIADO (boolean o equivalente) en recaudos indica específicamente que el recaudo fue cruzado contra un movimiento bancario, o simplemente que fue aplicado a un documento de cartera?",
    contexto: "La conciliación bancaria requiere cruzar recaudos contra extractos bancarios, no solo contra documentos de cartera.",
    impacto:  "Si CONCILIADO solo refleja aplicación a cartera, el módulo de conciliación bancaria no puede usarlo como señal de cruce con bancos.",
  },
  {
    id:       "REC-02",
    dominio:  "recaudos",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿Los recaudos anulados o reversados permanecen en la vista con un estado especial, o se eliminan físicamente del registro?",
    impacto:  "Los recaudos reversados deben excluirse del saldo de caja real pero incluirse en el historial de movimientos para conciliación.",
  },
];

const preguntasBancos: OpenQuestion[] = [
  {
    id:       "BAN-01",
    dominio:  "bancos",
    prioridad: "crítica",
    status:   "pendiente",
    pregunta: "¿El campo REFERENCIA_BANCARIA en la vista de bancos corresponde al número de referencia del extracto bancario emitido por la entidad financiera, o es un código interno de SAG?",
    contexto: "Para la conciliación bancaria automatizada, la referencia debe poder cruzarse directamente con el extracto bancario del banco.",
    impacto:  "Si es un código interno de SAG, la conciliación automática contra extractos bancarios externos no es posible.",
  },
  {
    id:       "BAN-02",
    dominio:  "bancos",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿La vista de bancos puede filtrar por TIPO_MOVIMIENTO para separar créditos (ingresos) de débitos (egresos)? ¿Cuáles son los valores exactos del campo TIPO_MOVIMIENTO en SAG?",
    impacto:  "El análisis de flujo de caja bancario requiere separar ingresos de egresos de forma confiable.",
  },
  {
    id:       "BAN-03",
    dominio:  "bancos",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿Los movimientos bancarios en SAG son cargados manualmente por el equipo contable o se importan automáticamente desde el banco?",
    impacto:  "Determina la latencia real de los datos bancarios y la confiabilidad del saldo reportado.",
  },
  {
    id:       "BAN-04",
    dominio:  "bancos",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿Existe un campo que identifique si un movimiento bancario ya fue cruzado con un recaudo en SAG (ESTADO_CONCILIACION o equivalente)?",
    impacto:  "La detección de movimientos bancarios no conciliados requiere esta señal para evitar falsos positivos.",
  },
];

const preguntasInventario: OpenQuestion[] = [
  {
    id:       "INV-01",
    dominio:  "inventario",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo DISPONIBLE en v_saldos_inventariotallanew descuenta automáticamente las reservas por pedidos pendientes de surtir, o es equivalente a EXISTENCIA menos solo los compromisos registrados en SAG?",
    contexto: "SAG ya confirmó que el cálculo del disponible depende de la parametrización 'Disponible a utilizar' y de las fuentes configuradas para afectar disponible. Esta validación busca únicamente determinar la configuración específica utilizada por la organización.",
    impacto:  "Si DISPONIBLE y EXISTENCIA son iguales, el campo DISPONIBLE no puede usarse como indicador operativo de stock real. Afecta quiebres de stock y cobertura.",
  },
  {
    id:       "INV-02",
    dominio:  "inventario",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo RESERVADO existe en v_saldos_inventariotallanew o es un campo derivado que debe calcularse cruzando con pedidos pendientes?",
    impacto:  "Determina si el inventario comprometido puede calcularse directamente desde la vista de inventario o requiere un JOIN adicional.",
  },
  {
    id:       "INV-03",
    dominio:  "inventario",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿Los atributos COLOR y demás variantes de producto se encuentran disponibles de forma consistente para todas las empresas o dependen de parametrizaciones específicas de implementación?",
    impacto:  "Determina si el análisis de inventario puede hacerse a nivel de SKU completo (referencia + talla + color) para todas las empresas o solo para algunas según configuración.",
  },
  {
    id:       "INV-04",
    dominio:  "inventario",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo COSTO_PROMEDIO en inventario es el costo promedio ponderado histórico o el último costo de compra?",
    impacto:  "Afecta directamente el cálculo del valor total del inventario y el margen bruto.",
  },
  {
    id:       "INV-05",
    dominio:  "inventario",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿Existe una vista o tabla en SAG que consolide el inventario en tránsito (comprado pero aún no recibido físicamente)?",
    impacto:  "Sin esta información, el inventario en tránsito debe estimarse desde las órdenes de compra enviadas sin recepción completa.",
  },
];

const preguntasCompras: OpenQuestion[] = [
  {
    id:       "COM-01",
    dominio:  "compras",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿El campo ESTADO_OC en SAG tiene valores estándar predefinidos? ¿Cuáles son los posibles valores y cuál indica que una OC está completamente recibida?",
    impacto:  "El cálculo de compras pendientes y cumplimiento de proveedores depende de poder filtrar por estado de la OC.",
  },
  {
    id:       "COM-02",
    dominio:  "compras",
    prioridad: "importante",
    status:   "pendiente",
    pregunta: "¿La fecha de compromiso de entrega del proveedor (FECHA_COMPROMISO) está disponible a nivel de línea de OC o solo a nivel de encabezado?",
    impacto:  "El cálculo de OC vencidas y el seguimiento de SLA por proveedor requiere la fecha a nivel de línea para productos con diferentes fechas de entrega.",
  },
  {
    id:       "COM-03",
    dominio:  "compras",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿SAG registra el tipo de compra (nacional / internacional) a nivel de OC? ¿Bajo qué campo y con qué valores?",
    impacto:  "El análisis de importaciones y dependencia de comercio exterior requiere este campo.",
  },
];

const preguntasProductos: OpenQuestion[] = [
  {
    id:       "PRO-01",
    dominio:  "productos",
    prioridad: "crítica",
    status:   "pendiente",
    pregunta: "¿El código de referencia (REFERENCIA) en el maestro de productos de SAG es el mismo que se usa en las vistas de ventas, inventario, compras y cartera? ¿Es la clave de cruce garantizada entre todos los dominios?",
    impacto:  "Si los códigos de referencia no son consistentes entre dominios, la trazabilidad Producto → Inventario → Venta → Compra no es posible sin tablas de homologación adicionales.",
  },
  {
    id:       "PRO-02",
    dominio:  "productos",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿El campo ACTIVO en el maestro de productos distingue entre productos activos para venta, activos para compra y activos solo para consulta histórica?",
    impacto:  "El conteo de referencias activas puede ser impreciso si el campo ACTIVO no distingue entre estos estados.",
  },
  {
    id:       "PRO-03",
    dominio:  "productos",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿Existe un campo MARGEN_OBJETIVO en el maestro de productos que refleje el margen esperado por la organización para esa referencia?",
    impacto:  "El análisis de productos por margen requiere este campo para identificar referencias por encima o por debajo del objetivo.",
  },
  {
    id:       "PRO-04",
    dominio:  "productos",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿SAG maneja el campo ES_IMPORTADO o equivalente en el maestro de productos? ¿O solo está disponible el PAIS_ORIGEN?",
    impacto:  "Si solo está disponible PAIS_ORIGEN, el campo ES_IMPORTADO debe derivarse comparando PAIS_ORIGEN con el país de la organización.",
  },
];

const preguntasAccesoGeneral: OpenQuestion[] = [
  {
    id:       "GEN-01",
    dominio:  "acceso_general",
    prioridad: "crítica",
    status:   "pendiente",
    pregunta: "¿Cuál es el mecanismo de autenticación que SAG recomienda para el acceso de solo lectura a las vistas? ¿Usuario de base de datos dedicado, API key, o conexión por VPN corporativa?",
    impacto:  "La arquitectura de conexión no puede definirse hasta confirmar el mecanismo de autenticación.",
  },
  {
    id:       "GEN-02",
    dominio:  "acceso_general",
    prioridad: "crítica",
    status:   "pendiente",
    pregunta: "¿Las vistas se crearán en el ambiente de producción de SAG o en un ambiente espejo/staging? ¿Habrá un proceso de certificación antes de pasar a producción?",
    impacto:  "Determina el cronograma de implementación y los ambientes disponibles para pruebas.",
  },
  {
    id:       "GEN-03",
    dominio:  "acceso_general",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿Cuál es la ventana horaria recomendada por SAG para ejecutar procesos de consulta, sincronización o extracción de información sin afectar la operación normal del sistema?",
    impacto:  "Permite programar las sincronizaciones en horarios de baja operación, preferiblemente nocturnos, y definir tamaños de lote adecuados para minimizar cualquier impacto sobre SAG.",
  },
  {
    id:       "GEN-04",
    dominio:  "acceso_general",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿SAG puede notificar a Agentik cuando una vista ha sido actualizada (trigger o flag de timestamp), o Agentik debe hacer polling periódico?",
    impacto:  "Afecta el diseño del proceso de sincronización y la frescura de los datos en Agentik.",
  },
  {
    id:       "GEN-05",
    dominio:  "acceso_general",
    prioridad: "informativa",
    status:   "pendiente",
    pregunta: "¿Existe documentación técnica del esquema de base de datos de SAG disponible para el equipo de Agentik? ¿Diccionario de datos, ERD, o manual de tablas?",
    impacto:  "Acelera la validación de campos y reduce el número de preguntas en reuniones técnicas.",
  },
];

// ── Consolidated register ──────────────────────────────────────────────────────

export const SAG_OPEN_QUESTIONS: OpenQuestion[] = [
  ...preguntasAccesoGeneral,
  ...preguntasVentas,
  ...preguntasPagos,
  ...preguntasCartera,
  ...preguntasRecaudos,
  ...preguntasBancos,
  ...preguntasInventario,
  ...preguntasCompras,
  ...preguntasProductos,
];

// ── Query helpers ──────────────────────────────────────────────────────────────

export function getQuestionsByDomain(dominio: QuestionDomain): OpenQuestion[] {
  return SAG_OPEN_QUESTIONS.filter(q => q.dominio === dominio);
}

export function getCriticalQuestions(): OpenQuestion[] {
  return SAG_OPEN_QUESTIONS.filter(q => q.prioridad === "crítica");
}

export function getBlockingQuestions(): OpenQuestion[] {
  return SAG_OPEN_QUESTIONS.filter(q => q.status === "bloqueante");
}

export function getOpenQuestionsSummary(): {
  total:       number;
  criticas:    number;
  importantes: number;
  informativas: number;
  porDominio:  Record<QuestionDomain, number>;
} {
  const byDomain = {} as Record<QuestionDomain, number>;

  for (const q of SAG_OPEN_QUESTIONS) {
    byDomain[q.dominio] = (byDomain[q.dominio] ?? 0) + 1;
  }

  return {
    total:        SAG_OPEN_QUESTIONS.length,
    criticas:     SAG_OPEN_QUESTIONS.filter(q => q.prioridad === "crítica").length,
    importantes:  SAG_OPEN_QUESTIONS.filter(q => q.prioridad === "importante").length,
    informativas: SAG_OPEN_QUESTIONS.filter(q => q.prioridad === "informativa").length,
    porDominio:   byDomain,
  };
}

// ── Convenience: render as plain text ─────────────────────────────────────────

export function renderOpenQuestionsText(): string {
  const lines: string[] = [
    "Registro de Preguntas Abiertas — Agentik × SAG",
    "Reunión de validación técnica",
    "",
    "─".repeat(80),
    "",
  ];

  const domains: QuestionDomain[] = [
    "acceso_general",
    "ventas", "pagos", "cartera", "recaudos",
    "bancos", "inventario", "compras", "productos",
  ];

  const domainLabels: Record<QuestionDomain, string> = {
    acceso_general: "Acceso General",
    ventas:         "Dominio: Ventas",
    pagos:          "Dominio: Pagos",
    cartera:        "Dominio: Cartera",
    recaudos:       "Dominio: Recaudos",
    bancos:         "Dominio: Bancos",
    inventario:     "Dominio: Inventario",
    compras:        "Dominio: Compras",
    productos:      "Dominio: Productos",
  };

  for (const domain of domains) {
    const questions = getQuestionsByDomain(domain);
    if (questions.length === 0) continue;

    lines.push(domainLabels[domain]);
    lines.push("");

    for (const q of questions) {
      lines.push(`[${q.id}] [${q.prioridad.toUpperCase()}] ${q.pregunta}`);
      if (q.contexto) lines.push(`  Contexto: ${q.contexto}`);
      lines.push(`  Impacto: ${q.impacto}`);
      lines.push("");
    }

    lines.push("─".repeat(80));
    lines.push("");
  }

  const summary = getOpenQuestionsSummary();
  lines.push(`Total: ${summary.total} preguntas (${summary.criticas} críticas, ${summary.importantes} importantes, ${summary.informativas} informativas)`);

  return lines.join("\n");
}
