import React from 'react'
import { ArrowUpRight, CalendarDays, CheckSquare, FileText, Plus, Sparkles } from 'lucide-react'
import { useData, todayISO } from '../store.jsx'

export default function Desktop({ onOpenApp, onCreate }) {
  const { data } = useData()
  const today = todayISO()
  const { tasks, events, notes, settings } = data

  const due = tasks.filter((t) => t.due === today && t.status !== 'done').length
  const eventCount = events.filter((e) => e.date === today).length
  const dateLabel = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="desktop-layer">
      <div className="desktop-hero glass-card">
        <span className="eyebrow"><Sparkles size={13} /> {dateLabel}</span>
        <h1>Welcome back, {settings.name}.</h1>
        <p>Your space for everything that matters. Pick up where you left off.</p>
        <div className="desktop-stats">
          <button type="button" onClick={() => onOpenApp('tasks')}><CheckSquare size={16} /><strong>{due}</strong><span>tasks due</span></button>
          <button type="button" onClick={() => onOpenApp('calendar')}><CalendarDays size={16} /><strong>{eventCount}</strong><span>events today</span></button>
          <button type="button" onClick={() => onOpenApp('notes')}><FileText size={16} /><strong>{notes.length}</strong><span>notes</span></button>
        </div>
        <div className="desktop-actions">
          <button type="button" className="btn primary" onClick={() => onCreate('task')}><Plus size={15} /> New task</button>
          <button type="button" className="btn ghost" onClick={() => onOpenApp('dashboard')}>Open overview <ArrowUpRight size={14} /></button>
        </div>
      </div>
      <div className="desktop-hint glass-card">
        <span className="hint-keys"><kbd>⌘</kbd><kbd>K</kbd></span>
        <span>Jump anywhere with the command bar</span>
      </div>
    </div>
  )
}
