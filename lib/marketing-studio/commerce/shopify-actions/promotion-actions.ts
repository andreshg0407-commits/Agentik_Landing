/**
 * lib/marketing-studio/commerce/shopify-actions/promotion-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Promotions domain actions.
 * SERVER ONLY — no React imports.
 */
import "server-only";

import {
  listPromotions,
  createPromotion      as _createPromotion,
  duplicatePromotion   as _duplicatePromotion,
  schedulePromotion    as _schedulePromotion,
  disablePromotion     as _disablePromotion,
  findPromotion        as _findPromotion,
  generateDiscountCode as _generateDiscountCode,
}                                           from "../shopify-promotions-service";
import type { PromotionCreateInput }        from "../shopify-promotions-types";
import type { ShopifyActionMeta }           from "./action-types";
import {
  start,
  mkOk,
  mkFail,
  mkStub,
  type ShopifyContext,
} from "./action-types";

// ── Registry entries ───────────────────────────────────────────────────────────

export const promotionActionRegistry: Record<string, ShopifyActionMeta> = {
  createPromotion: {
    id: "createPromotion", category: "promotions",
    displayName: "Crear promoción",
    description: "Crea una nueva regla de descuento en Shopify con los parámetros indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["PromotionCreateInput"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  duplicatePromotion: {
    id: "duplicatePromotion", category: "promotions",
    displayName: "Duplicar promoción",
    description: "Duplica una promoción existente con un nuevo título y fecha de inicio.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string", "overrides?: Partial<PromotionCreateInput>"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  schedulePromotion: {
    id: "schedulePromotion", category: "promotions",
    displayName: "Programar promoción",
    description: "Programa una promoción para que se active en una fecha futura.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["PromotionCreateInput con startsAt futuro"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  pausePromotion: {
    id: "pausePromotion", category: "promotions",
    displayName: "Pausar promoción",
    description: "Desactiva una promoción activa sin eliminarla.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  generateDiscountCode: {
    id: "generateDiscountCode", category: "promotions",
    displayName: "Generar código de descuento",
    description: "Genera un nuevo código de descuento asociado a una regla de precio existente.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string", "code: string"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  generateBulkDiscountCodes: {
    id: "generateBulkDiscountCodes", category: "promotions",
    displayName: "Generar códigos de descuento en lote",
    description: "Genera múltiples códigos únicos para una regla de precio.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string", "prefix: string", "count: number"],
    expectedOutputs: ["codes: string[]", "PromotionOperationResult[]"],
  },
  findActivePromotions: {
    id: "findActivePromotions", category: "promotions",
    displayName: "Buscar promociones activas",
    description: "Devuelve todas las promociones activas en este momento.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyPromotionSummary[]"],
  },
  findScheduledPromotions: {
    id: "findScheduledPromotions", category: "promotions",
    displayName: "Buscar promociones programadas",
    description: "Devuelve promociones creadas pero aún no activas.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyPromotionSummary[]"],
  },
  findExpiredPromotions: {
    id: "findExpiredPromotions", category: "promotions",
    displayName: "Buscar promociones vencidas",
    description: "Devuelve promociones cuya fecha de fin ya pasó.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyPromotionSummary[]"],
  },
};

// ── Actions ────────────────────────────────────────────────────────────────────

async function findActivePromotions(ctx: ShopifyContext) {
  const t0     = start();
  const result = await listPromotions(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result.active, `${result.active.length} promoción(es) activa(s).`, {}, t0);
}

async function findScheduledPromotions(ctx: ShopifyContext) {
  const t0     = start();
  const result = await listPromotions(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result.scheduled, `${result.scheduled.length} promoción(es) programada(s).`, {}, t0);
}

async function findExpiredPromotions(ctx: ShopifyContext) {
  const t0     = start();
  const result = await listPromotions(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result.expired, `${result.expired.length} promoción(es) vencida(s).`, {}, t0);
}

async function createPromotion(ctx: ShopifyContext, input: PromotionCreateInput) {
  const t0     = start();
  const result = await _createPromotion(ctx.organizationId, ctx.accessToken, ctx.shopDomain, input);
  if (result.ok) return mkOk(result, result.message ?? "Promoción creada correctamente.", {}, t0);
  return mkFail(result.errors ?? [result.message ?? "Error"], "No se pudo crear la promoción.", t0);
}

