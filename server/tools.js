import { uid, nowISO, config, fetchWithTimeout } from './lib.js'
import { mutateState } from './state.js'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const findItem = (list, idOrTitle) => {
  if (!idOrTitle) return null
  const q = String(idOrTitle).toLowerCase()
  return list.find((x) => x.id === q) || list.find((x) => String(x.title || x.name || '').toLowerCase().includes(q)) || null
}

async function vramOps(method, route, body) {
  const res = await fetchWithTimeout(`${config.vramops.url}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, 8000)
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text.slice(0, 500) }
}

export const TOOLS = [
  {
    name: 'get_overview',
    description: 'Get a snapshot of the user\'s day: task counts, today\'s tasks and events, projects, and recent notes.',
    input: {},
    run: async () => {
      const { getState } = await import('./state.js')
      const d = (await getState())?.data || {}
      const t = today()
      return {
        date: t,
        name: d.settings?.name || 'there',
        openTasks: (d.tasks || []).filter((x) => x.status !== 'done').length,
        dueToday: (d.tasks || []).filter((x) => x.due === t && x.status !== 'done').map((x) => x.title),
        completed: (d.tasks || []).filter((x) => x.status === 'done').length,
        eventsToday: (d.events || []).filter((x) => x.date === t).map((x) => `${x.start} ${x.title}`),
        projects: (d.projects || []).map((x) => x.name),
        notes: (d.notes || []).slice(0, 8).map((x) => x.title),
      }
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks. Filter by status (todo/doing/done), project name, or a text query.',
    input: { status: 'string?', project: 'string?', query: 'string?', limit: 'number?' },
    run: async ({ status, project, query, limit = 25 } = {}) => {
      const { getState } = await import('./state.js')
      const d = (await getState())?.data || {}
      let tasks = d.tasks || []
      if (status) tasks = tasks.filter((x) => x.status === status)
      if (project) tasks = tasks.filter((x) => (d.projects || []).find((p) => p.id === x.projectId)?.name === project)
      if (query) tasks = tasks.filter((x) => `${x.title} ${x.notes || ''}`.toLowerCase().includes(String(query).toLowerCase()))
      return tasks.slice(0, limit).map((x) => ({ id: x.id, title: x.title, status: x.status, priority: x.priority, due: x.due, notes: x.notes }))
    },
  },
  {
    name: 'create_task',
    description: 'Create a task. Use due in YYYY-MM-DD format. Priority: low, medium or high.',
    input: { title: 'string', notes: 'string?', priority: 'string?', due: 'string?', project: 'string?', status: 'string?' },
    run: async (args) => mutateState(async (d) => {
      d.tasks = d.tasks || []
      const project = args.project ? (d.projects || []).find((p) => p.name.toLowerCase() === String(args.project).toLowerCase()) : null
      const task = {
        id: uid(), title: args.title, notes: args.notes || '', projectId: project?.id || null,
        priority: ['low', 'medium', 'high'].includes(args.priority) ? args.priority : 'medium',
        status: ['todo', 'doing', 'done'].includes(args.status) ? args.status : 'todo',
        due: args.due || null, createdAt: Date.now(),
      }
      d.tasks.unshift(task)
      return { ok: true, task }
    }).then((r) => r.result),
  },
  {
    name: 'update_task',
    description: 'Update an existing task, identified by its id or part of its title. Can change title, notes, status, priority, due date or project.',
    input: { id: 'string', title: 'string?', notes: 'string?', status: 'string?', priority: 'string?', due: 'string?' },
    run: async (args) => mutateState(async (d) => {
      const task = findItem(d.tasks || [], args.id)
      if (!task) return { ok: false, error: 'Task not found' }
      for (const key of ['title', 'notes', 'status', 'priority', 'due']) {
        if (args[key] !== undefined) task[key] = args[key]
      }
      return { ok: true, task }
    }).then((r) => r.result),
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done, identified by id or part of its title.',
    input: { id: 'string' },
    run: async ({ id }) => mutateState(async (d) => {
      const task = findItem(d.tasks || [], id)
      if (!task) return { ok: false, error: 'Task not found' }
      task.status = 'done'
      return { ok: true, title: task.title }
    }).then((r) => r.result),
  },
  {
    name: 'delete_task',
    description: 'Delete a task by id or part of its title.',
    input: { id: 'string' },
    run: async ({ id }) => mutateState(async (d) => {
      const task = findItem(d.tasks || [], id)
      if (!task) return { ok: false, error: 'Task not found' }
      d.tasks = d.tasks.filter((x) => x.id !== task.id)
      return { ok: true, title: task.title }
    }).then((r) => r.result),
  },
  {
    name: 'create_project',
    description: 'Create a project to group tasks.',
    input: { name: 'string', color: 'string?' },
    run: async (args) => mutateState(async (d) => {
      d.projects = d.projects || []
      const project = { id: uid(), name: args.name, color: args.color || '#8b7cff', description: '' }
      d.projects.push(project)
      return { ok: true, project }
    }).then((r) => r.result),
  },
  {
    name: 'list_events',
    description: 'List calendar events, optionally for a specific date (YYYY-MM-DD).',
    input: { date: 'string?', limit: 'number?' },
    run: async ({ date, limit = 25 } = {}) => {
      const { getState } = await import('./state.js')
      const d = (await getState())?.data || {}
      let events = d.events || []
      if (date) events = events.filter((x) => x.date === date)
      return events.slice(0, limit).map((x) => ({ id: x.id, title: x.title, date: x.date, start: x.start, end: x.end }))
    },
  },
  {
    name: 'create_event',
    description: 'Add a calendar event. Date is YYYY-MM-DD; times are HH:MM (24h).',
    input: { title: 'string', date: 'string?', start: 'string?', end: 'string?', notes: 'string?' },
    run: async (args) => mutateState(async (d) => {
      d.events = d.events || []
      const event = {
        id: uid(), title: args.title, date: args.date || today(), start: args.start || '09:00',
        end: args.end || '10:00', color: '#8b7cff', notes: args.notes || '',
      }
      d.events.push(event)
      return { ok: true, event }
    }).then((r) => r.result),
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event by id or part of its title.',
    input: { id: 'string' },
    run: async ({ id }) => mutateState(async (d) => {
      const event = findItem(d.events || [], id)
      if (!event) return { ok: false, error: 'Event not found' }
      d.events = d.events.filter((x) => x.id !== event.id)
      return { ok: true, title: event.title }
    }).then((r) => r.result),
  },
  {
    name: 'list_notes',
    description: 'Search and list notes.',
    input: { query: 'string?', limit: 'number?' },
    run: async ({ query, limit = 15 } = {}) => {
      const { getState } = await import('./state.js')
      const d = (await getState())?.data || {}
      let notes = d.notes || []
      if (query) notes = notes.filter((x) => `${x.title} ${x.body}`.toLowerCase().includes(String(query).toLowerCase()))
      return notes.slice(0, limit).map((x) => ({ id: x.id, title: x.title, tags: x.tags, excerpt: String(x.body || '').slice(0, 180) }))
    },
  },
  {
    name: 'create_note',
    description: 'Create a note. Body supports Markdown. Tags is a list of strings.',
    input: { title: 'string', body: 'string?', tags: 'string[]?' },
    run: async (args) => mutateState(async (d) => {
      d.notes = d.notes || []
      const note = { id: uid(), title: args.title, body: args.body || '', tags: args.tags || [], pinned: false, updatedAt: Date.now() }
      d.notes.unshift(note)
      return { ok: true, note }
    }).then((r) => r.result),
  },
  {
    name: 'append_note',
    description: 'Append text to an existing note, identified by id or part of its title.',
    input: { id: 'string', text: 'string' },
    run: async ({ id, text }) => mutateState(async (d) => {
      const note = findItem(d.notes || [], id)
      if (!note) return { ok: false, error: 'Note not found' }
      note.body = `${note.body || ''}\n\n${text}`
      note.updatedAt = Date.now()
      return { ok: true, title: note.title }
    }).then((r) => r.result),
  },
  {
    name: 'set_profile_name',
    description: 'Change the user\'s display name in FordOS.',
    input: { name: 'string' },
    run: async ({ name }) => mutateState(async (d) => {
      d.settings = d.settings || {}
      d.settings.name = name
      return { ok: true, name }
    }).then((r) => r.result),
  },
  {
    name: 'get_vram_status',
    description: 'Read GPU VRAM usage and which models are resident from the VRAM OPS service.',
    input: {},
    run: async () => {
      const s = await vramOps('GET', '/api/state')
      return { gpu: s?.gpu || null, ollamaModels: (s?.ollama?.models || []).map((m) => m.name), llamaServers: s?.llamacpp?.servers || [] }
    },
  },
  {
    name: 'load_model',
    description: 'Load an Ollama model into VRAM so it responds faster. Use a full model name from the Ollama engine.',
    input: { model: 'string', keep_alive: 'string?' },
    run: async ({ model, keep_alive = '10m' }) => ({ ok: true, result: await vramOps('POST', '/api/ollama/load', { model, keep_alive }) }),
  },
  {
    name: 'unload_all_models',
    description: 'Unload all resident Ollama models from VRAM. Use carefully — it may slow the next request.',
    input: {},
    run: async () => ({ ok: true, result: await vramOps('POST', '/api/ollama/unload_all', {}) }),
  },
]

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

export async function runTool(name, args = {}) {
  const tool = TOOL_MAP[name]
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` }
  try {
    const result = await tool.run(args || {})
    return { ok: result?.ok !== false, tool: name, result }
  } catch (e) {
    return { ok: false, tool: name, error: e.message }
  }
}
