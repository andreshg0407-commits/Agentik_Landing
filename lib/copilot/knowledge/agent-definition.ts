/**
 * lib/copilot/knowledge/agent-definition.ts
 *
 * Agentik Knowledge Foundation — Agent Definition Layer
 * Sprint: AGENTIK-COPILOT-KNOWLEDGE-FOUNDATION-01
 *
 * Structural model for specialized Agentik agents.
 * Agents CONSUME the Domain, Entity, Capability, and Action registries.
 * They do NOT implement business logic — they declare what they know
 * and what they can do, by referencing the knowledge foundation.
 *
 * The intelligence lives in the foundation. Not in the agents.
 */

import type { DomainId } from "./domain-registry";
import type { CapabilityId } from "./capability-registry";
import type { ActionId } from "./action-registry";

// ── Agent ID union ─────────────────────────────────────────────────────────────

export type KnowledgeAgentId =
  | "luca"    // Marketing & Creative
  | "diego"   // Finance & Reconciliation
  | "mila"    // Commercial & Collections
  | "sofia"   // Integrations & Technical
  | "laura"   // Operations & Inventory
  | "pablo"   // Procurement & Supply Chain
  | "david";  // Executive & Strategic

// ── Agent persona ──────────────────────────────────────────────────────────────

export type AgentTone =
  | "analitico"
  | "ejecutivo"
  | "comercial"
  | "tecnico"
  | "operativo"
  | "creativo";

export interface AgentPersona {
  nombre:      string;
  rol:         string;
  descripcion: string;
  tono:        AgentTone;
}

// ── Agent knowledge definition ─────────────────────────────────────────────────

export interface AgentKnowledgeDefinition {
  id:                 KnowledgeAgentId;
  persona:            AgentPersona;
  primaryDomains:     DomainId[];        // Domains this agent owns and specializes in
  secondaryDomains:   DomainId[];        // Domains this agent monitors but doesn't own
  capabilities:       CapabilityId[];    // Subset of BUSINESS_CAPABILITY_REGISTRY
  actions:            ActionId[];        // Subset of ACTION_REGISTRY this agent can trigger
  watchedSignals:     string[];          // Domain-prefixed signal identifiers to observe
  escalatesToAgent?:  KnowledgeAgentId; // Agent to escalate to when outside scope
}

// ── Registry ───────────────────────────────────────────────────────────────────

