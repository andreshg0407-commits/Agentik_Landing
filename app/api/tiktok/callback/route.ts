// app/api/tiktok/callback/route.ts
import { NextResponse } from "next/server"
import { cookieDomain, cookieSecure } from "@/app/lib/tiktokEnv"

export const runtime = "nodejs"

const STATE_COOKIE = "tt_state"
const AFTER_COOKIE = "tt_after"
const CLIENT_COOKIE = "tt_client_id"

const ACCESS_COOKIE = "tt_access_token"
const REFRESH_COOKIE = "tt_refresh_token"
const EXPIRES_COOKIE = "tt_expires_in"
const OPENID_COOKIE = "tt_open_id"
const SCOPE_COOKIE = "tt_scope"

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function pickCookie(cookieHeader: string, name: string) {
  const hit = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : ""
}

function safeInternalPath(p: string | null) {
  if (!p || !p.startsWith("/")) return "/agents/luca"
  return p
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

export async function GET(req: Request) {
  const u = new URL(req.url)

  // Fuerza www (cookies consistentes)
  if (u.hostname === "agentickers.com") {
    u.hostname = "www.agentickers.com"
    return NextResponse.redirect(u.toString(), 302)
  }

  const code = u.searchParams.get("code")
  const returnedState = u.searchParams.get("state")
  const ttError = u.searchParams.get("error")
  const ttErrorDesc = u.searchParams.get("error_description")

  const cookieHeader = req.headers.get("cookie") || ""
  const cookieState = pickCookie(cookieHeader, STATE_COOKIE)

  // dónde volver + qué cliente
  const after = safeInternalPath(pickCookie(cookieHeader, AFTER_COOKIE) || "/agents/luca")
  const clientId = pickCookie(cookieHeader, CLIENT_COOKIE) || "moda-colombia"

  const redirectWithError = (msg: string) => {
    const out = new URL(req.url)
    out.hostname = "www.agentickers.com"
    out.pathname = after
    out.search = ""
    out.searchParams.set("tiktok_error", msg)
    out.searchParams.set("client_id", clientId)
    return NextResponse.redirect(out.toString(), 302)
  }

  if (ttError) return redirectWithError(`tiktok_${ttError}${ttErrorDesc ? `_${ttErrorDesc}` : ""}`)
  if (!code || !returnedState) return redirectWithError("missing_code_or_state")
  if (!cookieState) return redirectWithError("invalid_state_missing_cookie")
  if (cookieState !== returnedState) return redirectWithError("invalid_state_mismatch")

  const clientKey = process.env.TIKTOK_CLIENT_KEY || ""
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || ""
  const redirectUriRaw = process.env.TIKTOK_REDIRECT_URI || ""

  if (!clientKey || !clientSecret || !redirectUriRaw) return redirectWithError("missing_env_vars")

  // redirect_uri con www (TikTok quisquilloso)
  let redirectUri = redirectUriRaw
  try {
    const ru = new URL(redirectUriRaw)
    if (ru.hostname === "agentickers.com") ru.hostname = "www.agentickers.com"
    redirectUri = ru.toString()
  } catch {
    // deja como está si no parsea
  }

  // webhook token-save (si env falta, usa el default)
  const n8nTokenWebhookUrl =
    process.env.N8N_TIKTOK_TOKEN_WEBHOOK_URL?.trim() ||
    "https://iagentscolombia.app.n8n.cloud/webhook/token-save"

  try {
    const body = new URLSearchParams()
    body.set("client_key", clientKey)
    body.set("client_secret", clientSecret)
    body.set("code", code)
    body.set("grant_type", "authorization_code")
    body.set("redirect_uri", redirectUri)

    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })

    const tokenJson = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenJson) return redirectWithError("token_exchange_failed")

    const data = tokenJson.data || tokenJson
    const accessToken = data.access_token as string | undefined
    const refreshToken = data.refresh_token as string | undefined
    const expiresIn = data.expires_in as number | undefined
    const openId = data.open_id as string | undefined
    const scope = data.scope as string | undefined
    const tokenType = data.token_type as string | undefined

    if (!accessToken) return redirectWithError("missing_access_token")
    if (!openId) return redirectWithError("missing_open_id") // ← importante para “connected”

    // 1) Persistir en n8n (token-save)
    let n8nSaved = false
    let n8nStatus: number | null = null

    try {
      const saveRes = await fetchWithTimeout(
        n8nTokenWebhookUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            source: "agentik-web",
            received_at: new Date().toISOString(),
            open_id: openId,
            access_token: accessToken,
            refresh_token: refreshToken || null,
            expires_in: typeof expiresIn === "number" ? expiresIn : null,
            scope: scope || null,
            token_type: tokenType || null,
            raw: tokenJson,
          }),
        },
        8000
      )

      n8nStatus = saveRes.status
      n8nSaved = saveRes.ok
    } catch {
      n8nSaved = false
      n8nStatus = null
    }

    // 2) redirect final al after + flags debug
    const out = new URL(req.url)
    out.hostname = "www.agentickers.com"
    out.pathname = after
    out.search = ""
    out.searchParams.set("tiktok_connected", "1")
    out.searchParams.set("client_id", clientId)
    out.searchParams.set("n8n_saved", n8nSaved ? "1" : "0")
    if (n8nStatus !== null) out.searchParams.set("n8n_status", String(n8nStatus))

    const res = NextResponse.redirect(out.toString(), 302)

    const secure = cookieSecure(u.hostname, u.protocol)
    const domain = cookieDomain(u.hostname, u.protocol)

    // limpia temporales
    res.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0, domain })
    res.cookies.set(AFTER_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0, domain })
    res.cookies.set(CLIENT_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0, domain })

    // guarda tokens cookies
    res.cookies.set(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
      domain,
    })
    if (refreshToken) {
      res.cookies.set(REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
        domain,
      })
    }

    // visibles UI/status
    res.cookies.set(OPENID_COOKIE, openId, { httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE_SECONDS, domain })
    if (scope) res.cookies.set(SCOPE_COOKIE, scope, { httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE_SECONDS, domain })
    if (typeof expiresIn === "number") res.cookies.set(EXPIRES_COOKIE, String(expiresIn), { httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE_SECONDS, domain })
    if (tokenType) res.cookies.set("tt_token_type", tokenType, { httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE_SECONDS, domain })

    return res
  } catch {
    return redirectWithError("callback_exception")
  }
}