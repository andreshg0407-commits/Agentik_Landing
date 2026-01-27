// app/api/tiktok/publish/route.ts
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const ACCESS_COOKIE = "tt_access_token"
const PUBLISH_COOKIE = "tt_publish_id"

function isProdHost(host: string) {
  return host === "www.agentickers.com" || host === "agentickers.com" || host.endsWith(".agentickers.com")
}

function getCookie(req: NextRequest, name: string) {
  return req.cookies.get(name)?.value || ""
}

function jsonError(msg: string, status = 400, details?: any) {
  return NextResponse.json({ ok: false, error: msg, details }, { status })
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || ""
  const isProd = isProdHost(host)

  const accessToken = getCookie(req, ACCESS_COOKIE)
  if (!accessToken) {
    return jsonError("Not connected. Please Connect TikTok first.", 401)
  }

  // 1) publish_id desde cookie (para no tocar tu TSX)
  const publishId = getCookie(req, PUBLISH_COOKIE)
  if (!publishId) {
    return jsonError("Missing publish_id. Run Upload first.", 400)
  }

  // 2) status/fetch (Get Post Status)  [oai_citation:6‡TikTok para Desarrolladores](https://developers.tiktok.com/doc/content-posting-api-get-started?utm_source=chatgpt.com)
  let statusJson: any
  try {
    const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    })

    statusJson = await statusRes.json().catch(() => null)

    if (!statusRes.ok || !statusJson) {
      return jsonError("tiktok_status_fetch_failed", 502, { status: statusRes.status, statusJson })
    }

    if (statusJson?.error?.code && statusJson.error.code !== "ok") {
      return jsonError("tiktok_status_error", 400, statusJson)
    }
  } catch (e) {
    return jsonError("tiktok_status_exception", 502, String(e))
  }

  // Normalmente viene algo como data.status + (cuando ya está) post_id
  const data = statusJson?.data || {}
  const publishStatus = data?.status || data?.publish_status || "UNKNOWN"

  // Si ya terminó, puedes limpiar la cookie para evitar confusiones en el video
  const doneStates = new Set(["PUBLISHED", "PUBLICLY_AVAILABLE", "COMPLETE", "SUCCESS", "FAILED"])
  const isDone = doneStates.has(String(publishStatus).toUpperCase())

  const res = NextResponse.json(
    {
      ok: true,
      publish_id: publishId,
      status: publishStatus,
      data,
      note: isDone
        ? "Final status reached."
        : "Not final yet. Click Publish again in a few seconds (this is normal).",
    },
    { status: 200 }
  )

  if (isDone) {
    res.cookies.set(PUBLISH_COOKIE, "", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      domain: isProd ? ".agentickers.com" : undefined,
    })
  }

  return res
}