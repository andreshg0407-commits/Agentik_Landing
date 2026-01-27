'use client'

import { useState } from 'react'

export default function WhatsAppReviewPage() {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const btnStyle: React.CSSProperties = {
    appearance: 'none',
    WebkitAppearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 18px',
    border: '2px solid #111',
    borderRadius: 12,
    background: '#fff',
    color: '#111',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    userSelect: 'none',
    textDecoration: 'none',
    minHeight: 44,
  }

  const handleConnect = () => {
    window.location.href = '/api/meta/whatsapp/connect'
  }

  const handleSend = async () => {
    if (!message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error('Send failed')
      setStatus('sent')
      setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: '80px auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 10 }}>WhatsApp Review</h1>

      <p style={{ opacity: 0.85, lineHeight: 1.5 }}>
        This page demonstrates WhatsApp connection and manual message sending for Meta App Review.
      </p>

      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={handleConnect} style={btnStyle}>
          Continue with Facebook
        </button>
      </div>

      <hr style={{ margin: '28px 0' }} />

      <label style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>Message to send</label>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Hello from Agentik"
        style={{
          width: '100%',
          padding: 12,
          border: '2px solid #111',
          borderRadius: 12,
          fontSize: 16,
          minHeight: 44,
          outline: 'none',
        }}
      />

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={handleSend} style={btnStyle} disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </button>
      </div>

      {status === 'sent' && <p style={{ marginTop: 12, color: 'green', fontWeight: 700 }}>Message sent ✅</p>}
      {status === 'error' && <p style={{ marginTop: 12, color: 'crimson', fontWeight: 700 }}>Error sending message ❌</p>}
    </main>
  )
}