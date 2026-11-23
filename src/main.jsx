import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DataProvider, ToastProvider } from './store.jsx'
import './styles.css'

/* Attach the access code to same-origin API calls so remote browsers can
   use the exact same UI as the desktop. */
const realFetch = window.fetch.bind(window)
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || ''
  const token = localStorage.getItem('fordos.token')
  if (token && url.includes('/api/')) {
    const headers = new Headers(init.headers || {})
    headers.set('x-fordos-token', token)
    return realFetch(input, { ...init, headers })
  }
  return realFetch(input, init)
}

const RealEventSource = window.EventSource
window.EventSource = class extends RealEventSource {
  constructor(url, options) {
    const token = localStorage.getItem('fordos.token')
    const target = token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url
    super(target, options)
  }
}

function Login({ onDone }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) throw new Error('Wrong access code')
      localStorage.setItem('fordos.token', code.trim())
      onDone()
    } catch (err) {
      setError(err.message || 'Could not sign in')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-screen">
      <form className="login-card glass-card" onSubmit={submit}>
        <div className="login-logo">F</div>
        <span className="eyebrow">Remote access</span>
        <h1>Welcome to FordOS</h1>
        <p>Enter the access code shown in the FordOS server terminal.</p>
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" spellCheck="false" />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="btn primary full" disabled={!code.trim() || busy}>{busy ? 'Checking…' : 'Unlock'}</button>
        <small>Stored on this device only.</small>
      </form>
    </div>
  )
}

function Root() {
  const [authorized, setAuthorized] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('/api/state')
      .then((r) => { if (alive) setAuthorized(r.ok) })
      .catch(() => { if (alive) setAuthorized(true) })
    return () => { alive = false }
  }, [])

  if (authorized === null) return <div className="boot-screen">Starting FordOS…</div>
  if (!authorized) return <Login onDone={() => window.location.reload()} />

  return (
    <React.StrictMode>
      <ToastProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </ToastProvider>
    </React.StrictMode>
  )
}

createRoot(document.getElementById('root')).render(<Root />)
