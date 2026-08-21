/**
 * lib/copilot-core/copilot-core-mock-responder.ts
 *
 * Copilot Core — Deterministic Mock Responder
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Pure function. Zero AI SDK, zero fetch, zero API keys,
 * zero external calls, zero dynamic provider selection.
 *
 * Formats the pre-authorized, aggregated, redacted DTO into
 * a human-readable summary for UI testing.
 */

import type {
  CopilotAnswer,
  TruthState,
  FactRef,
} from "./copilot-core-types";

/**
 * Build a deterministic mock response from a redacted DTO.
 * The DTO has already been authorized, aggregated, and redacted
 * by the gateway + adapter pipeline.
 *
 * Zero network. Zero AI SDK. Zero API keys.
 */
export function buildMockCopilotResponse(
  redactedDto: unknown,
  capabilityId: string,
  truthState: TruthState,
  facts: readonly FactRef[],
  organizationId: string,
  requestId: string,
): CopilotAnswer {
  const text = formatDtoAsText(redactedDto, capabilityId);

  return {
    answerId: crypto.randomUUID(),
    text,
    truthState,
    asOf: new Date().toISOString(),
    facts: [...facts],
    warnings: [],
    capabilityId,
    organizationId,
    requestId,
  };
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatDtoAsText(dto: unknown, capabilityId: string): string {
  if (dto == null || typeof dto !== "object") {
    return "No data available for this request.";
  }

  const data = dto as Record<string, unknown>;

  switch (capabilityId) {
    case "commercial.customers.summary.read":
      return formatCustomerSummary(data);
    case "commercial.orders.summary.read":
      return formatOrderSummary(data);
    case "commercial.sales.performance.read":
      return formatSalesPerformance(data);
    default:
      return "Data retrieved successfully.";
  }
}

function formatCustomerSummary(data: Record<string, unknown>): string {
  const total = data.totalCustomers ?? 0;
  const active = data.activeCustomers ?? 0;
  const inactive = data.inactiveCustomers ?? 0;

  return [
    `Resumen de clientes:`,
    `- Total de clientes: ${total}`,
    `- Clientes activos: ${active}`,
    `- Clientes inactivos: ${inactive}`,
  ].join("\n");
}

function formatOrderSummary(data: Record<string, unknown>): string {
  const today = data.totalOrdersToday ?? 0;
  const synced = data.synced ?? 0;
  const pending = data.pendingSag ?? 0;
  const conflicts = data.conflicts ?? 0;

  return [
    `Resumen de pedidos:`,
    `- Pedidos hoy: ${today}`,
    `- Sincronizados: ${synced}`,
    `- Pendientes SAG: ${pending}`,
    `- Conflictos: ${conflicts}`,
  ].join("\n");
}

function formatSalesPerformance(data: Record<string, unknown>): string {
  const orders = data.totalOrders ?? 0;
  const value = data.totalValue ?? 0;
  const avg = data.avgTicket ?? 0;
  const sellers = data.totalSellers ?? 0;
  const customers = data.totalCustomers ?? 0;

  return [
    `Desempeño de ventas:`,
    `- Total pedidos: ${orders}`,
    `- Valor total: $${Number(value).toLocaleString()}`,
    `- Ticket promedio: $${Number(avg).toLocaleString()}`,
    `- Vendedores activos: ${sellers}`,
    `- Clientes atendidos: ${customers}`,
  ].join("\n");
}
