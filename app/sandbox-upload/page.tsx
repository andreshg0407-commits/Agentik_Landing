'use client'

import React, { useMemo, useState } from 'react'

type UploadState = 'idle' | 'ready' | 'uploading' | 'success' | 'error'

export default function SandboxUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [message, setMessage] = useState<string>('')
  const [details, setDetails] = useState<any>(null)

  const fileLabel = useMemo(() => {
    if (!file) return 'No file selected'
    const mb = (file.size / (1024 * 1024)).toFixed(2)
    return `${file.name} • ${mb} MB`
  }, [file])

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setDetails(null)
    setMessage('')
    setState(f ? 'ready' : 'idle')
  }

  const onUpload = async () => {
    if (!file) return
    setState('uploading')
    setMessage('Uploading to TikTok Sandbox...')
    setDetails(null)

    try {
      const form = new FormData()
      form.append('video', file)

      // Campos opcionales súper mínimos (sin user scopes)
      form.append('caption', 'Agentickers Sandbox Upload Demo')
      form.append('sandbox', 'true')

      const res = await fetch('/api/tiktok/upload', {
        method: 'POST',
        body: form,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setState('error')
        setMessage(data?.error || 'Upload failed')
        setDetails(data)
        return
      }

      setState('success')
      setMessage('Upload successful (Sandbox).')
      setDetails(data)
    } catch (err: any) {
      setState('error')
      setMessage(err?.message || 'Unexpected error')
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: 24, background: '#0b1220', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <h1 style={{ fontSize: 22, margin: 0 }}>Agentickers — TikTok Sandbox Upload Demo</h1>
          </div>

          <p style={{ marginTop: 10, marginBottom: 0, color: '#9ca3af', lineHeight: 1.5 }}>
            This page demonstrates <b>video upload</b> to <b>TikTok Sandbox</b> using only the <code>video.upload</code>{' '}
            permission.
          </p>
        </header>

        <section
          style={{
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14,
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ display: 'grid', gap: 12 }}>
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
                <input
                  type="file"
                  accept="video/*"
                  onChange={onPickFile}
                  style={{ display: 'none' }}
                />
                <span style={{ fontWeight: 600 }}>Choose video</span>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>{fileLabel}</span>
              </label>

              <button
                onClick={onUpload}
                disabled={!file || state === 'uploading'}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: state === 'uploading' ? 'rgba(48,79,157,0.35)' : '#304f9d',
                  color: 'white',
                  fontWeight: 700,
                  cursor: !file || state === 'uploading' ? 'not-allowed' : 'pointer',
                }}
              >
                {state === 'uploading' ? 'Uploading…' : 'Upload to TikTok (Sandbox)'}
              </button>

              <span
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(0,0,0,0.25)',
                  color: '#cbd5e1',
                }}
              >
                Sandbox: ON
              </span>
            </div>

            <div
              style={{
                borderRadius: 12,
                padding: 12,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Status</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {state === 'idle' && 'Idle'}
                    {state === 'ready' && 'Ready'}
                    {state === 'uploading' && 'Uploading'}
                    {state === 'success' && 'Success'}
                    {state === 'error' && 'Error'}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ minWidth: 240 }}>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Message</div>
                  <div style={{ fontSize: 14 }}>{message || '—'}</div>
                </div>
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

            <p style={{ margin: 0, color: '#6b7280', fontSize: 12, lineHeight: 1.6 }}>
              Note: This demo intentionally does not request or display profile, stats, or user information.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}