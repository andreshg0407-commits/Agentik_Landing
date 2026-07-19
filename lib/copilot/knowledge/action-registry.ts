/**
 * lib/copilot/knowledge/action-registry.ts
 *
 * Agentik Knowledge Foundation — Action Registry
 * Sprint: AGENTIK-COPILOT-KNOWLEDGE-FOUNDATION-01
 *
 * Defines executable actions available to Agentik Copilot.
 * Actions represent real execution — distinct from Capabilities,
 * which represent knowledge and analysis.
 *
 * Medium/high-risk actions require human confirmation before execution.
 */

import type { CapabilityId } from "./capability-registry";

// ── Action ID union ────────────────────────────────────────────────────────────

export type ActionId =
  | "create_task"
  | "create_alert"
  | "generate_report"
  | "request_approval"
  | "launch_workflow"
  | "generate_photo"
  | "generate_video"
  | "send_whatsapp"
  | "schedule_post"
  | "create_purchase_suggestion"
  | "export_data"
  | "flag_for_review"
  | "assign_task"
  | "close_reconciliation_item"
  | "draft_collection_message";

// ── Action category ────────────────────────────────────────────────────────────

export type ActionCategory =
  | "task_management"     // Creating, assigning, tracking tasks
  | "communication"       // Sending messages, notifications
  | "content_generation"  // Producing creative or documentary content
  | "workflow"            // Launching or coordinating automated workflows
  | "reporting"           // Generating structured reports
  | "procurement"         // Purchase and supply chain actions
  | "reconciliation"      // Financial reconciliation actions
  | "moderation";         // Review, approval, flagging

// ── Risk level ─────────────────────────────────────────────────────────────────

export type ActionRisk = "low" | "medium" | "high";

// ── Action parameter ───────────────────────────────────────────────────────────

export interface ActionParameter {
  name:        string;
  type:        "string" | "number" | "boolean" | "date" | "reference" | "enum";
  required:    boolean;
  descripcion: string;
  enumValues?: string[];
}

// ── Action definition ──────────────────────────────────────────────────────────

export interface ActionDefinition {
  id:                   ActionId;
  name:                 string;
  descripcion:          string;
  category:             ActionCategory;
  requiredCapabilities: CapabilityId[];
  parameters:           ActionParameter[];
  riskLevel:            ActionRisk;
  requiresConfirmation: boolean;
  reversible:           boolean;
}

// ── Registry ───────────────────────────────────────────────────────────────────

