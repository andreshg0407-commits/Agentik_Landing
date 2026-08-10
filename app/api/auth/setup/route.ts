/**
 * POST /api/auth/setup
 *
 * AGENTIK-SELLER-ACCESS-PROVISIONING-V1-01
 *
 * Seller account setup: validate one-time token + create password.
 * Activates the INVITED membership and enables login.
 *
 * PUBLIC endpoint — no auth required (seller doesn't have credentials yet).
 * Protected by: hashed token validation + expiration.
 */

import { NextResponse } from "next/server";
import { completeSellerSetup } from "@/lib/comercial/frontline/seller-access-provisioning";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, token, password } = body as {
      email?: string;
      token?: string;
      password?: string;
    };

    if (!email || !token || !password) {
      return NextResponse.json(
        { ok: false, error: "Todos los campos son requeridos" },
        { status: 400 },
      );
    }

    const result = await completeSellerSetup(email, token, password);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
