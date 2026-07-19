/**
 * action-registry.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Handler registry and handler contract.
 *
 * Handlers implement dry-run/mock execution for action types.
 * No real external side effects in this sprint.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { ActionType } from "./action-types";
import type { BusinessAction } from "./action";
import type { ActionExecutionResult } from "./action-result";
import { buildDryRunResult } from "./action-result";
import type { ActionReceipt } from "./action-receipt";
import { buildDryRunReceipt } from "./action-receipt";

// -- Action Handler Contract --------------------------------------------------

/** Handler for a specific action type. */
export interface ActionHandler {
  /** Action type this handler supports. */
  actionType: ActionType;
  /** Check if this handler can execute the given action. */
  canExecute(action: BusinessAction): boolean;
  /** Dry-run execution (no side effects). */
  dryRun(action: BusinessAction): ActionExecutionResult;
  /** Real execution (reserved for future — must be safe in this sprint). */
  execute(action: BusinessAction): ActionExecutionResult;
}

// -- Action Registry ----------------------------------------------------------

/** In-memory action handler registry. */
export class ActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  /** Register a handler. */
  registerHandler(handler: ActionHandler): void {
    this.handlers.set(handler.actionType, handler);
  }

  /** Register multiple handlers. */
  registerAll(handlers: ActionHandler[]): void {
    for (const h of handlers) this.registerHandler(h);
  }

  /** Get handler for an action type. */
  getHandler(actionType: ActionType): ActionHandler | undefined {
    return this.handlers.get(actionType);
  }

  /** Check if a handler exists for the type. */
  canHandle(actionType: ActionType): boolean {
    return this.handlers.has(actionType);
  }

  /** List all registered handlers. */
  listHandlers(): ActionHandler[] {
    return Array.from(this.handlers.values());
  }

  /** Total registered handlers. */
  size(): number {
    return this.handlers.size;
  }

  /** Clear all handlers. */
  clear(): void {
    this.handlers.clear();
  }
}

// -- Built-in Dry-Run Handlers ------------------------------------------------

function makeDryRunHandler(actionType: ActionType, label: string): ActionHandler {
  return {
    actionType,
    canExecute: () => true,
    dryRun: (action) => buildDryRunResult({
      message: `[DRY RUN] ${label}: "${action.title}"`,
      output: { actionId: action.actionId, actionType, simulated: true },
      receipt: buildDryRunReceipt(action.actionId, "dry-run"),
      eventsToEmit: [{
        eventType: "business_action_completed",
        summary: `[DRY RUN] ${label} completado`,
        payload: { actionId: action.actionId, actionType, dryRun: true },
      }],
    }),
    execute: (action) => buildDryRunResult({
      message: `[MOCK] ${label}: "${action.title}" — ejecucion real no disponible en este sprint`,
      output: { actionId: action.actionId, actionType, mock: true },
      receipt: buildDryRunReceipt(action.actionId, "mock"),
    }),
  };
}

/** Built-in dry-run handlers for common action types. */
export const DEFAULT_HANDLERS: ActionHandler[] = [
  makeDryRunHandler("notification_send", "Enviar notificacion"),
  makeDryRunHandler("alert_create", "Crear alerta"),
  makeDryRunHandler("task_create", "Crear tarea"),
  makeDryRunHandler("manual_review_request", "Solicitar revision manual"),
  makeDryRunHandler("dashboard_update", "Actualizar dashboard"),
  makeDryRunHandler("timeline_append", "Agregar a timeline"),
  makeDryRunHandler("data_refresh_request", "Solicitar actualizacion de datos"),
  makeDryRunHandler("portfolio_remove_reference", "Retirar referencia de maleta"),
  makeDryRunHandler("portfolio_update", "Actualizar maleta"),
  makeDryRunHandler("production_review_request", "Solicitar revision de produccion"),
  makeDryRunHandler("production_create_request", "Solicitar creacion de OP"),
  makeDryRunHandler("inventory_transfer_suggestion", "Sugerir traslado de inventario"),
  makeDryRunHandler("inventory_transfer_request", "Solicitar traslado de inventario"),
  makeDryRunHandler("order_priority_mark", "Marcar pedido como prioritario"),
  makeDryRunHandler("customer_contact_request", "Solicitar contacto con cliente"),
  makeDryRunHandler("vendor_contact_request", "Solicitar contacto con vendedor"),
  makeDryRunHandler("external_api_call", "Llamada a API externa"),
  makeDryRunHandler("custom", "Accion personalizada"),
];
