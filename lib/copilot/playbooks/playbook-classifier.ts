/**
 * lib/copilot/playbooks/playbook-classifier.ts
 *
 * Agentik — Copilot Playbooks — Classifier
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Deterministic rule-based classifier for playbook categories and priorities.
 * No AI. No embeddings. No LLM. Pure keyword scoring.
 *
 * Used when creating a playbook without explicit category/priority,
 * or when suggesting metadata from a title/description.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { PlaybookCategory, PlaybookPriority } from "./playbook-types";

// ── Keyword maps ──────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<PlaybookCategory, string[]> = {
  FINANCE: [
    "cierre", "presupuesto", "tesorería", "treasury", "cash", "flujo de caja",
    "conciliación", "reconciliation", "budget", "estado financiero", "balance",
    "contabilidad", "accounting", "factura", "invoice", "pago", "payment",
    "nómina", "payroll", "impuesto", "tax", "iva", "dian", "financiero",
    "liquidez", "caja", "banco", "banking", "egreso", "ingreso",
  ],
  COLLECTIONS: [
    "cobranza", "cobro", "cartera", "collection", "vencida", "vencido",
    "overdue", "mora", "moroso", "deuda", "deudor", "debtors", "recaudo",
    "seguimiento de cobro", "factura vencida", "cliente moroso", "gestión de cobro",
    "recordatorio de pago", "plazo", "vencimiento",
  ],
  SALES: [
    "venta", "ventas", "sales", "cierre de venta", "prospecto", "lead",
    "cotización", "propuesta", "oportunidad", "pipeline", "funnel",
    "cliente nuevo", "cliente potencial", "negociación", "contrato",
    "comisión", "cuota", "meta de ventas", "pedido", "orden",
  ],
  MARKETING: [
    "marketing", "campaña", "campaign", "contenido", "content", "social",
    "redes sociales", "instagram", "facebook", "meta", "tiktok", "shopify",
    "lanzamiento", "launch", "pauta", "ads", "publicidad", "branding",
    "audiencia", "engagement", "influencer", "foto", "foto-estudio",
    "catálogo", "catalogo", "producto", "creatividad",
  ],
  OPERATIONS: [
    "operación", "operaciones", "operations", "proceso", "process",
    "procedimiento", "procedure", "inventario", "inventory", "logística",
    "logistic", "proveedor", "supplier", "compra", "purchase", "bodega",
    "warehouse", "despacho", "entrega", "delivery", "calidad", "quality",
    "mantenimiento", "sistema", "flujo de trabajo",
  ],
  CUSTOMER_SERVICE: [
    "cliente", "customer", "servicio al cliente", "soporte", "support",
    "reclamo", "complaint", "ticket", "atención", "post-venta",
    "seguimiento", "devolución", "garantía", "satisfacción", "nps",
    "chat", "whatsapp", "vip", "prioridad", "caso",
  ],
  EXECUTIVE: [
    "ejecutivo", "executive", "gerencia", "dirección", "strategy",
    "estrategia", "junta", "board", "decisión", "kpi", "okr",
    "revisión mensual", "revisión semanal", "planeación", "planning",
    "roadmap", "visión", "misión", "objetivo", "meta organizacional",
    "informe gerencial", "reporte ejecutivo",
  ],
  CUSTOM: [],
};

const PRIORITY_KEYWORDS: Record<PlaybookPriority, string[]> = {
  CRITICAL: [
    "crítico", "critico", "urgente", "critical", "emergencia", "emergency",
    "cierre", "clausura", "vencimiento legal", "obligatorio", "dian",
    "regulatorio", "compliance", "auditoría", "auditoria", "multa",
    "sanción", "sancion", "impago", "crisis",
  ],
  HIGH: [
    "importante", "alto", "high", "prioritario", "priority",
    "trimestral", "mensual", "semanal", "recurrente", "cobranza",
    "cliente vip", "cliente clave", "revisión", "aprobación",
    "facturación", "ingreso", "presupuesto",
  ],
  MEDIUM: [
    "medio", "medium", "moderado", "regular", "estándar",
    "seguimiento", "control", "proceso normal", "rutinario",
  ],
  LOW: [
    "bajo", "low", "menor", "informativo", "sugerencia",
    "mejora", "optimización", "futuro", "eventual",
  ],
};

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

// ── Inference functions ───────────────────────────────────────────────────────

/**
 * Infer the most likely PlaybookCategory from a title and/or description.
 *
 * Examples:
 *   "Proceso de cobranza semanal"          → COLLECTIONS
 *   "Proceso de cierre mensual"            → FINANCE
 *   "Campaña de lanzamiento de producto"   → MARKETING
 *   "Revisión ejecutiva trimestral"        → EXECUTIVE
 *
 * Returns CUSTOM when no category scores above 0.
 */
export function inferPlaybookCategory(
  title:       string,
  description: string = "",
): PlaybookCategory {
  const combinedText = `${title} ${description}`;
  let best: PlaybookCategory = "CUSTOM";
  let bestScore = 0;

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [PlaybookCategory, string[]][]) {
    if (cat === "CUSTOM") continue;
    const score = scoreText(combinedText, keywords);
    if (score > bestScore) {
      bestScore = score;
      best      = cat;
    }
  }

  return best;
}

/**
 * Infer the most likely PlaybookPriority from a title and/or description.
 *
 * CRITICAL wins if any critical keyword is present.
 * Falls back to HIGH → MEDIUM → LOW scoring.
 *
 * Default: MEDIUM when no signal is strong enough.
 */
export function inferPlaybookPriority(
  title:       string,
  description: string = "",
): PlaybookPriority {
  const combinedText = `${title} ${description}`;

  // Critical keywords are hard triggers
  if (scoreText(combinedText, PRIORITY_KEYWORDS.CRITICAL) > 0) return "CRITICAL";

  let best: PlaybookPriority = "MEDIUM";
  let bestScore = 0;

  for (const [pri, keywords] of Object.entries(PRIORITY_KEYWORDS) as [PlaybookPriority, string[]][]) {
    if (pri === "CRITICAL") continue;
    const score = scoreText(combinedText, keywords);
    if (score > bestScore) {
      bestScore = score;
      best      = pri;
    }
  }

  return best;
}

/**
 * Return all category keywords for a given category.
 * Useful for testing and debugging the classifier.
 */
export function getCategoryKeywords(category: PlaybookCategory): string[] {
  return [...(CATEGORY_KEYWORDS[category] ?? [])];
}

/**
 * Return all priority keywords for a given priority.
 */
export function getPriorityKeywords(priority: PlaybookPriority): string[] {
  return [...(PRIORITY_KEYWORDS[priority] ?? [])];
}
