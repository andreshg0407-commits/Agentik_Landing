/**
 * AI Commercial Intelligence — Scoring layer for the Agentik platform.
 *
 * Provides deterministic risk/health scoring for customers and opportunities
 * with an optional AI enhancement path via Claude claude-sonnet-4-6.
 *
 * When ANTHROPIC_API_KEY is present, Claude is called with a focused Spanish
 * prompt and the structured JSON response is parsed and returned.
 * On any error — missing key, API failure, malformed JSON — the module falls
 * back silently to the deterministic calculation so callers always receive a
 * usable result.
 *
 * All prompts and responses are in Spanish (Colombian business context).
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Input / output types ───────────────────────────────────────────────────────

export interface CustomerRiskInput {
  organizationId: string;
  customerId: string;
  customerName: string;
  ltv: number;
  lastPurchaseAt: Date | null;
  totalReceivable: number;
  overdueReceivable: number;
  maxDpd: number;
  purchasePeriods: number;
  totalSalesL12: number;
  totalSalesL3: number;
  openOpportunities: number;
  lastActivityAt: Date | null;
}

export interface CustomerRiskResult {
  customerId: string;
  riskScore: number;       // 0-100, higher = more risk
  healthScore: number;     // 0-100, higher = healthier
  churnRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  nextBestAction: string;
  aiSummary: string;
  source: "ai" | "deterministic";
}

export interface OpportunityScoreInput {
  opportunityId: string;
  title: string;
  amount: number;
  stage: string;
  probability: number;
  daysSinceLastActivity: number;
  daysSinceOpened: number;
  daysUntilExpectedClose: number | null;
  hasQuote: boolean;
  lossReasonHistory: string[];
}

export interface OpportunityScoreResult {
  opportunityId: string;
  aiCloseProbability: number;  // 0-1
  riskFlags: string[];
  recommendation: string;
  source: "ai" | "deterministic";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysSince(date: Date | null): number {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Extract a JSON object from Claude's response — handles markdown fences. */
function extractJson(raw: string): unknown {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : raw.trim();
  return JSON.parse(jsonStr);
}

// ── Deterministic customer risk scoring ───────────────────────────────────────

function deterministicCustomerRisk(input: CustomerRiskInput): CustomerRiskResult {
  const lastPurchaseDays = daysSince(input.lastPurchaseAt);
  const overdueRatio =
    input.totalReceivable > 0 ? input.overdueReceivable / input.totalReceivable : 0;
  const recentActivityRatio =
    input.totalSalesL12 > 0 ? input.totalSalesL3 / input.totalSalesL12 : 0;

  let riskScore = 0;

  // Cartera vencida
  if (input.overdueReceivable > 0) riskScore += 30;
  if (overdueRatio > 0.5) riskScore += 20;
  if (input.maxDpd > 60) riskScore += 20;

  // Inactividad de compras
  if (lastPurchaseDays > 90) riskScore += 10;
  if (lastPurchaseDays > 180) riskScore += 20;  // additive: 90d already added 10

  // Factores positivos
  if (input.openOpportunities > 0) riskScore -= 15;
  if (recentActivityRatio > 0.3) riskScore -= 10; // Recently active

  riskScore = clamp(riskScore, 0, 100);
  const healthScore = clamp(100 - riskScore, 0, 100);

  let churnRisk: CustomerRiskResult["churnRisk"];
  if (riskScore < 20) churnRisk = "LOW";
  else if (riskScore < 40) churnRisk = "MEDIUM";
  else if (riskScore < 70) churnRisk = "HIGH";
  else churnRisk = "CRITICAL";

  // Determine next best action based on dominant risk factor
  let nextBestAction: string;
  if (input.maxDpd > 60 || overdueRatio > 0.5) {
    nextBestAction = `Gestionar cartera vencida urgente: ${fmtCOP(input.overdueReceivable)} en mora (DPD máx. ${input.maxDpd} días). Coordinar cobranza con gerencia financiera.`;
  } else if (input.overdueReceivable > 0) {
    nextBestAction = `Revisar y gestionar ${fmtCOP(input.overdueReceivable)} en cartera vencida antes del próximo pedido.`;
  } else if (lastPurchaseDays > 180) {
    nextBestAction = `Cliente sin compras en más de 6 meses. Programar visita de reactivación comercial de alta prioridad.`;
  } else if (lastPurchaseDays > 90) {
    nextBestAction = `El cliente lleva ${lastPurchaseDays} días sin comprar. Contactar para oferta de reactivación o entender motivo de pausa.`;
  } else if (input.openOpportunities > 0) {
    nextBestAction = `Hay ${input.openOpportunities} oportunidad(es) abiertas. Dar seguimiento activo para avanzar en el embudo.`;
  } else {
    nextBestAction = `Cliente activo. Explorar oportunidades de venta cruzada basadas en historial de líneas compradas.`;
  }

  const aiSummary =
    `Cliente ${input.customerName}: riesgo ${churnRisk.toLowerCase()} (score ${riskScore}/100). ` +
    `LTV acumulado: ${fmtCOP(input.ltv)}. ` +
    `Ventas últimos 12 meses: ${fmtCOP(input.totalSalesL12)}. ` +
    (input.overdueReceivable > 0
      ? `Cartera vencida: ${fmtCOP(input.overdueReceivable)} (DPD máx. ${input.maxDpd}d). `
      : "Sin cartera vencida. ") +
    `Última compra: ${lastPurchaseDays < 9999 ? `hace ${lastPurchaseDays} días` : "sin registro"}.`;

  return {
    customerId: input.customerId,
    riskScore,
    healthScore,
    churnRisk,
    nextBestAction,
    aiSummary,
    source: "deterministic",
  };
}

