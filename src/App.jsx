import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePersistentState, useData } from './store.jsx'
import { APPS, APP_MAP } from './apps/registry.js'
import TopBar from './components/TopBar.jsx'
import Dock from './components/Dock.jsx'
import Window from './components/Window.jsx'
import Desktop from './components/Desktop.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { LayoutDashboard, CheckSquare, CalendarDays, FileText, Settings as SettingsIcon, Plus, Sun, RotateCcw, Bot, Gauge, Atom } from 'lucide-react'

const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

export default function App() {
  const { data } = useData()
  const { settings, notes } = data
  const [windows, setWindows] = usePersistentState('fordos.windows.v1', {})
  const [paletteOpen, setPaletteOpen] = useState(false)
  const zRef = useRef(Math.max(10, ...Object.values(windows).map((w) => w.z || 0)))
  const booted = useRef(false)

  /* theme */
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent', settings.accent || '#8b7cff')
    root.classList.toggle('reduce-motion', !!settings.reduceMotion)
    document.body.dataset.wallpaper = settings.wallpaper || 'aurora'
  }, [settings.accent, settings.reduceMotion, settings.wallpaper])

  /* open Overview on first boot */
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (Object.keys(windows).length === 0) openApp('dashboard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openApp = useCallback((id) => {
    setWindows((w) => {
      const app = APP_MAP[id]
      if (!app) return w
      const maxZ = Math.max(0, ...Object.values(w).map((x) => x.z || 0))
      const z = Math.max(zRef.current, maxZ) + 1
      zRef.current = z
      if (w[id]) {
        if (w[id].z === maxZ && !w[id].minimized) return { ...w, [id]: { ...w[id], minimized: true } }
        return { ...w, [id]: { ...w[id], minimized: false, z } }
      }
      const count = Object.keys(w).length
      const width = Math.min(app.w, window.innerWidth - 32)
      const height = Math.min(app.h, window.innerHeight - 150)
      const x = clamp(Math.round((window.innerWidth - width) / 2) + (count % 3) * 26 - 26, 12, Math.max(12, window.innerWidth - width - 12))
      const y = clamp(Math.round((window.innerHeight - height) / 2) - 16 + (count % 3) * 18, 58, Math.max(58, window.innerHeight - height - 90))
      return { ...w, [id]: { x, y, w: width, h: height, z, minimized: false, maximized: false } }
    })
  }, [setWindows])

  const closeApp = useCallback((id) => setWindows((w) => {
    const next = { ...w }
    delete next[id]
    return next
  }), [setWindows])

  const minimizeApp = useCallback((id) => setWindows((w) => w[id] ? { ...w, [id]: { ...w[id], minimized: true } } : w), [setWindows])

  const updateWindow = useCallback((id, patch) => setWindows((w) => w[id] ? { ...w, [id]: { ...w[id], ...patch } } : w), [setWindows])

  const focusWindow = useCallback((id) => setWindows((w) => {
    const cur = w[id]
    if (!cur) return w
    const maxZ = Math.max(0, ...Object.values(w).map((x) => x.z || 0))
    if (cur.z === maxZ && !cur.minimized) return w
    const z = Math.max(zRef.current, maxZ) + 1
    zRef.current = z
    return { ...w, [id]: { ...cur, z, minimized: false } }
  }), [setWindows])

  const emit = useCallback((name, detail) => {
    let attempt = 0
    const send = () => {
      const handled = !window.dispatchEvent(new CustomEvent(name, { detail }))
      if (!handled && attempt++ < 6) setTimeout(send, 120)
    }
    setTimeout(send, 50)
  }, [])

  const create = useCallback((kind) => {
    const target = { task: 'tasks', event: 'calendar', note: 'notes' }[kind]
    if (target) openApp(target)
    emit('fordos:create', kind)
  }, [openApp, emit])

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commands = useMemo(() => [
    { id: 'app-dashboard', group: 'Apps', label: 'Open Overview', icon: LayoutDashboard, run: () => openApp('dashboard') },
    { id: 'app-tasks', group: 'Apps', label: 'Open Tasks & Projects', icon: CheckSquare, run: () => openApp('tasks') },
    { id: 'app-calendar', group: 'Apps', label: 'Open Calendar', icon: CalendarDays, run: () => openApp('calendar') },
    { id: 'app-notes', group: 'Apps', label: 'Open Notes & Knowledge', icon: FileText, run: () => openApp('notes') },
    { id: 'app-ai', group: 'Apps', label: 'Open AI Studio', icon: Bot, run: () => openApp('ai') },
    { id: 'app-vram', group: 'Apps', label: 'Open VRAM Control', icon: Gauge, run: () => openApp('vram') },
    { id: 'app-core', group: 'Apps', label: 'Open Agent Core', icon: Atom, run: () => openApp('core') },
    { id: 'app-settings', group: 'Apps', label: 'Open Settings', icon: SettingsIcon, run: () => openApp('settings') },
    { id: 'new-task', group: 'Quick actions', label: 'Create a new task', icon: Plus, run: () => create('task') },
    { id: 'new-event', group: 'Quick actions', label: 'Create a new event', icon: CalendarDays, run: () => create('event') },
    { id: 'new-note', group: 'Quick actions', label: 'Create a new note', icon: FileText, run: () => create('note') },
    { id: 'today', group: 'Quick actions', label: 'Jump to today on calendar', icon: Sun, run: () => { openApp('calendar'); emit('fordos:today') } },
    { id: 'reset-windows', group: 'System', label: 'Close all windows', icon: RotateCcw, run: () => setWindows({}) },
    ...notes.slice(0, 12).map((n) => ({
      id: `note-${n.id}`, group: 'Notes', label: n.title || 'Untitled note', icon: FileText, hint: 'open',
      run: () => { openApp('notes'); emit('fordos:open-note', n.id) },
    })),
  ], [notes, openApp, create, emit, setWindows])

  return (
    <div className={`os-shell ${Object.keys(windows).length ? 'has-windows' : ''}`}>
      <div className="wallpaper" aria-hidden="true" />
      <div className="wallpaper-glow" aria-hidden="true" />

      <Desktop onOpenApp={openApp} onCreate={create} />

      {Object.entries(windows).map(([id, win]) => {
        const app = APP_MAP[id]
        if (!app) return null
        const Component = app.component
        return (
          <Window
            key={id}
            app={app}
            win={win}
            onUpdate={(patch) => updateWindow(id, patch)}
            onFocus={() => focusWindow(id)}
            onClose={() => closeApp(id)}
            onMinimize={() => minimizeApp(id)}
          >
            <ErrorBoundary name={app.title}>
              <Component onOpenApp={openApp} onCreate={create} />
            </ErrorBoundary>
          </Window>
        )
      })}

      <TopBar name={settings.name} onOpenApp={openApp} onCommand={() => setPaletteOpen(true)} />
      <Dock apps={APPS} windows={windows} onOpen={openApp} onCreate={create} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  )
}
