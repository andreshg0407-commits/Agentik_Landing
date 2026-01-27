// app/api/tiktok/status/route.ts
import { NextResponse } from "next/server"

export const runtime = "nodejs"

function pickCookie(cookieHeader: string, name: string) {
  const hit = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : ""
}

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || ""

  // httpOnly (server sí puede leerlos)
  const access_token = pickCookie(cookieHeader, "tt_access_token")
  const refresh_token = pickCookie(cookieHeader, "tt_refresh_token")

  // visibles (httpOnly:false)
  const open_id = pickCookie(cookieHeader, "tt_open_id")
  const scope = pickCookie(cookieHeader, "tt_scope")
  const expires_in = pickCookie(cookieHeader, "tt_expires_in")
  const token_type = pickCookie(cookieHeader, "tt_token_type")

  const connected = Boolean(open_id && access_token)

  return NextResponse.json({
    ok: true,
    connected,
    tiktok: {
      open_id: open_id || null,
      scope: scope || null,
      expires_in: expires_in ? Number(expires_in) : null,
      token_type: token_type || null,
      has_access_token: Boolean(access_token),
      has_refresh_token: Boolean(refresh_token),
    },
  })
}