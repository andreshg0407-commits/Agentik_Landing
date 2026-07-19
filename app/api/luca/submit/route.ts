// app/api/luca/submit/route.ts
import { NextResponse } from "next/server"
import crypto from "crypto"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

export const runtime = "nodejs"

// === Cookies helpers ===
function pickCookie(cookieHeader: string, name: string) {
  const hit = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : ""
}

// ===========================
// R2 env (producción)
// ===========================
const ENABLE_R2_UPLOAD = (process.env.ENABLE_R2_UPLOAD || "false").toLowerCase() === "true"

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ""
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ""
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ""
const R2_BUCKET = process.env.R2_BUCKET || ""
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "") // sin slash final
const R2_PREFIX = (process.env.R2_PREFIX || "uploads").replace(/^\/+|\/+$/g, "")

const MAX_FILE_MB = Number(process.env.MAX_UPLOAD_MB || 20)

// S3 client (Cloudflare R2)
function getR2Client() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

function safeExtFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "video/mp4") return "mp4"
  if (mime === "video/quicktime") return "mov"
  return ""
}

function sanitizeFilename(name: string) {
  // quita rarezas, deja letras/números/._-
  const clean = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return clean || "file"
}

async function uploadToR2(args: {
  file: File
  clientId: string
  requestId: string
}): Promise<{ url: string; name: string; mime: string; key: string; bytes: number }> {
  const { file, clientId, requestId } = args

  if (!ENABLE_R2_UPLOAD) throw new Error("R2 upload disabled (ENABLE_R2_UPLOAD=false)")
  if (!R2_BUCKET || !R2_PUBLIC_BASE_URL) throw new Error("Missing R2_BUCKET or R2_PUBLIC_BASE_URL")
  const s3 = getR2Client()
  if (!s3) throw new Error("Missing R2 credentials/env")

  const bytes = file.size
  const maxBytes = MAX_FILE_MB * 1024 * 1024
  if (bytes > maxBytes) throw new Error(`File too large. Max ${MAX_FILE_MB}MB`)

  const mime = file.type || "application/octet-stream"

  const orig = sanitizeFilename(file.name || "file")
  const ext = safeExtFromMime(mime) || (orig.includes(".") ? orig.split(".").pop() || "" : "")
  const base = orig.replace(/\.[^/.]+$/, "")

  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const rand = crypto.randomBytes(6).toString("hex")

  // Key final dentro del bucket (multi-cliente)
  const key = `${R2_PREFIX}/luca/${sanitizeFilename(clientId)}/${ts}_${requestId}_${rand}_${base}${ext ? "." + ext : ""}`

  const body = Buffer.from(await file.arrayBuffer())

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: mime,
      CacheControl: "public, max-age=31536000, immutable",
    })
  )

  const url = `${R2_PUBLIC_BASE_URL}/${key}`

  return { url, name: `${base}${ext ? "." + ext : ""}`, mime, key, bytes }
}

// helpers para reglas duras
function asBool(v: any, fallback = false) {
  if (typeof v === "boolean") return v
  if (typeof v === "string") return v.toLowerCase() === "true"
  return fallback
}