// ── Deterministic opportunity scoring ─────────────────────────────────────────

function deterministicOpportunityScore(
  input: OpportunityScoreInput,
): OpportunityScoreResult {
  let base = clamp(input.probability / 100, 0, 1);
  const riskFlags: string[] = [];

  if (input.daysSinceLastActivity > 60) {
    base -= 0.25;
    riskFlags.push(`sin_actividad_${input.daysSinceLastActivity}d`);
  } else if (input.daysSinceLastActivity > 30) {
    base -= 0.15;
    riskFlags.push(`sin_actividad_${input.daysSinceLastActivity}d`);
  }

  if (input.daysUntilExpectedClose !== null && input.daysUntilExpectedClose < 0) {
    base -= 0.20;
    riskFlags.push("fecha_cierre_vencida");
  }

  if (input.hasQuote) {
    base += 0.10;
  }

  const aiCloseProbability = clamp(base, 0, 1);

  // Build recommendation
  let recommendation: string;
  if (riskFlags.includes("fecha_cierre_vencida") && input.daysSinceLastActivity > 30) {
    recommendation =
      `Oportunidad en riesgo alto: fecha de cierre vencida y sin actividad en ${input.daysSinceLastActivity} días. ` +
      `Contactar al cliente esta semana para actualizar estado o cerrar/cancelar el negocio.`;
  } else if (riskFlags.includes("fecha_cierre_vencida")) {
    recommendation =
      `La fecha esperada de cierre ya venció. Actualizar la fecha o acelerar el proceso de decisión con el cliente.`;
  } else if (input.daysSinceLastActivity > 30) {
    recommendation =
      `Han pasado ${input.daysSinceLastActivity} días sin actividad. Programar seguimiento inmediato para mantener el impulso del negocio.`;
  } else if (!input.hasQuote && input.probability >= 60) {
    recommendation =
      `Oportunidad en etapa avanzada (${input.stage}) sin cotización enviada. Emitir propuesta formal para acelerar el cierre.`;
  } else if (input.hasQuote && aiCloseProbability >= 0.7) {
    recommendation =
      `Alta probabilidad de cierre (${Math.round(aiCloseProbability * 100)}%). Hacer seguimiento de la cotización y resolver objeciones pendientes.`;
  } else {
    recommendation =
      `Continuar avanzando el negocio en la etapa "${input.stage}". Probabilidad estimada: ${Math.round(aiCloseProbability * 100)}%.`;
  }

  return {
    opportunityId: input.opportunityId,
    aiCloseProbability,
    riskFlags,
    recommendation,
    source: "deterministic",
  };
}

