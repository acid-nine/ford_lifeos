import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus, Search, LayoutList, Columns3, Trash2, CalendarDays, Flag,
  CheckSquare, Circle, CheckCircle2, Inbox, Sun, CalendarClock, Archive,
  MoreHorizontal, X,
} from 'lucide-react'
import Modal, { Field } from '../components/Modal.jsx'
import { useData, useToast, todayISO, addDaysISO } from '../store.jsx'

const PRIORITIES = ['low', 'medium', 'high']
const STATUSES = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
]

const emptyTask = (due = null) => ({ title: '', notes: '', projectId: null, priority: 'medium', status: 'todo', due })

function TaskModal({ task, projects, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => task ? { ...task } : emptyTask())
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isValid = form.title.trim().length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!isValid) return
    onSave({ ...form, title: form.title.trim() })
  }

  return (
    <Modal title={task ? 'Edit task' : 'New task'} subtitle={task ? 'Update the details below' : 'Capture something you need to do'} onClose={onClose}
      footer={<>
        {task && <button type="button" className="btn danger ghost" onClick={onDelete}><Trash2 size={15} /> Delete</button>}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary" form="task-form" disabled={!isValid}>{task ? 'Save changes' : 'Add task'}</button>
      </>}>
      <form id="task-form" onSubmit={submit} className="form-stack">
        <Field label="Title">
          <input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="What needs doing?" />
        </Field>
        <Field label="Notes">
          <textarea rows={3} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Add context, links, or a next action…" />
        </Field>
        <div className="form-row">
          <Field label="Project">
            <select value={form.projectId || ''} onChange={(e) => set('projectId', e.target.value || null)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Status">
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" value={form.due || ''} onChange={(e) => set('due', e.target.value || null)} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}

export default function Tasks({ initialFilter = 'all' }) {
  const { data, addTask, updateTask, deleteTask, addProject, deleteProject } = useData()
  const toast = useToast()
  const [filter, setFilter] = useState(initialFilter)
  const [view, setView] = useState('list')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // task object or { isNew: true, due }
  const [newProject, setNewProject] = useState('')
  const today = todayISO()

  useEffect(() => {
    const handler = (e) => {
      if (e.detail !== 'task') return
      e.preventDefault()
      setEditing({ isNew: true, due: filter === 'today' ? today : filter === 'upcoming' ? addDaysISO(today, 1) : null })
    }
    window.addEventListener('fordos:create', handler)
    return () => window.removeEventListener('fordos:create', handler)
  }, [filter, today])

  const { tasks, projects } = data
  const counts = useMemo(() => ({
    all: tasks.filter((t) => t.status !== 'done').length,
    today: tasks.filter((t) => t.due === today && t.status !== 'done').length,
    upcoming: tasks.filter((t) => t.due && t.due > today && t.status !== 'done').length,
    completed: tasks.filter((t) => t.status === 'done').length,
  }), [tasks, today])

  const filtered = useMemo(() => {
    let list = tasks
    if (filter === 'today') list = list.filter((t) => t.due === today)
    else if (filter === 'upcoming') list = list.filter((t) => t.due && t.due > today)
    else if (filter === 'completed') list = list.filter((t) => t.status === 'done')
    else if (filter === 'all') list = list.filter((t) => t.status !== 'done')
    else list = list.filter((t) => t.projectId === filter)

    const q = search.trim().toLowerCase()
    if (q) list = list.filter((t) => `${t.title} ${t.notes || ''}`.toLowerCase().includes(q))

    const rank = { high: 0, medium: 1, low: 2 }
    return [...list].sort((a, b) => {
      if ((a.due || '9999') !== (b.due || '9999')) return (a.due || '9999').localeCompare(b.due || '9999')
      return rank[a.priority] - rank[b.priority]
    })
  }, [tasks, filter, search, today])

  const open = filtered.filter((t) => t.status !== 'done')
  const done = filtered.filter((t) => t.status === 'done')
  const activeProject = projects.find((p) => p.id === filter)
  const filterLabel = activeProject?.name || ({ all: 'All tasks', today: 'Today', upcoming: 'Upcoming', completed: 'Completed' }[filter] || 'Tasks')

  const toggle = (task) => updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })

  const saveTask = (form) => {
    if (editing?.id) { updateTask(editing.id, form); toast('Task updated', '✎') }
    else { addTask(form); toast('Task added', '✓') }
    setEditing(null)
  }

  const addProjectHandler = (e) => {
    e.preventDefault()
    if (!newProject.trim()) return
    addProject({ name: newProject.trim(), color: ['#8b7cff', '#4fd1c5', '#ff8a9b', '#ffc66d', '#57d9ff'][projects.length % 5] })
    setNewProject('')
    toast('Project created', '✦')
  }

  return (
    <div className="app tasks-app">
      <aside className="app-sidebar">
        <div className="sidebar-label">Smart lists</div>
        {[
          { id: 'all', label: 'All tasks', icon: Inbox, count: counts.all },
          { id: 'today', label: 'Today', icon: Sun, count: counts.today },
          { id: 'upcoming', label: 'Upcoming', icon: CalendarClock, count: counts.upcoming },
          { id: 'completed', label: 'Completed', icon: Archive, count: counts.completed },
        ].map((item) => {
          const Icon = item.icon
          return (
            <button type="button" key={item.id} className={`side-item ${filter === item.id ? 'active' : ''}`} onClick={() => setFilter(item.id)}>
              <Icon size={16} /><span>{item.label}</span><em>{item.count}</em>
            </button>
          )
        })}
        <div className="sidebar-label with-gap">Projects</div>
        {projects.map((p) => (
          <div className={`side-item project-item ${filter === p.id ? 'active' : ''}`} key={p.id}>
            <button type="button" onClick={() => setFilter(p.id)}>
              <i className="project-dot" style={{ background: p.color }} /><span>{p.name}</span>
              <em>{tasks.filter((t) => t.projectId === p.id && t.status !== 'done').length}</em>
            </button>
            <button type="button" className="side-delete" onClick={() => { deleteProject(p.id); if (filter === p.id) setFilter('all') }} aria-label={`Delete ${p.name}`}><X size={13} /></button>
          </div>
        ))}
        <form className="add-project" onSubmit={addProjectHandler}>
          <Plus size={15} />
          <input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="New project" />
        </form>
      </aside>

      <main className="app-main">
        <header className="app-toolbar">
          <div>
            <h1>{filterLabel}</h1>
            <p>{open.length} open · {done.length} done</p>
          </div>
          <div className="toolbar-actions">
            <div className="search-box"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" /></div>
            <div className="view-toggle">
              <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><LayoutList size={16} /></button>
              <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => setView('board')} aria-label="Board view"><Columns3 size={16} /></button>
            </div>
            <button type="button" className="btn primary" onClick={() => setEditing({ isNew: true, due: (filter === 'today' ? today : filter === 'upcoming' ? addDaysISO(today, 1) : null) })}><Plus size={15} /> New task</button>
          </div>
        </header>

        <div className="app-scroll">
          {view === 'list' ? (
            <div className="task-list">
              {open.length === 0 && done.length === 0 && <div className="empty-state"><CheckSquare size={30} /><h3>Nothing here yet</h3><p>Add a task to get moving.</p></div>}
              {open.map((task) => <TaskRow key={task.id} task={task} projects={projects} today={today} onToggle={() => toggle(task)} onEdit={() => setEditing(task)} />)}
              {done.length > 0 && <div className="list-section-label">Completed ({done.length})</div>}
              {done.map((task) => <TaskRow key={task.id} task={task} projects={projects} today={today} onToggle={() => toggle(task)} onEdit={() => setEditing(task)} />)}
            </div>
          ) : (
            <div className="board">
              {STATUSES.map((status) => {
                const columnTasks = filtered.filter((t) => t.status === status.id)
                return (
                  <div className="board-col" key={status.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const id = e.dataTransfer.getData('text/plain')
                      if (id) { updateTask(id, { status: status.id }); toast(`Moved to ${status.label}`, '↔') }
                    }}>
                    <div className="board-col-head"><span className={`status-dot ${status.id}`} />{status.label}<em>{columnTasks.length}</em></div>
                    <div className="board-col-body">
                      {columnTasks.map((task) => {
                        const project = projects.find((p) => p.id === task.projectId)
                        return (
                          <div key={task.id} className="board-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)} onClick={() => setEditing(task)}>
                            <div className="board-card-top">
                              <button type="button" className="check" onClick={(e) => { e.stopPropagation(); toggle(task) }} aria-label="Toggle complete">
                                {task.status === 'done' ? <CheckCircle2 size={18} className="checked" /> : <Circle size={18} />}
                              </button>
                              <span className={`priority-chip ${task.priority}`}>{task.priority}</span>
                            </div>
                            <strong>{task.title}</strong>
                            {task.notes && <p className="board-card-notes">{task.notes}</p>}
                            <div className="board-card-foot">
                              {project && <span className="project-dot-label"><i style={{ background: project.color }} />{project.name}</span>}
                              {task.due && <span className="due-pill"><CalendarDays size={12} />{task.due === today ? 'Today' : task.due}</span>}
                            </div>
                          </div>
                        )
                      })}
                      {columnTasks.length === 0 && <div className="board-empty">Drop tasks here</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {editing && (
        <TaskModal
          task={editing.id ? editing : null}
          projects={projects}
          onClose={() => setEditing(null)}
          onSave={saveTask}
          onDelete={() => { deleteTask(editing.id); setEditing(null); toast('Task deleted', '✕') }}
        />
      )}
    </div>
  )
}

function TaskRow({ task, projects, today, onToggle, onEdit }) {
  const project = projects.find((p) => p.id === task.projectId)
  const overdue = task.due && task.due < today && task.status !== 'done'
  return (
    <div className={`task-row ${task.status === 'done' ? 'is-done' : ''}`}>
      <button type="button" className="check" onClick={onToggle} aria-label="Toggle complete">
        {task.status === 'done' ? <CheckCircle2 size={19} className="checked" /> : <Circle size={19} />}
      </button>
      <button type="button" className="task-row-main" onClick={onEdit}>
        <span className="task-title">{task.title}</span>
        {task.notes && <span className="task-notes">{task.notes}</span>}
      </button>
      <div className="task-row-meta">
        {project && <span className="project-dot-label"><i style={{ background: project.color }} />{project.name}</span>}
        <span className={`priority-chip ${task.priority}`}><Flag size={11} />{task.priority}</span>
        {task.due && <span className={`due-pill ${overdue ? 'overdue' : ''}`}><CalendarDays size={12} />{task.due === today ? 'Today' : task.due}</span>}
        <button type="button" className="icon-btn small" onClick={onEdit} aria-label="Edit task"><MoreHorizontal size={16} /></button>
      </div>
    </div>
  )
}
