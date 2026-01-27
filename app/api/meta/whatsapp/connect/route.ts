import { NextResponse } from "next/server"
import crypto from "crypto"

export const runtime = "nodejs"

const STATE_COOKIE = "meta_oauth_state"

export async function GET(req: Request) {
  const appId = process.env.META_APP_ID
  const redirectUri = process.env.META_REDIRECT_URI

  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing META_APP_ID or META_REDIRECT_URI" },
      { status: 500 }
    )
  }

  const url = new URL(req.url)
  const state = crypto.randomBytes(24).toString("hex")

  const scope = [
    "whatsapp_business_messaging",
    "whatsapp_business_management",
    "business_management",
    "pages_show_list",
    "public_profile",
  ].join(",")

  const authUrl = new URL("https://www.facebook.com/v24.0/dialog/oauth")
  authUrl.searchParams.set("client_id", appId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", scope)

  const res = NextResponse.redirect(authUrl.toString())
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  })

  return res
}