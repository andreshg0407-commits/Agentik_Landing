// app/api/tiktok/userinfo/route.ts
import { NextResponse } from "next/server"

export const runtime = "nodejs"

const ACCESS_COOKIE = "tt_access_token"
const OPENID_COOKIE = "tt_open_id"

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || ""

    const getCookie = (name: string) => {
      const found = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`))
      return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : ""
    }

    const accessToken = getCookie(ACCESS_COOKIE)
    const openIdFromCookie = getCookie(OPENID_COOKIE)

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "missing_access_token" }, { status: 401 })
    }

    // ✅ SOLO fields de user.info.basic (evita scope_not_authorized)
    const fields = "open_id,union_id,display_name,avatar_url"

    const u = new URL("https://open.tiktokapis.com/v2/user/info/")
    u.searchParams.set("fields", fields)

    const r = await fetch(u.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    })

    const j = await r.json().catch(() => ({}))

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "tiktok_userinfo_failed", details: j },
        { status: 400 }
      )
    }

    // TikTok suele responder { data: { user: {...} } }
    const user = j?.data?.user || j?.user || j?.data || j

    // Fallback: si por alguna razón no viene open_id, muestra el de cookie
    if (user && !user.open_id && openIdFromCookie) user.open_id = openIdFromCookie

    return NextResponse.json({ ok: true, user }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "userinfo_exception", message: e?.message }, { status: 500 })
  }
}