"use server";

/**
 * Canonical server actions for ActionTask creation.
 * Importable from any client component in the app via @/lib/actions/server-actions.
 */

import { requireOrgAccess }      from "@/lib/auth/org-access";
import {
  createActionTask,
  type CreateActionInput,
  type ActionTask,
}                                from "@/lib/actions/service";

export type SAResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function saCreateAction(
  orgSlug: string,
  input:   CreateActionInput,
): Promise<SAResult<ActionTask>> {
  try {
    const { user, organization } = await requireOrgAccess(orgSlug);
    const task = await createActionTask(
      organization.id,
      user.email ?? user.id,
      input,
    );
    return { ok: true, data: task };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return { ok: false, error: "No autenticado" };
    if (msg === "ACCESS_DENIED")   return { ok: false, error: "Sin acceso" };
    if (msg === "ORG_NOT_FOUND")   return { ok: false, error: "Organización no encontrada" };
    console.error("[saCreateAction]", e);
    return { ok: false, error: msg };
  }
}
