/**
 * lib/integrations/real-connectors.ts
 *
 * Agentik — Real Connector Contracts V1
 *
 * Sprint: AGENTIK-SECURITY-VAULT-AND-REAL-CONNECTORS-01 — Block B1
 *
 * Defines the execution profiles, governance requirements, and dispatch
 * capabilities for each Agentik real connector.
 *
 * These contracts govern what a connector CAN do, what secrets it NEEDS,
 * and what governance applies before any real dispatch occurs.
 *
 * V1: contracts only — no live API calls, no real dispatch.
 * V4: these contracts drive real supervised dispatch via webhook-execution.ts.
 *
 * ALL executions remain:
 *   - supervised (human-in-the-loop)
 *   - governed (governance rules applied before dispatch)
 *   - tenant-safe (orgSlug isolation enforced)
 *   - audited (trace + audit events emitted)
 *   - non-autonomous (canAutoDispatch = false in V3)
 */

// ── Connector types ─────────────────────────────────────────────────────────────

export type RealConnectorId =
  | "n8n"
  | "whatsapp"
  | "tiktok"
  | "runway"
  | "dian"
  | "sag-erp"
  | "shopify"
  | "email";

export type ConnectorDispatchMode =
  | "webhook"      // Triggered via webhook POST
  | "rest_api"     // REST API call
  | "soap"         // SOAP XML call
  | "sdk";         // SDK client call

export type ConnectorRiskLevel =
  | "low"      // Low risk — reversible, informational
  | "medium"   // Medium risk — data write, reversible
  | "high"     // High risk — financial, legal, irreversible
  | "critical"; // Critical — DIAN fiscal, banking

// ── Connector contract interface ────────────────────────────────────────────────

export interface RealConnectorContract {
  id:                    RealConnectorId;
  name:                  string;
  description:           string;
  dispatchMode:          ConnectorDispatchMode;
  riskLevel:             ConnectorRiskLevel;
  requiredSecretIds:     string[];           // IDs from vault catalog
  supportedActions:      string[];           // What actions this connector can perform
  governanceRequirements: {
    requiresHumanApproval: boolean;
    minApprovalLevel:      string;           // "none" | "low" | "medium" | "high" | "critical"
    runtimeRequirements:   string[];         // Runtime states that allow dispatch
    tenantScoped:          boolean;          // Must match orgSlug
  };
  supervisionRequirements: {
    supervisedOnly:        boolean;          // Never automatic
    confirmationRequired:  boolean;
    auditRequired:         boolean;
  };
  dispatchCapabilities: {
    canSendMessages:       boolean;
    canTriggerWorkflows:   boolean;
    canPublishContent:     boolean;
    canGenerateMedia:      boolean;
    canSubmitFiscal:       boolean;
    canReadData:           boolean;
    canWriteData:          boolean;
  };
  rollbackSupport: {
    supported:             boolean;
    rollbackWindow?:       number;           // Minutes
    rollbackMethod?:       string;
  };
  runtimeDependencies: string[];           // Other connector IDs this depends on
}

// ── Connector catalog ───────────────────────────────────────────────────────────

