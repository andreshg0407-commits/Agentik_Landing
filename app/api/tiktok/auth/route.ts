// app/api/tiktok/auth/route.ts
import { NextResponse } from "next/server"
import crypto from "crypto"
import { cookieDomain, cookieSecure } from "@/lib/tiktokEnv"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const STATE_COOKIE = "tt_state"
const AFTER_COOKIE = "tt_after"      // a dónde volver tras callback
const CLIENT_COOKIE = "tt_client_id" // a qué cliente asignar tokens

function safeInternalPath(p: string | null) {
  // Solo paths internos para evitar open-redirects
  if (!p || !p.startsWith("/")) return "/agents/luca"
  return p
}

function forceWww(hostname: string) {
  return hostname === "agentickers.com" ? "www.agentickers.com" : hostname
}

export async function GET(req: Request) {
  const u = new URL(req.url)

  // ✅ regla permanente: siempre www
  const forcedHost = forceWww(u.hostname)
  if (forcedHost !== u.hostname) {
    u.hostname = forcedHost
    return NextResponse.redirect(u.toString(), 302)
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY || ""
  const redirectUriRaw = process.env.TIKTOK_REDIRECT_URI || ""
  const scope = process.env.TIKTOK_SCOPES || "user.info.basic,video.upload,video.publish"

  // ✅ vienen desde tu UI:
  // /api/tiktok/auth?client_id=moda-colombia&redirect=/agents/luca
  const clientId = u.searchParams.get("client_id") || "moda-colombia"
  const after = safeInternalPath(u.searchParams.get("redirect"))

  // ✅ si falta env, volvemos a Luca con error (sin sandbox)
  if (!clientKey || !redirectUriRaw) {
    const out = new URL(req.url)
    out.hostname = "www.agentickers.com"
    out.pathname = after
    out.search = ""
    out.searchParams.set("tiktok_error", "missing_env_vars")
    const res = NextResponse.redirect(out.toString(), 302)
    res.headers.set("Cache-Control", "no-store, max-age=0")
    return res
  }

  // ✅ redirect_uri EXACTO y con www
  let redirectUri = redirectUriRaw
  try {
    const ru = new URL(redirectUriRaw)
    ru.hostname = forceWww(ru.hostname)
    redirectUri = ru.toString()
  } catch {
    // deja tal cual si no es URL válida
  }

  const state = crypto.randomBytes(16).toString("hex")

  // ✅ TikTok OAuth authorize
  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/")
  authUrl.searchParams.set("prompt", "consent")
  authUrl.searchParams.set("client_key", clientKey)
  authUrl.searchParams.set("scope", scope)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("state", state)

  const res = NextResponse.redirect(authUrl.toString(), 302)

  // ✅ cookies consistentes en www
  const secure = cookieSecure(u.hostname, u.protocol)
  const domain = cookieDomain(u.hostname, u.protocol)

  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 min
    domain,
  })

  res.cookies.set(AFTER_COOKIE, after, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
    domain,
  })

  res.cookies.set(CLIENT_COOKIE, clientId, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
    domain,
  })

  // 🔥 anti-cache
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}