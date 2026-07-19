/**
 * lib/agentik-agents/agent-resolver.ts
 *
 * Agentik OS — Agent Context Resolver
 * Sprint: AGENTIK-AGENTS-COPILOT-ARCHITECTURE-01
 *
 * Decides which agent corresponds to the active route.
 * Uses a declarative route rules registry — no giant if/else.
 *
 * Single source of truth for all pathname → agent decisions.
 * Consumed by: copilot-context-resolver, right-ops-rail, context-engine.
 */

import { getAgent, getAgentOrDefault, type AgentDef } from "./agent-registry";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentResolverInput {
  pathname:      string;
  orgSlug?:      string;
  role?:         string;
  moduleKey?:    string;
  submoduleKey?: string;
}

export interface AgentResolverResult {
  agent:         AgentDef;
  confidence:    number;   // 0–100
  matchedRule:   string;   // identifier of the rule that triggered
  contextDomain: string;   // human-readable domain label
}

// ── Route rules ────────────────────────────────────────────────────────────────
// Order matters: more specific patterns must come BEFORE broader ones.

interface RouteRule {
  pattern:       RegExp;
  agentId:       string;
  confidence:    number;
  matchedRule:   string;
  contextDomain: string;
}

const ROUTE_RULES: RouteRule[] = [

  // ── Marketing Studio — Shopify (specific sub-route → Sofia) ────────────────
  {
    pattern:       /\/agentik\/marketing-studio\/shopify/,
    agentId:       "sofia",
    confidence:    100,
    matchedRule:   "marketing_studio.shopify",
    contextDomain: "Marketing Studio · Shopify",
  },

  // ── Marketing Studio — all other sub-routes (foto-estudio, biblioteca, etc.) → Luca ──
  {
    pattern:       /\/agentik\/marketing-studio/,
    agentId:       "luca",
    confidence:    95,
    matchedRule:   "marketing_studio",
    contextDomain: "Marketing Studio",
  },

  // ── Finance — sub-modules ─────────────────────────────────────────────────
  {
    pattern:       /\/finanzas\/(conciliacion|cierre|tesoreria|planeacion|documentos)/,
    agentId:       "diego",
    confidence:    100,
    matchedRule:   "finance.submodule",
    contextDomain: "Finanzas",
  },
  {
    pattern:       /\/finanzas/,
    agentId:       "diego",
    confidence:    95,
    matchedRule:   "finance",
    contextDomain: "Finanzas",
  },
  // Agentik finance alias (used in sprint validation: /agentik/finance)
  {
    pattern:       /\/agentik\/finance/,
    agentId:       "diego",
    confidence:    95,
    matchedRule:   "finance.agentik_alias",
    contextDomain: "Finanzas",
  },
  // Torre de control / reconciliation
  {
    pattern:       /\/torre-control|\/reconciliation|\/conciliacion/,
    agentId:       "diego",
    confidence:    90,
    matchedRule:   "finance.reconciliation",
    contextDomain: "Finanzas · Conciliación",
  },

  // ── Executive dashboard (Torre de Control principal) ─────────────────────
  {
    pattern:       /\/executive/,
    agentId:       "diego",
    confidence:    90,
    matchedRule:   "finance.executive",
    contextDomain: "Torre de Control · Finanzas",
  },

  // ── Collections / cobranza ────────────────────────────────────────────────
  {
    pattern:       /\/agentik\/collections/,
    agentId:       "mila",
    confidence:    100,
    matchedRule:   "collections.agentik",
    contextDomain: "Cobranza",
  },
  {
    pattern:       /\/collections|\/colecciones|\/cobranza|\/pipeline/,
    agentId:       "mila",
    confidence:    95,
    matchedRule:   "collections",
    contextDomain: "Cobranza · Pipeline",
  },

  // ── WhatsApp commercial ───────────────────────────────────────────────────
  {
    pattern:       /\/whatsapp-sales|\/whatsapp/,
    agentId:       "laura",
    confidence:    95,
    matchedRule:   "whatsapp",
    contextDomain: "WhatsApp Comercial",
  },

  // ── Comercial / maletas ───────────────────────────────────────────────────
  {
    pattern:       /\/comercial/,
    agentId:       "david",
    confidence:    95,
    matchedRule:   "comercial",
    contextDomain: "Comercial · Maletas",
  },

  // ── Sales / customers / orders ────────────────────────────────────────────
  {
    pattern:       /\/sales|\/ventas|\/customers|\/clientes|\/orders|\/pedidos/,
    agentId:       "david",
    confidence:    90,
    matchedRule:   "sales",
    contextDomain: "Comercial",
  },

  // ── eCommerce / integrations ──────────────────────────────────────────────
  {
    pattern:       /\/integrations|\/shopify/,
    agentId:       "sofia",
    confidence:    90,
    matchedRule:   "integrations",
    contextDomain: "Integraciones · eCommerce",
  },

  // ── Operations / dashboard / alerts / reports ─────────────────────────────
  {
    pattern:       /\/dashboard|\/alerts|\/alertas|\/tasks|\/tareas|\/reports|\/informes/,
    agentId:       "pablo",
    confidence:    85,
    matchedRule:   "operations",
    contextDomain: "Gestión Operativa",
  },

  // ── Agentik OS internal sub-sections ─────────────────────────────────────
  {
    pattern:       /\/agentik\/control-center|\/agentik\/agentes|\/agentik\/configuracion/,
    agentId:       "pablo",
    confidence:    90,
    matchedRule:   "agentik_os.internal",
    contextDomain: "Agentik OS",
  },

  // ── Agentik OS root (broad) ───────────────────────────────────────────────
  {
    pattern:       /\/agentik/,
    agentId:       "pablo",
    confidence:    70,
    matchedRule:   "agentik_os",
    contextDomain: "Agentik OS",
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  {
    pattern:       /\/ajustes|\/settings/,
    agentId:       "pablo",
    confidence:    75,
    matchedRule:   "settings",
    contextDomain: "Ajustes",
  },
];

// ── Default result ─────────────────────────────────────────────────────────────

const DEFAULT_RESULT: AgentResolverResult = {
  agent:         getAgent("pablo"),
  confidence:    50,
  matchedRule:   "default",
  contextDomain: "Agentik OS",
};

// ── Resolver ───────────────────────────────────────────────────────────────────

export function resolveAgentForRoute(input: AgentResolverInput): AgentResolverResult {
  const { pathname } = input;

  for (const rule of ROUTE_RULES) {
    if (rule.pattern.test(pathname)) {
      return {
        agent:         getAgentOrDefault(rule.agentId),
        confidence:    rule.confidence,
        matchedRule:   rule.matchedRule,
        contextDomain: rule.contextDomain,
      };
    }
  }

  return DEFAULT_RESULT;
}
