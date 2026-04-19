// app/api/tiktok/logout/route.ts
import { NextResponse } from "next/server"
import { cookieDomain, cookieSecure } from "@/lib/tiktokEnv"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const COOKIES = [
  "tt_state",
  "tt_after",
  "tt_client_id",
  "tt_access_token",
  "tt_refresh_token",
  "tt_expires_in",
  "tt_open_id",
  "tt_scope",
  "tt_token_type",
  "tt_publish_id",
]

export async function POST(req: Request) {
  const u = new URL(req.url)
  const secure = cookieSecure(u.hostname, u.protocol)
  const domain = cookieDomain(u.hostname, u.protocol)

  const res = NextResponse.json({ ok: true })
  res.headers.set("Cache-Control", "no-store, max-age=0")

  for (const name of COOKIES) {
    res.cookies.set(name, "", {
      httpOnly: name === "tt_access_token" || name === "tt_refresh_token" || name === "tt_state" || name === "tt_after" || name === "tt_client_id",
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      domain,
    })
  }

  return res
}