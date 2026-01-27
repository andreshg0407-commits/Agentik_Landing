import { NextResponse } from "next/server"

export const runtime = "nodejs"

const STATE_COOKIE = "meta_oauth_state"
const ACCESS_COOKIE = "meta_wa_access_token"

function getCookie(req: Request, name: string) {
  const cookieHeader = req.headers.get("cookie") || ""
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const redirectUri = process.env.META_REDIRECT_URI

  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Missing META_APP_ID / META_APP_SECRET / META_REDIRECT_URI" },
      { status: 500 }
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/review/whatsapp?error=missing_code_or_state", url.origin))
  }

  const cookieState = getCookie(req, STATE_COOKIE)
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL("/review/whatsapp?error=invalid_state", url.origin))
  }

  const tokenUrl = new URL("https://graph.facebook.com/v24.0/oauth/access_token")
  tokenUrl.searchParams.set("client_id", appId)
  tokenUrl.searchParams.set("client_secret", appSecret)
  tokenUrl.searchParams.set("redirect_uri", redirectUri)
  tokenUrl.searchParams.set("code", code)

  const tokenRes = await fetch(tokenUrl.toString())
  const tokenJson = await tokenRes.json().catch(() => ({}))

  if (!tokenRes.ok || !tokenJson.access_token) {
    return NextResponse.redirect(
      new URL(`/review/whatsapp?error=token_exchange_failed`, url.origin)
    )
  }

  const res = NextResponse.redirect(new URL("/review/whatsapp?connected=1", url.origin))
  res.cookies.set(ACCESS_COOKIE, tokenJson.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  })
  res.cookies.delete(STATE_COOKIE)
  return res
}