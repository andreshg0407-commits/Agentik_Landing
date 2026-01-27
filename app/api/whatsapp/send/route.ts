import { NextResponse } from "next/server"

export const runtime = "nodejs"

const ACCESS_COOKIE = "meta_wa_access_token"

function normalizeToE164(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return ""
  return trimmed.startsWith("+") ? trimmed.slice(1) : trimmed
}

function getCookie(req: Request, name: string) {
  const cookieHeader = req.headers.get("cookie") || ""
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null
}

export async function POST(req: Request) {
  const { message, to } = await req.json().catch(() => ({}))

  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID
  const defaultTo = process.env.META_WA_TEST_TO

  if (!phoneNumberId) {
    return NextResponse.json({ error: "Missing META_WA_PHONE_NUMBER_ID" }, { status: 500 })
  }

  const accessToken = getCookie(req, ACCESS_COOKIE)
  if (!accessToken) {
    return NextResponse.json(
      { error: "Not connected. Click 'Continue with Facebook' first." },
      { status: 401 }
    )
  }

  const bodyText = typeof message === "string" ? message.trim() : ""
  if (!bodyText) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 })
  }

  const destRaw = (typeof to === "string" && to.trim()) ? to : defaultTo
  const dest = destRaw ? normalizeToE164(destRaw) : ""
  if (!dest) {
    return NextResponse.json({ error: "Missing destination number" }, { status: 400 })
  }

  const sendUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`

  const payload = {
    messaging_product: "whatsapp",
    to: dest,
    type: "text",
    text: { body: bodyText },
  }

  const r = await fetch(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const json = await r.json()

  if (!r.ok) {
    return NextResponse.json(
      { error: "WhatsApp send failed", details: json },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, result: json })
}