import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, MessageSquare, Cpu, Activity, RefreshCw, Send, Plus, Trash2, Play,
  Pencil, Power, PowerOff, Database, Code2, Sparkles, Layers, Check,
  ChevronDown, Clock, Zap, Wrench, AlertCircle, CircleCheck, CircleX, Terminal,
} from 'lucide-react'
import { AGENT_SHAPES, SHAPE_ICONS, AGENT_COLORS, defaultVisual } from '../lib/visuals.js'

export { AGENT_SHAPES, SHAPE_ICONS, AGENT_COLORS, defaultVisual }
import Modal, { Field } from '../components/Modal.jsx'

const api = async (path, options) => {
  const res = await fetch(`/api${path}`, options)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const ENGINE_ICONS = { ollama: Database, llamacpp: Cpu, hermes: Sparkles, opencode: Code2, strata: Layers }
const TRIGGER_LABELS = { manual: 'Manual', interval: 'Interval', cron: 'Schedule' }

const blankAgent = () => ({
  name: '', description: '', systemPrompt: 'You are a helpful assistant inside FordOS. Be concise and take action when needed.',
  prompt: '', engineId: 'ollama', model: 'qwen2.5-coder:1.5b', tools: [],
  trigger: { type: 'manual', minutes: 60, expr: '0 8 * * *' }, enabled: true, maxSteps: 4,
  visual: defaultVisual(''),
})

/* ------------------------------- chat helpers ------------------------------ */
async function streamChat({ engineId, model, system, messages }, onDelta) {
  const res = await fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engineId, model, system, messages }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Chat failed (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      let evt
      try { evt = JSON.parse(line.slice(5).trim()) } catch { continue }
      if (evt.error) throw new Error(evt.error)
      if (evt.text) { text += evt.text; onDelta(text) }
    }
  }
  return text
}

