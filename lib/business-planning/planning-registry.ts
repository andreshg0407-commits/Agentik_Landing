/**
 * planning-registry.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Strategy registry — pluggable strategy factories for generating alternatives.
 *
 * Strategies are registered once and queried when a plan needs alternatives.
 * Each strategy decides if it applies to a given context and produces
 * a PlanAlternative when it does.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanAlternative } from "./plan-alternative";
import { buildPlanAlternative } from "./plan-alternative";
import type { PlanningContext } from "./plan-context";
import type { PlanStrategy } from "./planning-types";
import { buildPlanStep } from "./plan-step";
import { buildPlanCost } from "./plan-cost";
import { buildPlanBenefit } from "./plan-benefit";
import { buildPlanRisk } from "./plan-risk";
import { buildPlanConstraint } from "./plan-constraint";
import { buildPlanDependency } from "./plan-dependency";
import { buildPlanApproval } from "./plan-approval";

// -- Strategy Contract --------------------------------------------------------

/** A pluggable planning strategy. */
export interface PlanningStrategy {
  /** Strategy name (must match a PlanStrategy value). */
  name: PlanStrategy;
  /** Human-readable description. */
  description: string;
  /** Check if this strategy applies to the given context. */
  appliesTo(ctx: PlanningContext): boolean;
  /** Create a plan alternative using this strategy. */
  createAlternative(planId: string, ctx: PlanningContext): PlanAlternative;
}

// -- Registry -----------------------------------------------------------------

/** In-memory strategy registry. */
export class PlanningRegistry {
  private strategies = new Map<string, PlanningStrategy>();

  /** Register a strategy. */
  registerStrategy(strategy: PlanningStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /** Register multiple strategies. */
  registerAll(strategies: PlanningStrategy[]): void {
    for (const s of strategies) {
      this.registerStrategy(s);
    }
  }

  /** Get all registered strategies. */
  listStrategies(): PlanningStrategy[] {
    return Array.from(this.strategies.values());
  }

  /** Find strategies that apply to a given context. */
  findStrategiesForContext(ctx: PlanningContext): PlanningStrategy[] {
    return this.listStrategies().filter(s => s.appliesTo(ctx));
  }

  /** Create alternatives from all applicable strategies. */
  createAlternatives(planId: string, ctx: PlanningContext): PlanAlternative[] {
    return this.findStrategiesForContext(ctx)
      .map(s => s.createAlternative(planId, ctx));
  }

  /** Total registered strategies. */
  size(): number {
    return this.strategies.size;
  }

  /** Clear all strategies. */
  clear(): void {
    this.strategies.clear();
  }
}

// -- Built-in Strategies ------------------------------------------------------

/** Remove depleted reference from active portfolio/maleta. */
export const removePortfolioSampleStrategy: PlanningStrategy = {
  name: "remove_portfolio_sample",
  description: "Retirar muestra agotada de maleta activa",
  appliesTo: (ctx) =>
    ctx.signals.some(s => s.type === "absence_detected" && s.category === "inventory") ||
    ctx.metrics["depleted_portfolio_count"] > 0,
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Retirar muestra de maleta",
      description: "Retirar la referencia agotada de las maletas activas para evitar que vendedores ofrezcan producto sin stock",
      strategy: "remove_portfolio_sample",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Identificar maletas afectadas", description: "Buscar maletas activas con la referencia agotada", stepType: "review", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Retirar muestra", description: "Marcar la referencia como retirada en cada maleta", stepType: "remove_sample", order: 2 }),
        buildPlanStep({ alternativeId: "", title: "Notificar vendedor", description: "Informar al vendedor del retiro de muestra", stepType: "notify", order: 3 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "customers_protected", estimatedValue: 1, unit: "consistencia", description: "Vendedores no ofrecen producto agotado", confidence: 90 }),
      ],
      costs: [
        buildPlanCost({ type: "effort", amount: 30, unit: "minutos", description: "Tiempo de revision y actualizacion de maletas", confidence: 80 }),
      ],
      risks: [
        buildPlanRisk({ title: "Maleta queda sin alternativas", description: "Si la referencia era la unica en la categoria, la maleta puede quedar incompleta", probability: 30, impact: 4 }),
      ],
      approvalRequirements: [
        buildPlanApproval({ approvalType: "commercial", requiredRole: "gerente_comercial", reason: "Modificacion de maleta activa requiere aprobacion comercial" }),
      ],
      confidence: 85,
      estimatedDuration: "1h",
      expectedImpact: "Maletas actualizadas, vendedores informados",
    }),
};

