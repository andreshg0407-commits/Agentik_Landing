// app/api/luca/result/route.ts
//
// AGENTIK-LUCA-TIKTOK-DEMO-RESCUE-01 — FASE 6
//
// GET  ?id=req_xxx  — poll result status by request_id
// POST             — n8n callback: { request_id, status, video_url, caption, hashtags }
//
// In-memory store (process-level). Sufficient for demo.
// In production, replace with a DB-backed store.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ── Store ─────────────────────────────────────────────────────────────────────

type ResultStatus = 'pending' | 'complete' | 'failed'

interface LucaResult {
  status: ResultStatus
  videoUrl?: string
  caption?: string
  hashtags?: string[]
  error?: string
  updatedAt: number
}

// Singleton in-memory map (survives across requests in the same process)
const resultStore = new Map<string, LucaResult>()

// Auto-clean entries older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [key, val] of resultStore.entries()) {
    if (val.updatedAt < cutoff) resultStore.delete(key)
  }
}, 15 * 60 * 1000)

// ── GET — poll ────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ ok: false, error: 'id requerido' }, { status: 400 })
  }

  const result = resultStore.get(id)
  if (!result) {
    return NextResponse.json({ ok: true, status: 'pending' as ResultStatus })
  }

  return NextResponse.json({ ok: true, ...result })
}

// ── POST — n8n callback ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      request_id?: string
      status?: string
      video_url?: string
      caption?: string
      hashtags?: string[]
      error?: string
    }

    const { request_id, status, video_url, caption, hashtags, error } = body

    if (!request_id) {
      return NextResponse.json({ ok: false, error: 'request_id requerido' }, { status: 400 })
    }

    const resultStatus: ResultStatus =
      status === 'complete' || status === 'succeeded'
        ? 'complete'
        : status === 'failed' || status === 'error'
        ? 'failed'
        : 'pending'

    resultStore.set(request_id, {
      status: resultStatus,
      videoUrl: video_url,
      caption,
      hashtags,
      error,
      updatedAt: Date.now(),
    })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
