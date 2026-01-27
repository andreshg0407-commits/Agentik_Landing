'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ArrowRight, CheckCircle2, Lock, Sparkles, Upload, Video, ImageIcon } from 'lucide-react'

import { Navbar } from '@/components/ui/navbar'
import { Card, CardContent } from '@/components/ui/card'

type PostType = 'video' | 'image'
type Objective = 'ventas' | 'seguidores' | 'likes'
type AutoMode = 'auto' | 'custom'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

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
        {helper ? <p className="mt-1 text-sm text-gray-600">{helper}</p> : null}
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
        'text-left rounded-2xl border p-5 transition w-full',
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-sm',
        selected ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)]/5' : 'border-black/10 bg-white'
      )}
    >
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-[var(--agentik-blue)]/5 flex items-center justify-center">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{title}</p>
            {disabled ? <Pill variant="outline">Próximamente</Pill> : null}
          </div>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
      </div>
    </button>
  )
}

export default function LucaPage() {
  // ✅ TikTok connection status (real)
  const [checkingTikTok, setCheckingTikTok] = useState(true)
  const [tiktokConnected, setTikTokConnected] = useState(false)

  // Form
  const [postType, setPostType] = useState<PostType>('video')
  const [objective, setObjective] = useState<Objective>('ventas')
  const [description, setDescription] = useState<string>('')

  // Media
  const [hasReference, setHasReference] = useState<boolean>(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)

  // AI toggles
  const [optimize, setOptimize] = useState<boolean>(true)
  const [hashtagsMode, setHashtagsMode] = useState<AutoMode>('auto')
  const [copyMode, setCopyMode] = useState<AutoMode>('auto')
  const [hashtagsCustom, setHashtagsCustom] = useState<string>('')
  const [copyCustom, setCopyCustom] = useState<string>('')

  // Submit state
  const [sending, setSending] = useState<boolean>(false)
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null)

  useEffect(() => {
    let alive = true

    async function check() {
      try {
        const res = await fetch('/api/tiktok/status', { method: 'GET' })
        const data = await res.json().catch(() => null)
        if (!alive) return
        setTikTokConnected(Boolean(data?.connected))
      } catch {
        if (!alive) return
        setTikTokConnected(false)
      } finally {
        if (!alive) return
        setCheckingTikTok(false)
      }
    }

    check()
    return () => {
      alive = false
    }
  }, [])

  const canSubmit = useMemo(() => {
    if (checkingTikTok) return false
    if (!tiktokConnected) return false
    if (!description.trim()) return false
    if (hasReference && !mediaFile) return false
    if (postType === 'image') return false // image = próximamente
    return true
  }, [checkingTikTok, tiktokConnected, description, hasReference, mediaFile, postType])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    if (!canSubmit) return

    setSending(true)

    try {
      const formData = new FormData()

      // core
      formData.append('agent', 'luca')
      formData.append('platform', 'tiktok')
      formData.append('post_type', postType)
      formData.append('objective', objective)
      formData.append('description', description)
      formData.append('optimize', String(optimize))

      // ✅ client_id para que n8n filtre token rows
      formData.append('client_id', 'moda-colombia')

      // Hashtags
      formData.append(
        'hashtags',
        JSON.stringify(hashtagsMode === 'auto' ? { mode: 'auto' } : { mode: 'custom', value: hashtagsCustom })
      )

      // Copy
      formData.append(
        'copy',
        JSON.stringify(copyMode === 'auto' ? { mode: 'auto' } : { mode: 'custom', value: copyCustom })
      )

      // Archivo (si existe)
      if (hasReference && mediaFile) {
        formData.append('file', mediaFile, mediaFile.name)
      }

      // ✅ TU backend (sin CORS) → reenvía a n8n
      const res = await fetch('/api/luca/submit', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.message || `Error HTTP ${res.status}`)
      }

      setResult({
        ok: true,
        message: data?.message || 'Luca recibió la orden y está trabajando en la publicación.',
      })
    } catch (err: any) {
      setResult({
        ok: false,
        message: err?.message || 'Ocurrió un error inesperado',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <Navbar />

      {/* HERO */}
      <section className="bg-[#f7f8fa]">
        <div className="mx-auto max-w-7xl px-6 pt-28 pb-10 md:pt-32 md:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-10 items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill variant="blue">Luca</Pill>
                <Pill variant="green">Activo</Pill>
                <Pill variant="outline">TikTok</Pill>
              </div>

              <h1 className="mt-4 text-[var(--agentik-blue)] text-4xl md:text-5xl font-bold leading-tight">
                Tu Social Media Manager con IA
              </h1>

              <p className="mt-5 text-gray-700 text-lg leading-relaxed max-w-2xl">
                Dile a Luca qué quieres publicar hoy. Él optimiza el contenido para TikTok según tu objetivo y lo deja
                listo para publicar.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-sm text-gray-600">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Copy y hashtags (auto o manual)
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Modo “ventas / seguidores / likes”
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Publicación en TikTok (v1)
                </span>
              </div>
            </div>

            {/* Avatar / TikTok connect */}
            <Card className="border-black/10 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-[var(--agentik-blue)]/5 flex items-center justify-center overflow-hidden">
                    <Image src="/agents/luca.png" alt="Luca" width={56} height={56} className="h-14 w-14 object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">Luca</p>
                    <p className="text-sm text-gray-600">Social Media Manager • TikTok</p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-black/10 p-4 bg-[#f7f8fa]">
                  {checkingTikTok ? (
                    <p className="text-sm text-gray-600">Verificando conexión con TikTok…</p>
                  ) : tiktokConnected ? (
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">TikTok conectado</p>
                        <p className="mt-1 text-sm text-gray-600">Ya puedes publicar con Luca.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 text-gray-700 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Conecta TikTok para publicar</p>
                        <p className="mt-1 text-sm text-gray-600">Esto autoriza a Agentik a publicar en tu cuenta.</p>

                        <a
                          href="/api/tiktok/auth"
                          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[var(--agentik-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--agentik-blue-hover)] transition"
                        >
                          Conectar TikTok
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            setCheckingTikTok(true)
                            fetch('/api/tiktok/status')
                              .then((r) => r.json())
                              .then((d) => setTikTokConnected(Boolean(d?.connected)))
                              .catch(() => setTikTokConnected(false))
                              .finally(() => setCheckingTikTok(false))
                          }}
                          className="mt-3 w-full inline-flex items-center justify-center rounded-xl border border-black/20 px-4 py-2 text-sm font-semibold text-black hover:bg-[var(--agentik-blue)]/5 transition"
                        >
                          Ya conecté, verificar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* WORKSPACE */}
      <section className="pb-16 md:pb-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.52fr] gap-10 items-start">
            {/* Form */}
            <form onSubmit={onSubmit}>
              <Card className="border-black/10 bg-white">
                <CardContent className="p-6 md:p-8">
                  <h2 className="text-xl font-bold text-[var(--agentik-blue)]">¿Qué quieres publicar hoy?</h2>
                  <p className="mt-2 text-gray-600">
                    Cuéntale a Luca tu objetivo y el tipo de publicación. Él se encarga del resto.
                  </p>

                  {/* Post type */}
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ChoiceCard
                      title="Video"
                      description="Ideal para TikTok. Publicación lista para ventas o engagement."
                      icon={<Video className="h-5 w-5" />}
                      selected={postType === 'video'}
                      onClick={() => setPostType('video')}
                    />
                    <ChoiceCard
                      title="Imagen"
                      description="Próximamente: posts estáticos optimizados."
                      icon={<ImageIcon className="h-5 w-5" />}
                      selected={postType === 'image'}
                      onClick={() => setPostType('image')}
                      disabled
                    />
                  </div>

                  {/* Objective */}
                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-[var(--agentik-blue)]">Objetivo de la publicación</h3>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {([
                        { key: 'ventas', label: 'Ventas', icon: <Sparkles className="h-4 w-4" /> },
                        { key: 'seguidores', label: 'Seguidores', icon: <Sparkles className="h-4 w-4" /> },
                        { key: 'likes', label: 'Likes', icon: <Sparkles className="h-4 w-4" /> },
                      ] as const).map((o) => (
                        <button
                          type="button"
                          key={o.key}
                          onClick={() => setObjective(o.key)}
                          className={cx(
                            'rounded-xl border px-4 py-3 text-sm font-semibold transition flex items-center justify-center gap-2',
                            objective === o.key
                              ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                              : 'border-black/15 bg-white hover:bg-[var(--agentik-blue)]/5'
                          )}
                        >
                          {o.icon}
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reference media */}
                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-[var(--agentik-blue)]">¿Tienes una referencia?</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Puedes subir un video o imagen de referencia. Si no, Luca trabaja con tu descripción.
                    </p>

                    <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-center">
                      <button
                        type="button"
                        onClick={() => setHasReference(true)}
                        className={cx(
                          'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition border',
                          hasReference
                            ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                            : 'border-black/20 bg-white hover:bg-[var(--agentik-blue)]/5'
                        )}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Subir archivo
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setHasReference(false)
                          setMediaFile(null)
                        }}
                        className={cx(
                          'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition border',
                          !hasReference
                            ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                            : 'border-black/20 bg-white hover:bg-[var(--agentik-blue)]/5'
                        )}
                      >
                        No, solo descripción
                      </button>

                      {hasReference ? (
                        <div className="sm:ml-auto">
                          <input
                            type="file"
                            accept="video/*,image/*"
                            onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-xl file:border-0 file:bg-[var(--agentik-blue)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[var(--agentik-blue-hover)]"
                          />
                          {mediaFile ? (
                            <p className="mt-2 text-xs text-gray-500">
                              Archivo: <span className="font-medium">{mediaFile.name}</span>
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-gray-500">Sube un archivo para continuar.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-[var(--agentik-blue)]">Descripción de la publicación</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Escribe lo que quieres comunicar. Luca convertirá esto en una publicación lista para TikTok.
                    </p>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[var(--agentik-blue)]/20"
                      placeholder="Ej: Quiero mostrar jeans colombianos para mujer, resaltar calidad, horma y envío rápido a Estados Unidos. Cierra con llamada a escribir por WhatsApp."
                    />
                  </div>

                  {/* AI options */}
                  <div className="mt-8 rounded-2xl border border-black/10 bg-[#f7f8fa] p-5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      <h3 className="text-sm font-semibold text-[var(--agentik-blue)]">Opciones de Luca</h3>
                    </div>

                    <div className="mt-4 space-y-5">
                      <Toggle
                        checked={optimize}
                        onChange={setOptimize}
                        label="Optimizar con Luca (recomendado)"
                        helper="Luca mejora la estructura, el gancho y la claridad para TikTok."
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Hashtags */}
                        <div className="rounded-xl border border-black/10 bg-white p-4">
                          <p className="text-sm font-semibold text-gray-900">Hashtags</p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setHashtagsMode('auto')}
                              className={cx(
                                'flex-1 rounded-xl px-3 py-2 text-sm font-semibold border transition',
                                hashtagsMode === 'auto'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Auto
                            </button>
                            <button
                              type="button"
                              onClick={() => setHashtagsMode('custom')}
                              className={cx(
                                'flex-1 rounded-xl px-3 py-2 text-sm font-semibold border transition',
                                hashtagsMode === 'custom'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Personalizar
                            </button>
                          </div>

                          {hashtagsMode === 'custom' ? (
                            <textarea
                              value={hashtagsCustom}
                              onChange={(e) => setHashtagsCustom(e.target.value)}
                              rows={3}
                              className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--agentik-blue)]/20"
                              placeholder="#jeanscolombianos #modacolombia #outfit"
                            />
                          ) : (
                            <p className="mt-3 text-sm text-gray-600">Luca genera hashtags automáticamente.</p>
                          )}
                        </div>

                        {/* Copy */}
                        <div className="rounded-xl border border-black/10 bg-white p-4">
                          <p className="text-sm font-semibold text-gray-900">Copy</p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setCopyMode('auto')}
                              className={cx(
                                'flex-1 rounded-xl px-3 py-2 text-sm font-semibold border transition',
                                copyMode === 'auto'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Auto
                            </button>
                            <button
                              type="button"
                              onClick={() => setCopyMode('custom')}
                              className={cx(
                                'flex-1 rounded-xl px-3 py-2 text-sm font-semibold border transition',
                                copyMode === 'custom'
                                  ? 'border-[var(--agentik-blue)] bg-[var(--agentik-blue)] text-white'
                                  : 'border-black/15 bg-white hover:bg-[var(--agentik-blue)]/5'
                              )}
                            >
                              Personalizar
                            </button>
                          </div>

                          {copyMode === 'custom' ? (
                            <textarea
                              value={copyCustom}
                              onChange={(e) => setCopyCustom(e.target.value)}
                              rows={3}
                              className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--agentik-blue)]/20"
                              placeholder="Escribe el copy exacto que quieres usar..."
                            />
                          ) : (
                            <p className="mt-3 text-sm text-gray-600">Luca escribe el copy automáticamente.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
                    <button
                      type="submit"
                      disabled={!canSubmit || sending}
                      className={cx(
                        'inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition w-full sm:w-auto',
                        !canSubmit || sending
                          ? 'bg-black/30 text-white cursor-not-allowed'
                          : 'bg-[var(--agentik-blue)] text-white hover:bg-[var(--agentik-blue-hover)]'
                      )}
                    >
                      {sending ? 'Luca está trabajando…' : 'Generar y publicar en TikTok'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </button>

                    <p className="text-sm text-gray-600">
                      {checkingTikTok
                        ? 'Verificando TikTok…'
                        : !tiktokConnected
                        ? 'Conecta TikTok para habilitar la publicación.'
                        : hasReference && !mediaFile
                        ? 'Sube un archivo para continuar.'
                        : postType === 'image'
                        ? 'Imagen está en “próximamente”.'
                        : 'Tip: describe el producto, el gancho y el llamado a la acción.'}
                    </p>
                  </div>

                  {result ? (
                    <div
                      className={cx(
                        'mt-6 rounded-2xl border p-4 text-sm',
                        result.ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'
                      )}
                    >
                      {result.message}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </form>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card className="border-black/10 bg-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold text-[var(--agentik-blue)]">Cómo lo usa Moda Colombia</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Luca prepara publicaciones enfocadas en ventas: gancho fuerte, producto claro, prueba social y un
                    CTA simple.
                  </p>

                  <div className="mt-4 rounded-xl bg-[#f7f8fa] border border-black/10 p-4">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Ejemplo</p>
                    <p className="mt-2 text-sm text-gray-700">
                      “Jeans push up colombianos ✨ Envíos a USA 3–5 días por FedEx. Escríbenos ‘CATÁLOGO’ y te lo enviamos.”
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-black/10 bg-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold text-[var(--agentik-blue)]">Estado</h3>
                  <div className="mt-3 space-y-2 text-sm text-gray-700">
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> TikTok aprobado y listo para publicar
                    </p>
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> Hashtags y copy automáticos
                    </p>
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> Publicación automática en tu cuenta.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-10 border-t border-black/5 bg-white">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row gap-3 items-center justify-between">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Agentik</p>
          <p className="text-xs text-gray-500">Luca (v1) • TikTok</p>
        </div>
      </footer>
    </div>
  )
}