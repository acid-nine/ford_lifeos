import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

/* ---------------------------------- utils --------------------------------- */

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const addDaysISO = (iso, amount) => {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date()
  d.setDate(d.getDate() + amount)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw)
    } catch {
      /* ignore corrupt storage */
    }
    return typeof initial === 'function' ? initial() : initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or unavailable */
    }
  }, [key, value])

  return [value, setValue]
}

/* -------------------------------- seed data -------------------------------- */

const t = todayISO()
const day = (n) => addDaysISO(t, n)

const seed = () => ({
  settings: {
    name: 'Matt',
    accent: '#8b7cff',
    wallpaper: 'aurora',
    reduceMotion: false,
  },
  projects: [
    { id: 'p-work', name: 'Work', color: '#8b7cff', description: 'Deep work and deliverables' },
    { id: 'p-personal', name: 'Personal', color: '#4fd1c5', description: 'Life admin and growth' },
    { id: 'p-health', name: 'Health', color: '#ff8a9b', description: 'Body and mind' },
    { id: 'p-learning', name: 'Learning', color: '#ffc66d', description: 'Courses, books, skills' },
  ],
  tasks: [
    { id: 't1', title: 'Finish Q3 roadmap draft', notes: 'Focus on the three priority bets. Share with team by Friday.', projectId: 'p-work', priority: 'high', status: 'doing', due: t, createdAt: Date.now() - 500000 },
    { id: 't2', title: 'Review pull requests', notes: '', projectId: 'p-work', priority: 'medium', status: 'todo', due: t, createdAt: Date.now() - 400000 },
    { id: 't3', title: 'Book dentist appointment', notes: '', projectId: 'p-personal', priority: 'medium', status: 'todo', due: day(2), createdAt: Date.now() - 300000 },
    { id: 't4', title: 'Morning run — 5km', notes: 'Easy pace, recover if needed.', projectId: 'p-health', priority: 'low', status: 'todo', due: t, createdAt: Date.now() - 200000 },
    { id: 't5', title: 'Read 20 pages of "Deep Work"', notes: '', projectId: 'p-learning', priority: 'low', status: 'todo', due: day(1), createdAt: Date.now() - 100000 },
    { id: 't6', title: 'Weekly planning session', notes: '', projectId: 'p-personal', priority: 'medium', status: 'done', due: day(-1), createdAt: Date.now() - 900000 },
    { id: 't7', title: 'Update portfolio site', notes: 'Add the new case study.', projectId: 'p-work', priority: 'low', status: 'todo', due: null, createdAt: Date.now() - 800000 },
  ],
  events: [
    { id: 'e1', title: 'Team standup', date: t, start: '09:30', end: '10:00', color: '#8b7cff', notes: 'Quick sync on blockers.' },
    { id: 'e2', title: 'Deep work block', date: t, start: '10:30', end: '12:30', color: '#57d9ff', notes: 'Roadmap draft — phone away.' },
    { id: 'e3', title: 'Lunch with Sam', date: t, start: '13:00', end: '14:00', color: '#ffc66d', notes: '' },
    { id: 'e4', title: 'Design review', date: t, start: '15:00', end: '16:00', color: '#ff8a9b', notes: '' },
    { id: 'e5', title: 'Gym — strength', date: day(1), start: '18:00', end: '19:15', color: '#4fd1c5', notes: '' },
    { id: 'e6', title: 'Sprint planning', date: day(3), start: '10:00', end: '11:30', color: '#8b7cff', notes: '' },
  ],
  notes: [
    {
      id: 'n1',
      title: 'My life OS — starting point',
      tags: ['system', 'ideas'],
      pinned: true,
      updatedAt: Date.now() - 1000 * 60 * 60,
      body: `# Welcome to FordOS

This is your **second brain**. Keep everything here: thoughts, plans, snippets, and half-formed ideas.

## How I want to use this

- **Tasks** — things with a next action
- **Calendar** — things that need a time and a place
- **Notes** — things I want to remember

> A system is only as good as the trust you have in it.

Try typing \`Cmd + K\` to open the command palette.`,
    },
    {
      id: 'n2',
      title: 'Weekly review checklist',
      tags: ['routine', 'productivity'],
      pinned: false,
      updatedAt: Date.now() - 1000 * 60 * 60 * 26,
      body: `# Weekly review

1. Clear the inbox
2. Review calendar for last week
3. Look at every open project
4. Pick the top 3 priorities for next week
5. Do one thing for fun`,
    },
    {
      id: 'n3',
      title: 'Ideas worth exploring',
      tags: ['ideas'],
      pinned: false,
      updatedAt: Date.now() - 1000 * 60 * 60 * 72,
      body: `# Idea parking lot

- A personal dashboard that actually feels calm
- Automations for recurring admin
- A reading list that respects my attention

*Add anything. Sort it later.*`,
    },
  ],
})

/* --------------------------------- context --------------------------------- */

const DataContext = createContext(null)

function normalizeData(input) {
  const base = seed()
  if (!input || typeof input !== 'object') return base
  const result = {
    settings: { ...base.settings, ...(input.settings || {}) },
    projects: Array.isArray(input.projects) ? input.projects : base.projects,
    tasks: Array.isArray(input.tasks) ? input.tasks : base.tasks,
    events: Array.isArray(input.events) ? input.events : base.events,
    notes: Array.isArray(input.notes) ? input.notes : base.notes,
  }
  if (result.settings.name === 'Alex') result.settings.name = 'Matt'
  return result
}

