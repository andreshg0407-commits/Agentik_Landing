// AGENTIK-STRATEGIC-PLANNING-01 — Phase 35: Canonical Planning Scenarios
// 15 canonical business plans mapped to the 15 CanonicalPlanType values.
// Pure domain data — no Prisma, no server-only.

import type { CanonicalPlanType, PlanningPriority, PlanningHorizon, StrategicDomain } from "./strategic-planning-types";

export interface CanonicalPlanningScenario {
  readonly type:              CanonicalPlanType;
  readonly title:             string;
  readonly description:       string;
  readonly domain:            StrategicDomain;
  readonly priority:          PlanningPriority;
  readonly horizon:           PlanningHorizon;
  readonly objectiveTitles:   string[];
  readonly initiativeTitles:  string[];
  readonly riskLabels:        string[];
  readonly opportunityLabels: string[];
  readonly limitations:       string[];
}

export const CANONICAL_PLANNING_SCENARIOS: CanonicalPlanningScenario[] = [
  {
    type:        "REDUCIR_CARTERA",
    title:       "Plan de Reducción de Cartera Vencida",
    description: "Reducir el nivel de cartera vencida mejorando los procesos de cobranza, seguimiento y recuperación.",
    domain:      "FINANCE",
    priority:    "CRITICAL",
    horizon:     "SHORT_TERM",
    objectiveTitles:   ["Reducir cartera vencida en 30%", "Mejorar tasa de recuperación"],
    initiativeTitles:  ["Automatizar recordatorios de pago", "Segmentar clientes por riesgo", "Implementar acuerdos de pago"],
    riskLabels:        ["Resistencia de clientes a renegociación", "Impacto en relaciones comerciales"],
    opportunityLabels: ["Mejora en flujo de caja", "Fortalecimiento de relaciones con clientes cumplidores"],
    limitations:       ["No incluye cancelación de deudas", "Requiere validación legal para acuerdos de pago"],
  },
  {
    type:        "MEJORAR_LIQUIDEZ",
    title:       "Plan de Mejora de Liquidez Operativa",
    description: "Fortalecer la posición de liquidez a corto y mediano plazo mediante optimización del ciclo de efectivo.",
    domain:      "FINANCE",
    priority:    "HIGH",
    horizon:     "SHORT_TERM",
    objectiveTitles:   ["Aumentar reserva de efectivo", "Reducir ciclo de conversión de efectivo"],
    initiativeTitles:  ["Negociar plazos con proveedores", "Acelerar cobranza", "Revisar política de inventario"],
    riskLabels:        ["Tensión en relación con proveedores", "Estacionalidad del flujo"],
    opportunityLabels: ["Mayor capacidad de inversión", "Reducción de necesidad de crédito"],
    limitations:       ["No incluye decisiones de financiamiento externo", "Proyecciones son estimaciones"],
  },
  {
    type:        "INCREMENTAR_VENTAS",
    title:       "Plan de Incremento de Ventas",
    description: "Aumentar el volumen y valor de ventas mediante estrategias de prospección, conversión y retención.",
    domain:      "COMMERCIAL",
    priority:    "HIGH",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Crecer ventas en 20%", "Mejorar tasa de conversión"],
    initiativeTitles:  ["Fortalecer equipo de ventas", "Optimizar proceso de prospección", "Implementar CRM"],
    riskLabels:        ["Presión competitiva de precios", "Capacidad operativa insuficiente"],
    opportunityLabels: ["Captura de nuevos segmentos", "Incremento en ticket promedio"],
    limitations:       ["No incluye cambios de precio sin aprobación", "Proyecciones sujetas a condición de mercado"],
  },
  {
    type:        "EXPANDIR_MERCADO",
    title:       "Plan de Expansión de Mercado",
    description: "Penetrar nuevos mercados geográficos o segmentos de clientes para diversificar la base comercial.",
    domain:      "COMMERCIAL",
    priority:    "MEDIUM",
    horizon:     "LONG_TERM",
    objectiveTitles:   ["Ingresar a 2 nuevos mercados", "Diversificar base de clientes"],
    initiativeTitles:  ["Investigación de mercado", "Desarrollo de oferta localizada", "Alianzas estratégicas"],
    riskLabels:        ["Barreras de entrada regulatorias", "Diferencias culturales y operativas"],
    opportunityLabels: ["Primera posición en mercado nuevo", "Reducción de dependencia de mercado actual"],
    limitations:       ["Requiere análisis legal por mercado", "Plazos sujetos a validación externa"],
  },
  {
    type:        "ABRIR_SUCURSAL",
    title:       "Plan de Apertura de Nueva Sucursal",
    description: "Planificar y preparar la apertura de una nueva ubicación comercial para ampliar presencia.",
    domain:      "OPERATIONS",
    priority:    "MEDIUM",
    horizon:     "LONG_TERM",
    objectiveTitles:   ["Definir ubicación óptima", "Preparar operaciones para nueva sucursal"],
    initiativeTitles:  ["Análisis de viabilidad de ubicaciones", "Plan de dotación de personal", "Gestión de permisos"],
    riskLabels:        ["Costos de apertura superiores a lo estimado", "Bajo tráfico inicial"],
    opportunityLabels: ["Captura de nueva zona de influencia", "Economías de escala"],
    limitations:       ["No incluye aprobación de presupuesto", "Requiere validación inmobiliaria"],
  },
  {
    type:        "OPTIMIZAR_INVENTARIO",
    title:       "Plan de Optimización de Inventario",
    description: "Reducir capital inmovilizado en inventario sin comprometer disponibilidad de producto.",
    domain:      "OPERATIONS",
    priority:    "MEDIUM",
    horizon:     "SHORT_TERM",
    objectiveTitles:   ["Reducir inventario en 25%", "Mejorar rotación de inventario"],
    initiativeTitles:  ["Clasificación ABC de productos", "Revisión de puntos de reorden", "Gestión de productos de baja rotación"],
    riskLabels:        ["Quiebres de stock en productos críticos", "Pérdidas por obsolescencia"],
    opportunityLabels: ["Liberación de capital de trabajo", "Mejora en espacio de almacenamiento"],
    limitations:       ["No aplica a productos bajo contrato de suministro fijo", "Datos de demanda pueden tener rezago"],
  },
  {
    type:        "REDUCIR_COSTOS",
    title:       "Plan de Reducción de Costos Operativos",
    description: "Identificar y ejecutar oportunidades de reducción de costos sin impactar la calidad del servicio.",
    domain:      "FINANCE",
    priority:    "HIGH",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Reducir costos en 15%", "Identificar gastos no esenciales"],
    initiativeTitles:  ["Auditoría de gastos operativos", "Renegociación de contratos", "Automatización de procesos manuales"],
    riskLabels:        ["Impacto en moral del equipo", "Reducción de calidad de servicio"],
    opportunityLabels: ["Mejora en margen operativo", "Mayor eficiencia operacional"],
    limitations:       ["No incluye reducción de personal sin proceso de RRHH", "Ahorro proyectado es estimado"],
  },
  {
    type:        "MEJORAR_MARKETING",
    title:       "Plan de Mejora de Marketing y Posicionamiento",
    description: "Fortalecer la presencia de marca, comunicación y generación de demanda mediante canales digitales y tradicionales.",
    domain:      "MARKETING",
    priority:    "MEDIUM",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Aumentar reconocimiento de marca", "Mejorar generación de leads"],
    initiativeTitles:  ["Estrategia de contenido digital", "Campaña de redes sociales", "Optimización de pauta"],
    riskLabels:        ["Baja conversión de campañas", "Saturación de mercado"],
    opportunityLabels: ["Posicionamiento diferenciado", "Generación de comunidad de marca"],
    limitations:       ["No incluye compromisos de presupuesto de marketing", "Resultados de marca son a mediano plazo"],
  },
  {
    type:        "DIGITALIZACION_OPERATIVA",
    title:       "Plan de Digitalización Operativa",
    description: "Transformar procesos manuales y en papel a flujos digitales para mejorar eficiencia y trazabilidad.",
    domain:      "TECHNOLOGY",
    priority:    "HIGH",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Digitalizar 5 procesos clave", "Reducir trabajo manual en 40%"],
    initiativeTitles:  ["Mapeo de procesos actuales", "Selección e implementación de herramientas", "Capacitación del equipo"],
    riskLabels:        ["Resistencia al cambio", "Curva de aprendizaje"],
    opportunityLabels: ["Trazabilidad total de operaciones", "Reducción de errores humanos"],
    limitations:       ["Requiere conectividad y dispositivos adecuados", "No incluye cambio de sistemas core sin aprobación"],
  },
  {
    type:        "MEJORAR_COBRANZA",
    title:       "Plan de Mejora del Proceso de Cobranza",
    description: "Optimizar el proceso de cobranza para reducir días de cobro y mejorar la predictibilidad del flujo de caja.",
    domain:      "FINANCE",
    priority:    "HIGH",
    horizon:     "SHORT_TERM",
    objectiveTitles:   ["Reducir días de cobro (DSO)", "Mejorar tasa de cobro al vencimiento"],
    initiativeTitles:  ["Automatizar comunicaciones de cobro", "Definir política de cobranza escalonada", "Segmentar cartera por comportamiento"],
    riskLabels:        ["Pérdida de clientes sensibles a contacto de cobro", "Saturación de equipo de cobranza"],
    opportunityLabels: ["Mayor previsibilidad financiera", "Reducción de provisiones de cartera"],
    limitations:       ["No incluye castigo de cartera", "Segmentación depende de calidad de datos"],
  },
  {
    type:        "INCREMENTAR_RENTABILIDAD",
    title:       "Plan de Incremento de Rentabilidad",
    description: "Mejorar márgenes y rentabilidad mediante optimización de mix de productos, precios y estructura de costos.",
    domain:      "FINANCE",
    priority:    "HIGH",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Mejorar margen bruto en 5pp", "Identificar líneas de alta rentabilidad"],
    initiativeTitles:  ["Análisis de rentabilidad por producto", "Revisión de política de precios", "Optimización de mix"],
    riskLabels:        ["Impacto en volumen por cambio de precios", "Pérdida de clientes sensibles a precio"],
    opportunityLabels: ["Crecimiento de rentabilidad sin incremento de volumen", "Mejor foco en categorías clave"],
    limitations:       ["Análisis de precios no incluye cambios automáticos", "Datos de margen requieren validación contable"],
  },
  {
    type:        "EXPANDIR_CANALES",
    title:       "Plan de Expansión de Canales de Venta",
    description: "Diversificar los canales de distribución y venta para reducir dependencia y ampliar alcance.",
    domain:      "COMMERCIAL",
    priority:    "MEDIUM",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Activar 2 nuevos canales de venta", "Reducir dependencia del canal principal"],
    initiativeTitles:  ["Evaluación de canales alternativos", "Plan de activación digital", "Programa de distribuidores"],
    riskLabels:        ["Conflicto de canal", "Costo de habilitación de nuevos canales"],
    opportunityLabels: ["Incremento en cobertura de mercado", "Diversificación de riesgo comercial"],
    limitations:       ["No incluye compromisos contractuales con nuevos socios", "Plazos de activación son estimados"],
  },
  {
    type:        "FORTALECER_RETENCION",
    title:       "Plan de Fortalecimiento de Retención de Clientes",
    description: "Reducir la tasa de deserción y aumentar el valor de vida del cliente mediante estrategias de fidelización.",
    domain:      "COMMERCIAL",
    priority:    "HIGH",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Reducir tasa de churn en 20%", "Aumentar NPS y satisfacción"],
    initiativeTitles:  ["Programa de fidelización", "Mejora de atención post-venta", "Encuestas de satisfacción"],
    riskLabels:        ["Costo de programa de fidelización", "Expectativas no cumplidas"],
    opportunityLabels: ["Incremento de LTV", "Referidos por clientes satisfechos"],
    limitations:       ["No incluye decisiones de compensación sin aprobación", "NPS tarda en reflejar cambios"],
  },
  {
    type:        "AUMENTAR_PRODUCTIVIDAD",
    title:       "Plan de Aumento de Productividad del Equipo",
    description: "Mejorar la productividad del equipo humano mediante capacitación, herramientas y optimización de procesos.",
    domain:      "PEOPLE",
    priority:    "MEDIUM",
    horizon:     "MEDIUM_TERM",
    objectiveTitles:   ["Incrementar productividad por persona en 15%", "Reducir cuellos de botella operativos"],
    initiativeTitles:  ["Diagnóstico de productividad", "Plan de capacitación", "Implementación de herramientas de colaboración"],
    riskLabels:        ["Resistencia a nuevas herramientas", "Carga de trabajo durante transición"],
    opportunityLabels: ["Mayor capacidad sin incremento de headcount", "Mejor clima laboral"],
    limitations:       ["No incluye cambios estructurales de organización", "Métricas de productividad requieren baseline"],
  },
  {
    type:        "EXPANSION_INTERNACIONAL",
    title:       "Plan de Expansión Internacional",
    description: "Evaluar y planificar la entrada a mercados internacionales como estrategia de crecimiento de largo plazo.",
    domain:      "COMMERCIAL",
    priority:    "MEDIUM",
    horizon:     "LONG_TERM",
    objectiveTitles:   ["Evaluar viabilidad de 3 mercados internacionales", "Definir modelo de entrada"],
    initiativeTitles:  ["Análisis de mercado internacional", "Evaluación legal y regulatoria", "Modelo de negocio adaptado"],
    riskLabels:        ["Riesgo regulatorio y cambiario", "Complejidad operativa internacional"],
    opportunityLabels: ["Diversificación geográfica de ingresos", "Marca global"],
    limitations:       ["Requiere asesoría legal por jurisdicción", "Plazos de entrada son de largo aliento"],
  },
];

export function getCanonicalScenario(type: CanonicalPlanType): CanonicalPlanningScenario | undefined {
  return CANONICAL_PLANNING_SCENARIOS.find((s) => s.type === type);
}

export function buildAllCanonicalScenaries(): CanonicalPlanningScenario[] {
  return CANONICAL_PLANNING_SCENARIOS;
}

export function getScenariosByDomain(domain: StrategicDomain): CanonicalPlanningScenario[] {
  return CANONICAL_PLANNING_SCENARIOS.filter((s) => s.domain === domain);
}

export function getScenariosByPriority(priority: PlanningPriority): CanonicalPlanningScenario[] {
  return CANONICAL_PLANNING_SCENARIOS.filter((s) => s.priority === priority);
}
