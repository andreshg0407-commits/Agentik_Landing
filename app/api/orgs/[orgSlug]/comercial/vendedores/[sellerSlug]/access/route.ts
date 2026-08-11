/**
 * /api/orgs/[orgSlug]/comercial/vendedores/[sellerSlug]/access
 *
 * AGENTIK-SELLER-ACCESS-PROVISIONING-V1-01
 *
 * GET  — seller access state (admin-only)
 * POST — provision / resend / revoke seller access (admin-only)
 *
 * Server-side enforcement:
 *   - Only ORG_ADMIN/SUPER_ADMIN can call this endpoint (MANAGER excluded per §4)
 *   - sellerSlug and sellerTerceroId come from the server-side seller directory
 *   - Client cannot override seller identity
 */

import { NextResponse } from "next/server";
import { requireCommercialAccess } from "@/lib/auth/org-access";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";
import { buildSellerDirectory } from "@/lib/comercial/foundation/seller-directory";
import { lookupSellerTerceroId } from "@/lib/comercial/frontline/seller-tercero-mapping";
import {
  provisionSellerAccess,
  resendSellerSetupLink,
  revokeSellerAccess,
  getSellerAccessState,
} from "@/lib/comercial/frontline/seller-access-provisioning";

export const runtime = "nodejs";

// ── Admin gate ──────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(["ORG_ADMIN", "SUPER_ADMIN"]);

// ── GET — access state ──────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; sellerSlug: string }> },
) {
  try {
    const { orgSlug, sellerSlug } = await params;
    const { user, organization, membership } = await requireCommercialAccess(orgSlug);

    if (!ADMIN_ROLES.has(membership.role)) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const status = await getSellerAccessState(organization.id, sellerSlug);
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// ── POST — provision / resend / revoke ──────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; sellerSlug: string }> },
) {
  try {
    const { orgSlug, sellerSlug } = await params;
    const { user, organization, membership } = await requireCommercialAccess(orgSlug);

    // Admin gate
    if (!ADMIN_ROLES.has(membership.role)) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action as string;

    // Validate seller exists in CRM directory (server-side — not from client)
    const directory = await buildSellerDirectory(organization.id);
    const seller = directory.sellers.find(s => s.sellerSlug === sellerSlug);
    if (!seller) {
      return NextResponse.json(
        { ok: false, error: `Vendedor "${sellerSlug}" no encontrado en el directorio CRM` },
        { status: 404 },
      );
    }

    switch (action) {
      case "provision": {
        const email = body.email as string | undefined;
        if (!email?.trim()) {
          return NextResponse.json({ ok: false, error: "email es requerido" }, { status: 400 });
        }

        // Resolve sellerTerceroId from server-side canonical mapping
        // Client CANNOT provide or override sellerTerceroId
        const terceroIdStr = await lookupSellerTerceroId(organization.id, sellerSlug);
        if (!terceroIdStr) {
          return NextResponse.json(
            { ok: false, error: `No se encontro sellerTerceroId para "${sellerSlug}" en la data SAG. Verifique que el vendedor tenga pedidos sincronizados.` },
            { status: 422 },
          );
        }

        const sellerTerceroId = parseInt(terceroIdStr, 10);
        if (isNaN(sellerTerceroId) || sellerTerceroId <= 0) {
          return NextResponse.json(
            { ok: false, error: `sellerTerceroId invalido: ${terceroIdStr}` },
            { status: 422 },
          );
        }

        const result = await provisionSellerAccess({
          organizationId: organization.id,
          sellerSlug,
          sellerTerceroId,
          sellerName: seller.sellerName,
          email: email.trim(),
          adminUserId: user.id,
        });

        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
        }

        // Return result WITHOUT logging the token
        return NextResponse.json({
          ok: true,
          setupUrl: result.setupUrl,
          userId: result.userId,
          membershipId: result.membershipId,
          isNewUser: result.isNewUser,
        });
      }

      case "resend": {
        const result = await resendSellerSetupLink(
          organization.id,
          sellerSlug,
          user.id,
        );

        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
        }

        return NextResponse.json({
          ok: true,
          setupUrl: result.setupUrl,
        });
      }

      case "revoke": {
        const result = await revokeSellerAccess(
          organization.id,
          sellerSlug,
          user.id,
        );

        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
        }

        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json(
          { ok: false, error: `Accion desconocida: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
