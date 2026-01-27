// app/api/wa/incoming/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

// ✅ ENV necesarias
// META_VERIFY_TOKEN=agentik_verify (o el que uses en Meta)
// N8N_WA_INCOMING_WEBHOOK_URL=https://TU-URL.n8n.cloud/webhook/wa/incoming (tu webhook PROD de n8n)
// (Opcional pero recomendado) META_APP_SECRET=xxxxxxxx (para validar firma X-Hub-Signature-256)

function timingSafeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string | undefined) {
  // Si no configuraste secret, no bloqueamos
  if (!appSecret) return true;

  // Meta manda: "sha256=<hex>"
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const theirSig = signatureHeader.replace("sha256=", "").trim();
  const ourSig = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  return timingSafeEqual(theirSig, ourSig);
}

// ✅ GET: verificación del webhook (Meta)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.META_VERIFY_TOKEN || "";

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    // Meta espera un texto plano con el challenge
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 403 });
}

// ✅ POST: eventos entrantes (messages, statuses, etc)
export async function POST(req: Request) {
  const n8nUrl = process.env.N8N_WA_INCOMING_WEBHOOK_URL;
  if (!n8nUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing N8N_WA_INCOMING_WEBHOOK_URL" },
      { status: 500 }
    );
  }

  // Leemos raw body (para firma) y luego JSON
  const rawBody = await req.text();

  // (Opcional) Validación de firma para seguridad
  const sigHeader = req.headers.get("x-hub-signature-256");
  const okSig = verifyMetaSignature(rawBody, sigHeader, process.env.META_APP_SECRET);
  if (!okSig) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  // Parse JSON si se puede
  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Si Meta manda algo raro, igual respondemos 200 para que no reintente infinito
    return NextResponse.json({ ok: true, received: false }, { status: 200 });
  }

  // ✅ Responder rápido a Meta
  // Meta solo necesita 200 OK para considerar recibido.
  // Luego reenviamos a n8n "en background" (sin bloquear).
  const res = NextResponse.json({ ok: true }, { status: 200 });

  // Reenviar a n8n (no bloqueante)
  // Ojo: en serverless igual puede cortar rápido, pero suele funcionar perfecto.
  // Si quieres ultra-robustez, lo hacemos con queue/retry luego.
  void fetch(n8nUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // útil para debug en n8n:
      "x-agentik-source": "meta-webhook",
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // No hacemos throw para no afectar a Meta
  });

  return res;
}