import { NextResponse } from 'next/server'

export const runtime = 'nodejs' // importante para manejar FormData + fetch en servidor

export async function POST(req: Request) {
  try {
    const webhook = process.env.N8N_TIKTOK_UPLOAD_WEBHOOK
    if (!webhook) {
      return NextResponse.json(
        { error: 'Missing env var: N8N_TIKTOK_UPLOAD_WEBHOOK' },
        { status: 500 }
      )
    }

    const incoming = await req.formData()
    const video = incoming.get('video')

    if (!video || !(video instanceof File)) {
      return NextResponse.json({ error: 'Missing file field: video' }, { status: 400 })
    }

    // Re-armamos un FormData limpio (solo lo necesario)
    const forward = new FormData()
    forward.append('video', video, video.name)
    forward.append('caption', String(incoming.get('caption') ?? 'Agentickers Sandbox Upload Demo'))
    forward.append('sandbox', 'true')
    forward.append('app_name', 'Agentickers')
    forward.append('scope', 'video.upload')

    // Reenvío al webhook de n8n (que hace el upload real a TikTok Sandbox)
    const r = await fetch(webhook, {
      method: 'POST',
      body: forward,
    })

    const text = await r.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (!r.ok) {
      return NextResponse.json(
        { error: 'n8n webhook returned error', status: r.status, details: data },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, details: data })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}