export const AGENT_KNOWLEDGE_REGISTRY: Record<KnowledgeAgentId, AgentKnowledgeDefinition> = {

  luca: {
    id: "luca",
    persona: {
      nombre:      "Luca",
      rol:         "Director Creativo de Marketing",
      descripcion: "Especialista en campañas, contenido y analítica de demanda. " +
                   "Genera, distribuye y mide el impacto de iniciativas de marketing.",
      tono:        "creativo",
    },
    primaryDomains:   ["marketing", "productos"],
    secondaryDomains: ["ventas", "clientes"],
    capabilities: [
      "marketing.generate_content",
      "marketing.schedule_post",
      "marketing.analyze_performance",
      "marketing.measure_conversion",
      "ventas.rank_products",
      "clientes.segment_by_value",
    ],
    actions: [
      "generate_photo",
      "generate_video",
      "schedule_post",
      "create_task",
      "generate_report",
    ],
    watchedSignals:   ["marketing.campaign_at_risk", "marketing.content_pending", "ventas.demand_drop"],
    escalatesToAgent: "diego",
  },

  diego: {
    id: "diego",
    persona: {
      nombre:      "Diego",
      rol:         "Inteligencia Financiera",
      descripcion: "Especialista en finanzas, tesorería, conciliación y cierre contable. " +
                   "Analiza flujos de caja, cartera y posición bancaria.",
      tono:        "analitico",
    },
    primaryDomains:   ["bancos", "conciliacion", "cartera", "pagos", "recaudos"],
    secondaryDomains: ["ventas", "compras", "tareas"],
    capabilities: [
      "bancos.query_movements",
      "bancos.calculate_balance",
      "bancos.detect_unreconciled",
      "bancos.support_reconciliation",
      "conciliacion.reconcile_movements",
      "conciliacion.detect_exceptions",
      "conciliacion.generate_close_report",
      "cartera.detect_overdue",
      "cartera.prioritize_collection",
      "cartera.calculate_aging",
      "cartera.project_cashflow",
      "pagos.track_payments",
      "pagos.detect_unapplied",
      "recaudos.detect_unreconciled",
      "alertas.generate_alert",
    ],
    actions: [
      "generate_report",
      "create_alert",
      "create_task",
      "flag_for_review",
      "close_reconciliation_item",
      "request_approval",
    ],
    watchedSignals: [
      "bancos.unreconciled_movements",
      "cartera.critical_overdue",
      "conciliacion.exceptions_pending",
      "pagos.unapplied_payments",
    ],
    escalatesToAgent: "david",
  },

  mila: {
    id: "mila",
    persona: {
      nombre:      "Mila",
      rol:         "Inteligencia Comercial",
      descripcion: "Especialista en seguimiento de cartera, cobros y comunicación con clientes. " +
                   "Prioriza la gestión comercial y el flujo del pipeline de ventas.",
      tono:        "comercial",
    },
    primaryDomains:   ["clientes", "cartera", "ventas"],
    secondaryDomains: ["pagos", "tareas", "alertas"],
    capabilities: [
      "clientes.segment_by_value",
      "clientes.detect_churn_risk",
      "clientes.analyze_payment_behavior",
      "cartera.detect_overdue",
      "cartera.prioritize_collection",
      "cartera.calculate_aging",
      "ventas.analyze_performance",
      "ventas.rank_customers",
      "tareas.track_open_tasks",
    ],
    actions: [
      "draft_collection_message",
      "send_whatsapp",
      "create_task",
      "assign_task",
      "create_alert",
      "generate_report",
    ],
    watchedSignals: [
      "cartera.overdue_high_value",
      "clientes.churn_risk",
      "ventas.pipeline_stalled",
    ],
    escalatesToAgent: "diego",
  },

  sofia: {
    id: "sofia",
    persona: {
      nombre:      "Sofía",
      rol:         "Inteligencia de Integraciones",
      descripcion: "Especialista en conectores, sincronización de datos y salud de integraciones. " +
                   "Monitorea el estado de los sistemas externos y la calidad del dato.",
      tono:        "tecnico",
    },
    primaryDomains:   [],    // Sofía opera en la capa de plataforma, no en dominios de negocio
    secondaryDomains: ["inventario", "ventas", "compras"],
    capabilities: [
      "inventario.check_stock",
      "ventas.analyze_performance",
      "compras.track_open_orders",
    ],
    actions: [
      "create_alert",
      "create_task",
      "flag_for_review",
      "launch_workflow",
    ],
    watchedSignals: [
      "integration.sync_failed",
      "integration.connector_degraded",
      "integration.data_quality_alert",
    ],
    escalatesToAgent: "david",
  },

  laura: {
    id: "laura",
    persona: {
      nombre:      "Laura",
      rol:         "Inteligencia Operativa de Inventario",
      descripcion: "Especialista en inventario, productos y abastecimiento operativo. " +
                   "Detecta quiebres de stock, sobreinventario y necesidades de reposición.",
      tono:        "operativo",
    },
    primaryDomains:   ["inventario", "productos"],
    secondaryDomains: ["compras", "ventas", "produccion"],
    capabilities: [
      "inventario.check_stock",
      "inventario.detect_stockout",
      "inventario.calculate_coverage",
      "inventario.flag_overstock",
      "productos.analyze_margin",
      "productos.detect_low_rotation",
      "productos.cross_domain_traceability",
    ],
    actions: [
      "create_purchase_suggestion",
      "create_alert",
      "create_task",
      "generate_report",
      "export_data",
    ],
    watchedSignals: [
      "inventario.stockout_detected",
      "inventario.coverage_critical",
      "inventario.overstock_detected",
    ],
    escalatesToAgent: "pablo",
  },

  pablo: {
    id: "pablo",
    persona: {
      nombre:      "Pablo",
      rol:         "Inteligencia de Compras y Proveedores",
      descripcion: "Especialista en órdenes de compra, proveedores y cadena de abastecimiento. " +
                   "Monitorea el cumplimiento de proveedores y las necesidades de reposición.",
      tono:        "operativo",
    },
    primaryDomains:   ["compras"],
    secondaryDomains: ["inventario", "productos"],
    capabilities: [
      "compras.track_open_orders",
      "compras.detect_overdue_orders",
      "compras.analyze_supplier_performance",
      "inventario.calculate_coverage",
      "productos.cross_domain_traceability",
    ],
    actions: [
      "create_purchase_suggestion",
      "create_task",
      "create_alert",
      "request_approval",
      "generate_report",
    ],
    watchedSignals: [
      "compras.overdue_orders",
      "compras.supplier_sla_breach",
      "inventario.replenishment_needed",
    ],
    escalatesToAgent: "diego",
  },

  david: {
    id: "david",
    persona: {
      nombre:      "David",
      rol:         "Inteligencia Ejecutiva",
      descripcion: "Visión estratégica y ejecutiva del negocio. Consolida señales de todos los " +
                   "dominios para producir briefings ejecutivos y recomendaciones estratégicas.",
      tono:        "ejecutivo",
    },
    primaryDomains:   ["alertas", "tareas"],
    secondaryDomains: ["ventas", "cartera", "bancos", "inventario", "marketing", "compras"],
    capabilities: [
      "ventas.analyze_performance",
      "ventas.detect_trends",
      "cartera.detect_overdue",
      "cartera.project_cashflow",
      "bancos.calculate_balance",
      "inventario.calculate_coverage",
      "alertas.prioritize",
      "tareas.track_open_tasks",
      "tareas.detect_overdue",
    ],
    actions: [
      "generate_report",
      "create_alert",
      "create_task",
      "request_approval",
      "export_data",
    ],
    watchedSignals: [
      "global.critical_alerts",
      "ventas.revenue_at_risk",
      "cartera.cashflow_risk",
      "bancos.low_balance",
    ],
    escalatesToAgent: undefined,
  },
};

// ── Accessors ──────────────────────────────────────────────────────────────────

export function getAgentDefinition(id: KnowledgeAgentId): AgentKnowledgeDefinition {
  return AGENT_KNOWLEDGE_REGISTRY[id];
}

export function getAllAgentDefinitions(): AgentKnowledgeDefinition[] {
  return Object.values(AGENT_KNOWLEDGE_REGISTRY);
}

export function getAgentsForDomain(domainId: DomainId): AgentKnowledgeDefinition[] {
  return getAllAgentDefinitions().filter(a =>
    a.primaryDomains.includes(domainId) || a.secondaryDomains.includes(domainId)
  );
}

export function getAgentsForCapability(capabilityId: CapabilityId): AgentKnowledgeDefinition[] {
  return getAllAgentDefinitions().filter(a => a.capabilities.includes(capabilityId));
}