// ── AI path helpers ───────────────────────────────────────────────────────────

function buildCustomerRiskPrompt(input: CustomerRiskInput): string {
  const lastPurchaseDays = daysSince(input.lastPurchaseAt);
  return `Eres un analista de inteligencia comercial para una empresa colombiana.
Analiza el perfil de riesgo del siguiente cliente y responde ÚNICAMENTE con un JSON válido.

DATOS DEL CLIENTE:
- Nombre: ${input.customerName}
- LTV acumulado: ${fmtCOP(input.ltv)}
- Ventas últimos 12 meses: ${fmtCOP(input.totalSalesL12)}
- Ventas últimos 3 meses: ${fmtCOP(input.totalSalesL3)}
- Períodos de compra históricos: ${input.purchasePeriods}
- Última compra: ${lastPurchaseDays < 9999 ? `hace ${lastPurchaseDays} días` : "sin registro"}
- Cartera total por cobrar: ${fmtCOP(input.totalReceivable)}
- Cartera vencida: ${fmtCOP(input.overdueReceivable)}
- DPD máximo: ${input.maxDpd} días
- Oportunidades CRM abiertas: ${input.openOpportunities}
- Última actividad CRM: ${input.lastActivityAt ? `hace ${daysSince(input.lastActivityAt)} días` : "sin registro"}

Responde ÚNICAMENTE con este JSON (sin texto fuera del JSON):
{
  "riskScore": <número entero 0-100, donde 100 = máximo riesgo>,
  "healthScore": <número entero 0-100, donde 100 = máxima salud>,
  "churnRisk": <"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">,
  "nextBestAction": "<acción concreta y específica en español, máx 200 caracteres>",
  "aiSummary": "<resumen ejecutivo de 2-3 oraciones en español colombiano con datos clave>"
}

Reglas:
- healthScore = 100 - riskScore (o similar)
- churnRisk: LOW si riskScore < 20, MEDIUM si < 40, HIGH si < 70, CRITICAL si >= 70
- nextBestAction: acción inmediata y accionable basada en el mayor factor de riesgo
- aiSummary: incluir cifras en pesos COP, contexto de comportamiento de pago y compras`;
}

function buildOpportunityScorePrompt(input: OpportunityScoreInput): string {
  return `Eres un analista de pipeline comercial para una empresa colombiana.
Analiza la probabilidad de cierre de la siguiente oportunidad y responde ÚNICAMENTE con un JSON válido.

DATOS DE LA OPORTUNIDAD:
- Título: ${input.title}
- Monto: ${fmtCOP(input.amount)}
- Etapa: ${input.stage}
- Probabilidad base CRM: ${input.probability}%
- Días desde apertura: ${input.daysSinceOpened}
- Días sin actividad: ${input.daysSinceLastActivity}
- Días hasta cierre esperado: ${input.daysUntilExpectedClose !== null ? input.daysUntilExpectedClose : "no definido"}
- Cotización enviada: ${input.hasQuote ? "Sí" : "No"}
- Historial de pérdidas (razones previas): ${input.lossReasonHistory.length > 0 ? input.lossReasonHistory.join(", ") : "Ninguno"}

Responde ÚNICAMENTE con este JSON (sin texto fuera del JSON):
{
  "aiCloseProbability": <número entre 0.0 y 1.0>,
  "riskFlags": [<lista de strings con flags de riesgo identificados, en snake_case>],
  "recommendation": "<recomendación concreta de acción en español, máx 250 caracteres>"
}

Reglas:
- aiCloseProbability considera todos los factores: inactividad, fecha vencida, cotización, historial de pérdidas
- riskFlags: usa nombres descriptivos como "sin_actividad_Xd", "fecha_cierre_vencida", "negocio_grande", "patron_perdida_previo"
- recommendation: una acción específica y accionable para el vendedor`;
}

// ── scoreCustomerRisk ─────────────────────────────────────────────────────────

