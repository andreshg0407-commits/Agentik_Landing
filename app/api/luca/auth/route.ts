// app/api/luca/auth/route.ts
import { NextResponse } from "next/server"
import crypto from "crypto"
import { cookieDomain, cookieSecure } from "@/lib/tiktokEnv"

export const runtime = "nodejs"

const ALLOWED_CLIENTS = ["moda-colombia", "castillitos", "do-jeans"]

const SESSION_COOKIE = "agentik_session"
const SESSION_TTL_SECONDS = 60 * 60 * 24 // 24h

function pickCookie(cookieHeader: string, name: string) {
  const hit = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : ""
}

function sign(payload: object, secret: string) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url")
  return `${data}.${sig}`
}

export async function POST(req: Request) {
  const u = new URL(req.url)

  try {
    const secret = process.env.AGENTIK_SESSION_SECRET || ""
    if (!secret) {
      return NextResponse.json(
        { ok: false, message: "Falta AGENTIK_SESSION_SECRET en env" },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => null)
    const client_id = body?.client_id as string | undefined

    if (!client_id) {
      return NextResponse.json({ ok: false, message: "client_id requerido" }, { status: 400 })
    }

    if (!ALLOWED_CLIENTS.includes(client_id)) {
      return NextResponse.json({ ok: false, message: "Cliente no autorizado" }, { status: 403 })
    }

    // ✅ Verificar que TikTok esté conectado (cookies que ya guardas en callback)
    const cookieHeader = req.headers.get("cookie") || ""
    const open_id = pickCookie(cookieHeader, "tt_open_id")
    const access_token = pickCookie(cookieHeader, "tt_access_token") // httpOnly, igual la leemos por header

    if (!open_id || !access_token) {
      return NextResponse.json(
        {
          ok: false,
          needs_tiktok: true,
          message: "TikTok no está conectado. Inicia sesión con TikTok primero.",
        },
        { status: 401 }
      )
    }

    const now = Math.floor(Date.now() / 1000)
    const sessionPayload = {
      v: 1,
      agent: "luca",
      client_id,
      open_id,
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
    }

    const token = sign(sessionPayload, secret)

    const res = NextResponse.json({
      ok: true,
      agent: "luca",
      client_id,
      open_id,
      expires_in: SESSION_TTL_SECONDS,
    })

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure(u.hostname, u.protocol),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
      domain: cookieDomain(u.hostname, u.protocol),
    })

    return res
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "Error en auth de Luca" },
      { status: 500 }
    )
  }
}