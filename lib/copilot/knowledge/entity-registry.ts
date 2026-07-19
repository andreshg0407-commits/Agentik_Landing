/**
 * lib/copilot/knowledge/entity-registry.ts
 *
 * Agentik Knowledge Foundation — Entity Registry
 * Sprint: AGENTIK-COPILOT-KNOWLEDGE-FOUNDATION-01
 *
 * Canonical business entities. ERP-agnostic universal representations
 * of core business concepts. They do NOT map to any specific table,
 * view, or integration adapter.
 *
 * Integration adapters (SAG, Siigo, Odoo, SAP, Shopify, etc.) translate
 * their own schemas into these canonical entities via the adapter layer.
 * Copilot and all agents reason about these entities, never about tables.
 */

import type { DomainId } from "./domain-registry";

// ── Entity ID union ────────────────────────────────────────────────────────────

export type EntityId =
  | "customer"
  | "product"
  | "invoice"
  | "sales_line"
  | "payment"
  | "collection"
  | "bank_movement"
  | "inventory_position"
  | "purchase_order"
  | "marketing_asset"
  | "campaign"
  | "task"
  | "alert";

// ── Field type system ──────────────────────────────────────────────────────────

export type FieldType =
  | "string"
  | "number"
  | "decimal"
  | "date"
  | "datetime"
  | "boolean"
  | "enum"
  | "reference";

export interface CanonicalField {
  name:             string;
  type:             FieldType;
  descripcion:      string;
  required:         boolean;
  referenceEntity?: EntityId;   // Only when type = "reference"
  enumValues?:      string[];   // Only when type = "enum"
}

// ── Entity definition interface ────────────────────────────────────────────────

export interface EntityDefinition {
  id:              EntityId;
  nombre:          string;
  descripcion:     string;
  primaryDomain:   DomainId;
  fields:          CanonicalField[];
  relatedEntities: EntityId[];
}

// ── Registry ───────────────────────────────────────────────────────────────────

