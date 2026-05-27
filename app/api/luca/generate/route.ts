// app/api/luca/generate/route.ts
//
// AGENTIK-LUCA-TIKTOK-DEMO-RESCUE-01 — FASE 3
//
// Calls Claude (claude-haiku-4-5-20251001) to generate Luca's creative output
// before video generation starts:
//   concept, caption, hashtags, replicatePrompt, recommendation
//
// Falls back to demo output when:
//   - ANTHROPIC_API_KEY not set
//   - NEXT_PUBLIC_LUCA_DEMO_MODE=true
//   - body.demo=true
//   - Any API error

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

// ── Demo fallback ─────────────────────────────────────────────────────────────

const DEMO_OUTPUT = {
  concept: 'Jean colombiano push-up que resalta la figura y conquista el mercado de USA',
  caption:
    '¿Buscas el jean perfecto? 🔥 Nuestros jeans colombianos push-up son la combinación perfecta de estilo y comodidad. Envíos a USA en 3–5 días. Escribe CATÁLOGO y te lo enviamos 👇',
  hashtags: [
    '#jeanscolombianos',
    '#modacolombia',
    '#pushupjeans',
    '#ootd',
    '#modamujer',
    '#enviosusa',
    '#fashiontiktok',
  ],
  replicatePrompt:
    'Cinematic TikTok-style vertical video showcasing Colombian denim jeans. Close-up shots of fabric texture, waist fit, full-body silhouette. Warm golden lighting, fashionable urban setting. High energy, fast cuts. 9:16 aspect ratio.',
  recommendation: 'Formato vertical (9:16), 12 segundos — muestra producto + CTA claro',
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      description?: string
      objective?: string
      generationType?: string
      clientId?: string
      demo?: boolean
    }

    const {
      description = '',
      objective = 'ventas',
      generationType = 'text-to-video',
      demo = false,
    } = body

    if (!description.trim()) {
      return NextResponse.json({ ok: false, error: 'description es requerido' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    const isDemoMode = demo || !apiKey || process.env.NEXT_PUBLIC_LUCA_DEMO_MODE === 'true'

    if (isDemoMode) {
      await new Promise((r) => setTimeout(r, 1200))
      return NextResponse.json({ ok: true, ...DEMO_OUTPUT, demo: true })
    }

    // ── Real Claude call ───────────────────────────────────────────────────────

    const client = new Anthropic({ apiKey })

    const systemPrompt = `Eres Luca, el agente de Social Media Manager de Agentik.
Tu especialidad es TikTok para marcas colombianas que venden a Latinoamérica y USA.
Eres directo, efectivo y sabes qué engancha en TikTok.
Responde SOLO con JSON válido, sin markdown, sin explicaciones adicionales.`

    const userPrompt = `Analiza este briefing y genera el output creativo para TikTok:

DESCRIPCIÓN DEL PRODUCTO/CAMPAÑA: ${description}
OBJETIVO: ${objective}
TIPO DE GENERACIÓN: ${generationType}

Responde con exactamente este JSON (sin markdown ni texto extra):
{
  "concept": "concepto creativo en 1 oración, máx 120 caracteres",
  "caption": "caption completo para TikTok con emojis y CTA, máx 250 caracteres",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "replicatePrompt": "prompt en inglés para generación de video con Wan2.1, máx 200 caracteres, describe visualmente",
  "recommendation": "recomendación breve de formato, máx 80 caracteres"
}`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        parsed = JSON.parse(match[0])
      } else {
        // Fallback to demo on parse failure
        return NextResponse.json({ ok: true, ...DEMO_OUTPUT, demo: true })
      }
    }

    return NextResponse.json({
      ok: true,
      concept: (parsed.concept as string) || DEMO_OUTPUT.concept,
      caption: (parsed.caption as string) || DEMO_OUTPUT.caption,
      hashtags: (parsed.hashtags as string[]) || DEMO_OUTPUT.hashtags,
      replicatePrompt: (parsed.replicatePrompt as string) || DEMO_OUTPUT.replicatePrompt,
      recommendation: (parsed.recommendation as string) || DEMO_OUTPUT.recommendation,
      demo: false,
    })
  } catch {
    // On any error, fall back to demo output so the demo never breaks
    return NextResponse.json({ ok: true, ...DEMO_OUTPUT, demo: true })
  }
}