/** Review and track open production orders. */
export const reviewProductionStrategy: PlanningStrategy = {
  name: "produce",
  description: "Revisar produccion abierta para la referencia",
  appliesTo: (ctx) =>
    ctx.metrics["open_production_count"] > 0 ||
    ctx.signals.some(s => s.type === "pattern_detected" && s.category === "production"),
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Revisar produccion relacionada",
      description: "Dar seguimiento a ordenes de produccion abiertas para esta referencia",
      strategy: "produce",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Consultar OPs abiertas", description: "Identificar ordenes de produccion con esta referencia", stepType: "review", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Verificar fechas estimadas", description: "Confirmar fechas de entrega de produccion", stepType: "verify", order: 2 }),
        buildPlanStep({ alternativeId: "", title: "Documentar estado", description: "Registrar estado actual de produccion", stepType: "document", order: 3 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "production_aligned", estimatedValue: 1, unit: "alineacion", description: "Produccion alineada con demanda comercial", confidence: 70 }),
      ],
      dependencies: [
        buildPlanDependency({ type: "production_complete", description: "Produccion debe completar para reabastecer", status: "pending" }),
      ],
      confidence: 70,
      estimatedDuration: "30min",
      expectedImpact: "Visibilidad de produccion y fecha estimada de reabastecimiento",
    }),
};

/** Suggest inventory transfer from another warehouse. */
export const transferInventoryStrategy: PlanningStrategy = {
  name: "transfer_inventory",
  description: "Sugerir traslado de inventario desde otra bodega",
  appliesTo: (ctx) =>
    ctx.metrics["alternative_inventory_total"] > 0,
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Traslado de inventario",
      description: "Trasladar inventario desde bodegas alternativas que tienen stock disponible",
      strategy: "transfer_inventory",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Identificar bodegas con stock", description: "Buscar bodegas con inventario disponible de la referencia", stepType: "review", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Solicitar traslado", description: "Crear solicitud de traslado entre bodegas", stepType: "transfer", order: 2 }),
        buildPlanStep({ alternativeId: "", title: "Aprobar traslado", description: "Obtener aprobacion de logistica", stepType: "approve", order: 3 }),
        buildPlanStep({ alternativeId: "", title: "Verificar recepcion", description: "Confirmar recepcion en bodega destino", stepType: "verify", order: 4 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "inventory_recovered", estimatedValue: ctx.metrics["alternative_inventory_total"] ?? 0, unit: "unidades", description: "Inventario recuperado por traslado", confidence: 75 }),
        buildPlanBenefit({ type: "orders_unblocked", estimatedValue: ctx.metrics["affected_order_count"] ?? 0, unit: "pedidos", description: "Pedidos desbloqueados", confidence: 60 }),
      ],
      costs: [
        buildPlanCost({ type: "time", amount: 2, unit: "dias", description: "Tiempo de traslado entre bodegas", confidence: 60 }),
        buildPlanCost({ type: "money", amount: 50000, unit: "COP", description: "Costo estimado de logistica", confidence: 40 }),
      ],
      risks: [
        buildPlanRisk({ title: "Demora en traslado", description: "El traslado puede demorar mas de lo estimado", probability: 40, impact: 5 }),
      ],
      approvalRequirements: [
        buildPlanApproval({ approvalType: "manager", requiredRole: "jefe_logistica", reason: "Traslados entre bodegas requieren aprobacion de logistica" }),
      ],
      constraints: [
        buildPlanConstraint({ type: "inventory", description: "Requiere stock disponible en otra bodega" }),
      ],
      confidence: 65,
      estimatedDuration: "2-3 dias",
      expectedImpact: "Reabastecimiento parcial o total de la referencia agotada",
    }),
};