async function duplicatePromotion(
  ctx:         ShopifyContext,
  promotionId: string,
  overrides?:  Partial<PromotionCreateInput>,
) {
  const t0     = start();
  const result = await _duplicatePromotion(ctx.organizationId, ctx.accessToken, ctx.shopDomain, promotionId, overrides);
  if (result.ok) return mkOk(result, result.message ?? "Promoción duplicada correctamente.", {}, t0);
  return mkFail(result.errors ?? [result.message ?? "Error"], "No se pudo duplicar la promoción.", t0);
}

async function schedulePromotion(ctx: ShopifyContext, input: PromotionCreateInput) {
  const t0     = start();
  const result = await _schedulePromotion(ctx.organizationId, ctx.accessToken, ctx.shopDomain, input);
  if (result.ok) return mkOk(result, result.message ?? "Promoción programada.", {}, t0);
  return mkFail(result.errors ?? [result.message ?? "Error"], "No se pudo programar la promoción.", t0);
}

async function pausePromotion(ctx: ShopifyContext, promotionId: string) {
  const t0     = start();
  const result = await _disablePromotion(ctx.organizationId, ctx.accessToken, ctx.shopDomain, promotionId);
  if (result.ok) return mkOk(result, result.message ?? "Promoción pausada.", {}, t0);
  return mkFail(result.errors ?? [result.message ?? "Error"], "No se pudo pausar la promoción.", t0);
}

async function generateDiscountCode(ctx: ShopifyContext, promotionId: string, code: string) {
  const t0     = start();
  const result = await _generateDiscountCode(ctx.organizationId, ctx.accessToken, ctx.shopDomain, promotionId, code);
  if (result.ok) return mkOk(result, `Código "${code}" generado.`, {}, t0);
  return mkFail(result.errors ?? [result.message ?? "Error"], `No se pudo generar el código "${code}".`, t0);
}

async function generateBulkDiscountCodes(
  ctx:  ShopifyContext,
  opts: { promotionId: string; prefix: string; count: number },
) {
  const t0       = start();
  const codes: string[]  = [];
  const failed: string[] = [];

  for (let i = 0; i < Math.min(opts.count, 100); i++) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code   = `${opts.prefix}-${suffix}`;
    try {
      const result = await _generateDiscountCode(
        ctx.organizationId, ctx.accessToken, ctx.shopDomain, opts.promotionId, code,
      );
      if (result.ok) codes.push(code); else failed.push(code);
    } catch { failed.push(code); }
  }

  if (codes.length > 0) {
    return mkOk(
      { codes, failed },
      `${codes.length} código(s) generado(s). ${failed.length} fallido(s).`,
      { executed: codes.length, failed: failed.length },
      t0,
    );
  }
  return mkFail(
    [`No se pudo generar ningún código para la promoción ${opts.promotionId}.`],
    "Generación de códigos fallida.",
    t0,
  );
}

export async function findPromotionByName(ctx: ShopifyContext, title: string) {
  const t0     = start();
  const result = await _findPromotion(ctx.organizationId, ctx.accessToken, ctx.shopDomain, { title });
  if (result) return mkOk(result, `Promoción encontrada: "${result.title}".`, { executed: 1 }, t0);
  return mkOk(null, `No se encontró ninguna promoción con el nombre "${title}".`, { executed: 0, skipped: 1 }, t0);
}

async function resumePromotion(_ctx: ShopifyContext, _promotionId: string) {
  return mkStub("resumePromotion");
}

async function expirePromotion(_ctx: ShopifyContext, _promotionId: string) {
  return mkStub("expirePromotion");
}

async function deletePromotion(_ctx: ShopifyContext, _promotionId: string) {
  return mkStub("deletePromotion");
}

// ── Domain object ──────────────────────────────────────────────────────────────

export const promotionActions = {
  createPromotion,
  duplicatePromotion,
  schedulePromotion,
  pausePromotion,
  resumePromotion,
  expirePromotion,
  deletePromotion,
  generateDiscountCode,
  generateBulkDiscountCodes,
  findActivePromotions,
  findExpiredPromotions,
  findScheduledPromotions,
  findPromotionByName,
} as const;
