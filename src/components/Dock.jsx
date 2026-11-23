import React, { useState } from 'react'
import { Plus, CheckSquare, FileText, Settings as SettingsIcon, LayoutDashboard, CalendarDays, Bot, Gauge, Atom, FolderOpen, Cloud } from 'lucide-react'

const DEFAULT_ICONS = {
  dashboard: LayoutDashboard,
  tasks: CheckSquare,
  calendar: CalendarDays,
  notes: FileText,
  ai: Bot,
  vram: Gauge,
  core: Atom,
  files: FolderOpen,
  cloud: Cloud,
  settings: SettingsIcon,
}

export default function Dock({ apps, windows, onOpen, onCreate }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="dock-wrap">
      {menuOpen && (
        <div className="dock-menu">
          <button type="button" onClick={() => { onCreate('task'); setMenuOpen(false) }}><CheckSquare size={15} /> New task</button>
          <button type="button" onClick={() => { onCreate('event'); setMenuOpen(false) }}><CalendarDays size={15} /> New event</button>
          <button type="button" onClick={() => { onCreate('note'); setMenuOpen(false) }}><FileText size={15} /> New note</button>
        </div>
      )}
      <nav className="dock" aria-label="Application dock">
        <button
          type="button"
          className={`dock-icon dock-add ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Quick create"
        >
          <Plus size={22} />
        </button>
        <span className="dock-sep" />
        {apps.filter((a) => a.id !== 'settings').map((app) => {
          const Icon = app.icon || DEFAULT_ICONS[app.id]
          const win = windows[app.id]
          const running = win && !win.minimized
          return (
            <button
              type="button"
              key={app.id}
              className={`dock-icon ${running ? 'running' : ''}`}
              onClick={() => { onOpen(app.id); setMenuOpen(false) }}
              aria-label={app.title}
            >
              <Icon size={22} strokeWidth={1.8} />
              <span className="dock-tooltip">{app.title}</span>
              {win && <span className={`dock-dot ${running ? 'on' : ''}`} />}
            </button>
          )
        })}
        <span className="dock-sep" />
        {apps.filter((a) => a.id === 'settings').map((app) => {
          const Icon = app.icon || SettingsIcon
          const win = windows[app.id]
          return (
            <button type="button" key={app.id} className={`dock-icon ${win && !win.minimized ? 'running' : ''}`} onClick={() => onOpen(app.id)} aria-label={app.title}>
              <Icon size={22} strokeWidth={1.8} />
              <span className="dock-tooltip">{app.title}</span>
              {win && <span className={`dock-dot ${win.minimized ? '' : 'on'}`} />}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
