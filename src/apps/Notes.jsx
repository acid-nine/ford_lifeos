import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Pin, PinOff, Trash2, FileText, Eye, Pencil, Tag, Hash } from 'lucide-react'
import { useData, useToast } from '../store.jsx'

/* A tiny, escaped markdown renderer — no external dependency. */
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function inline(raw) {
  const codes = []
  let s = raw.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000` })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
    /^(https?:|mailto:)/i.test(href) ? `<a href="${href}" target="_blank" rel="noreferrer">${text}</a>` : text)
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`)
  return s
}

export function renderMarkdown(src = '') {
  const lines = src.replace(/\r/g, '').split('\n')
  let html = '', i = 0, list = null, inCode = false
  const code = []
  const closeList = () => { if (list) { html += `</${list}>`; list = null } }
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      closeList()
      if (!inCode) { inCode = true; code.length = 0 }
      else { html += `<pre><code>${code.join('\n')}</code></pre>`; inCode = false }
      i++; continue
    }
    if (inCode) { code.push(escapeHtml(line)); i++; continue }
    const esc = escapeHtml(line)
    let m
    if (!esc.trim()) { closeList(); i++; continue }
    if ((m = esc.match(/^(#{1,3})\s+(.*)$/))) { closeList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; continue }
    if ((m = esc.match(/^(?:>|&gt;)\s?(.*)$/))) { closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; i++; continue }
    if (/^(---|\*\*\*)$/.test(esc.trim())) { closeList(); html += '<hr />'; i++; continue }
    if ((m = esc.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul' } html += `<li>${inline(m[1])}</li>`; i++; continue }
    if ((m = esc.match(/^\s*\d+\.\s+(.*)$/))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol' } html += `<li>${inline(m[1])}</li>`; i++; continue }
    closeList(); html += `<p>${inline(esc)}</p>`; i++
  }
  closeList()
  if (inCode) html += `<pre><code>${code.join('\n')}</code></pre>`
  return html
}

export default function Notes({ initialNoteId = null }) {
  const { data, addNote, updateNote, deleteNote } = useData()
  const toast = useToast()
  const [selectedId, setSelectedId] = useState(initialNoteId)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState(null)
  const [mode, setMode] = useState('write')
  const lastCreateRef = useRef(0)

  const notes = data.notes
  useEffect(() => {
    if (selectedId && notes.some((n) => n.id === selectedId)) return
    const first = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title))[0]
    setSelectedId(first?.id || null)
  }, [notes, selectedId])

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags || []))].sort(), [notes])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter((n) => (!tagFilter || (n.tags || []).includes(tagFilter)) && (!q || `${n.title} ${n.body} ${(n.tags || []).join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title))
  }, [notes, search, tagFilter])

  const note = notes.find((n) => n.id === selectedId) || null

  useEffect(() => {
    const onCreate = (e) => {
      if (e.detail !== 'note') return
      e.preventDefault()
      if (Date.now() - lastCreateRef.current < 400) return
      lastCreateRef.current = Date.now()
      createNote()
    }
    const onOpen = (e) => {
      if (!e.detail) return
      e.preventDefault()
      setSelectedId(e.detail)
      setTagFilter(null)
      setSearch('')
    }
    window.addEventListener('fordos:create', onCreate)
    window.addEventListener('fordos:open-note', onOpen)
    return () => {
      window.removeEventListener('fordos:create', onCreate)
      window.removeEventListener('fordos:open-note', onOpen)
    }
  })

  const createNote = () => {
    const id = addNote({ title: 'Untitled note', body: '', tags: [] })
    setSelectedId(id)
    setMode('write')
    toast('Note created', '✎')
  }

  const update = (changes) => note && updateNote(note.id, changes)

  return (
    <div className="app notes-app">
      <aside className="app-sidebar notes-sidebar">
        <div className="notes-side-top">
          <div className="search-box"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" /></div>
          <button type="button" className="btn primary icon-only" onClick={createNote} aria-label="New note"><Plus size={17} /></button>
        </div>
        {allTags.length > 0 && (
          <div className="tag-bar">
            <button type="button" className={`tag-chip ${!tagFilter ? 'active' : ''}`} onClick={() => setTagFilter(null)}>All</button>
            {allTags.map((tag) => <button type="button" key={tag} className={`tag-chip ${tagFilter === tag ? 'active' : ''}`} onClick={() => setTagFilter(tag)}>#{tag}</button>)}
          </div>
        )}
        <div className="note-list">
          {filtered.length === 0 && <div className="empty-mini">No notes found.</div>}
          {filtered.map((n) => (
            <button type="button" key={n.id} className={`note-item ${n.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(n.id)}>
              <div className="note-item-top"><strong>{n.title || 'Untitled note'}</strong>{n.pinned && <Pin size={12} className="pin-mark" />}</div>
              <p>{n.body.replace(/[#*`>\[\]]/g, '').slice(0, 90) || 'Empty note'}</p>
              <div className="note-item-foot">
                <span>{new Date(n.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                {(n.tags || []).slice(0, 2).map((t) => <em key={t}>#{t}</em>)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="app-main notes-main">
        {note ? (
          <>
            <header className="notes-toolbar">
              <div className="notes-toolbar-left">
                <button type="button" className={`icon-btn ${note.pinned ? 'active' : ''}`} onClick={() => update({ pinned: !note.pinned })} aria-label="Pin note">
                  {note.pinned ? <Pin size={16} /> : <PinOff size={16} />}
                </button>
                <span className="toolbar-divider" />
                <span className="note-stamp"><FileText size={13} /> Edited {new Date(note.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="notes-toolbar-right">
                <div className="view-toggle">
                  <button type="button" className={mode === 'write' ? 'active' : ''} onClick={() => setMode('write')} aria-label="Write mode"><Pencil size={15} /></button>
                  <button type="button" className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')} aria-label="Preview mode"><Eye size={15} /></button>
                </div>
                <button type="button" className="icon-btn danger" onClick={() => { deleteNote(note.id); setSelectedId(null); toast('Note deleted', '✕') }} aria-label="Delete note"><Trash2 size={16} /></button>
              </div>
            </header>
            <div className="note-editor">
              <input className="note-title-input" value={note.title} onChange={(e) => update({ title: e.target.value })} placeholder="Untitled note" />
              <div className="note-tags">
                <Tag size={13} />
                <input value={(note.tags || []).join(', ')} onChange={(e) => update({ tags: e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean) })} placeholder="Add tags, separated by commas" />
              </div>
              {mode === 'write' ? (
                <textarea className="note-body" value={note.body} onChange={(e) => update({ body: e.target.value })} placeholder="Start writing… Markdown supported." spellCheck="true" />
              ) : (
                <div className="note-preview markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }} />
              )}
              <footer className="note-foot">
                <span><Hash size={12} /> {(note.tags || []).length} tags</span>
                <span>{note.body.trim() ? note.body.trim().split(/\s+/).length : 0} words</span>
                <span className="spacer" />
                <span>Markdown supported</span>
              </footer>
            </div>
          </>
        ) : (
          <div className="empty-state big"><FileText size={40} /><h2>No note selected</h2><p>Create a note to start building your second brain.</p><button type="button" className="btn primary" onClick={createNote}><Plus size={15} /> New note</button></div>
        )}
      </main>
    </div>
  )
}