/** Contact vendor about depleted reference. */
export const contactVendorStrategy: PlanningStrategy = {
  name: "contact_vendor",
  description: "Contactar vendedor sobre referencia agotada",
  appliesTo: (ctx) =>
    ctx.metrics["affected_vendor_count"] > 0 ||
    ctx.signals.some(s => s.category === "vendor"),
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Contactar vendedor",
      description: "Informar al vendedor sobre la referencia agotada y coordinar acciones",
      strategy: "contact_vendor",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Identificar vendedores afectados", description: "Listar vendedores con esta referencia en su portafolio", stepType: "review", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Contactar vendedor", description: "Comunicar situacion al vendedor", stepType: "contact", order: 2 }),
        buildPlanStep({ alternativeId: "", title: "Documentar respuesta", description: "Registrar respuesta y acuerdos", stepType: "document", order: 3 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "customer_satisfaction", estimatedValue: 1, unit: "proactividad", description: "Vendedor informado proactivamente", confidence: 85 }),
      ],
      costs: [
        buildPlanCost({ type: "effort", amount: 15, unit: "minutos", description: "Tiempo de comunicacion por vendedor", confidence: 90 }),
      ],
      confidence: 80,
      estimatedDuration: "1h",
      expectedImpact: "Vendedores informados, expectativas ajustadas",
    }),
};

/** Escalate to management when impact exceeds threshold. */
export const escalateStrategy: PlanningStrategy = {
  name: "escalate_to_management",
  description: "Escalar a gerencia cuando el impacto supera umbral",
  appliesTo: (ctx) =>
    (ctx.metrics["affected_order_count"] ?? 0) >= 5 ||
    ctx.ruleResults.some(r => r.suggestedOutcomes.some(o => o.severity === "critical")),
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Escalar a gerencia",
      description: "Informar a gerencia sobre situacion critica que afecta multiples pedidos o clientes",
      strategy: "escalate_to_management",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Preparar reporte de impacto", description: "Consolidar datos de impacto comercial", stepType: "document", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Notificar gerencia", description: "Enviar reporte a gerencia para decision", stepType: "escalate", order: 2 }),
        buildPlanStep({ alternativeId: "", title: "Esperar decision", description: "Aguardar respuesta de gerencia", stepType: "wait", order: 3 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "risk_reduced", estimatedValue: 1, unit: "visibilidad", description: "Gerencia informada de situacion critica", confidence: 95 }),
      ],
      approvalRequirements: [
        buildPlanApproval({ approvalType: "admin", requiredRole: "gerente_general", reason: "Situacion critica requiere atencion de gerencia", blocking: false }),
      ],
      confidence: 90,
      estimatedDuration: "variable",
      expectedImpact: "Decision gerencial sobre situacion critica",
    }),
};

/** Wait for production to complete. */
export const waitForProductionStrategy: PlanningStrategy = {
  name: "wait_for_production",
  description: "Esperar produccion en curso para reabastecimiento",
  appliesTo: (ctx) =>
    ctx.metrics["open_production_count"] > 0,
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Esperar produccion",
      description: "Si existe produccion abierta cercana a entrega, esperar reabastecimiento natural",
      strategy: "wait_for_production",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Verificar fecha de entrega", description: "Confirmar fecha estimada de produccion", stepType: "verify", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Monitorear avance", description: "Dar seguimiento al avance de produccion", stepType: "wait", order: 2 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "inventory_recovered", estimatedValue: 1, unit: "reabastecimiento", description: "Inventario se recupera por produccion natural", confidence: 60 }),
      ],
      costs: [
        buildPlanCost({ type: "time", amount: 5, unit: "dias", description: "Tiempo de espera estimado", confidence: 40 }),
      ],
      risks: [
        buildPlanRisk({ title: "Demora en produccion", description: "La produccion puede atrasarse", probability: 50, impact: 6 }),
      ],
      dependencies: [
        buildPlanDependency({ type: "production_complete", description: "Produccion debe completar en tiempo estimado", status: "pending" }),
      ],
      confidence: 55,
      estimatedDuration: "3-7 dias",
      expectedImpact: "Reabastecimiento natural sin intervencion adicional",
    }),
};