export function DataProvider({ children }) {
  const [data, setDataRaw] = useState(() => {
    try {
      const raw = localStorage.getItem('fordos.data.v1')
      return normalizeData(raw ? JSON.parse(raw) : null)
    } catch { return normalizeData(null) }
  })
  const setData = setDataRaw
  const revRef = useRef(0)
  const hydratedRef = useRef(false)
  const lastPushedRef = useRef(JSON.stringify(data))

  /* local cache */
  useEffect(() => {
    try { localStorage.setItem('fordos.data.v1', JSON.stringify(data)) } catch { /* ignore */ }
  }, [data])

  /* hydrate from the local API, then keep in sync so agents can act on the same data */
  useEffect(() => {
    let alive = true
    const adopt = (remote) => {
      if (!alive || !remote?.data) return
      lastPushedRef.current = JSON.stringify(remote.data)
      revRef.current = remote.rev || 0
      setDataRaw(normalizeData(remote.data))
    }
    fetch('/api/state').then((r) => r.json()).then((remote) => {
      if (!alive) return
      if (remote?.data) adopt(remote)
      else {
        fetch('/api/state', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, rev: 0 }),
        }).then((r) => r.json()).then((j) => {
          if (j?.state) { revRef.current = j.state.rev; lastPushedRef.current = JSON.stringify(data) }
        }).catch(() => {})
      }
      hydratedRef.current = true
    }).catch(() => { hydratedRef.current = true })

    const refresh = () => fetch('/api/state').then((r) => r.json()).then((remote) => {
      if (remote?.rev > revRef.current) adopt(remote)
    }).catch(() => {})
    const poll = setInterval(refresh, 3000)
    let source
    try {
      source = new EventSource('/api/events')
      source.addEventListener('state', refresh)
    } catch { /* no SSE support */ }
    return () => { alive = false; clearInterval(poll); source?.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) return
    const serialized = JSON.stringify(data)
    if (serialized === lastPushedRef.current) return
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/state', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, rev: revRef.current }),
        })
        const j = await res.json()
        if (res.ok && j?.state) {
          revRef.current = j.state.rev
          lastPushedRef.current = JSON.stringify(data)
        } else if (res.status === 409 && j?.state) {
          lastPushedRef.current = JSON.stringify(j.state.data)
          revRef.current = j.state.rev
          setDataRaw(normalizeData(j.state.data))
        }
      } catch { /* offline — local cache still works */ }
    }, 450)
    return () => clearTimeout(timer)
  }, [data])

  const add = useCallback((section, item) => {
    const id = uid()
    setData((d) => ({ ...d, [section]: [{ ...item, id, createdAt: Date.now() }, ...d[section]] }))
    return id
  }, [setData])

  const patch = useCallback((section, id, changes) => {
    setData((d) => ({ ...d, [section]: d[section].map((item) => (item.id === id ? { ...item, ...changes } : item)) }))
  }, [setData])

  const remove = useCallback((section, id) => {
    setData((d) => ({ ...d, [section]: d[section].filter((item) => item.id !== id) }))
  }, [setData])

  const value = useMemo(() => ({
    data,
    setData,
    addTask: (task) => add('tasks', { status: 'todo', priority: 'medium', due: null, notes: '', ...task }),
    updateTask: (id, changes) => patch('tasks', id, changes),
    deleteTask: (id) => remove('tasks', id),
    addProject: (project) => add('projects', { color: '#8b7cff', description: '', ...project }),
    updateProject: (id, changes) => patch('projects', id, changes),
    deleteProject: (id) => {
      setData((d) => ({
        ...d,
        projects: d.projects.filter((p) => p.id !== id),
        tasks: d.tasks.map((task) => (task.projectId === id ? { ...task, projectId: null } : task)),
      }))
    },
    addEvent: (event) => add('events', { color: '#8b7cff', notes: '', ...event }),
    updateEvent: (id, changes) => patch('events', id, changes),
    deleteEvent: (id) => remove('events', id),
    addNote: (note) => add('notes', { title: 'Untitled note', body: '', tags: [], pinned: false, updatedAt: Date.now(), ...note }),
    updateNote: (id, changes) => patch('notes', id, { ...changes, updatedAt: Date.now() }),
    deleteNote: (id) => remove('notes', id),
    setSetting: (key, val) => setData((d) => ({ ...d, settings: { ...d.settings, [key]: val } })),
    resetData: () => setData(seed()),
    importData: (incoming) => {
      if (!incoming || typeof incoming !== 'object') return false
      setData({
        settings: { ...seed().settings, ...(incoming.settings || {}) },
        projects: Array.isArray(incoming.projects) ? incoming.projects : [],
        tasks: Array.isArray(incoming.tasks) ? incoming.tasks : [],
        events: Array.isArray(incoming.events) ? incoming.events : [],
        notes: Array.isArray(incoming.notes) ? incoming.notes : [],
      })
      return true
    },
  }), [data, setData, add, patch, remove])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

/* ---------------------------------- toasts --------------------------------- */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, icon) => {
    const id = uid()
    setToasts((list) => [...list, { id, message, icon }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2800)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.icon ? <span className="toast-icon">{t.icon}</span> : <span className="toast-dot" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