export const ACTION_REGISTRY: Record<ActionId, ActionDefinition> = {

  create_task: {
    id:                   "create_task",
    name:                 "Crear tarea",
    descripcion:          "Crea una tarea operacional asignada a un usuario o agente.",
    category:             "task_management",
    requiredCapabilities: [],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "titulo",       type: "string", required: true,  descripcion: "Título de la tarea." },
      { name: "asignado_a",   type: "string", required: false, descripcion: "Usuario o agente responsable." },
      { name: "prioridad",    type: "enum",   required: true,  descripcion: "Prioridad.", enumValues: ["baja", "media", "alta", "critica"] },
      { name: "fecha_limite", type: "date",   required: false, descripcion: "Fecha límite." },
      { name: "dominio",      type: "string", required: false, descripcion: "Dominio de origen." },
    ],
  },

  create_alert: {
    id:                   "create_alert",
    name:                 "Crear alerta",
    descripcion:          "Genera una alerta operacional con nivel de severidad.",
    category:             "task_management",
    requiredCapabilities: ["alertas.generate_alert"],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "tipo",       type: "string", required: true,  descripcion: "Tipo de alerta." },
      { name: "severidad",  type: "enum",   required: true,  descripcion: "Nivel de severidad.", enumValues: ["info", "warning", "critical"] },
      { name: "mensaje",    type: "string", required: true,  descripcion: "Mensaje de la alerta." },
      { name: "dominio",    type: "string", required: true,  descripcion: "Dominio de origen." },
      { name: "entidad_id", type: "string", required: false, descripcion: "ID de la entidad relacionada." },
    ],
  },

  generate_report: {
    id:                   "generate_report",
    name:                 "Generar reporte",
    descripcion:          "Produce un reporte estructurado a partir de los datos del dominio activo.",
    category:             "reporting",
    requiredCapabilities: [],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "tipo_reporte", type: "enum", required: true,  descripcion: "Tipo de reporte.", enumValues: ["resumen_ventas", "aging_cartera", "saldo_inventario", "flujo_tesoreria", "conciliacion"] },
      { name: "fecha_desde",  type: "date", required: true,  descripcion: "Fecha de inicio del período." },
      { name: "fecha_hasta",  type: "date", required: true,  descripcion: "Fecha de fin del período." },
      { name: "formato",      type: "enum", required: false, descripcion: "Formato.", enumValues: ["pdf", "excel", "pantalla"] },
    ],
  },

  request_approval: {
    id:                   "request_approval",
    name:                 "Solicitar aprobación",
    descripcion:          "Envía una solicitud de aprobación a un responsable definido.",
    category:             "moderation",
    requiredCapabilities: [],
    riskLevel:            "medium",
    requiresConfirmation: true,
    reversible:           false,
    parameters: [
      { name: "concepto",     type: "string",  required: true,  descripcion: "Descripción de lo que se aprueba." },
      { name: "aprobador_id", type: "string",  required: true,  descripcion: "Usuario responsable de la aprobación." },
      { name: "urgente",      type: "boolean", required: false, descripcion: "Indica si la aprobación es urgente." },
    ],
  },

  launch_workflow: {
    id:                   "launch_workflow",
    name:                 "Lanzar workflow",
    descripcion:          "Inicia la ejecución de un workflow de automatización registrado.",
    category:             "workflow",
    requiredCapabilities: [],
    riskLevel:            "medium",
    requiresConfirmation: true,
    reversible:           false,
    parameters: [
      { name: "workflow_id", type: "string", required: true,  descripcion: "Identificador del workflow." },
      { name: "parametros",  type: "string", required: false, descripcion: "Parámetros de entrada (JSON)." },
    ],
  },

  generate_photo: {
    id:                   "generate_photo",
    name:                 "Generar fotografía de producto",
    descripcion:          "Genera una imagen fotorrealista de producto usando el motor de foto-estudio.",
    category:             "content_generation",
    requiredCapabilities: ["marketing.generate_content"],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "producto_ref", type: "string", required: true,  descripcion: "Referencia del producto." },
      { name: "estilo",       type: "enum",   required: false, descripcion: "Estilo visual.", enumValues: ["lifestyle", "fondo_blanco", "editorial", "social_media"] },
      { name: "cantidad",     type: "number", required: false, descripcion: "Número de imágenes." },
    ],
  },

  generate_video: {
    id:                   "generate_video",
    name:                 "Generar video",
    descripcion:          "Genera un video de producto o campaña para canales digitales.",
    category:             "content_generation",
    requiredCapabilities: ["marketing.generate_content"],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "producto_ref", type: "string", required: false, descripcion: "Referencia del producto principal." },
      { name: "duracion",     type: "enum",   required: false, descripcion: "Duración.", enumValues: ["15s", "30s", "60s", "90s"] },
      { name: "formato",      type: "enum",   required: false, descripcion: "Formato.", enumValues: ["vertical", "cuadrado", "horizontal"] },
    ],
  },

  send_whatsapp: {
    id:                   "send_whatsapp",
    name:                 "Enviar WhatsApp",
    descripcion:          "Envía un mensaje de WhatsApp a un cliente.",
    category:             "communication",
    requiredCapabilities: [],
    riskLevel:            "medium",
    requiresConfirmation: true,
    reversible:           false,
    parameters: [
      { name: "destinatario_id", type: "string", required: true,  descripcion: "ID del cliente destinatario." },
      { name: "template_id",     type: "string", required: true,  descripcion: "ID de la plantilla aprobada." },
      { name: "variables",       type: "string", required: false, descripcion: "Variables de la plantilla (JSON)." },
    ],
  },

  schedule_post: {
    id:                   "schedule_post",
    name:                 "Programar publicación",
    descripcion:          "Agenda la publicación de contenido en una red social o canal digital.",
    category:             "communication",
    requiredCapabilities: ["marketing.schedule_post"],
    riskLevel:            "medium",
    requiresConfirmation: true,
    reversible:           true,
    parameters: [
      { name: "activo_id",  type: "string", required: true, descripcion: "ID del activo de marketing." },
      { name: "canal",      type: "enum",   required: true, descripcion: "Canal.", enumValues: ["instagram", "facebook", "tiktok", "whatsapp"] },
      { name: "fecha_hora", type: "date",   required: true, descripcion: "Fecha y hora de publicación." },
    ],
  },

  create_purchase_suggestion: {
    id:                   "create_purchase_suggestion",
    name:                 "Crear sugerencia de compra",
    descripcion:          "Genera una propuesta de orden de compra basada en cobertura de inventario.",
    category:             "procurement",
    requiredCapabilities: ["inventario.calculate_coverage", "compras.track_open_orders"],
    riskLevel:            "medium",
    requiresConfirmation: true,
    reversible:           true,
    parameters: [
      { name: "producto_ref",      type: "string", required: true,  descripcion: "Referencia del producto." },
      { name: "cantidad_sugerida", type: "number", required: true,  descripcion: "Unidades sugeridas." },
      { name: "proveedor_id",      type: "string", required: false, descripcion: "Proveedor sugerido." },
    ],
  },

  export_data: {
    id:                   "export_data",
    name:                 "Exportar datos",
    descripcion:          "Exporta un conjunto de datos del dominio activo en el formato solicitado.",
    category:             "reporting",
    requiredCapabilities: [],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "dominio",  type: "string", required: true,  descripcion: "Dominio de los datos a exportar." },
      { name: "formato",  type: "enum",   required: true,  descripcion: "Formato.", enumValues: ["csv", "excel", "json"] },
      { name: "filtros",  type: "string", required: false, descripcion: "Filtros aplicados (JSON)." },
    ],
  },

  flag_for_review: {
    id:                   "flag_for_review",
    name:                 "Marcar para revisión",
    descripcion:          "Marca un elemento como pendiente de revisión por un responsable humano.",
    category:             "moderation",
    requiredCapabilities: [],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "entidad_tipo", type: "string", required: true,  descripcion: "Tipo de entidad." },
      { name: "entidad_id",   type: "string", required: true,  descripcion: "ID de la entidad." },
      { name: "motivo",       type: "string", required: false, descripcion: "Motivo de la revisión." },
    ],
  },

  assign_task: {
    id:                   "assign_task",
    name:                 "Asignar tarea",
    descripcion:          "Asigna una tarea existente a un usuario o cambia su responsable.",
    category:             "task_management",
    requiredCapabilities: ["tareas.track_open_tasks"],
    riskLevel:            "low",
    requiresConfirmation: false,
    reversible:           true,
    parameters: [
      { name: "tarea_id",   type: "string", required: true, descripcion: "ID de la tarea." },
      { name: "asignado_a", type: "string", required: true, descripcion: "Usuario o agente responsable." },
    ],
  },

  close_reconciliation_item: {
    id:                   "close_reconciliation_item",
    name:                 "Cerrar ítem de conciliación",
    descripcion:          "Cierra manualmente un ítem de excepción de conciliación tras revisión humana.",
    category:             "reconciliation",
    requiredCapabilities: ["conciliacion.detect_exceptions"],
    riskLevel:            "high",
    requiresConfirmation: true,
    reversible:           false,
    parameters: [
      { name: "item_id",    type: "string", required: true,  descripcion: "ID del ítem de conciliación." },
      { name: "resolucion", type: "enum",   required: true,  descripcion: "Tipo de resolución.", enumValues: ["aprobado", "rechazado", "diferido"] },
      { name: "nota",       type: "string", required: false, descripcion: "Nota de cierre." },
    ],
  },

  draft_collection_message: {
    id:                   "draft_collection_message",
    name:                 "Redactar mensaje de cobro",
    descripcion:          "Genera un borrador de mensaje de cobro para un cliente con cartera vencida.",
    category:             "communication",
    requiredCapabilities: ["cartera.prioritize_collection"],
    riskLevel:            "medium",
    requiresConfirmation: true,
    reversible:           true,
    parameters: [
      { name: "cliente_id", type: "string", required: true,  descripcion: "ID del cliente." },
      { name: "canal",      type: "enum",   required: true,  descripcion: "Canal.", enumValues: ["whatsapp", "email", "llamada"] },
      { name: "tono",       type: "enum",   required: false, descripcion: "Tono del mensaje.", enumValues: ["amable", "formal", "urgente"] },
    ],
  },
};

// ── Accessors ──────────────────────────────────────────────────────────────────

export function getAction(id: ActionId): ActionDefinition {
  return ACTION_REGISTRY[id];
}

export function getAllActions(): ActionDefinition[] {
  return Object.values(ACTION_REGISTRY);
}

export function getActionsByCategory(category: ActionCategory): ActionDefinition[] {
  return getAllActions().filter(a => a.category === category);
}

export function getActionsRequiringCapability(capabilityId: CapabilityId): ActionDefinition[] {
  return getAllActions().filter(a => a.requiredCapabilities.includes(capabilityId));
}