/** Review data quality before taking action. */
export const reviewDataStrategy: PlanningStrategy = {
  name: "review_data",
  description: "Revisar calidad de datos antes de actuar",
  appliesTo: (ctx) =>
    ctx.constraints["data_quality_issues"] !== undefined ||
    ctx.ruleResults.some(r => r.matchedEvaluations.some(e => e.evidence.confidence < 50)),
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Revisar calidad de datos",
      description: "Verificar que los datos base son correctos antes de tomar decisiones",
      strategy: "review_data",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Auditar datos fuente", description: "Verificar datos de inventario, pedidos y produccion en SAG", stepType: "review", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Corregir discrepancias", description: "Si se encuentran errores, corregir en fuente", stepType: "verify", order: 2 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "risk_reduced", estimatedValue: 1, unit: "precision", description: "Decisiones basadas en datos correctos", confidence: 95 }),
      ],
      confidence: 90,
      estimatedDuration: "2h",
      expectedImpact: "Datos verificados, decisiones con mayor confianza",
    }),
};

/** Do nothing — maintain current state. */
export const doNothingStrategy: PlanningStrategy = {
  name: "do_nothing",
  description: "No tomar accion, mantener estado actual",
  appliesTo: () => true,
  createAlternative: (planId) =>
    buildPlanAlternative({
      planId,
      title: "No tomar accion",
      description: "Mantener el estado actual sin intervencion. Monitorear la situacion.",
      strategy: "do_nothing",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Monitorear situacion", description: "Seguir observando indicadores relevantes", stepType: "wait", order: 1 }),
      ],
      risks: [
        buildPlanRisk({ title: "Situacion se agrava", description: "Sin intervencion, la situacion puede empeorar", probability: 60, impact: 5 }),
      ],
      confidence: 100,
      estimatedDuration: "indefinido",
      expectedImpact: "Sin cambio — riesgo de deterioro",
    }),
};

/** Contact customer about affected orders. */
export const contactCustomerStrategy: PlanningStrategy = {
  name: "contact_customer",
  description: "Contactar clientes con pedidos afectados",
  appliesTo: (ctx) =>
    (ctx.metrics["affected_customer_count"] ?? 0) > 0,
  createAlternative: (planId, ctx) =>
    buildPlanAlternative({
      planId,
      title: "Contactar clientes afectados",
      description: "Informar a clientes con pedidos afectados sobre la situacion y alternativas",
      strategy: "contact_customer",
      steps: [
        buildPlanStep({ alternativeId: "", title: "Identificar clientes", description: "Listar clientes con pedidos que contienen la referencia agotada", stepType: "review", order: 1 }),
        buildPlanStep({ alternativeId: "", title: "Preparar comunicacion", description: "Redactar mensaje informativo con alternativas", stepType: "document", order: 2 }),
        buildPlanStep({ alternativeId: "", title: "Contactar clientes", description: "Enviar comunicacion a clientes afectados", stepType: "contact", order: 3 }),
      ],
      benefits: [
        buildPlanBenefit({ type: "customer_satisfaction", estimatedValue: 1, unit: "transparencia", description: "Clientes informados proactivamente", confidence: 85 }),
      ],
      costs: [
        buildPlanCost({ type: "effort", amount: 20, unit: "minutos/cliente", description: "Tiempo de comunicacion por cliente", confidence: 80 }),
      ],
      approvalRequirements: [
        buildPlanApproval({ approvalType: "commercial", requiredRole: "gerente_comercial", reason: "Comunicacion a clientes requiere aprobacion comercial" }),
      ],
      confidence: 80,
      estimatedDuration: "2h",
      expectedImpact: "Clientes informados, relacion comercial protegida",
    }),
};

// -- Default strategies -------------------------------------------------------

/** All built-in strategies. Register with PlanningRegistry. */
export const DEFAULT_STRATEGIES: PlanningStrategy[] = [
  removePortfolioSampleStrategy,
  reviewProductionStrategy,
  transferInventoryStrategy,
  contactVendorStrategy,
  contactCustomerStrategy,
  escalateStrategy,
  waitForProductionStrategy,
  reviewDataStrategy,
  doNothingStrategy,
];
