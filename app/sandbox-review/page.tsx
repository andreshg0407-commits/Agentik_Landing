'use client'

import React, { useEffect, useMemo, useState } from 'react'

type StepState = 'idle' | 'ready' | 'loading' | 'success' | 'error'

type TikTokStatus = {
  connected: boolean
  scope?: string
  open_id?: string
  token_type?: string
}

type TikTokUserInfo = {
  open_id?: string
  username?: string
  display_name?: string
  avatar_url?: string
  union_id?: string
  [k: string]: any
}

const REQUIRED_SCOPES = ['user.info.basic', 'video.upload', 'video.publish'] as const

export default function SandboxReviewPage() {
  // Connection / scopes
  const [status, setStatus] = useState<TikTokStatus>({ connected: false })
  const [userInfo, setUserInfo] = useState<TikTokUserInfo | null>(null)

  // Upload
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<StepState>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadDetails, setUploadDetails] = useState<any>(null)

  // Publish
  const [publishState, setPublishState] = useState<StepState>('idle')
  const [publishMsg, setPublishMsg] = useState('')
  const [publishDetails, setPublishDetails] = useState<any>(null)

  const displayedScope = useMemo(() => {
    // TikTok suele devolver scopes en string separado por coma/espacio
    const s = (status?.scope || REQUIRED_SCOPES.join(', ')).trim()
    return s
  }, [status?.scope])

  const hasAllRequiredScopes = useMemo(() => {
    const s = (displayedScope || '').toLowerCase()
    return REQUIRED_SCOPES.every((x) => s.includes(x))
  }, [displayedScope])

  const fileLabel = useMemo(() => {
    if (!file) return 'No file selected'
    const mb = (file.size / (1024 * 1024)).toFixed(2)
    return `${file.name} • ${mb} MB`
  }, [file])

  const refreshStatus = async () => {
    const res = await fetch('/api/tiktok/status', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    setStatus({
      connected: !!data?.connected,
      scope: data?.scope || '',
      open_id: data?.open_id,
      token_type: data?.token_type,
    })
  }

  const fetchUserInfo = async () => {
    // Esto demuestra user.info.basic (debe verse en pantalla)
    const res = await fetch('/api/tiktok/userinfo', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data?.ok) setUserInfo(data?.user || data)
    else setUserInfo(data?.user || data || null)
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  // ✅ Si volvemos del callback con ?connected=1, refrescamos estado una vez más
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') refreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Si ya está conectado, traemos info del usuario para que el video lo muestre.
    if (status.connected) fetchUserInfo()
    else setUserInfo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.connected])

  // ✅ OAuth con redirect directo (tu opción 1)
  const onConnect = () => {
    window.location.href = '/api/tiktok/auth'
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setUploadDetails(null)
    setUploadMsg('')
    setUploadState(f ? 'ready' : 'idle')

    // Reset publish state when new file selected
    setPublishDetails(null)
    setPublishMsg('')
    setPublishState('idle')
  }

  const onUpload = async () => {
  if (!file) return
  setUploadState('loading')
  setUploadMsg('Uploading (Sandbox)...')
  setUploadDetails(null)

  try {
    const form = new FormData()
    form.append('video', file)

    const res = await fetch('/api/tiktok/upload', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setUploadState('error')
      setUploadMsg(data?.error || 'Upload failed')
      setUploadDetails(data)
      return
    }

    // ✅ Guardamos toda la respuesta + publish_id "plano" para usarlo en Publish
    const publishId = data?.publish_id || data?.tiktok?.data?.publish_id || data?.tiktok?.publish_id || ''
    const patched = { ...data, publish_id: publishId }

    setUploadState('success')
    setUploadMsg(publishId ? `Upload OK (Sandbox). publish_id: ${publishId}` : 'Upload OK (Sandbox).')
    setUploadDetails(patched)
  } catch (e: any) {
    setUploadState('error')
    setUploadMsg(e?.message || 'Unexpected error')
  }
}

  const onPublish = async () => {
  const publishId =
    uploadDetails?.publish_id ||
    uploadDetails?.tiktok?.data?.publish_id ||
    uploadDetails?.tiktok?.publish_id ||
    ''

  if (!publishId) {
    setPublishState('error')
    setPublishMsg('Missing publish_id. Run Upload first.')
    setPublishDetails({ ok: false, error: 'Missing publish_id. Run Upload first.' })
    return
  }

  setPublishState('loading')
  setPublishMsg('Fetching publish status (Sandbox)...')
  setPublishDetails(null)

  try {
    const res = await fetch('/api/tiktok/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: publishId }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setPublishState('error')
      setPublishMsg(data?.error || 'Publish status failed')
      setPublishDetails(data)
      return
    }

    setPublishState('success')
    setPublishMsg('Publish status OK (Sandbox).')
    setPublishDetails(data)
  } catch (e: any) {
    setPublishState('error')
    setPublishMsg(e?.message || 'Unexpected error')
    setPublishDetails({ ok: false, error: e?.message || 'Unexpected error' })
  }
}

  const canUpload = status.connected && file && uploadState !== 'loading'
  const canPublish = status.connected && file && publishState !== 'loading'

  return (
    <main style={{ minHeight: '100vh', padding: 24, background: '#0b1220', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* HEADER */}
        <header style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: '#304f9d',
                boxShadow: '0 0 0 4px rgba(48,79,157,0.18)',
              }}
            />
            <h1 style={{ fontSize: 22, margin: 0 }}>Agentickers — TikTok Sandbox Review Demo</h1>

            <span
              style={{
                marginLeft: 'auto',
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(234,179,8,0.16)',
                color: '#fde68a',
                fontWeight: 800,
                letterSpacing: 0.5,
              }}
            >
              SANDBOX MODE
            </span>
          </div>

          <p style={{ marginTop: 10, marginBottom: 0, color: '#9ca3af', lineHeight: 1.5 }}>
            This page demonstrates <b>Login Kit (OAuth)</b> + <b>Content Posting</b> in <b>Sandbox</b> for the selected
            scopes.
          </p>
        </header>

        {/* SCOPES PANEL (must be visible in video) */}
        <section
          style={{
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14,
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800 }}>Scopes selected (must be shown in video):</div>
            {REQUIRED_SCOPES.map((s) => (
              <span
                key={s}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(0,0,0,0.25)',
                  color: '#cbd5e1',
                }}
              >
                {s}
              </span>
            ))}

            <span
              style={{
                marginLeft: 'auto',
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: hasAllRequiredScopes ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.16)',
                color: '#cbd5e1',
                fontWeight: 800,
              }}
            >
              {hasAllRequiredScopes ? 'Scopes detected ✅' : 'Scopes missing ❌'}
            </span>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: '#9ca3af' }}>
            Current token scope string: <code style={{ color: '#e5e7eb' }}>{displayedScope || '—'}</code>
          </div>
        </section>

        {/* STEP 1: CONNECT */}
        <section
          style={{
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14,
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900 }}>Step 1 — Login Kit (OAuth)</div>

            <span
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: status.connected ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.14)',
                color: '#cbd5e1',
                fontWeight: 800,
              }}
            >
              {status.connected ? 'Connected ✅' : 'Not connected'}
            </span>

            <button
              onClick={onConnect}
              style={{
                marginLeft: 8,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#304f9d',
                color: 'white',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Connect TikTok (Sandbox)
            </button>

            <button
              onClick={refreshStatus}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(0,0,0,0.25)',
                color: '#e5e7eb',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>

          {/* user.info.basic evidence */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>
              Evidence for <code style={{ color: '#e5e7eb' }}>user.info.basic</code> (must be visible):
            </div>

            <div
              style={{
                marginTop: 8,
                borderRadius: 12,
                padding: 12,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(0,0,0,0.25)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {userInfo?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userInfo.avatar_url}
                  alt="avatar"
                  style={{ width: 42, height: 42, borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)' }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                />
              )}

              <div style={{ minWidth: 280 }}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>
                  {userInfo?.display_name || userInfo?.username || '—'}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  open_id: <code style={{ color: '#e5e7eb' }}>{userInfo?.open_id || status.open_id || '—'}</code>
                </div>
              </div>

              <div style={{ flex: 1 }} />
              <button
                onClick={fetchUserInfo}
                disabled={!status.connected}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: status.connected ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.05)',
                  color: '#e5e7eb',
                  fontWeight: 800,
                  cursor: status.connected ? 'pointer' : 'not-allowed',
                }}
              >
                Load user info
              </button>
            </div>

            {userInfo ? (
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  overflowX: 'auto',
                  fontSize: 12,
                  color: '#d1d5db',
                }}
              >
{JSON.stringify(userInfo, null, 2)}
              </pre>
            ) : null}
          </div>
        </section>

        {/* STEP 2: UPLOAD */}
        <section
          style={{
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14,
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Step 2 — Upload (Sandbox) — <code style={{ color: '#e5e7eb' }}>video.upload</code>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(0,0,0,0.20)',
                cursor: 'pointer',
              }}
            >
              <input type="file" accept="video/*" onChange={onPickFile} style={{ display: 'none' }} />
              <span style={{ fontWeight: 800 }}>Choose video</span>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>{fileLabel}</span>
            </label>

            <button
              onClick={onUpload}
              disabled={!canUpload}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: canUpload ? '#304f9d' : 'rgba(48,79,157,0.35)',
                color: 'white',
                fontWeight: 900,
                cursor: canUpload ? 'pointer' : 'not-allowed',
              }}
            >
              {uploadState === 'loading' ? 'Uploading…' : 'Upload (Sandbox)'}
            </button>

            <span style={{ color: '#9ca3af', fontSize: 13 }}>
              Status: <b style={{ color: '#e5e7eb' }}>{uploadState}</b>
            </span>

            <span style={{ color: '#9ca3af', fontSize: 13 }}>{uploadMsg || ''}</span>
          </div>

          {uploadDetails ? (
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                overflowX: 'auto',
                fontSize: 12,
                color: '#d1d5db',
              }}
            >
{JSON.stringify(uploadDetails, null, 2)}
            </pre>
          ) : null}
        </section>

        {/* STEP 3: PUBLISH */}
        <section
          style={{
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14,
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>
            Step 3 — Publish (Sandbox) — <code style={{ color: '#e5e7eb' }}>video.publish</code>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onPublish}
              disabled={!canPublish}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: canPublish ? '#304f9d' : 'rgba(48,79,157,0.35)',
                color: 'white',
                fontWeight: 900,
                cursor: canPublish ? 'pointer' : 'not-allowed',
              }}
            >
              {publishState === 'loading' ? 'Publishing…' : 'Publish (Sandbox)'}
            </button>

            <span style={{ color: '#9ca3af', fontSize: 13 }}>
              Status: <b style={{ color: '#e5e7eb' }}>{publishState}</b>
            </span>

            <span style={{ color: '#9ca3af', fontSize: 13 }}>{publishMsg || ''}</span>
          </div>

          {publishDetails ? (
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                overflowX: 'auto',
                fontSize: 12,
                color: '#d1d5db',
              }}
            >
{JSON.stringify(publishDetails, null, 2)}
              </pre>
          ) : null}

          <p style={{ marginTop: 10, marginBottom: 0, color: '#6b7280', fontSize: 12, lineHeight: 1.6 }}>
            For the review video: show Connect → user info → Upload JSON → Publish JSON. Keep “SANDBOX MODE” visible.
          </p>
        </section>
      </div>
    </main>
  )
}