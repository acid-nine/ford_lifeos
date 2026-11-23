import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FolderOpen, Upload, Download, Trash2, HardDrive, RefreshCw, Share2, FileText } from 'lucide-react'
import { useToast } from '../store.jsx'

const human = (n) => {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(1)} ${units[i]}`
}

export default function Files() {
  const [files, setFiles] = useState([])
  const [access, setAccess] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const toast = useToast()

  const load = useCallback(async () => {
    try { setFiles(await fetch('/api/files').then((r) => r.json())) }
    catch { /* offline */ }
  }, [])

  useEffect(() => {
    load()
    fetch('/api/access').then(setAccess).catch(() => {})
    const source = new EventSource('/api/events')
    source.addEventListener('files', load)
    return () => source.close()
  }, [load])

  const upload = async (e) => {
    const selected = [...(e.target.files || [])]
    if (!selected.length) return
    setBusy(true); setError('')
    for (const file of selected) {
      try {
        const buffer = await file.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(buffer)
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
        const res = await fetch('/api/files', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, contentBase64: btoa(binary) }),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Upload failed')
      } catch (err) { setError(`${file.name}: ${err.message}`) }
    }
    e.target.value = ''
    setBusy(false)
    load()
    toast(`${selected.length} file(s) uploaded`, '↑')
  }

  const remove = async (name) => {
    if (!confirm(`Delete "${name}" from shared files?`)) return
    await fetch(`/api/files?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    load()
    toast('File deleted', '✕')
  }

  const token = localStorage.getItem('fordos.token') || ''
  const downloadUrl = (name) => `/api/files/download?name=${encodeURIComponent(name)}&token=${encodeURIComponent(token)}`
  const total = files.reduce((sum, f) => sum + f.size, 0)

  return (
    <div className="app files-app">
      <header className="app-toolbar">
        <div><h1>Shared files</h1><p>A single folder your devices can reach — from this desktop or your phone.</p></div>
        <div className="toolbar-actions">
          <button type="button" className="icon-btn" onClick={load} aria-label="Refresh"><RefreshCw size={16} /></button>
          <button type="button" className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload size={15} /> {busy ? 'Uploading…' : 'Upload'}</button>
          <input ref={inputRef} type="file" multiple hidden onChange={upload} />
        </div>
      </header>

      <div className="files-body">
        {access && (
          <div className="files-location">
            <span className="files-location-icon"><Share2 size={17} /></span>
            <div><strong>Shared folder</strong><code>{access.sharedDir}</code></div>
            <span className="files-total"><HardDrive size={13} /> {files.length} files · {human(total)}</span>
          </div>
        )}
        {error && <div className="ai-notice"><FolderOpen size={14} /> {error}</div>}

        <div className="file-list">
          {files.length === 0 && <div className="empty-state"><FolderOpen size={34} /><h3>Nothing shared yet</h3><p>Upload a file, or drop files into the shared folder on this machine.</p></div>}
          {files.map((f) => (
            <div className="file-row" key={f.name}>
              <span className="file-icon"><FileText size={17} /></span>
              <div className="file-info"><strong>{f.name}</strong><em>{human(f.size)} · {new Date(f.modified).toLocaleString()}</em></div>
              <div className="file-actions">
                <a className="btn ghost small" href={downloadUrl(f.name)} download><Download size={13} /> Download</a>
                <button type="button" className="icon-btn danger" onClick={() => remove(f.name)} aria-label="Delete file"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
