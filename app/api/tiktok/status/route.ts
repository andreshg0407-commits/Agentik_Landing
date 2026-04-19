// app/api/tiktok/status/route.ts
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const ACCESS_COOKIE = "tt_access_token"
const OPENID_COOKIE = "tt_open_id"
const SCOPE_COOKIE = "tt_scope"
const TOKEN_TYPE_COOKIE = "tt_token_type"

function pickCookie(cookieHeader: string, name: string) {
  const hit = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : ""
}

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || ""
  const access = pickCookie(cookieHeader, ACCESS_COOKIE)
  const open_id = pickCookie(cookieHeader, OPENID_COOKIE)
  const scope = pickCookie(cookieHeader, SCOPE_COOKIE)
  const token_type = pickCookie(cookieHeader, TOKEN_TYPE_COOKIE)

  const connected = Boolean(access && open_id)

  const res = NextResponse.json({
    ok: true,
    connected,
    tiktok: {
      open_id: open_id || null,
      scope: scope || null,
      token_type: token_type || null,
      has_access_token: Boolean(access),
    },
  })

  // 🔥 evita “connected fantasma” por cache
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}