/* -------------------------------- main app -------------------------------- */
export default function AIStudio({ onOpenApp }) {
  const [tab, setTab] = useState('chat')
  const [engines, setEngines] = useState([])
  const [integrations, setIntegrations] = useState({})
  const [agents, setAgents] = useState([])
  const [runs, setRuns] = useState([])
  const [tools, setTools] = useState([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const loadEngines = useCallback(async (force = false) => {
    try {
      const data = await api(`/engines${force ? '?refresh=1' : ''}`)
      setEngines(data.engines || [])
      setIntegrations(data.integrations || {})
    } catch (e) { setNotice(`Engine discovery failed: ${e.message}`) }
  }, [])
  const loadAgents = useCallback(async () => { try { setAgents(await api('/agents')) } catch {} }, [])
  const loadRuns = useCallback(async () => { try { setRuns(await api('/runs')) } catch {} }, [])

  useEffect(() => {
    loadEngines()
    loadAgents()
    loadRuns()
    api('/tools').then(setTools).catch(() => {})
    const source = new EventSource('/api/events')
    source.addEventListener('run', () => { loadRuns(); loadAgents() })
    return () => source.close()
  }, [loadEngines, loadAgents, loadRuns])

  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'engines', label: 'Engines', icon: Cpu },
    { id: 'runs', label: 'Runs', icon: Activity },
  ]

  return (
    <div className="app ai-app">
      <aside className="app-sidebar ai-sidebar">
        <div className="ai-brand"><span className="ai-brand-icon"><Bot size={18} /></span><div><strong>AI Studio</strong><em>Engines & agents</em></div></div>
        <div className="sidebar-label with-gap">Workspace</div>
        {tabs.map((t) => {
          const Icon = t.icon
          return <button type="button" key={t.id} className={`side-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><Icon size={16} /><span>{t.label}</span></button>
        })}
        <div className="ai-side-foot">
          <span className={`ai-status-dot ${engines.some((e) => e.status === 'online') ? 'on' : ''}`} />
          <span>{engines.filter((e) => e.status === 'online').length} engine(s) online</span>
        </div>
      </aside>
      <main className="app-main ai-main">
        {notice && <div className="ai-notice"><AlertCircle size={14} /> {notice} <button type="button" onClick={() => setNotice('')}>×</button></div>}
        {tab === 'chat' && <ChatTab engines={engines} loadEngines={loadEngines} busy={busy} setBusy={setBusy} />}
        {tab === 'agents' && <AgentsTab agents={agents} engines={engines} tools={tools} loadAgents={loadAgents} loadRuns={loadRuns} setNotice={setNotice} />}
        {tab === 'engines' && <EnginesTab engines={engines} integrations={integrations} loadEngines={loadEngines} busy={busy} setBusy={setBusy} onOpenApp={onOpenApp} onUse={(engineId, model) => setTab('chat')} />}
        {tab === 'runs' && <RunsTab runs={runs} loadRuns={loadRuns} />}
      </main>
    </div>
  )
}

/* --------------------------------- chat ----------------------------------- */
function ChatTab({ engines, loadEngines, busy, setBusy }) {
  const [engineId, setEngineId] = useState('ollama')
  const [model, setModel] = useState('')
  const [system, setSystem] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (model || !engines.length) return
    const preferred = engines.find((e) => e.id === 'ollama') || engines[0]
    setEngineId(preferred.id)
    setModel(preferred.models?.[0]?.id || '')
  }, [engines, model])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const engine = engines.find((e) => e.id === engineId)
  const models = engine?.models || []

  const send = async () => {
    const text = input.trim()
    if (!text || !model || streaming) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)
    setBusy(true)
    try {
      await streamChat({ engineId, model, system, messages: next }, (acc) => {
        setMessages([...next, { role: 'assistant', content: acc }])
      })
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `**Error:** ${e.message}` }])
    } finally { setStreaming(false); setBusy(false) }
  }

  return (
    <div className="ai-chat">
      <header className="ai-page-head">
        <div><h1>Chat</h1><p>Talk to any local engine. Responses stream as they're generated.</p></div>
        <button type="button" className="btn ghost" onClick={() => setMessages([])}>Clear chat</button>
      </header>
      <div className="chat-controls">
        <select value={engineId} onChange={(e) => { setEngineId(e.target.value); setModel('') }} aria-label="Engine">
          {engines.map((en) => <option key={en.id} value={en.id}>{en.name} ({en.status})</option>)}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
          {!models.length && <option value="">No models</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.label || m.name}</option>)}
        </select>
        <button type="button" className="icon-btn" onClick={() => loadEngines(true)} title="Refresh models"><RefreshCw size={15} /></button>
      </div>
      <div className="chat-scroll">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <span className="chat-welcome-icon"><Sparkles size={26} /></span>
            <h2>What are we working on?</h2>
            <p>Pick an engine and model above, then start a conversation.</p>
            <div className="chat-suggestions">
              {['Plan my day for me', 'Summarize my open tasks', 'Where is the time going this week?'].map((s) => (
                <button type="button" key={s} onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <span className="chat-avatar">{m.role === 'assistant' ? <Bot size={15} /> : 'M'}</span>
            <div className="chat-bubble">{m.content || (streaming ? <span className="typing"><i /><i /><i /></span> : '')}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-composer">
        <details className="chat-system">
          <summary><Terminal size={13} /> System prompt</summary>
          <textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={3} placeholder="Optional instructions for this conversation…" />
        </details>
        <div className="chat-input-row">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} rows={2} placeholder="Message the model… (Enter to send, Shift+Enter for newline)" />
          <button type="button" className="btn primary" onClick={send} disabled={!model || streaming || busy}><Send size={15} /> Send</button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------- agents ---------------------------------- */
function AgentsTab({ agents, engines, tools, loadAgents, loadRuns, setNotice }) {
  const [editing, setEditing] = useState(null)
  const [runningId, setRunningId] = useState(null)

  const run = async (agent) => {
    setRunningId(agent.id)
    try {
      const result = await post(`/agents/${agent.id}/run`, {})
      setNotice(result.status === 'error' ? `Run failed: ${result.error}` : `${agent.name} finished · ${result.status}`)
      await Promise.all([loadAgents(), loadRuns()])
    } catch (e) { setNotice(`Run failed: ${e.message}`) } finally { setRunningId(null) }
  }

  const toggle = async (agent) => {
    await post('/agents', { ...agent, enabled: !agent.enabled })
    await loadAgents()
  }

  const remove = async (agent) => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    await api(`/agents/${agent.id}`, { method: 'DELETE' })
    await loadAgents()
  }

  return (
    <div className="ai-page">
      <header className="ai-page-head">
        <div><h1>Agents</h1><p>Autonomous processes that can read and change your FordOS data.</p></div>
        <button type="button" className="btn primary" onClick={() => setEditing(blankAgent())}><Plus size={15} /> New agent</button>
      </header>
      <div className="agent-grid">
        {agents.length === 0 && <div className="empty-state"><Bot size={34} /><h3>No agents yet</h3><p>Create one to automate part of your day.</p></div>}
        {agents.map((agent) => {
          const engine = engines.find((e) => e.id === agent.engineId)
          const visual = { ...defaultVisual(agent.name), ...(agent.visual || {}) }
          const Icon = SHAPE_ICONS[visual.shape] || Bot
          return (
            <div className={`agent-card ${agent.enabled ? '' : 'disabled'}`} key={agent.id}>
              <div className="agent-card-head">
                <span className="agent-icon" style={{ color: `hsl(${visual.hue} 90% 65%)`, background: `hsla(${visual.hue} 90% 60% / .14)` }}><Icon size={18} /></span>
                <div><h3>{agent.name}</h3><p>{agent.description || 'No description'}</p></div>
                <button type="button" className={`switch small ${agent.enabled ? 'on' : ''}`} onClick={() => toggle(agent)} aria-label="Toggle agent" />
              </div>
              <div className="agent-meta">
                <span><Cpu size={12} /> {engine?.name || agent.engineId}</span>
                <span><Zap size={12} /> {agent.model || 'default'}</span>
                <span><Clock size={12} /> {TRIGGER_LABELS[agent.trigger?.type] || 'Manual'}</span>
              </div>
              <div className="agent-tags">
                {agent.tools?.length ? agent.tools.slice(0, 3).map((t) => <em key={t}>{t}</em>) : <em>no tools</em>}
                {agent.tools?.length > 3 && <em>+{agent.tools.length - 3}</em>}
              </div>
              <div className="agent-foot">
                <span>{agent.runCount || 0} runs{agent.lastRun ? ` · ${new Date(agent.lastRun).toLocaleDateString()}` : ''}</span>
                <div>
                  <button type="button" className="icon-btn" onClick={() => setEditing({ ...agent })} aria-label="Edit agent"><Pencil size={15} /></button>
                  <button type="button" className="icon-btn danger" onClick={() => remove(agent)} aria-label="Delete agent"><Trash2 size={15} /></button>
                  <button type="button" className="btn primary small" onClick={() => run(agent)} disabled={runningId === agent.id}><Play size={13} /> {runningId === agent.id ? 'Running…' : 'Run'}</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {editing && <AgentEditor agent={editing} engines={engines} tools={tools} onClose={() => setEditing(null)} onSave={async (a) => { await post('/agents', a); await loadAgents(); setEditing(null) }} />}
    </div>
  )
}

function AgentEditor({ agent, engines, tools, onClose, onSave }) {
  const [form, setForm] = useState({ ...agent, visual: { ...defaultVisual(agent.name), ...(agent.visual || {}) }, trigger: { ...agent.trigger } })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const engine = engines.find((e) => e.id === form.engineId)
  const delegate = ['hermes', 'opencode'].includes(form.engineId)

  const toggleTool = (name) => set('tools', form.tools.includes(name) ? form.tools.filter((t) => t !== name) : [...form.tools, name])

  return (
    <Modal title={agent.id ? 'Edit agent' : 'New agent'} subtitle="Give it instructions, a model, and things it can do" onClose={onClose} wide
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => onSave(form)} disabled={!form.name.trim()}>Save agent</button></>}>
      <div className="form-stack">
        <div className="form-row">
          <Field label="Name"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Morning planner" /></Field>
          <Field label="Description"><input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What does this agent do?" /></Field>
        </div>
        <Field label="Visual model" hint="How this agent appears in Agent Core">
          <div className="visual-picker">
            <div className="visual-shapes">
              {AGENT_SHAPES.map((shape) => {
                const Icon = SHAPE_ICONS[shape]
                return <button type="button" key={shape} title={shape} className={`visual-shape ${form.visual.shape === shape ? 'active' : ''}`} onClick={() => set('visual', { ...form.visual, shape })}><Icon size={15} /></button>
              })}
            </div>
            <div className="visual-colors">
              {AGENT_COLORS.map((hue) => <button type="button" key={hue} className={`visual-color ${form.visual.hue === hue ? 'active' : ''}`} style={{ background: `hsl(${hue} 90% 60%)` }} onClick={() => set('visual', { ...form.visual, hue })} aria-label={`Hue ${hue}`} />)}
            </div>
            <label className="visual-speed">Speed <input type="range" min="0.4" max="2" step="0.1" value={form.visual.speed || 1} onChange={(e) => set('visual', { ...form.visual, speed: Number(e.target.value) })} /></label>
          </div>
        </Field>
        <Field label="Instructions"><textarea rows={4} value={form.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} /></Field>
        <Field label="Prompt (used for scheduled runs)" hint="Leave blank to use the instructions above"><textarea rows={2} value={form.prompt} onChange={(e) => set('prompt', e.target.value)} placeholder="Review my day and prepare a plan…" /></Field>
        <div className="form-row">
          <Field label="Engine">
            <select value={form.engineId} onChange={(e) => { set('engineId', e.target.value); set('model', '') }}>
              {engines.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <select value={form.model} onChange={(e) => set('model', e.target.value)}>
              <option value="">Default</option>
              {(engine?.models || []).map((m) => <option key={m.id} value={m.id}>{m.label || m.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Trigger">
          <div className="trigger-row">
            <select value={form.trigger.type} onChange={(e) => set('trigger', { ...form.trigger, type: e.target.value })}>
              <option value="manual">Manual only</option>
              <option value="interval">Every N minutes</option>
              <option value="cron">Cron schedule</option>
            </select>
            {form.trigger.type === 'interval' && <input type="number" min="1" value={form.trigger.minutes || 60} onChange={(e) => set('trigger', { ...form.trigger, minutes: Number(e.target.value) })} />}
            {form.trigger.type === 'cron' && <input value={form.trigger.expr || ''} onChange={(e) => set('trigger', { ...form.trigger, expr: e.target.value })} placeholder="0 8 * * *" />}
          </div>
        </Field>
        {!delegate && (
          <Field label={`Tools (${form.tools.length} selected)`} hint="The agent can call these to change your data">
            <div className="tool-grid">
              {tools.map((t) => (
                <button type="button" key={t.name} className={`tool-chip ${form.tools.includes(t.name) ? 'active' : ''}`} onClick={() => toggleTool(t.name)} title={t.description}>
                  {form.tools.includes(t.name) && <Check size={11} />} {t.name}
                </button>
              ))}
            </div>
          </Field>
        )}
        {delegate && <div className="ai-hint"><Terminal size={14} /> Delegated runs use {form.engineId === 'hermes' ? 'Hermes' : 'OpenCode'}'s own tools; FordOS tools are not available here.</div>}
        <Field label="Max tool steps"><input type="number" min="1" max="8" value={form.maxSteps} onChange={(e) => set('maxSteps', Number(e.target.value))} /></Field>
        <label className="switch-row"><span><strong>Enabled</strong><em>Allow scheduled runs</em></span><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /><span className="switch" /></label>
      </div>
    </Modal>
  )
}

/* -------------------------------- engines --------------------------------- */
function EnginesTab({ engines, integrations, loadEngines, busy, setBusy, onUse, onOpenApp }) {
  const [expanded, setExpanded] = useState(null)
  const gpu = integrations?.vramOps?.gpu

  return (
    <div className="ai-page">
      <header className="ai-page-head">
        <div><h1>Engines</h1><p>Auto-discovered from your installed tools and local endpoints.</p></div>
        <button type="button" className="btn ghost" onClick={async () => { setBusy(true); await loadEngines(true); setBusy(false) }} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh</button>
      </header>

      {gpu && (
        <div className="integration-card">
          <span className="integration-icon"><Cpu size={18} /></span>
          <div><strong>VRAM OPS · {gpu.name}</strong><p>{Math.round(gpu.used_mib / 1024)} GB / {Math.round(gpu.total_mib / 1024)} GB used · {gpu.temp_c}°C · {gpu.util_pct}% load · driver {gpu.driver}</p></div>
          <span className="status-badge online">online</span>
          <button type="button" className="btn ghost small" onClick={() => onOpenApp?.('vram')}>Open VRAM Control</button>
        </div>
      )}

      <div className="engine-grid">
        {engines.map((engine) => {
          const Icon = ENGINE_ICONS[engine.id] || Cpu
          const isOpen = expanded === engine.id
          return (
            <div className="engine-card" key={engine.id}>
              <div className="engine-head">
                <span className="engine-icon"><Icon size={19} /></span>
                <div><h3>{engine.name}</h3><p>{engine.note}</p></div>
                <span className={`status-badge ${engine.status}`}>{engine.status}</span>
              </div>
              <div className="engine-stats"><span><Zap size={12} /> {engine.models.length} models</span>{engine.endpoint && <span><Terminal size={12} /> {engine.endpoint}</span>}</div>
              {engine.models.length > 0 && (
                <>
                  <button type="button" className="engine-toggle" onClick={() => setExpanded(isOpen ? null : engine.id)}>
                    {isOpen ? 'Hide models' : `Show ${engine.models.length} models`} <ChevronDown size={13} className={isOpen ? 'flip' : ''} />
                  </button>
                  {isOpen && (
                    <div className="model-list">
                      {engine.models.map((m) => (
                        <div className="model-row" key={m.id}>
                          <span className={`model-dot ${m.running ? 'running' : ''}`} />
                          <div><strong>{m.label || m.name}</strong><em>{[m.free && 'FREE TIER', m.sizeGB && `${m.sizeGB} GB`, m.family, m.context && `${m.context} ctx`, m.port && `:${m.port}`].filter(Boolean).join(' · ')}</em></div>
                          <button type="button" className="link-btn" onClick={() => onUse(engine.id, m.id)}>Use</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------- runs ----------------------------------- */
function RunsTab({ runs, loadRuns }) {
  const [open, setOpen] = useState(null)
  const statusIcon = { success: CircleCheck, error: CircleX, running: Activity }

  return (
    <div className="ai-page">
      <header className="ai-page-head">
        <div><h1>Runs</h1><p>Everything your agents have done, step by step.</p></div>
        <button type="button" className="btn ghost" onClick={loadRuns}><RefreshCw size={15} /> Refresh</button>
      </header>
      <div className="run-list">
        {runs.length === 0 && <div className="empty-state"><Activity size={34} /><h3>No runs yet</h3><p>Run an agent to see its activity here.</p></div>}
        {runs.map((run) => {
          const Icon = statusIcon[run.status] || Activity
          const isOpen = open === run.id
          const duration = run.endedAt ? Math.round((new Date(run.endedAt) - new Date(run.startedAt)) / 1000) : null
          return (
            <div className={`run-card ${run.status}`} key={run.id}>
              <button type="button" className="run-summary" onClick={() => setOpen(isOpen ? null : run.id)}>
                <span className={`run-status ${run.status}`}><Icon size={16} /></span>
                <div><strong>{run.agentName}</strong><em>{run.prompt?.slice(0, 100)}</em></div>
                <span className="run-trigger">{run.trigger}</span>
                <span className="run-time">{new Date(run.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{duration != null && ` · ${duration}s`}</span>
                <ChevronDown size={15} className={isOpen ? 'flip' : ''} />
              </button>
              {isOpen && (
                <div className="run-detail">
                  {run.error && <div className="run-error"><AlertCircle size={14} /> {run.error}</div>}
                  {run.steps?.map((step, i) => (
                    <div className={`run-step ${step.role}`} key={i}>
                      <span>{step.role === 'tool' ? <Wrench size={13} /> : <Bot size={13} />}</span>
                      <div><strong>{step.role === 'tool' ? step.content?.tool || 'tool' : 'Assistant'}</strong><pre>{typeof step.content === 'string' ? step.content : JSON.stringify(step.content, null, 2)}</pre></div>
                    </div>
                  ))}
                  <div className="run-output"><strong>Result</strong><p>{run.output}</p></div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
