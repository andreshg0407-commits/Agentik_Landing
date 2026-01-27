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
      // cache para assets (ajusta si quieres)
      CacheControl: "public, max-age=31536000, immutable",
    })
  )

  const url = `${R2_PUBLIC_BASE_URL}/${key}`

  return { url, name: `${base}${ext ? "." + ext : ""}`, mime, key, bytes }
}

export async function POST(req: Request) {
  try {
    // 1) Validar TikTok conectado (SIN demos)
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
    const client_id = String(formData.get("client_id") || "moda-colombia")

    if (!description) {
      return NextResponse.json({ ok: false, message: "description es requerido" }, { status: 400 })
    }

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
          file_url: up.url, // ✅ URL público real (Runway OK)
          file_name: up.name,
          mime_type: up.mime,
          bytes: up.bytes,
          r2_key: up.key,
        }
      }
    }

    // 5) Payload CANÓNICO
    const payload = {
      meta: {
        request_id,
        source: "agentik-web",
        client_id,
        locale: "es-CO",
        timezone: "America/Bogota",
        created_at: new Date().toISOString(),
        debug: false,
      },

      agent: {
        name: "luca",
        version: "v1",
        mode: "publish",
        pipeline: "runway->tiktok",
      },

      auth: {
        tiktok: {
          mode: "inline",
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
      },
    }

    // 6) Enviar a n8n
    const n8nRes = await fetch("https://iagentscolombia.app.n8n.cloud/webhook/luca-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const n8nText = await n8nRes.text().catch(() => "")
    if (!n8nRes.ok) {
      return NextResponse.json({ ok: false, message: `n8n error: ${n8nText || n8nRes.status}` }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      message: "Luca recibió la orden correctamente",
      connected_tiktok: true,
      reference_uploaded: Boolean(reference?.has_reference && reference?.file_url),
      reference_url: reference?.file_url || null,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Error en Luca submit" }, { status: 500 })
  }
}