export const REAL_CONNECTOR_CATALOG: Record<RealConnectorId, RealConnectorContract> = {

  n8n: {
    id:          "n8n",
    name:        "n8n Workflow Engine",
    description: "Automation workflow engine — triggers supervised workflows via webhook",
    dispatchMode: "webhook",
    riskLevel:   "medium",
    requiredSecretIds: ["n8n_webhook"],
    supportedActions: [
      "trigger_workflow", "execute_automation", "schedule_report",
      "send_notification", "sync_data",
    ],
    governanceRequirements: {
      requiresHumanApproval: true,
      minApprovalLevel:      "medium",
      runtimeRequirements:   ["HEALTHY", "SYNCING"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: true,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    false,
      canTriggerWorkflows: true,
      canPublishContent:  false,
      canGenerateMedia:   false,
      canSubmitFiscal:    false,
      canReadData:        true,
      canWriteData:       true,
    },
    rollbackSupport: {
      supported:      true,
      rollbackWindow: 30,
      rollbackMethod: "workflow_cancel",
    },
    runtimeDependencies: [],
  },

  whatsapp: {
    id:          "whatsapp",
    name:        "WhatsApp Business API",
    description: "Customer messaging via WhatsApp Business Cloud API",
    dispatchMode: "rest_api",
    riskLevel:   "high",
    requiredSecretIds: ["wa_token"],
    supportedActions: [
      "send_message", "send_template", "broadcast_campaign",
      "send_document", "update_contact",
    ],
    governanceRequirements: {
      requiresHumanApproval: true,
      minApprovalLevel:      "high",
      runtimeRequirements:   ["HEALTHY"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: true,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    true,
      canTriggerWorkflows: false,
      canPublishContent:  false,
      canGenerateMedia:   false,
      canSubmitFiscal:    false,
      canReadData:        false,
      canWriteData:       true,
    },
    rollbackSupport: {
      supported: false,
    },
    runtimeDependencies: [],
  },

  tiktok: {
    id:          "tiktok",
    name:        "TikTok Business API",
    description: "Social content publishing via TikTok Business API",
    dispatchMode: "rest_api",
    riskLevel:   "high",
    requiredSecretIds: ["tiktok_token"],
    supportedActions: [
      "publish_video", "schedule_post", "update_profile",
      "get_analytics", "create_campaign",
    ],
    governanceRequirements: {
      requiresHumanApproval: true,
      minApprovalLevel:      "high",
      runtimeRequirements:   ["HEALTHY"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: true,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    false,
      canTriggerWorkflows: false,
      canPublishContent:  true,
      canGenerateMedia:   false,
      canSubmitFiscal:    false,
      canReadData:        true,
      canWriteData:       true,
    },
    rollbackSupport: {
      supported:      true,
      rollbackWindow: 60,
      rollbackMethod: "delete_post",
    },
    runtimeDependencies: [],
  },

  runway: {
    id:          "runway",
    name:        "Runway ML",
    description: "AI media generation — images and video via Runway ML API",
    dispatchMode: "rest_api",
    riskLevel:   "low",
    requiredSecretIds: ["runway_api"],
    supportedActions: [
      "generate_image", "generate_video", "upscale_image",
      "remove_background", "style_transfer",
    ],
    governanceRequirements: {
      requiresHumanApproval: false,
      minApprovalLevel:      "none",
      runtimeRequirements:   ["HEALTHY", "SYNCING", "STALE"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: false,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    false,
      canTriggerWorkflows: false,
      canPublishContent:  false,
      canGenerateMedia:   true,
      canSubmitFiscal:    false,
      canReadData:        false,
      canWriteData:       false,
    },
    rollbackSupport: {
      supported: true,
      rollbackMethod: "discard_generation",
    },
    runtimeDependencies: [],
  },

  dian: {
    id:          "dian",
    name:        "DIAN Electronic Invoicing",
    description: "Colombian fiscal authority — electronic invoicing and validation",
    dispatchMode: "soap",
    riskLevel:   "critical",
    requiredSecretIds: ["dian_cert", "dian_pin"],
    supportedActions: [
      "submit_invoice", "validate_document", "annul_invoice",
      "query_status", "generate_cufe",
    ],
    governanceRequirements: {
      requiresHumanApproval: true,
      minApprovalLevel:      "critical",
      runtimeRequirements:   ["HEALTHY"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: true,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    false,
      canTriggerWorkflows: false,
      canPublishContent:  false,
      canGenerateMedia:   false,
      canSubmitFiscal:    true,
      canReadData:        true,
      canWriteData:       true,
    },
    rollbackSupport: {
      supported:      true,
      rollbackWindow: 24 * 60,   // 24 hours (annulment window)
      rollbackMethod: "annul_invoice",
    },
    runtimeDependencies: [],
  },

  "sag-erp": {
    id:          "sag-erp",
    name:        "SAG ERP",
    description: "Primary ERP connector — data sync and write operations",
    dispatchMode: "soap",
    riskLevel:   "medium",
    requiredSecretIds: ["sag_token"],
    supportedActions: [
      "sync_invoices", "sync_customers", "sync_payments",
      "write_collection", "validate_document",
    ],
    governanceRequirements: {
      requiresHumanApproval: true,
      minApprovalLevel:      "medium",
      runtimeRequirements:   ["HEALTHY", "SYNCING"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: true,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    false,
      canTriggerWorkflows: false,
      canPublishContent:  false,
      canGenerateMedia:   false,
      canSubmitFiscal:    false,
      canReadData:        true,
      canWriteData:       true,
    },
    rollbackSupport: {
      supported:      false,
    },
    runtimeDependencies: [],
  },

  shopify: {
    id:          "shopify",
    name:        "Shopify",
    description: "E-commerce storefront — product, order, and catalog operations",
    dispatchMode: "rest_api",
    riskLevel:   "medium",
    requiredSecretIds: ["shopify_admin"],
    supportedActions: [
      "create_product", "update_product", "sync_inventory",
      "create_draft_order", "get_analytics",
    ],
    governanceRequirements: {
      requiresHumanApproval: true,
      minApprovalLevel:      "medium",
      runtimeRequirements:   ["HEALTHY", "SYNCING", "STALE"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: true,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    false,
      canTriggerWorkflows: false,
      canPublishContent:  true,
      canGenerateMedia:   false,
      canSubmitFiscal:    false,
      canReadData:        true,
      canWriteData:       true,
    },
    rollbackSupport: {
      supported:      true,
      rollbackWindow: 60,
      rollbackMethod: "delete_product",
    },
    runtimeDependencies: [],
  },

  email: {
    id:          "email",
    name:        "Email",
    description: "Transactional and marketing email dispatch",
    dispatchMode: "rest_api",
    riskLevel:   "low",
    requiredSecretIds: ["email_api"],
    supportedActions: [
      "send_email", "send_bulk", "schedule_campaign", "track_delivery",
    ],
    governanceRequirements: {
      requiresHumanApproval: false,
      minApprovalLevel:      "none",
      runtimeRequirements:   ["HEALTHY", "SYNCING", "STALE"],
      tenantScoped:          true,
    },
    supervisionRequirements: {
      supervisedOnly:       true,
      confirmationRequired: false,
      auditRequired:        true,
    },
    dispatchCapabilities: {
      canSendMessages:    true,
      canTriggerWorkflows: false,
      canPublishContent:  false,
      canGenerateMedia:   false,
      canSubmitFiscal:    false,
      canReadData:        false,
      canWriteData:       true,
    },
    rollbackSupport: {
      supported: false,
    },
    runtimeDependencies: [],
  },

};

// ── Lookup helpers ──────────────────────────────────────────────────────────────

export function getConnectorContract(id: RealConnectorId): RealConnectorContract {
  return REAL_CONNECTOR_CATALOG[id];
}

export function getConnectorsByRiskLevel(riskLevel: ConnectorRiskLevel): RealConnectorContract[] {
  return Object.values(REAL_CONNECTOR_CATALOG).filter(c => c.riskLevel === riskLevel);
}

/**
 * Returns connectors that can dispatch under the given runtime state.
 */
export function getDispatchableConnectors(runtimeState: string): RealConnectorContract[] {
  return Object.values(REAL_CONNECTOR_CATALOG).filter(
    c => c.governanceRequirements.runtimeRequirements.includes(runtimeState)
  );
}

/**
 * Returns true if a connector requires human approval before dispatch.
 */
export function connectorRequiresApproval(id: RealConnectorId): boolean {
  return REAL_CONNECTOR_CATALOG[id].governanceRequirements.requiresHumanApproval;
}
