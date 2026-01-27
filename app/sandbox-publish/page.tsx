'use client'

import React, { useEffect, useMemo, useState } from 'react'

type StepState = 'idle' | 'ready' | 'loading' | 'success' | 'error'

export default function SandboxPublishOnlyPage() {
  const [connected, setConnected] = useState(false)
  const [scope, setScope] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<StepState>('idle')
  const [message, setMessage] = useState('')
  const [details, setDetails] = useState<any>(null)

  const fileLabel = useMemo(() => {
    if (!file) return 'No file selected'
    const mb = (file.size / (1024 * 1024)).toFixed(2)
    return `${file.name} • ${mb} MB`
  }, [file])

  const refresh = async () => {
    const r = await fetch('/api/tiktok/status', { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    setConnected(!!j?.connected)
    setScope(j?.scope || '')
  }

  useEffect(() => {
    refresh()
  }, [])

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setDetails(null)
    setMessage('')
    setState(f ? 'ready' : 'idle')
  }

  const onPublish = async () => {
    if (!file) return
    setState('loading')
    setMessage('Publishing (Sandbox)…')
    setDetails(null)

    const form = new FormData()
    form.append('video', file)

    const res = await fetch('/api/tiktok/publish', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setState('error')
      setMessage(data?.error || 'Publish failed')
      setDetails(data)
      return
    }

    setState('success')
    setMessage('Publish OK (Sandbox).')
    setDetails(data)
  }

  return (
    <main style={{ minHeight: '100vh', padding: 24, background: '#0b1220', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Sandbox Publish — video.publish</h1>
          <span
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              borderRadius: 999,
              fontSize: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(234,179,8,0.16)',
              color: '#fde68a',
              fontWeight: 900,
            }}
          >
            SANDBOX MODE
          </span>
        </div>

        <p style={{ color: '#9ca3af' }}>
          Connected: <b>{connected ? 'YES' : 'NO'}</b> — scope: <code>{scope || '—'}</code>
        </p>

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
            onClick={onPublish}
            disabled={!connected || !file || state === 'loading'}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: connected && file && state !== 'loading' ? '#304f9d' : 'rgba(48,79,157,0.35)',
              color: 'white',
              fontWeight: 900,
              cursor: connected && file && state !== 'loading' ? 'pointer' : 'not-allowed',
            }}
          >
            {state === 'loading' ? 'Publishing…' : 'Publish (Sandbox)'}
          </button>

          <span style={{ color: '#9ca3af' }}>Status: <b style={{ color: '#e5e7eb' }}>{state}</b></span>
          <span style={{ color: '#9ca3af' }}>{message}</span>
        </div>

        {details ? (
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
{JSON.stringify(details, null, 2)}
          </pre>
        ) : null}
      </div>
    </main>
  )
}