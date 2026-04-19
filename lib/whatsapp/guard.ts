/**
 * lib/whatsapp/guard.ts
 *
 * Module enablement guard for the WhatsApp feature.
 *
 * The WhatsApp module is opt-in only (see OPT_IN_MODULES in modules.ts).
 * These helpers enforce that guard at the API boundary.
 *
 * Usage in webhook:
 *   if (!await isWhatsAppEnabled(config.organizationId)) {
 *     return NextResponse.json({ ok: true }); // silently ack
 *   }
 *
 * Usage in authenticated API routes:
 *   const auth = await requireWhatsAppModule(organizationId);
 *   if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
 */

import { getEnabledModules }  from "@/lib/tenant/modules";
import { requireOrgMembership } from "@/lib/api/org-auth";

// ── Simple boolean check ──────────────────────────────────────────────────────

/**
 * Returns true if the WhatsApp module is explicitly enabled for the org.
 * Safe to call from webhook handlers (no auth check — uses org ID directly).
 */
export async function isWhatsAppEnabled(
  organizationId: string,
): Promise<boolean> {
  const mods = await getEnabledModules(organizationId);
  return mods.has("whatsapp");
}

// ── Authenticated route guard ─────────────────────────────────────────────────

type AuthResult = NonNullable<Awaited<ReturnType<typeof requireOrgMembership>>>;

type GuardResult =
  | { ok: true;  user: AuthResult["user"]; role: string }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Validates that:
 *   1. The caller is an authenticated org member (requireOrgMembership)
 *   2. The WhatsApp module is enabled for the org
 *
 * Returns { ok: true, user, role } or { ok: false, error, status }.
 * Callers return the error response immediately if ok is false.
 */
export async function requireWhatsAppModule(
  organizationId: string,
): Promise<GuardResult> {
  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  const enabled = await isWhatsAppEnabled(organizationId);
  if (!enabled) {
    return { ok: false, error: "WhatsApp module not enabled for this organization", status: 403 };
  }

  return { ok: true, user: auth.user, role: auth.role as string };
}
