/**
 * lib/integrations/integration-registry.ts
 *
 * Agentik — Integration Registry V1
 *
 * Block B of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Static registry of all supported integrations.
 * V1: all mock-safe. V4: tenant-specific overrides from Prisma.IntegrationConfig.
 */

import type { IntegrationContract } from "./integration-contracts";

// ── Registry ───────────────────────────────────────────────────────────────────

export const INTEGRATION_REGISTRY: IntegrationContract[] = [

  // ── Workflow Engine ────────────────────────────────────────────────────────
  {
    id:               "n8n",
    name:             "n8n",
    type:             "workflow_engine",
    tenantScope:      "all",
    requiredSecrets:  ["N8N_API_KEY", "N8N_BASE_URL"],
    supportedActions: ["trigger_workflow", "execute_automation", "send_webhook"],
    riskLevel:        "medium",
    healthState:      "unconfigured",   // V1: not yet wired
    executionMode:    "supervised",
    enabled:          true,
    description:      "Motor de automatización de flujos — WhatsApp, ERP, notificaciones",
  },

  // ── Messaging ─────────────────────────────────────────────────────────────
  {
    id:               "whatsapp",
    name:             "WhatsApp Business",
    type:             "messaging",
    tenantScope:      "all",
    requiredSecrets:  ["WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN"],
    supportedActions: ["send_message", "send_template", "trigger_followup"],
    riskLevel:        "high",           // External comms — requires approval
    healthState:      "unconfigured",
    executionMode:    "supervised",
    enabled:          true,
    description:      "Canal de comunicación comercial — seguimientos, campañas, cobranzas",
  },

  {
    id:               "email",
    name:             "Email (SMTP)",
    type:             "messaging",
    tenantScope:      "all",
    requiredSecrets:  ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
    supportedActions: ["send_email", "send_report", "send_alert"],
    riskLevel:        "medium",
    healthState:      "unconfigured",
    executionMode:    "supervised",
    enabled:          true,
    description:      "Canal de email para reportes operativos y alertas",
  },

  // ── Social Media ──────────────────────────────────────────────────────────
  {
    id:               "tiktok",
    name:             "TikTok Business",
    type:             "social_media",
    tenantScope:      "all",
    requiredSecrets:  ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET", "TIKTOK_ACCESS_TOKEN"],
    supportedActions: ["publish_video", "schedule_post", "get_analytics"],
    riskLevel:        "high",
    healthState:      "unconfigured",
    executionMode:    "supervised",
    enabled:          true,
    description:      "Publicación de contenido en TikTok para campañas de marketing",
  },

  // ── Media Generation ─────────────────────────────────────────────────────
  {
    id:               "runway",
    name:             "Runway Gen-3",
    type:             "media_gen",
    tenantScope:      "all",
    requiredSecrets:  ["RUNWAY_API_KEY"],
    supportedActions: ["generate_video", "generate_image", "upscale_image"],
    riskLevel:        "medium",
    healthState:      "unconfigured",
    executionMode:    "supervised",
    enabled:          true,
    description:      "Generación de video e imágenes con IA para Marketing Studio",
  },

  // ── Fiscal / Government ────────────────────────────────────────────────────
  {
    id:               "dian",
    name:             "DIAN (Colombia)",
    type:             "fiscal",
    tenantScope:      "castillitos",
    requiredSecrets:  ["DIAN_CERT_PATH", "DIAN_CERT_PASSWORD", "DIAN_NIT"],
    supportedActions: ["validate_invoice", "submit_document", "query_status"],
    riskLevel:        "critical",       // Government compliance — never automatic
    healthState:      "unconfigured",
    executionMode:    "supervised",
    enabled:          true,
    description:      "Conector fiscal para facturación electrónica DIAN (Colombia)",
  },

  // ── ERP / SAG ─────────────────────────────────────────────────────────────
  {
    id:               "sag-erp",
    name:             "SAG ERP",
    type:             "erp",
    tenantScope:      "castillitos",
    requiredSecrets:  ["SAG_DB_URL", "SAG_API_TOKEN"],
    supportedActions: ["sync_data", "read_invoices", "read_payments", "read_inventory"],
    riskLevel:        "medium",
    healthState:      "operational",    // Already connected for Castillitos
    executionMode:    "supervised",
    enabled:          true,
    description:      "Conector al ERP SAG para datos financieros y operacionales",
  },

  // ── Ecommerce ─────────────────────────────────────────────────────────────
  {
    id:               "shopify",
    name:             "Shopify",
    type:             "ecommerce",
    tenantScope:      "all",
    requiredSecrets:  ["SHOPIFY_SHOP_URL", "SHOPIFY_ACCESS_TOKEN"],
    supportedActions: ["publish_product", "create_draft", "get_orders", "update_inventory"],
    riskLevel:        "medium",
    healthState:      "unconfigured",
    executionMode:    "supervised",
    enabled:          true,
    description:      "Publicación y gestión de productos en tienda Shopify",
  },
];

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getIntegrationById(id: string): IntegrationContract | null {
  return INTEGRATION_REGISTRY.find(i => i.id === id) ?? null;
}

export function getIntegrationsForTenant(orgSlug: string): IntegrationContract[] {
  return INTEGRATION_REGISTRY.filter(
    i => i.tenantScope === "all" || i.tenantScope === orgSlug
  );
}

export function getOperationalIntegrations(orgSlug: string): IntegrationContract[] {
  return getIntegrationsForTenant(orgSlug).filter(
    i => i.enabled && (i.healthState === "operational" || i.healthState === "degraded")
  );
}

export function getReadyIntegrations(orgSlug: string): IntegrationContract[] {
  return getIntegrationsForTenant(orgSlug).filter(
    i => i.enabled && i.healthState === "operational"
  );
}
