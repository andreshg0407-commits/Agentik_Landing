/**
 * lib/comercial/maletas/replenishment-plan-service.ts
 *
 * MALETAS-BULK-REPLENISHMENT-PERSISTENCE-01
 *
 * Server-only service for persistent replenishment plans.
 * All queries filter by organizationId. No trust in client-side orgSlug.
 */

import { prisma } from "@/lib/prisma";

// ── Valid state transitions ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:             ["pending_warehouse", "cancelled"],
  pending_warehouse: ["prepared", "shipped", "cancelled"],
  prepared:          ["shipped"],
  shipped:           ["received"],
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Document number generation ───────────────────────────────────────────────

async function generateUniqueDocumentNumber(organizationId: string): Promise<string> {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PS-${ymd}-`;

  // Find highest existing seq for this org+date
  const existing = await (prisma as any).maletaReplenishmentPlan.findMany({
    where: {
      organizationId,
      documentNumber: { startsWith: prefix },
    },
    select: { documentNumber: true },
    orderBy: { documentNumber: "desc" },
    take: 1,
  });

  let seq = 1;
  if (existing.length > 0 && existing[0].documentNumber) {
    const lastSeq = parseInt(existing[0].documentNumber.slice(prefix.length), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ── Create event helper ──────────────────────────────────────────────────────

async function createEvent(
  organizationId: string,
  planId: string,
  type: string,
  description: string,
  userId: string = "sistema",
) {
  return (prisma as any).maletaReplenishmentEvent.create({
    data: { organizationId, planId, type, description, userId },
  });
}

// ── Include clause for full plan queries ─────────────────────────────────────

const PLAN_INCLUDE = {
  items: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "asc" as const } },
};

// ── Public API ───────────────────────────────────────────────────────────────

export interface PlanFilters {
  vendorId?: string;
  status?: string;
  limit?: number;
}

export interface AddItemInput {
  subgroupSag: string;
  removedReference?: string | null;
  removedDescription?: string | null;
  addedReference: string;
  addedDescription: string;
  quantity: number;
  reason?: string;
}

/**
 * List replenishment plans for an organization.
 */
export async function listReplenishmentPlans(
  organizationId: string,
  filters: PlanFilters = {},
) {
  const where: Record<string, unknown> = { organizationId };
  if (filters.vendorId) where.vendorId = filters.vendorId;
  if (filters.status) where.status = filters.status;

  return (prisma as any).maletaReplenishmentPlan.findMany({
    where,
    include: PLAN_INCLUDE,
    orderBy: { updatedAt: "desc" },
    take: filters.limit ?? 100,
  });
}

/**
 * Get the active draft plan for a vendor (at most one).
 */
export async function getActiveDraftPlan(
  organizationId: string,
  vendorId: string,
) {
  return (prisma as any).maletaReplenishmentPlan.findFirst({
    where: { organizationId, vendorId, status: "draft" },
    include: PLAN_INCLUDE,
  });
}

/**
 * Get a single plan by ID (with org guard).
 */
export async function getPlan(organizationId: string, planId: string) {
  const plan = await (prisma as any).maletaReplenishmentPlan.findFirst({
    where: { id: planId, organizationId },
    include: PLAN_INCLUDE,
  });
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  return plan;
}

/**
 * Create a new draft plan or return the existing one.
 * Rule: only one draft per org+vendor.
 */
export async function createOrGetDraftPlan(
  organizationId: string,
  vendorId: string,
  vendorName: string,
  warehouseCode: string,
  userId: string = "sistema",
) {
  const existing = await getActiveDraftPlan(organizationId, vendorId);
  if (existing) return existing;

  const plan = await (prisma as any).maletaReplenishmentPlan.create({
    data: {
      organizationId,
      vendorId,
      vendorName,
      warehouseCode,
      status: "draft",
      createdBy: userId,
    },
    include: PLAN_INCLUDE,
  });

  await createEvent(organizationId, plan.id, "created", "Plan de surtido creado", userId);

  // Re-fetch to include the event
  return getPlan(organizationId, plan.id);
}

/**
 * Add an item to a plan. Plan must be in draft status.
 */
export async function addItemToPlan(
  organizationId: string,
  planId: string,
  input: AddItemInput,
  userId: string = "sistema",
) {
  // Validate
  if (!input.addedReference?.trim()) throw new Error("INVALID_ADDED_REFERENCE");
  if (!input.quantity || input.quantity <= 0) throw new Error("INVALID_QUANTITY");

  const plan = await getPlan(organizationId, planId);
  if (plan.status !== "draft") throw new Error("PLAN_NOT_DRAFT");

  const item = await (prisma as any).maletaReplenishmentItem.create({
    data: {
      organizationId,
      planId,
      subgroupSag: input.subgroupSag || "SIN_SUBGRUPO",
      removedReference: input.removedReference || null,
      removedDescription: input.removedDescription || null,
      addedReference: input.addedReference,
      addedDescription: input.addedDescription,
      quantity: input.quantity,
      reason: input.reason || "",
    },
  });

  // Update summary
  const items = await (prisma as any).maletaReplenishmentItem.findMany({
    where: { planId },
  });
  const summaryAddedRefs = items.length;
  const summaryRemovedRefs = items.filter((i: { removedReference: string | null }) => i.removedReference).length;

  await (prisma as any).maletaReplenishmentPlan.update({
    where: { id: planId },
    data: { summaryAddedRefs, summaryRemovedRefs },
  });

  await createEvent(organizationId, planId, "item_added", `Agregado: ${input.addedReference}`, userId);

  return item;
}

/**
 * Remove an item from a plan. Plan must be in draft status.
 */
export async function removeItemFromPlan(
  organizationId: string,
  planId: string,
  itemId: string,
  userId: string = "sistema",
) {
  const plan = await getPlan(organizationId, planId);
  if (plan.status !== "draft") throw new Error("PLAN_NOT_DRAFT");

  // Verify item belongs to plan + org
  const item = await (prisma as any).maletaReplenishmentItem.findFirst({
    where: { id: itemId, planId, organizationId },
  });
  if (!item) throw new Error("ITEM_NOT_FOUND");

  await (prisma as any).maletaReplenishmentItem.delete({ where: { id: itemId } });

  // Update summary
  const remaining = await (prisma as any).maletaReplenishmentItem.findMany({
    where: { planId },
  });
  const summaryAddedRefs = remaining.length;
  const summaryRemovedRefs = remaining.filter((i: { removedReference: string | null }) => i.removedReference).length;

  await (prisma as any).maletaReplenishmentPlan.update({
    where: { id: planId },
    data: { summaryAddedRefs, summaryRemovedRefs },
  });

  await createEvent(organizationId, planId, "item_removed", `Eliminado: ${item.addedReference}`, userId);
}

/**
 * Generate a document — transitions draft → pending_warehouse.
 */
export async function generatePlanDocument(
  organizationId: string,
  planId: string,
  userId: string = "sistema",
) {
  const plan = await getPlan(organizationId, planId);
  if (plan.status !== "draft") throw new Error("PLAN_NOT_DRAFT");
  if (plan.items.length === 0) throw new Error("PLAN_EMPTY");

  const documentNumber = await generateUniqueDocumentNumber(organizationId);

  await (prisma as any).maletaReplenishmentPlan.update({
    where: { id: planId },
    data: { status: "pending_warehouse", documentNumber },
  });

  await createEvent(organizationId, planId, "document_generated", `Documento generado: ${documentNumber}`, userId);

  return getPlan(organizationId, planId);
}

/**
 * Update plan status. Validates transition rules.
 */
export async function updatePlanStatus(
  organizationId: string,
  planId: string,
  newStatus: string,
  userId: string = "sistema",
) {
  const plan = await getPlan(organizationId, planId);

  if (!isValidTransition(plan.status, newStatus)) {
    throw new Error(`INVALID_TRANSITION: ${plan.status} → ${newStatus}`);
  }

  await (prisma as any).maletaReplenishmentPlan.update({
    where: { id: planId },
    data: { status: newStatus },
  });

  const eventType = newStatus === "shipped" ? "shipped"
    : newStatus === "received" ? "received"
    : newStatus === "cancelled" ? "cancelled"
    : newStatus === "prepared" ? "prepared"
    : "document_generated";

  const statusLabels: Record<string, string> = {
    pending_warehouse: "Pendiente bodega",
    prepared: "Preparado",
    shipped: "Enviado",
    received: "Recibido",
    cancelled: "Cancelado",
  };

  await createEvent(organizationId, planId, eventType, `Estado: ${statusLabels[newStatus] ?? newStatus}`, userId);

  return getPlan(organizationId, planId);
}

/**
 * List plan history for an organization with filters.
 */
export async function listPlanHistory(
  organizationId: string,
  filters: PlanFilters = {},
) {
  return listReplenishmentPlans(organizationId, filters);
}
