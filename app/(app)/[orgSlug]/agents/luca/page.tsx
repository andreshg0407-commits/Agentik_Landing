'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Lock, Sparkles, Upload, Video, ImageIcon, LogOut } from 'lucide-react'

import { Navbar } from '@/components/ui/navbar'
import { Card, CardContent } from '@/components/ui/card'

// ── Types ─────────────────────────────────────────────────────────────────────

type PostType = 'video' | 'image'
type Objective = 'ventas' | 'seguidores' | 'likes'
type AutoMode = 'auto' | 'custom'
type GenerationType = 'text-to-video' | 'image-to-video'
type AspectRatio = '9:16' | '16:9'
type PromptMode = 'coach' | 'direct'
type Phase = 'idle' | 'generating' | 'output' | 'sending' | 'pending' | 'done'

interface LucaOutput {
  concept: string
  caption: string
  hashtags: string[]
  replicatePrompt: string
  recommendation: string
  demo?: boolean
}

interface VideoResult {
  videoUrl?: string
  caption?: string
  hashtags?: string[]
}

const DURATION_OPTIONS = [8, 12] as const
type DurationSeconds = (typeof DURATION_OPTIONS)[number]

const DEFAULT_CLIENT_ID = 'moda-colombia'

// ── Helpers ───────────────────────────────────────────────────────────────────

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Pill({
  children,
  variant = 'dark',
}: {
  children: React.ReactNode
  variant?: 'dark' | 'outline' | 'green' | 'blue'
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        variant === 'dark' && 'bg-black text-white',
        variant === 'outline' && 'border border-black/20 text-black',
        variant === 'green' && 'bg-green-100 text-green-800',
        variant === 'blue' && 'bg-[var(--agentik-blue)] text-white'
      )}
    >
      {children}
    </span>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  helper?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {helper ? <p className="mt-1 text-sm text-gray-500">{helper}</p> : null}
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition',
          checked ? 'bg-[var(--agentik-blue)] border-[var(--agentik-blue)]' : 'bg-white border-black/20'
        )}
      >
        <span
          className={cx(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  )
}

function ChoiceCard({
  title,
  description,
  icon,
  selected,
  onClick,
  disabled,
}: {
  title: string
  description: string
  icon: React.ReactNode
  selected: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'text-left rounded-2xl border p-4 transition w-full',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm',
        selected ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)]/5' : 'border-black/10 bg-white'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-[var(--agentik-blue)]/5 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900">{title}</p>
          {disabled ? (
            <p className="mt-0.5 text-xs text-gray-400">Próximamente</p>
          ) : (
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          )}
        </div>
      </div>
    </button>
  )
}

function SegButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full rounded-xl px-3 py-2 text-xs font-semibold border transition whitespace-normal leading-snug',
        active
          ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
          : 'border-black/15 bg-white hover:bg-[var(--agentik-blue)]/5 text-gray-700'
      )}
    >
      {children}
    </button>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function Shimmer({ h = 'h-4', w = 'w-full', className = '' }: { h?: string; w?: string; className?: string }) {
  return <div className={`${h} ${w} rounded-lg bg-gray-100 animate-pulse ${className}`} />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LucaPage() {
  const router = useRouter()

  const [checkingTikTok, setCheckingTikTok] = useState(true)
  const [tiktokConnected, setTikTokConnected] = useState(false)

  const clientId = DEFAULT_CLIENT_ID

  // Form state
  const [postType, setPostType] = useState<PostType>('video')
  const [objective, setObjective] = useState<Objective>('ventas')
  const [description, setDescription] = useState<string>('')
  const [generationType, setGenerationType] = useState<GenerationType>('text-to-video')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const [durationSeconds, setDurationSeconds] = useState<DurationSeconds>(12)
  const [hasReference, setHasReference] = useState<boolean>(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [optimize, setOptimize] = useState<boolean>(true)
  const [hashtagsMode, setHashtagsMode] = useState<AutoMode>('auto')
  const [copyMode, setCopyMode] = useState<AutoMode>('auto')
  const [hashtagsCustom, setHashtagsCustom] = useState<string>('')
  const [copyCustom, setCopyCustom] = useState<string>('')

  // Flow state
  const [sending, setSending] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [lucaOutput, setLucaOutput] = useState<LucaOutput | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [videoResult, setVideoResult] = useState<VideoResult | null>(null)
  const [pendingMode, setPendingMode] = useState<PromptMode>('coach')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── TikTok status check ────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true
    fetch('/api/tiktok/status', { method: 'GET', cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) setTikTokConnected(Boolean(d?.connected)) })
      .catch(() => { if (alive) setTikTokConnected(false) })
      .finally(() => { if (alive) setCheckingTikTok(false) })
    return () => { alive = false }
  }, [])

  function isImageFile(f: File | null) {
    return Boolean(f && (f.type || '').startsWith('image/'))
  }

  useEffect(() => {
    if (generationType === 'image-to-video') {
      setHasReference(true)
      if (mediaFile && !isImageFile(mediaFile)) setMediaFile(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationType])

  // ── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'pending' || !requestId) return
    let alive = true

    async function poll() {
      try {
        const res = await fetch(`/api/luca/result?id=${requestId}`, { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!alive) return
        if (data?.status === 'complete') {
          setVideoResult({ videoUrl: data.videoUrl, caption: data.caption, hashtags: data.hashtags })
          setPhase('done')
        } else if (data?.status === 'failed') {
          // In demo mode: treat failure as a simulated success
          if (process.env.NEXT_PUBLIC_LUCA_DEMO_MODE === 'true') {
            setVideoResult({})
            setPhase('done')
          } else {
            setErrorMsg('La generación del video no pudo completarse.')
            setPhase('idle')
          }
        } else {
          if (alive) pollRef.current = setTimeout(poll, 5000)
        }
      } catch {
        if (alive) pollRef.current = setTimeout(poll, 5000)
      }
    }

    pollRef.current = setTimeout(poll, 3000)
    return () => {
      alive = false
      if (pollRef.current) clearTimeout(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, requestId])

  // ── Derived ────────────────────────────────────────────────────────────────

  const canSubmit = useMemo(() => {
    if (checkingTikTok || !tiktokConnected) return false
    if (!description.trim()) return false
    if (postType === 'image') return false
    if (generationType === 'image-to-video') {
      if (!hasReference || !mediaFile || !isImageFile(mediaFile)) return false
    }
    if (hasReference && !mediaFile) return false
    return true
  }, [checkingTikTok, tiktokConnected, description, hasReference, mediaFile, postType, generationType])

  const connectHref = useMemo(() => {
    return `/api/tiktok/auth?client_id=${encodeURIComponent(clientId)}&redirect=${encodeURIComponent('/agents/luca')}`
  }, [clientId])

  function resetFlow() {
    setPhase('idle')
    setLucaOutput(null)
    setVideoResult(null)
    setRequestId(null)
    setErrorMsg(null)
  }

  async function handleLogout() {
    try { await fetch('/api/tiktok/logout', { method: 'POST' }) } catch {}
    setTikTokConnected(false)
    router.refresh()
    window.location.reload()
  }

  function mediaAccept() {
    return generationType === 'image-to-video' ? 'image/*' : 'video/*,image/*'
  }

  // ── FASE 3 — Generate creative output ─────────────────────────────────────

  async function submitWithMode(mode: PromptMode) {
    setErrorMsg(null)
    setLucaOutput(null)
    setVideoResult(null)
    if (!canSubmit) return

    setPendingMode(mode)
    setPhase('generating')
    setSending(true)

    try {
      const genRes = await fetch('/api/luca/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, objective, generationType, clientId }),
      })
      const genData = await genRes.json().catch(() => null)
      if (!genData?.ok) throw new Error(genData?.error || 'No fue posible generar el contenido.')

      setLucaOutput(genData as LucaOutput)
      setPhase('output')
    } catch {
      // In demo mode always show demo output
      if (process.env.NEXT_PUBLIC_LUCA_DEMO_MODE === 'true') {
        setLucaOutput({
          concept: 'Jean colombiano push-up que resalta la figura y conquista el mercado de USA',
          caption: '¿Buscas el jean perfecto? 🔥 Jeans colombianos push-up — estilo y comodidad. Envíos a USA en 3–5 días. Escribe CATÁLOGO 👇',
          hashtags: ['#jeanscolombianos', '#modacolombia', '#pushupjeans', '#ootd', '#enviosusa'],
          replicatePrompt: '',
          recommendation: 'Vertical 9:16, 12 segundos',
          demo: true,
        })
        setPhase('output')
      } else {
        setErrorMsg('No fue posible conectar con Luca. Intenta nuevamente.')
        setPhase('idle')
      }
    } finally {
      setSending(false)
    }
  }

  // ── FASE 4 — Send to n8n ──────────────────────────────────────────────────

  async function proceedToSubmit() {
    console.log('[LUCA_FRONTEND_SUBMIT]', '/api/luca/submit')
    setPhase('sending')
    setSending(true)

    try {
      const formData = new FormData()
      formData.append('agent', 'luca')
      formData.append('platform', 'tiktok')
      formData.append('post_type', postType)
      formData.append('objective', objective)
      formData.append('description', description)
      formData.append('optimize', String(optimize))
      formData.append('client_id', clientId)
      formData.append('generation_type', generationType)
      formData.append('aspect_ratio', aspectRatio)
      formData.append('duration_seconds', String(durationSeconds))
      formData.append('prompt_mode', pendingMode)
      if (lucaOutput?.replicatePrompt) formData.append('luca_replicate_prompt', lucaOutput.replicatePrompt)
      if (lucaOutput?.caption) formData.append('luca_caption', lucaOutput.caption)
      formData.append('hashtags', JSON.stringify(
        hashtagsMode === 'auto' ? { mode: 'auto' } : { mode: 'custom', value: hashtagsCustom }
      ))
      formData.append('copy', JSON.stringify(
        copyMode === 'auto' ? { mode: 'auto' } : { mode: 'custom', value: copyCustom }
      ))
      if (hasReference && mediaFile) formData.append('file', mediaFile, mediaFile.name)

      const res = await fetch('/api/luca/submit', { method: 'POST', body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.message || 'Error al enviar a Luca.')

      const rid = data?.request_id as string | undefined
      if (rid) {
        setRequestId(rid)
        setPhase('pending')
      } else {
        setPhase('done')
      }
    } catch {
      // Demo mode: always succeed
      if (process.env.NEXT_PUBLIC_LUCA_DEMO_MODE === 'true') {
        setPhase('pending')
        setRequestId(`demo_${Date.now()}`)
      } else {
        setErrorMsg('No fue posible enviar la solicitud. Intenta de nuevo.')
        setPhase('idle')
      }
    } finally {
      setSending(false)
    }
  }

  // ── Status hint ────────────────────────────────────────────────────────────

  const statusHint = checkingTikTok
    ? 'Verificando cuenta…'
    : !tiktokConnected
    ? 'Conecta TikTok para continuar.'
    : generationType === 'image-to-video' && (!mediaFile || !isImageFile(mediaFile))
    ? 'Sube una imagen de referencia para continuar.'
    : hasReference && !mediaFile
    ? 'Sube el archivo de referencia para continuar.'
    : postType === 'image'
    ? 'La publicación de imágenes estará disponible pronto.'
    : !description.trim()
    ? 'Describe tu producto para continuar.'
    : null

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f7f8fa] overflow-x-hidden">
      <Navbar />

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-4xl px-6 pt-28 pb-10 md:pt-32 md:pb-12">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Pill variant="blue">Luca</Pill>
            <Pill variant="green">Activo</Pill>
          </div>
          <h1 className="text-[var(--agentik-blue)] text-4xl md:text-5xl font-bold leading-tight max-w-2xl">
            Convierte un producto en una publicación lista para TikTok.
          </h1>
          <p className="mt-4 text-gray-500 text-base md:text-lg leading-relaxed max-w-xl">
            Luca analiza el producto, crea el concepto, genera el caption y prepara el video automáticamente.
          </p>
        </div>
      </section>

      {/* ── WORKSPACE ───────────────────────────────────────────────────────── */}
      <section className="pb-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_256px] gap-8 items-start">

            {/* ── Main card ─────────────────────────────────────────────────── */}
            <Card className="border-black/10 bg-white shadow-sm">
              <CardContent className="p-6 md:p-8">

                {/* ── IDLE: full form ──────────────────────────────────────── */}
                {phase === 'idle' && (
                  <>
                    <h2 className="text-lg font-bold text-gray-900">¿Qué quieres publicar?</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Describe el producto o campaña. Luca hace el resto.
                    </p>

                    {/* Post type */}
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <ChoiceCard
                        title="Video"
                        description="Ideal para TikTok — ventas y engagement"
                        icon={<Video className="h-4 w-4 text-[var(--agentik-blue)]" />}
                        selected={postType === 'video'}
                        onClick={() => setPostType('video')}
                      />
                      <ChoiceCard
                        title="Imagen"
                        description="Posts estáticos optimizados"
                        icon={<ImageIcon className="h-4 w-4 text-gray-400" />}
                        selected={postType === 'image'}
                        onClick={() => setPostType('image')}
                        disabled
                      />
                    </div>

                    {/* Video config */}
                    <div className="mt-6 rounded-2xl border border-black/8 bg-[#f9fafb] p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Configuración del video</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Tipo</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            <SegButton active={generationType === 'text-to-video'} onClick={() => setGenerationType('text-to-video')}>
                              Texto → Video
                            </SegButton>
                            <SegButton
                              active={generationType === 'image-to-video'}
                              onClick={() => { setGenerationType('image-to-video'); setHasReference(true) }}
                            >
                              Imagen → Video
                            </SegButton>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Formato</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            <SegButton active={aspectRatio === '9:16'} onClick={() => setAspectRatio('9:16')}>
                              Vertical (9:16)
                            </SegButton>
                            <SegButton active={aspectRatio === '16:9'} onClick={() => setAspectRatio('16:9')}>
                              Horizontal (16:9)
                            </SegButton>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Duración</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            {DURATION_OPTIONS.map((d) => (
                              <SegButton key={d} active={durationSeconds === d} onClick={() => setDurationSeconds(d)}>
                                {d} segundos
                              </SegButton>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Objective */}
                    <div className="mt-6">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Objetivo</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { key: 'ventas', label: 'Ventas' },
                          { key: 'seguidores', label: 'Seguidores' },
                          { key: 'likes', label: 'Likes' },
                        ] as const).map((o) => (
                          <button
                            type="button"
                            key={o.key}
                            onClick={() => setObjective(o.key)}
                            className={cx(
                              'rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                              objective === o.key
                                ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                : 'border-black/15 bg-white text-gray-700 hover:bg-[var(--agentik-blue)]/5'
                            )}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reference file */}
                    <div className="mt-6">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Referencia visual{' '}
                        {generationType !== 'image-to-video' && (
                          <span className="normal-case font-normal text-gray-400">(opcional)</span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setHasReference(true)}
                          className={cx(
                            'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition border',
                            hasReference
                              ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                              : 'border-black/20 bg-white text-gray-700 hover:bg-[var(--agentik-blue)]/5'
                          )}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Subir archivo
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (generationType !== 'image-to-video') { setHasReference(false); setMediaFile(null) } }}
                          disabled={generationType === 'image-to-video'}
                          className={cx(
                            'inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold transition border',
                            generationType === 'image-to-video'
                              ? 'opacity-40 cursor-not-allowed border-black/20 bg-white text-gray-700'
                              : !hasReference
                              ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                              : 'border-black/20 bg-white text-gray-700 hover:bg-[var(--agentik-blue)]/5'
                          )}
                        >
                          Solo texto
                        </button>
                      </div>

                      {hasReference && (
                        <div className="mt-3">
                          <input
                            type="file"
                            accept={mediaAccept()}
                            onChange={(e) => {
                              const f = e.target.files?.[0] || null
                              if (!f) { setMediaFile(null); return }
                              if (generationType === 'image-to-video' && !isImageFile(f)) {
                                setMediaFile(null)
                                setErrorMsg('Para Imagen → Video debes subir una imagen.')
                                return
                              }
                              setMediaFile(f)
                            }}
                            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--agentik-blue)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[var(--agentik-blue-hover)]"
                          />
                          {mediaFile && (
                            <p className="mt-1.5 text-xs text-gray-400">{mediaFile.name}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* AI options */}
                    <div className="mt-6 rounded-2xl border border-black/8 bg-[#f9fafb] p-4 space-y-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opciones de IA</p>
                      <Toggle
                        checked={optimize}
                        onChange={setOptimize}
                        label="Optimizar gancho y llamado a la acción"
                        helper="Luca mejora la estructura del contenido automáticamente."
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2">Hashtags</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setHashtagsMode('auto')}
                              className={cx(
                                'flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold border transition',
                                hashtagsMode === 'auto'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white text-gray-600 hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Automáticos
                            </button>
                            <button
                              type="button"
                              onClick={() => setHashtagsMode('custom')}
                              className={cx(
                                'flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold border transition',
                                hashtagsMode === 'custom'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white text-gray-600 hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Personalizar
                            </button>
                          </div>
                          {hashtagsMode === 'custom' && (
                            <textarea
                              value={hashtagsCustom}
                              onChange={(e) => setHashtagsCustom(e.target.value)}
                              rows={2}
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--agentik-blue)]/20"
                              placeholder="#hashtag1 #hashtag2"
                            />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2">Caption</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setCopyMode('auto')}
                              className={cx(
                                'flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold border transition',
                                copyMode === 'auto'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white text-gray-600 hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Automático
                            </button>
                            <button
                              type="button"
                              onClick={() => setCopyMode('custom')}
                              className={cx(
                                'flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold border transition',
                                copyMode === 'custom'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white text-gray-600 hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Personalizar
                            </button>
                          </div>
                          {copyMode === 'custom' && (
                            <textarea
                              value={copyCustom}
                              onChange={(e) => setCopyCustom(e.target.value)}
                              rows={2}
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--agentik-blue)]/20"
                              placeholder="Escribe el caption exacto…"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="mt-6">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Descripción del producto</p>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={5}
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[var(--agentik-blue)]/20 resize-none"
                        placeholder='Ej: Jean push-up colombiano, cintura alta, tela stretch. Hook: "¿Buscas jean que te haga cintura?" CTA: escribe CATÁLOGO. Envíos 3–5 días USA.'
                      />
                    </div>

                    {/* Actions */}
                    <div className="mt-6 space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => submitWithMode('coach')}
                          disabled={!canSubmit || sending}
                          className={cx(
                            'inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold text-sm transition w-full sm:w-auto',
                            !canSubmit || sending
                              ? 'bg-black/20 text-black/40 cursor-not-allowed'
                              : 'bg-[var(--agentik-blue)] text-white hover:bg-[var(--agentik-blue-hover)]'
                          )}
                        >
                          Generar con Luca
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => submitWithMode('direct')}
                          disabled={!canSubmit || sending}
                          className={cx(
                            'inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition border w-full sm:w-auto',
                            !canSubmit || sending
                              ? 'border-black/10 bg-white text-black/30 cursor-not-allowed'
                              : 'border-black/15 bg-white text-gray-700 hover:bg-[var(--agentik-blue)]/5'
                          )}
                        >
                          Sin mejoras de IA
                        </button>
                      </div>
                      {statusHint && (
                        <p className="text-xs text-gray-400">{statusHint}</p>
                      )}
                    </div>

                    {errorMsg && (
                      <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                        {errorMsg}
                      </div>
                    )}
                  </>
                )}

                {/* ── GENERATING ────────────────────────────────────────────── */}
                {phase === 'generating' && (
                  <div className="py-8 space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[var(--agentik-blue)]/10 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-5 w-5 text-[var(--agentik-blue)] animate-pulse" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Luca está analizando tu producto…</p>
                        <p className="text-sm text-gray-400 mt-0.5">Creando concepto creativo</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Shimmer h="h-3" w="w-3/4" />
                      <Shimmer h="h-3" w="w-full" />
                      <Shimmer h="h-3" w="w-5/6" />
                      <Shimmer h="h-3" w="w-2/3" />
                    </div>
                    <div className="flex gap-2">
                      <Shimmer h="h-7" w="w-20" />
                      <Shimmer h="h-7" w="w-24" />
                      <Shimmer h="h-7" w="w-16" />
                    </div>
                  </div>
                )}

                {/* ── OUTPUT ────────────────────────────────────────────────── */}
                {phase === 'output' && lucaOutput && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[var(--agentik-blue)]/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        <Image src="/agents/luca.png" alt="Luca" width={40} height={40} className="h-10 w-10 object-cover" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Luca preparó tu contenido</p>
                        <p className="text-sm text-gray-400 mt-0.5">Revisa y confirma antes de generar el video</p>
                      </div>
                    </div>

                    {/* Concept */}
                    <div className="rounded-2xl border border-black/8 bg-[#f9fafb] p-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Concepto</p>
                      <p className="text-sm font-medium text-gray-900 leading-relaxed">{lucaOutput.concept}</p>
                    </div>

                    {/* Caption */}
                    <div className="rounded-2xl border border-black/8 bg-[#f9fafb] p-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Caption</p>
                      <p className="text-sm text-gray-800 leading-relaxed">{lucaOutput.caption}</p>
                    </div>

                    {/* Hashtags */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Hashtags</p>
                      <div className="flex flex-wrap gap-2">
                        {lucaOutput.hashtags.map((h, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-full bg-[var(--agentik-blue)]/8 px-3 py-1 text-xs font-medium text-[var(--agentik-blue)]"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-black/8">
                      <button
                        type="button"
                        onClick={proceedToSubmit}
                        disabled={sending}
                        className="inline-flex items-center justify-center rounded-xl bg-[var(--agentik-blue)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--agentik-blue-hover)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Generar video
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={resetFlow}
                        className="inline-flex items-center justify-center rounded-xl border border-black/12 bg-white px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                      >
                        Editar descripción
                      </button>
                    </div>
                  </div>
                )}

                {/* ── SENDING ───────────────────────────────────────────────── */}
                {phase === 'sending' && (
                  <div className="py-8 space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[var(--agentik-blue)]/10 flex items-center justify-center flex-shrink-0">
                        <Video className="h-5 w-5 text-[var(--agentik-blue)] animate-pulse" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Iniciando generación…</p>
                        <p className="text-sm text-gray-400 mt-0.5">Luca está preparando el video</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Shimmer h="h-2" w="w-full" />
                      <Shimmer h="h-2" w="w-4/5" />
                    </div>
                  </div>
                )}

                {/* ── PENDING ───────────────────────────────────────────────── */}
                {phase === 'pending' && (
                  <div className="py-8 space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[var(--agentik-blue)]/10 flex items-center justify-center flex-shrink-0">
                        <Video className="h-5 w-5 text-[var(--agentik-blue)] animate-pulse" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Generando video…</p>
                        <p className="text-sm text-gray-400 mt-0.5">Esto puede tomar 1–3 minutos. No cierres esta página.</p>
                      </div>
                    </div>
                    {/* Animated progress bar */}
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-[var(--agentik-blue)] rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Shimmer h="h-32" />
                      <Shimmer h="h-32" />
                    </div>
                  </div>
                )}

                {/* ── DONE ──────────────────────────────────────────────────── */}
                {phase === 'done' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Video listo</p>
                        <p className="text-sm text-gray-400 mt-0.5">Luca completó la generación</p>
                      </div>
                    </div>

                    {videoResult?.videoUrl ? (
                      <div className="flex justify-center">
                        <div className="rounded-2xl overflow-hidden shadow-lg" style={{ maxWidth: 280 }}>
                          <video
                            src={videoResult.videoUrl}
                            controls
                            className="w-full"
                            style={{ aspectRatio: '9/16' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-black/8 bg-[#f9fafb] p-6 text-center">
                        <p className="text-sm text-gray-500">El video fue procesado correctamente por Luca.</p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-xl bg-[var(--agentik-blue)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--agentik-blue-hover)] transition"
                      >
                        Preparar publicación TikTok
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={resetFlow}
                        className="inline-flex items-center justify-center rounded-xl border border-black/12 bg-white px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                      >
                        Crear otra versión
                      </button>
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* ── Sidebar ───────────────────────────────────────────────────── */}
            <aside className="space-y-4">

              {/* Luca + TikTok status */}
              <Card className="border-black/10 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0">
                      <Image src="/agents/luca.png" alt="Luca" width={40} height={40} className="h-10 w-10 object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Luca</p>
                      <p className="text-xs text-gray-400">Social Media Manager</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    {checkingTikTok ? (
                      <Shimmer h="h-8" />
                    ) : tiktokConnected ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-gray-700">TikTok conectado</span>
                        </div>
                        <button
                          onClick={handleLogout}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
                        >
                          <LogOut className="h-3 w-3" />
                          Salir
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-500">TikTok no conectado</span>
                        </div>
                        <a
                          href={connectHref}
                          className="block w-full text-center rounded-xl bg-[var(--agentik-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--agentik-blue-hover)] transition"
                        >
                          Conectar TikTok
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setCheckingTikTok(true)
                            fetch('/api/tiktok/status', { cache: 'no-store' })
                              .then((r) => r.json())
                              .then((d) => setTikTokConnected(Boolean(d?.connected)))
                              .catch(() => setTikTokConnected(false))
                              .finally(() => setCheckingTikTok(false))
                          }}
                          className="block w-full text-center rounded-xl border border-black/15 bg-white px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 transition"
                        >
                          Ya conecté — verificar
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Capabilities */}
              <Card className="border-black/10 bg-white shadow-sm">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Qué hace Luca</p>
                  <ul className="space-y-2.5">
                    {[
                      { icon: <Sparkles className="h-3.5 w-3.5 text-[var(--agentik-blue)]" />, text: 'Genera concepto y caption con IA' },
                      { icon: <Video className="h-3.5 w-3.5 text-[var(--agentik-blue)]" />, text: 'Crea el video con Replicate' },
                      { icon: <CheckCircle2 className="h-3.5 w-3.5 text-[var(--agentik-blue)]" />, text: 'Publica directo en TikTok' },
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex-shrink-0">{item.icon}</span>
                        <span className="text-sm text-gray-600">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

            </aside>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-black/5 bg-white">
        <div className="mx-auto max-w-4xl px-6 flex items-center justify-between">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Agentik</p>
          <p className="text-xs text-gray-400">Luca v1</p>
        </div>
      </footer>
    </div>
  )
}