export async function scoreCustomerRisk(
  input: CustomerRiskInput,
): Promise<CustomerRiskResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return deterministicCustomerRisk(input);
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: buildCustomerRiskPrompt(input) }],
    });

    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    const parsed = extractJson(rawText) as {
      riskScore: number;
      healthScore: number;
      churnRisk: CustomerRiskResult["churnRisk"];
      nextBestAction: string;
      aiSummary: string;
    };

    return {
      customerId: input.customerId,
      riskScore: clamp(Number(parsed.riskScore), 0, 100),
      healthScore: clamp(Number(parsed.healthScore), 0, 100),
      churnRisk: parsed.churnRisk,
      nextBestAction: parsed.nextBestAction,
      aiSummary: parsed.aiSummary,
      source: "ai",
    };
  } catch (err) {
    console.error(
      "[CommercialIntelligence] scoreCustomerRisk AI call failed, using deterministic fallback:",
      (err as Error).message,
    );
    return deterministicCustomerRisk(input);
  }
}

// ── scoreOpportunityCloseProbability ─────────────────────────────────────────

export async function scoreOpportunityCloseProbability(
  input: OpportunityScoreInput,
): Promise<OpportunityScoreResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return deterministicOpportunityScore(input);
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: buildOpportunityScorePrompt(input) }],
    });

    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    const parsed = extractJson(rawText) as {
      aiCloseProbability: number;
      riskFlags: string[];
      recommendation: string;
    };

    return {
      opportunityId: input.opportunityId,
      aiCloseProbability: clamp(Number(parsed.aiCloseProbability), 0, 1),
      riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
      recommendation: parsed.recommendation,
      source: "ai",
    };
  } catch (err) {
    console.error(
      "[CommercialIntelligence] scoreOpportunityCloseProbability AI call failed, using deterministic fallback:",
      (err as Error).message,
    );
    return deterministicOpportunityScore(input);
  }
}

// ── scoreAllCustomers ─────────────────────────────────────────────────────────
// Scores a batch of customers. When AI is available, calls are made in parallel
// with a concurrency cap of 5 to avoid rate limit errors.

export async function scoreAllCustomers(
  organizationId: string,
  customerInputs: CustomerRiskInput[],
): Promise<CustomerRiskResult[]> {
  const CONCURRENCY = 5;
  const results: CustomerRiskResult[] = [];

  for (let i = 0; i < customerInputs.length; i += CONCURRENCY) {
    const batch = customerInputs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(input => scoreCustomerRisk(input)));
    results.push(...batchResults);
  }

  return results;
}

// ── detectInactiveHighValueCustomers ─────────────────────────────────────────

export function detectInactiveHighValueCustomers(
  customers: Array<{
    customerId: string;
    customerName: string;
    ltv: number;
    lastPurchaseAt: Date | null;
    totalSalesL12: number;
    inactivityDays: number;
  }>,
  thresholds: { inactivityDays?: number; minLtv?: number } = {},
): Array<{
  customerId: string;
  customerName: string;
  inactivityDays: number;
  ltv: number;
  urgency: "HIGH" | "CRITICAL";
}> {
  const inactivityThreshold = thresholds.inactivityDays ?? 60;
  const ltvThreshold = thresholds.minLtv ?? 0;

  const results: Array<{
    customerId: string;
    customerName: string;
    inactivityDays: number;
    ltv: number;
    urgency: "HIGH" | "CRITICAL";
  }> = [];

  for (const c of customers) {
    if (c.inactivityDays < inactivityThreshold) continue;
    if (c.ltv < ltvThreshold) continue;

    // CRITICAL: inactive > 2x threshold or high LTV at risk
    const urgency: "HIGH" | "CRITICAL" =
      c.inactivityDays >= inactivityThreshold * 2 || c.ltv >= 50_000_000
        ? "CRITICAL"
        : "HIGH";

    results.push({
      customerId: c.customerId,
      customerName: c.customerName,
      inactivityDays: c.inactivityDays,
      ltv: c.ltv,
      urgency,
    });
  }

  // Sort: CRITICAL first, then by inactivity desc
  results.sort((a, b) => {
    if (a.urgency !== b.urgency) {
      return a.urgency === "CRITICAL" ? -1 : 1;
    }
    return b.inactivityDays - a.inactivityDays;
  });

  return results;
}
