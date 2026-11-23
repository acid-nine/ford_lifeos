import React, { useCallback, useEffect, useState } from 'react'
import {
  Cloud, CloudUpload, RefreshCw, Save, Download, Trash2, RotateCcw,
  Check, AlertCircle, Settings2, HardDrive, FileJson,
} from 'lucide-react'
import { useToast } from '../store.jsx'

const human = (n) => {
  if (!n) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(1)} ${units[i]}`
}

export default function CloudBackup() {
  const [status, setStatus] = useState(null)
  const [backups, setBackups] = useState([])
  const [form, setForm] = useState({ webAppUrl: '', secret: '', autoMinutes: 0 })
  const [showSetup, setShowSetup] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        fetch('/api/google/status').then((r) => r.json()),
        fetch('/api/google/backups').then((r) => r.json()),
      ])
      setStatus(s)
      setBackups(Array.isArray(b) ? b : [])
      if (Array.isArray(b)) setForm((f) => ({ ...f }))
    } catch { /* offline */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const source = new EventSource('/api/events')
    source.addEventListener('google', load)
    return () => source.close()
  }, [load])

  const saveConfig = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/google/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast('Bridge settings saved', '✓')
      setShowSetup(false)
      load()
    } catch (err) { toast(err.message, '!') }
    finally { setBusy(false) }
  }

  const backupNow = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/google/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast(`Backed up as ${data.name}`, '↑')
      load()
    } catch (err) { toast(err.message, '!') }
    finally { setBusy(false) }
  }

  const download = async (name) => {
    try {
      const data = await fetch(`/api/google/backups/download?name=${encodeURIComponent(name)}`).then((r) => r.json())
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { toast(err.message, '!') }
  }

  const restore = async (name) => {
    if (!confirm(`Restore FordOS from "${name}"? This replaces current tasks, events, notes, agents and briefs.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/google/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('Backup restored', '↺')
    } catch (err) { toast(err.message, '!') }
    finally { setBusy(false) }
  }

  const remove = async (name) => {
    if (!confirm(`Delete "${name}" from Google Drive?`)) return
    await fetch(`/api/google/backups?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    toast('Remote backup deleted', '✕')
    load()
  }

  return (
    <div className="app cloud-app">
      <header className="app-toolbar">
        <div><h1>Cloud Backup</h1><p>Full FordOS snapshots in your own Google Drive — via a script you control.</p></div>
        <div className="toolbar-actions">
          <button type="button" className="btn ghost" onClick={() => setShowSetup((s) => !s)}><Settings2 size={15} /> Setup</button>
          <button type="button" className="btn ghost" onClick={load}><RefreshCw size={15} /></button>
          <button type="button" className="btn primary" onClick={backupNow} disabled={!status?.configured || busy}><CloudUpload size={15} /> {busy ? 'Working…' : 'Backup now'}</button>
        </div>
      </header>

      <div className="cloud-body">
        <div className={`cloud-status ${status?.configured && status.ok !== false ? 'connected' : ''}`}>
          <span className="cloud-status-icon">{status?.configured && status.ok !== false ? <Cloud size={22} /> : <AlertCircle size={22} />}</span>
          <div>
            <strong>{status?.configured ? (status.ok !== false ? 'Bridge connected' : 'Bridge error') : 'Not configured'}</strong>
            <p>{status?.configured ? (status.ok !== false ? `Drive folder: ${status.folder || 'FordOS Backups'} · auto: ${status.autoMinutes || 'off'}` : status.error) : 'Add your Apps Script web app URL and secret in Setup.'}</p>
          </div>
          {status?.configured && <span className="status-badge online">ready</span>}
        </div>

        {showSetup && (
          <form className="cloud-setup" onSubmit={saveConfig}>
            <div className="cloud-setup-head"><Settings2 size={15} /> Bridge settings</div>
            <ol className="cloud-steps">
              <li>Open <code>script.google.com</code> and create a project. Paste <code>google/Code.gs</code> from the FordOS folder.</li>
              <li>In Project Settings → Script Properties set <code>FORDOS_SECRET</code> to a long random string.</li>
              <li>Deploy → New deployment → Web app: execute as <strong>Me</strong>, access <strong>Anyone with the link</strong>. Copy the URL.</li>
              <li>Paste that URL and the same secret below, then save.</li>
            </ol>
            <div className="form-row">
              <label className="field"><span className="field-label">Web app URL</span><input value={form.webAppUrl} onChange={(e) => setForm({ ...form, webAppUrl: e.target.value })} placeholder="https://script.google.com/macros/s/.../exec" /></label>
              <label className="field"><span className="field-label">Secret</span><input type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="FORDOS_SECRET" /></label>
            </div>
            <label className="field"><span className="field-label">Auto backup interval (minutes, 0 = off)</span><input type="number" min="0" value={form.autoMinutes} onChange={(e) => setForm({ ...form, autoMinutes: Number(e.target.value) })} /></label>
            <div className="cloud-setup-foot"><span className="spacer" /><button type="button" className="btn ghost" onClick={() => setShowSetup(false)}>Cancel</button><button type="submit" className="btn primary" disabled={busy}><Save size={14} /> Save</button></div>
          </form>
        )}

        <section className="cloud-panel">
          <header><h3><HardDrive size={15} /> Remote backups</h3><span>{backups.length} in Drive</span></header>
          <div className="backup-list">
            {backups.length === 0 && <div className="empty-mini">No backups in Drive yet. Hit "Backup now".</div>}
            {backups.map((b) => (
              <div className="backup-row" key={b.name || b.id}>
                <span className="backup-icon"><FileJson size={17} /></span>
                <div className="backup-info"><strong>{b.name}</strong><em>{human(b.size)} · {new Date(b.modified).toLocaleString()}</em></div>
                <div className="backup-actions">
                  <button type="button" className="btn ghost small" onClick={() => download(b.name)}><Download size={12} /> Save copy</button>
                  <button type="button" className="btn ghost small" onClick={() => restore(b.name)} disabled={busy}><RotateCcw size={12} /> Restore</button>
                  <button type="button" className="icon-btn danger" onClick={() => remove(b.name)} aria-label="Delete backup"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="cloud-note"><Check size={12} /> Everything is stored in a folder your Google account owns. FordOS never sees your Google password — the script uses a secret you choose.</p>
      </div>
    </div>
  )
}