export const ENTITY_REGISTRY: Record<EntityId, EntityDefinition> = {

  customer: {
    id:            "customer",
    nombre:        "Cliente",
    descripcion:   "Persona natural o jurídica que realiza transacciones comerciales con la organización.",
    primaryDomain: "clientes",
    relatedEntities: ["invoice", "payment", "collection", "campaign"],
    fields: [
      { name: "id",             type: "string",   required: true,  descripcion: "Identificador único del cliente en el sistema de origen." },
      { name: "nombre",         type: "string",   required: true,  descripcion: "Nombre o razón social." },
      { name: "identificacion", type: "string",   required: true,  descripcion: "Número de identificación fiscal o tributaria." },
      { name: "tipo_cliente",   type: "enum",     required: false, descripcion: "Clasificación del cliente.", enumValues: ["distribuidor", "minorista", "consumidor_final", "corporativo"] },
      { name: "ciudad",         type: "string",   required: false, descripcion: "Ciudad de ubicación." },
      { name: "cupo_credito",   type: "decimal",  required: false, descripcion: "Cupo de crédito aprobado." },
      { name: "vendedor_id",    type: "string",   required: false, descripcion: "Vendedor responsable de la cuenta." },
      { name: "activo",         type: "boolean",  required: true,  descripcion: "Indica si el cliente está activo." },
    ],
  },

  product: {
    id:            "product",
    nombre:        "Producto",
    descripcion:   "Artículo comercializable con atributos de identificación, precio y categorización.",
    primaryDomain: "productos",
    relatedEntities: ["inventory_position", "invoice", "purchase_order", "sales_line"],
    fields: [
      { name: "id",               type: "string",  required: true,  descripcion: "Identificador único del producto." },
      { name: "referencia",       type: "string",  required: true,  descripcion: "Código de referencia comercial — clave de cruce entre dominios." },
      { name: "nombre_comercial", type: "string",  required: true,  descripcion: "Nombre del producto para presentación." },
      { name: "linea",            type: "string",  required: false, descripcion: "Línea de producto." },
      { name: "categoria",        type: "string",  required: false, descripcion: "Categoría de gestión." },
      { name: "precio_lista",     type: "decimal", required: false, descripcion: "Precio de lista vigente." },
      { name: "costo_promedio",   type: "decimal", required: false, descripcion: "Costo promedio ponderado." },
      { name: "activo",           type: "boolean", required: true,  descripcion: "Indica si el producto está activo." },
      { name: "maneja_variantes", type: "boolean", required: false, descripcion: "Indica si el producto tiene variantes (talla, color)." },
    ],
  },

  invoice: {
    id:            "invoice",
    nombre:        "Factura / Documento de Venta",
    descripcion:   "Documento que registra una transacción comercial de venta.",
    primaryDomain: "ventas",
    relatedEntities: ["customer", "sales_line", "payment", "collection"],
    fields: [
      { name: "id",             type: "string",   required: true,  descripcion: "Identificador único del documento." },
      { name: "numero_factura", type: "string",   required: true,  descripcion: "Número visible del documento de venta." },
      { name: "fecha",          type: "datetime", required: true,  descripcion: "Fecha y hora de la transacción." },
      { name: "cliente_id",     type: "reference",required: true,  descripcion: "Cliente al que se emite el documento.", referenceEntity: "customer" },
      { name: "monto_bruto",    type: "decimal",  required: true,  descripcion: "Valor bruto antes de descuentos." },
      { name: "monto_neto",     type: "decimal",  required: true,  descripcion: "Valor neto después de descuentos." },
      { name: "estado",         type: "enum",     required: true,  descripcion: "Estado del documento.", enumValues: ["activo", "anulado", "devuelto", "parcial"] },
      { name: "empresa_id",     type: "string",   required: true,  descripcion: "Empresa emisora del documento." },
    ],
  },

  sales_line: {
    id:            "sales_line",
    nombre:        "Línea de Venta",
    descripcion:   "Línea de detalle de un documento de venta con producto, cantidad y valor.",
    primaryDomain: "ventas",
    relatedEntities: ["invoice", "product"],
    fields: [
      { name: "id",              type: "string",   required: true,  descripcion: "Identificador de la línea." },
      { name: "factura_id",      type: "reference",required: true,  descripcion: "Documento al que pertenece.", referenceEntity: "invoice" },
      { name: "producto_id",     type: "reference",required: true,  descripcion: "Producto vendido.", referenceEntity: "product" },
      { name: "cantidad",        type: "number",   required: true,  descripcion: "Unidades vendidas." },
      { name: "precio_unitario", type: "decimal",  required: true,  descripcion: "Precio unitario de venta." },
      { name: "descuento",       type: "decimal",  required: false, descripcion: "Descuento aplicado a esta línea." },
      { name: "costo_unitario",  type: "decimal",  required: false, descripcion: "Costo unitario del producto." },
    ],
  },

  payment: {
    id:            "payment",
    nombre:        "Pago",
    descripcion:   "Registro de un abono o pago total recibido asociado a un documento de cartera.",
    primaryDomain: "pagos",
    relatedEntities: ["customer", "invoice", "collection"],
    fields: [
      { name: "id",         type: "string",   required: true,  descripcion: "Identificador único del pago." },
      { name: "factura_id", type: "reference",required: false, descripcion: "Factura a la que se aplica el pago.", referenceEntity: "invoice" },
      { name: "cliente_id", type: "reference",required: true,  descripcion: "Cliente que realizó el pago.", referenceEntity: "customer" },
      { name: "fecha",      type: "datetime", required: true,  descripcion: "Fecha y hora del pago." },
      { name: "monto",      type: "decimal",  required: true,  descripcion: "Valor del pago." },
      { name: "tipo",       type: "enum",     required: true,  descripcion: "Tipo de pago.", enumValues: ["abono", "pago_total", "anticipo"] },
      { name: "estado",     type: "enum",     required: true,  descripcion: "Estado del pago.", enumValues: ["aplicado", "pendiente", "anulado"] },
      { name: "empresa_id", type: "string",   required: true,  descripcion: "Empresa receptora." },
    ],
  },

  collection: {
    id:            "collection",
    nombre:        "Documento de Cartera",
    descripcion:   "Documento pendiente de cobro con saldo, antigüedad y estado de mora.",
    primaryDomain: "cartera",
    relatedEntities: ["customer", "invoice", "payment"],
    fields: [
      { name: "id",                type: "string",  required: true,  descripcion: "Identificador único del documento de cartera." },
      { name: "numero_factura",    type: "string",  required: true,  descripcion: "Número de la factura asociada." },
      { name: "cliente_id",        type: "reference",required: true, descripcion: "Cliente deudor.", referenceEntity: "customer" },
      { name: "fecha_emision",     type: "date",    required: true,  descripcion: "Fecha de emisión." },
      { name: "fecha_vencimiento", type: "date",    required: true,  descripcion: "Fecha de vencimiento." },
      { name: "valor_original",    type: "decimal", required: true,  descripcion: "Valor original del documento." },
      { name: "saldo_pendiente",   type: "decimal", required: true,  descripcion: "Saldo vigente pendiente de cobro." },
      { name: "dias_mora",         type: "number",  required: true,  descripcion: "Días transcurridos desde el vencimiento." },
      { name: "empresa_id",        type: "string",  required: true,  descripcion: "Empresa del documento." },
    ],
  },

  bank_movement: {
    id:            "bank_movement",
    nombre:        "Movimiento Bancario",
    descripcion:   "Registro de un movimiento en el extracto bancario de una cuenta de la organización.",
    primaryDomain: "bancos",
    relatedEntities: ["collection"],
    fields: [
      { name: "id",                  type: "string",  required: true,  descripcion: "Identificador único del movimiento." },
      { name: "cuenta_id",           type: "string",  required: true,  descripcion: "Identificador de la cuenta bancaria." },
      { name: "banco",               type: "string",  required: true,  descripcion: "Nombre de la entidad financiera." },
      { name: "fecha",               type: "date",    required: true,  descripcion: "Fecha del movimiento en el extracto." },
      { name: "tipo",                type: "enum",    required: true,  descripcion: "Tipo de movimiento.", enumValues: ["debito", "credito"] },
      { name: "valor_debito",        type: "decimal", required: false, descripcion: "Valor del débito." },
      { name: "valor_credito",       type: "decimal", required: false, descripcion: "Valor del crédito." },
      { name: "saldo_posterior",     type: "decimal", required: false, descripcion: "Saldo tras el movimiento." },
      { name: "referencia_bancaria", type: "string",  required: false, descripcion: "Referencia del banco para cruce con recaudos." },
      { name: "conciliado",          type: "boolean", required: false, descripcion: "Indica si el movimiento fue conciliado." },
      { name: "empresa_id",          type: "string",  required: true,  descripcion: "Empresa propietaria de la cuenta." },
    ],
  },

  inventory_position: {
    id:            "inventory_position",
    nombre:        "Posición de Inventario",
    descripcion:   "Saldo de existencias de un producto en una ubicación o bodega específica.",
    primaryDomain: "inventario",
    relatedEntities: ["product"],
    fields: [
      { name: "producto_id",    type: "reference",required: true,  descripcion: "Producto de la posición.", referenceEntity: "product" },
      { name: "referencia",     type: "string",   required: true,  descripcion: "Referencia comercial del producto." },
      { name: "variante",       type: "string",   required: false, descripcion: "Variante del producto (talla, color u otra dimensión)." },
      { name: "bodega_id",      type: "string",   required: true,  descripcion: "Bodega o ubicación." },
      { name: "existencia",     type: "number",   required: true,  descripcion: "Unidades físicas disponibles." },
      { name: "disponible",     type: "number",   required: true,  descripcion: "Unidades disponibles para venta según reglas del sistema." },
      { name: "reservado",      type: "number",   required: false, descripcion: "Unidades reservadas para pedidos pendientes." },
      { name: "costo_promedio", type: "decimal",  required: false, descripcion: "Costo promedio ponderado del artículo." },
      { name: "empresa_id",     type: "string",   required: true,  descripcion: "Empresa propietaria del inventario." },
    ],
  },

  purchase_order: {
    id:            "purchase_order",
    nombre:        "Orden de Compra",
    descripcion:   "Solicitud formal de compra a un proveedor con estado de recepción.",
    primaryDomain: "compras",
    relatedEntities: ["product"],
    fields: [
      { name: "id",                   type: "string",   required: true,  descripcion: "Identificador único de la OC." },
      { name: "numero_oc",            type: "string",   required: true,  descripcion: "Número visible de la OC." },
      { name: "proveedor_id",         type: "string",   required: true,  descripcion: "Identificador del proveedor." },
      { name: "producto_id",          type: "reference",required: true,  descripcion: "Producto solicitado.", referenceEntity: "product" },
      { name: "cantidad_ordenada",    type: "number",   required: true,  descripcion: "Unidades solicitadas." },
      { name: "cantidad_recibida",    type: "number",   required: true,  descripcion: "Unidades efectivamente recibidas." },
      { name: "valor_total",          type: "decimal",  required: true,  descripcion: "Valor total de la OC." },
      { name: "fecha_oc",             type: "date",     required: true,  descripcion: "Fecha de emisión." },
      { name: "fecha_compromiso",     type: "date",     required: false, descripcion: "Fecha pactada de entrega." },
      { name: "estado",               type: "enum",     required: true,  descripcion: "Estado de la OC.", enumValues: ["aprobada", "enviada", "parcial", "recibida", "cancelada"] },
      { name: "empresa_id",           type: "string",   required: true,  descripcion: "Empresa compradora." },
    ],
  },

  marketing_asset: {
    id:            "marketing_asset",
    nombre:        "Activo de Marketing",
    descripcion:   "Pieza de contenido creativo generada para uso en canales de marketing.",
    primaryDomain: "marketing",
    relatedEntities: ["campaign", "product"],
    fields: [
      { name: "id",          type: "string",   required: true,  descripcion: "Identificador único del activo." },
      { name: "tipo",        type: "enum",     required: true,  descripcion: "Tipo de activo.", enumValues: ["imagen", "video", "texto", "carrusel", "story"] },
      { name: "canal",       type: "enum",     required: true,  descripcion: "Canal de destino.", enumValues: ["instagram", "facebook", "tiktok", "whatsapp", "email", "web"] },
      { name: "estado",      type: "enum",     required: true,  descripcion: "Estado del activo.", enumValues: ["borrador", "aprobado", "publicado", "archivado"] },
      { name: "campaign_id", type: "reference",required: false, descripcion: "Campaña a la que pertenece.", referenceEntity: "campaign" },
      { name: "creado_en",   type: "datetime", required: true,  descripcion: "Fecha de creación." },
    ],
  },

  campaign: {
    id:            "campaign",
    nombre:        "Campaña",
    descripcion:   "Iniciativa de marketing con objetivo, presupuesto y canal de ejecución.",
    primaryDomain: "marketing",
    relatedEntities: ["marketing_asset", "customer"],
    fields: [
      { name: "id",           type: "string",  required: true,  descripcion: "Identificador único de la campaña." },
      { name: "nombre",       type: "string",  required: true,  descripcion: "Nombre de la campaña." },
      { name: "objetivo",     type: "enum",    required: true,  descripcion: "Objetivo.", enumValues: ["alcance", "conversion", "retencion", "awareness"] },
      { name: "canal",        type: "string",  required: true,  descripcion: "Canal principal." },
      { name: "presupuesto",  type: "decimal", required: false, descripcion: "Presupuesto asignado." },
      { name: "fecha_inicio", type: "date",    required: true,  descripcion: "Fecha de inicio." },
      { name: "fecha_fin",    type: "date",    required: false, descripcion: "Fecha de finalización." },
      { name: "estado",       type: "enum",    required: true,  descripcion: "Estado.", enumValues: ["borrador", "activa", "pausada", "finalizada"] },
    ],
  },

  task: {
    id:            "task",
    nombre:        "Tarea",
    descripcion:   "Unidad de trabajo asignada a un usuario o agente con fecha y prioridad.",
    primaryDomain: "tareas",
    relatedEntities: ["alert"],
    fields: [
      { name: "id",           type: "string",   required: true,  descripcion: "Identificador único de la tarea." },
      { name: "titulo",       type: "string",   required: true,  descripcion: "Título descriptivo." },
      { name: "descripcion",  type: "string",   required: false, descripcion: "Detalle de la tarea." },
      { name: "asignado_a",   type: "string",   required: false, descripcion: "Usuario o agente responsable." },
      { name: "dominio",      type: "string",   required: false, descripcion: "Dominio empresarial de origen." },
      { name: "prioridad",    type: "enum",     required: true,  descripcion: "Prioridad.", enumValues: ["baja", "media", "alta", "critica"] },
      { name: "estado",       type: "enum",     required: true,  descripcion: "Estado.", enumValues: ["pendiente", "en_progreso", "completada", "cancelada"] },
      { name: "fecha_limite", type: "date",     required: false, descripcion: "Fecha límite." },
      { name: "creado_en",    type: "datetime", required: true,  descripcion: "Fecha de creación." },
    ],
  },

  alert: {
    id:            "alert",
    nombre:        "Alerta",
    descripcion:   "Notificación operacional generada cuando se supera un umbral o condición definida.",
    primaryDomain: "alertas",
    relatedEntities: ["task"],
    fields: [
      { name: "id",           type: "string",   required: true,  descripcion: "Identificador único de la alerta." },
      { name: "tipo",         type: "string",   required: true,  descripcion: "Tipo de alerta (dominio + condición)." },
      { name: "dominio",      type: "string",   required: true,  descripcion: "Dominio empresarial de origen." },
      { name: "severidad",    type: "enum",     required: true,  descripcion: "Nivel de severidad.", enumValues: ["info", "warning", "critical"] },
      { name: "mensaje",      type: "string",   required: true,  descripcion: "Mensaje descriptivo." },
      { name: "entidad_id",   type: "string",   required: false, descripcion: "ID de la entidad que originó la alerta." },
      { name: "entidad_tipo", type: "string",   required: false, descripcion: "Tipo de entidad que originó la alerta." },
      { name: "resuelta",     type: "boolean",  required: true,  descripcion: "Indica si la alerta fue resuelta." },
      { name: "creado_en",    type: "datetime", required: true,  descripcion: "Fecha de generación." },
    ],
  },
};

// ── Accessors ──────────────────────────────────────────────────────────────────

export function getEntity(id: EntityId): EntityDefinition {
  return ENTITY_REGISTRY[id];
}

export function getAllEntities(): EntityDefinition[] {
  return Object.values(ENTITY_REGISTRY);
}

export function getEntitiesForDomain(domainId: DomainId): EntityDefinition[] {
  return getAllEntities().filter(e => e.primaryDomain === domainId);
}
