import React from 'react'
import { ArrowUpRight, CalendarDays, CheckCircle2, FileText, ListTodo, Plus, Sparkles, Circle } from 'lucide-react'
import { useData, todayISO, useToast } from '../store.jsx'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard({ onOpenApp, onCreate }) {
  const { data, updateTask } = useData()
  const toast = useToast()
  const today = todayISO()
  const { tasks, events, notes, projects, settings } = data

  const openTasks = tasks.filter((t) => t.status !== 'done')
  const dueToday = openTasks.filter((t) => t.due === today)
  const doneToday = tasks.filter((t) => t.status === 'done').length
  const todayEvents = events.filter((e) => e.date === today).sort((a, b) => a.start.localeCompare(b.start))
  const completion = tasks.length ? Math.round((doneToday / tasks.length) * 100) : 0

  const priorityRank = { high: 0, medium: 1, low: 2 }
  const focus = [...openTasks].sort((a, b) => {
    const ad = a.due ? (a.due <= today ? 0 : 1) : 2
    const bd = b.due ? (b.due <= today ? 0 : 1) : 2
    return ad - bd || priorityRank[a.priority] - priorityRank[b.priority]
  }).slice(0, 5)

  const complete = (task) => {
    updateTask(task.id, { status: 'done' })
    toast('Nice work — task complete', '✓')
  }

  return (
    <div className="app dashboard-app">
      <div className="dash-hero">
        <div className="dash-hero-text">
          <span className="eyebrow"><Sparkles size={13} /> Your command center</span>
          <h1>{greeting()}, {settings.name}.</h1>
          <p>Here's what's happening in your world today.</p>
          <div className="dash-hero-actions">
            <button type="button" className="btn primary" onClick={() => onCreate('task')}><Plus size={15} /> New task</button>
            <button type="button" className="btn ghost" onClick={() => onOpenApp('calendar')}>Open schedule <ArrowUpRight size={14} /></button>
          </div>
        </div>
        <div className="progress-ring" style={{ '--p': `${completion * 3.6}deg` }}>
          <div className="progress-ring-inner">
            <strong>{completion}%</strong>
            <span>complete</span>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <button type="button" className="stat-card" onClick={() => onOpenApp('tasks')}>
          <span className="stat-icon violet"><ListTodo size={18} /></span>
          <span className="stat-value">{dueToday.length}</span>
          <span className="stat-label">Due today</span>
        </button>
        <button type="button" className="stat-card" onClick={() => onOpenApp('tasks')}>
          <span className="stat-icon teal"><CheckCircle2 size={18} /></span>
          <span className="stat-value">{doneToday}</span>
          <span className="stat-label">Completed</span>
        </button>
        <button type="button" className="stat-card" onClick={() => onOpenApp('calendar')}>
          <span className="stat-icon amber"><CalendarDays size={18} /></span>
          <span className="stat-value">{todayEvents.length}</span>
          <span className="stat-label">Events today</span>
        </button>
        <button type="button" className="stat-card" onClick={() => onOpenApp('notes')}>
          <span className="stat-icon pink"><FileText size={18} /></span>
          <span className="stat-value">{notes.length}</span>
          <span className="stat-label">Notes</span>
        </button>
      </div>

      <div className="dash-columns">
        <section className="glass-card">
          <header className="card-head">
            <div><h3>Today's focus</h3><p>Your next most important things</p></div>
            <button type="button" className="link-btn" onClick={() => onOpenApp('tasks')}>All tasks <ArrowUpRight size={13} /></button>
          </header>
          <div className="focus-list">
            {focus.length === 0 && <div className="empty-mini">Nothing on the list. Enjoy the calm.</div>}
            {focus.map((task) => {
              const project = projects.find((p) => p.id === task.projectId)
              return (
                <div className="focus-row" key={task.id}>
                  <button type="button" className="check" onClick={() => complete(task)} aria-label="Complete task"><Circle size={19} /></button>
                  <div className="focus-main">
                    <span className="focus-title">{task.title}</span>
                    <span className="focus-meta">
                      {project && <span className="project-dot-label"><i style={{ background: project.color }} />{project.name}</span>}
                      {task.due && <span className={task.due < today ? 'overdue' : ''}>{task.due === today ? 'Today' : task.due}</span>}
                    </span>
                  </div>
                  <span className={`priority-chip ${task.priority}`}>{task.priority}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="glass-card">
          <header className="card-head">
            <div><h3>Up next</h3><p>Your schedule at a glance</p></div>
            <button type="button" className="link-btn" onClick={() => onOpenApp('calendar')}>Calendar <ArrowUpRight size={13} /></button>
          </header>
          <div className="timeline">
            {todayEvents.length === 0 && <div className="empty-mini">No events scheduled today.</div>}
            {todayEvents.map((event) => (
              <div className="timeline-row" key={event.id}>
                <span className="timeline-time">{event.start}</span>
                <span className="timeline-line"><i style={{ background: event.color }} /></span>
                <div className="timeline-body">
                  <strong>{event.title}</strong>
                  <span>{event.start} – {event.end}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