export async function POST(req: Request) {
  try {
    // 1) Validar TikTok conectado (real)
    const cookieHeader = req.headers.get("cookie") || ""
    const access_token = pickCookie(cookieHeader, "tt_access_token") // httpOnly
    const open_id = pickCookie(cookieHeader, "tt_open_id") // visible

    const connected = Boolean(open_id && access_token)
    if (!connected) {
      return NextResponse.json(
        {
          ok: false,
          message: "TikTok no está conectado. Primero conecta tu cuenta con el botón 'Conectar TikTok'.",
          needs_tiktok_login: true,
        },
        { status: 401 }
      )
    }

    // 2) Leer form
    const formData = await req.formData()

    const post_type = String(formData.get("post_type") || "video")
    const objective = String(formData.get("objective") || "ventas")
    const description = String(formData.get("description") || "").trim()
    const optimize = String(formData.get("optimize") || "true") === "true"

    const hashtagsRaw = String(formData.get("hashtags") || "{}")
    const copyRaw = String(formData.get("copy") || "{}")

    let hashtags: any = {}
    let copy: any = {}
    try {
      hashtags = JSON.parse(hashtagsRaw)
    } catch {
      hashtags = { mode: "auto" }
    }
    try {
      copy = JSON.parse(copyRaw)
    } catch {
      copy = { mode: "auto" }
    }

    // 3) client_id (multi-cliente)
    const client_id = String(formData.get("client_id") || "moda-colombia").trim() || "moda-colombia"

    if (!description) {
      return NextResponse.json({ ok: false, message: "description es requerido" }, { status: 400 })
    }

    // ===== NEW: generation controls from front =====
    const generation_type = String(formData.get("generation_type") || "text-to-video").trim() // text-to-video | image-to-video
    const aspect_ratio = String(formData.get("aspect_ratio") || "9:16").trim() // 9:16 | 16:9
    const duration_seconds_raw = String(formData.get("duration_seconds") || "12").trim() // 8 | 12
    const prompt_mode = String(formData.get("prompt_mode") || "coach").trim() // coach | direct
    const debug = asBool(formData.get("debug"), false)

    // Luca-generated creative fields (from /api/luca/generate step)
    const luca_replicate_prompt = String(formData.get("luca_replicate_prompt") || "").trim()
    const luca_caption = String(formData.get("luca_caption") || "").trim()

    // hard rules (no promesas falsas)
    const duration_seconds = Number(duration_seconds_raw)
    const ALLOWED_DURATIONS = new Set([8, 12])
    if (!ALLOWED_DURATIONS.has(duration_seconds)) {
      return NextResponse.json({ ok: false, message: "duration_seconds inválido. Solo 8 o 12." }, { status: 400 })
    }

    const ALLOWED_RATIOS = new Set(["9:16", "16:9"])
    if (!ALLOWED_RATIOS.has(aspect_ratio)) {
      return NextResponse.json({ ok: false, message: "aspect_ratio inválido. Solo 9:16 o 16:9." }, { status: 400 })
    }

    const ALLOWED_GEN = new Set(["text-to-video", "image-to-video"])
    if (!ALLOWED_GEN.has(generation_type)) {
      return NextResponse.json({ ok: false, message: "generation_type inválido." }, { status: 400 })
    }

    const ALLOWED_PROMPT_MODE = new Set(["coach", "direct"])
    if (!ALLOWED_PROMPT_MODE.has(prompt_mode)) {
      return NextResponse.json({ ok: false, message: "prompt_mode inválido." }, { status: 400 })
    }

    // helpers de video
    const vertical = aspect_ratio === "9:16"
    const resolution = vertical ? "1080x1920" : "1920x1080"

    // request_id canónico
    const request_id = `req_${Date.now()}`

    // 4) Archivo opcional + R2
    const file = formData.get("file")
    let reference: null | {
      has_reference: boolean
      reference_type: "image" | "video"
      file_url: string
      file_name: string
      mime_type: string
      bytes?: number
      r2_key?: string
    } = null

    if (file instanceof File && file.size > 0) {
      const mime = file.type || "application/octet-stream"
      const isVideo = mime.startsWith("video/")
      const isImage = mime.startsWith("image/")

      if (!isVideo && !isImage) {
        return NextResponse.json({ ok: false, message: "Archivo inválido. Sube imagen o video." }, { status: 400 })
      }

      // ✅ regla dura: image-to-video debe traer IMAGEN
      if (generation_type === "image-to-video" && !isImage) {
        return NextResponse.json({ ok: false, message: "Para Imagen → Video debes subir una imagen." }, { status: 400 })
      }

      if (!ENABLE_R2_UPLOAD) {
        // fallback (sin romper): manda metadata pero sin URL
        reference = {
          has_reference: true,
          reference_type: isVideo ? "video" : "image",
          file_url: "",
          file_name: file.name,
          mime_type: mime,
        }
      } else {
        const up = await uploadToR2({ file, clientId: client_id, requestId: request_id })
        reference = {
          has_reference: true,
          reference_type: isVideo ? "video" : "image",
          file_url: up.url,
          file_name: up.name,
          mime_type: up.mime,
          bytes: up.bytes,
          r2_key: up.key,
        }
      }
    }

    // ✅ regla dura: image-to-video requiere referencia (y idealmente URL pública)
    if (generation_type === "image-to-video" && !(reference && reference.has_reference)) {
      return NextResponse.json(
        { ok: false, message: "Para Imagen → Video la referencia (imagen) es requerida." },
        { status: 400 }
      )
    }

    // 5) Payload CANÓNICO (para Luca Replicate Video Generator)
    const payload = {
      meta: {
        request_id,
        source: "agentik-web",
        client_id,
        locale: "es-CO",
        timezone: "America/Bogota",
        created_at: new Date().toISOString(),
        debug,
      },

      agent: {
        name: "luca",
        version: "v1",
        mode: "publish",
        pipeline: "generate->publish",
      },

      auth: {
        tiktok: {
          // ✅ recomendación: preferir tabla, pero con fallback inline
          // (así multi-cliente se vuelve estable)
          mode: "prefer_table",
          open_id,
          access_token,
          refresh_token: null,
          expires_in: null,
          scope: null,
          token_row_id: null,
        },
      },

      input: {
        type: post_type,
        objective,
        platforms: ["tiktok"],
        title: null,
        description,
        language: "es",

        // ✅ CLAVE: guía el flujo grande
        intent: generation_type, // "text-to-video" | "image-to-video"

        reference: reference
          ? {
              has_reference: true,
              reference_type: reference.reference_type,
              file_url: reference.file_url,
              file_name: reference.file_name,
              mime_type: reference.mime_type,
            }
          : {
              has_reference: false,
              reference_type: null,
              file_url: null,
              file_name: null,
              mime_type: null,
            },
      },

      content: {
        optimize_prompt: optimize,

        // ✅ CLAVE: guía si usa Prompt Coach o no
        prompt_mode, // "coach" | "direct"

        copy: {
          mode: copy?.mode === "custom" ? "custom" : "auto",
          text: copy?.value || copy?.text || null,
        },
        hashtags: {
          mode: hashtags?.mode === "custom" ? "custom" : "auto",
          items:
            typeof hashtags?.value === "string"
              ? hashtags.value.split(/[,\s]+/).filter(Boolean)
              : Array.isArray(hashtags?.items)
              ? hashtags.items
              : [],
        },
      },

      // ✅ CLAVE: no adivinar en n8n
      video: {
        format: "mp4",
        vertical,
        aspect_ratio,
        duration_seconds,
        resolution,
        fps: 30,
        provider: "replicate",
        model_t2v: "wan-video/wan2.1-t2v-480p",
        model_i2v: "wan-video/wan2.1-i2v-480p",
      },

      publishing: {
        tiktok: {
          enabled: true,
          privacy_level: "PUBLIC",
          allow_comments: true,
          disable_duet: false,
          disable_stitch: false,
          auto_add_music: true,
        },
      },

      callbacks: {
        return_result_to_caller: true,
        result_callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.agentickers.com"}/api/luca/result`,
      },

      // Luca-generated creative output (from /api/luca/generate, passed through from frontend)
      luca_replicate_prompt: luca_replicate_prompt || null,
      luca_caption: luca_caption || null,
    }

    // 6) Enviar a n8n — Luca Replicate Video Generator
    // Uses LUCA_REPLICATE_WEBHOOK_URL env var; falls back to the canonical production URL.
    // DO NOT use N8N_LUCA_INTAKE_URL or any other legacy webhook here.
    const lucaWebhookUrl =
      (process.env.LUCA_REPLICATE_WEBHOOK_URL || "").trim() ||
      "https://iagentscolombia.app.n8n.cloud/webhook/luca-replicate-video"
    console.log("[LUCA_SUBMIT_WEBHOOK]", lucaWebhookUrl, "request_id:", request_id)
    const n8nRes = await fetch(lucaWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const n8nText = await n8nRes.text().catch(() => "")
    if (!n8nRes.ok) {
      return NextResponse.json({ ok: false, message: `n8n error: ${n8nText || n8nRes.status}` }, { status: 502 })
    }

    // ✅ respuesta al front con eco opcional (debug)
    return NextResponse.json({
      ok: true,
      message: "Luca recibió la orden correctamente",
      request_id,
      connected_tiktok: true,
      reference_uploaded: Boolean(reference?.has_reference && reference?.file_url),
      reference_url: reference?.file_url || null,
      ...(debug
        ? {
            echo: {
              client_id,
              generation_type,
              aspect_ratio,
              duration_seconds,
              prompt_mode,
              has_reference: Boolean(reference?.has_reference),
              reference_type: reference?.reference_type || null,
              reference_file_url_empty: reference?.has_reference ? !reference?.file_url : null,
            },
          }
        : {}),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Error en Luca submit" }, { status: 500 })
  }
}