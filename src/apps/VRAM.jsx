import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Gauge, Cpu, Zap, Thermometer, Activity, Database, Download, Search, RefreshCw,
  Trash2, Play, Square, Layers, HardDrive, ExternalLink, AlertCircle, Loader2,
  SlidersHorizontal, Rocket, Ban, ChevronDown,
} from 'lucide-react'

const api = async (path, options) => {
  const res = await fetch(`/api${path}`, options)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const CTX_STEPS = [4096, 8192, 16384, 32768, 65536, 131072, 262144]
const KV_OPTIONS = ['q8_0', 'f16', 'q4_0', 'bf16', 'q5_0']
const gb = (mib) => (Number(mib || 0) / 1024).toFixed(1)
const humanBytes = (n) => {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(1)} ${u[i]}`
}

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'ollama', label: 'Ollama models', icon: Database },
  { id: 'llamacpp', label: 'llama.cpp', icon: Cpu },
  { id: 'huggingface', label: 'Hugging Face', icon: Search },
  { id: 'downloads', label: 'Downloads', icon: Download },
]

export default function VRAM() {
  const [section, setSection] = useState('overview')
  const [snapshot, setSnapshot] = useState(null)
  const [history, setHistory] = useState([])
  const [lcModels, setLcModels] = useState({ models: [], ctx_steps: CTX_STEPS })
  const [downloads, setDownloads] = useState([])
  const [targets, setTargets] = useState([])
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [state, hist, models, dls] = await Promise.all([
        api('/vram/state'), api('/vram/history'), api('/vram/llamacpp/models'), api('/downloads'),
      ])
      setSnapshot(state)
      setHistory(Array.isArray(hist) ? hist.slice(-100) : [])
      setLcModels(models || { models: [], ctx_steps: CTX_STEPS })
      setDownloads(dls || [])
    } catch (e) {
      setNotice({ type: 'error', text: `VRAM OPS is unreachable: ${e.message}` })
    }
  }, [])

  useEffect(() => {
    refresh()
    api('/hf/targets').then(setTargets).catch(() => {})
    const id = setInterval(refresh, 2000)
    const source = new EventSource('/api/events')
    source.addEventListener('download', refresh)
    return () => { clearInterval(id); source.close() }
  }, [refresh])

  const act = async (route, body, message) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = body === undefined ? await api(`/vram${route}`, { method: 'POST' }) : await post(`/vram${route}`, body)
      if (message) setNotice({ type: 'success', text: message })
      await refresh()
      return result
    } catch (e) {
      setNotice({ type: 'error', text: e.message })
      return null
    } finally { setBusy(false) }
  }

  const gpu = snapshot?.gpu || {}
  const activeCount = downloads.filter((d) => d.status === 'downloading').length

  return (
    <div className="app vram-app">
      <aside className="app-sidebar vram-sidebar">
        <div className="ai-brand"><span className="ai-brand-icon"><Gauge size={18} /></span><div><strong>VRAM Control</strong><em>GPU & model manager</em></div></div>
        <div className="sidebar-label with-gap">Workspace</div>
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <button type="button" key={s.id} className={`side-item ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>
              <Icon size={16} /><span>{s.label}</span>
              {s.id === 'downloads' && activeCount > 0 && <em>{activeCount}</em>}
            </button>
          )
        })}
        <div className="ai-side-foot">
          <span className={`ai-status-dot ${snapshot?.gpu?.ok ? 'on' : ''}`} />
          <span>{gpu.name || 'GPU unavailable'}</span>
        </div>
      </aside>

      <main className="app-main vram-main">
        {notice && <div className={`ai-notice ${notice.type}`}><AlertCircle size={14} /> {notice.text}<button type="button" onClick={() => setNotice(null)}>×</button></div>}
        {section === 'overview' && <Overview snapshot={snapshot} history={history} refresh={refresh} act={act} busy={busy} />}
        {section === 'ollama' && <OllamaSection snapshot={snapshot} act={act} busy={busy} setNotice={setNotice} />}
        {section === 'llamacpp' && <LlamaSection snapshot={snapshot} lcModels={lcModels} act={act} busy={busy} setNotice={setNotice} />}
        {section === 'huggingface' && <HuggingFaceSection targets={targets} setSection={setSection} setNotice={setNotice} refresh={refresh} />}
        {section === 'downloads' && <DownloadsSection downloads={downloads} cancel={(id) => api(`/downloads/${id}`, { method: 'DELETE' }).then(refresh)} />}
      </main>
    </div>
  )
}

/* ------------------------------- overview ------------------------------- */
function Sparkline({ history }) {
  const points = useMemo(() => {
    if (!history.length) return ''
    return history.map((h, i) => {
      const used = (h.ollama || 0) + (h.strata || 0) + (h.llamacpp || 0) + (h.other || 0)
      const pct = h.total ? Math.min(1, used / h.total) : 0
      return `${(i / Math.max(history.length - 1, 1)) * 100},${30 - pct * 28}`
    }).join(' ')
  }, [history])
  return (
    <svg className="vram-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="VRAM usage history">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Overview({ snapshot, history, refresh, act, busy }) {
  const gpu = snapshot?.gpu || {}
  const mem = snapshot?.memory || {}
  const used = gpu.used_mib || 0
  const total = gpu.total_mib || 1
  const pct = Math.min(100, Math.round((used / total) * 100))
  const loaded = (snapshot?.fit_table || []).filter((m) => m.loaded)
  const servers = (snapshot?.llamacpp?.servers || []).filter((s) => s.running)
  const pulls = Object.entries(snapshot?.ollama?.pulls || {})

  return (
    <div className="vram-page">
      <header className="ai-page-head">
        <div><h1>GPU overview</h1><p>Live readings from VRAM OPS · updates every 2 seconds</p></div>
        <button type="button" className="btn ghost" onClick={refresh}><RefreshCw size={15} /> Refresh</button>
      </header>
      <div className="vram-content">
        <section className="vram-hero">
          <div className="vram-hero-top">
            <div><span className="eyebrow"><Cpu size={13} /> Graphics processor</span><h2>{gpu.name || 'No GPU detected'}</h2><p>Driver {gpu.driver || '—'} · CUDA {gpu.cuda || '—'}</p></div>
            <div className="vram-big"><strong>{gb(used)}</strong><span>/ {gb(total)} GB VRAM</span></div>
          </div>
          <div className="vram-meter"><i style={{ width: `${pct}%` }} className={pct > 90 ? 'critical' : pct > 75 ? 'warn' : ''} /></div>
          <div className="vram-meter-labels"><span>{pct}% used</span><span>{gb(total - used)} GB free</span></div>
          <Sparkline history={history} />
        </section>

        <div className="vram-stat-grid">
          <div className="vram-stat"><Thermometer size={17} /><strong>{gpu.temp_c ?? '—'}°C</strong><span>Temperature</span></div>
          <div className="vram-stat"><Activity size={17} /><strong>{gpu.util_pct ?? '—'}%</strong><span>GPU load</span></div>
          <div className="vram-stat"><Zap size={17} /><strong>{gpu.power_w ?? '—'} W</strong><span>Power draw</span></div>
          <div className="vram-stat"><Gauge size={17} /><strong>{gpu.fan_pct ?? '—'}%</strong><span>Fan speed</span></div>
          <div className="vram-stat"><Cpu size={17} /><strong>{gpu.clock_mhz ?? '—'} MHz</strong><span>Core clock</span></div>
          <div className="vram-stat"><HardDrive size={17} /><strong>{gpu.mem_util_pct ?? '—'}%</strong><span>Memory bus</span></div>
        </div>

        <section className="vram-panel">
          <header><h3>Resident models</h3><button type="button" className="btn ghost small" disabled={busy} onClick={() => act('/ollama/unload_all', {}, 'Unloaded all Ollama models')}>Unload all</button></header>
          <div className="resident-list">
            {loaded.length === 0 && servers.length === 0 && <div className="empty-mini">No models resident in VRAM.</div>}
            {loaded.map((m) => (
              <div className="resident-row" key={m.model}>
                <span className="model-dot running" />
                <div><strong>{m.model}</strong><em>Ollama · {gb(m.mib)} GB{m.cpu_only ? ' · CPU only' : ''}</em></div>
                <button type="button" className="btn ghost small" disabled={busy} onClick={() => act('/ollama/unload', { model: m.model }, `Unloaded ${m.model}`)}>Unload</button>
              </div>
            ))}
            {servers.flatMap((s) => (s.models || []).map((m) => (
              <div className="resident-row" key={`${s.port}-${m.name}`}>
                <span className="model-dot running" />
                <div><strong>{m.name || `Server :${s.port}`}</strong><em>llama.cpp :{s.port} · {gb(s.vram_mib)} GB</em></div>
                <button type="button" className="btn ghost small" disabled={busy} onClick={() => act(`/llamacpp/${s.port}/unload`, { model: m.name }, `Unloaded on :${s.port}`)}>Unload</button>
              </div>
            )))}
          </div>
        </section>

        {pulls.length > 0 && (
          <section className="vram-panel">
            <header><h3>Pulling models</h3></header>
            {pulls.map(([name, p]) => (
              <div className="pull-row" key={name}><strong>{name}</strong><span>{p.status}{p.pct != null ? ` · ${p.pct}%` : ''}</span><div className="mini-bar"><i style={{ width: `${p.pct || 5}%` }} /></div></div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}

/* ------------------------------- ollama ------------------------------- */
function OllamaSection({ snapshot, act, busy, setNotice }) {
  const [ctx, setCtx] = useState(32768)
  const [keep, setKeep] = useState('10m')
  const [pull, setPull] = useState('')
  const installed = snapshot?.ollama?.installed || []
  const fit = Object.fromEntries((snapshot?.fit_table || []).map((m) => [m.model, m]))
  const pulls = Object.entries(snapshot?.ollama?.pulls || {})

  return (
    <div className="vram-page">
      <header className="ai-page-head"><div><h1>Ollama models</h1><p>{installed.length} installed · load into VRAM with a chosen context size</p></div>
        <button type="button" className="btn ghost" onClick={() => act('/ollama/unload_all', {}, 'Unloaded all Ollama models')} disabled={busy}><Ban size={15} /> Unload all</button>
      </header>
      <div className="vram-content">
        <section className="vram-panel">
          <header><h3>Load settings</h3><span className="panel-hint">Applied when you load a model</span></header>
          <div className="vram-form-row">
            <label className="field"><span className="field-label">Context size</span>
              <select value={ctx} onChange={(e) => setCtx(Number(e.target.value))}>
                {CTX_STEPS.map((n) => <option key={n} value={n}>{n.toLocaleString()} tokens</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Keep alive</span>
              <select value={keep} onChange={(e) => setKeep(e.target.value)}>
                <option value="5m">5 minutes</option><option value="30m">30 minutes</option><option value="1h">1 hour</option><option value="-1">Forever</option>
              </select>
            </label>
          </div>
        </section>

        <section className="vram-panel">
          <header><h3>Installed models</h3></header>
          <div className="model-table">
            {installed.length === 0 && <div className="empty-mini">No Ollama models found.</div>}
            {installed.map((m) => {
              const state = fit[m.name]
              const loaded = state?.loaded
              return (
                <div className="model-table-row" key={m.name}>
                  <div className="model-identity"><span className={`model-dot ${loaded ? 'running' : ''}`} /><div><strong>{m.name}</strong><em>{[m.params, m.quant, m.family, gb(m.size_mib) + ' GB'].filter(Boolean).join(' · ')}</em></div></div>
                  <span className={`status-badge ${loaded ? 'online' : ''}`}>{loaded ? 'resident' : 'standby'}</span>
                  <div className="model-actions">
                    <button type="button" className="btn primary small" disabled={busy} onClick={async () => {
                      const result = await act('/ollama/load', { model: m.name, keep_alive: keep, num_ctx: ctx }, `Loading ${m.name}…`)
                      if (!result) setNotice({ type: 'error', text: `Could not load ${m.name}. It may not fit — try a smaller context.` })
                    }}><Play size={12} /> Load</button>
                    {loaded && <button type="button" className="btn ghost small" disabled={busy} onClick={() => act('/ollama/unload', { model: m.name }, `Unloaded ${m.name}`)}><Square size={12} /> Unload</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="vram-panel">
          <header><h3>Pull a model</h3><span className="panel-hint">Ollama model name or hf.co/… tag</span></header>
          <div className="vram-form-row">
            <input value={pull} onChange={(e) => setPull(e.target.value)} placeholder="hf.co/unsloth/Qwen3.5-9B-GGUF:Q4_K_M" />
            <button type="button" className="btn primary" disabled={!pull.trim() || busy} onClick={async () => {
              await act('/ollama/pull', { model: pull.trim() }, `Pulling ${pull.trim()}`)
              setPull('')
            }}><Download size={15} /> Pull</button>
          </div>
          {pulls.map(([name, p]) => <div className="pull-row" key={name}><strong>{name}</strong><span>{p.status}{p.pct != null ? ` · ${p.pct}%` : ''}</span><div className="mini-bar"><i style={{ width: `${p.pct || 5}%` }} /></div></div>)}
        </section>
      </div>
    </div>
  )
}

/* ------------------------------ llama.cpp ------------------------------ */
function LlamaSection({ snapshot, lcModels, act, busy, setNotice }) {
  const steps = lcModels.ctx_steps?.length ? lcModels.ctx_steps : CTX_STEPS
  const [path, setPath] = useState('')
  const [ctx, setCtx] = useState(32768)
  const [kv, setKv] = useState('q8_0')
  const [moe, setMoe] = useState(0)
  const [replace, setReplace] = useState(0)
  const [plan, setPlan] = useState(null)
  const servers = snapshot?.llamacpp?.servers || []
  const models = lcModels.models || []
  const selected = models.find((m) => m.path === path)

  const planIt = async () => {
    if (!path) return
    try {
      const data = await api(`/vram/llamacpp/plan?path=${encodeURIComponent(path)}&ctx=${ctx}&kv=${encodeURIComponent(kv)}&replace_port=${replace}`)
      setPlan(data)
    } catch (e) { setNotice({ type: 'error', text: e.message }) }
  }

  return (
    <div className="vram-page">
      <header className="ai-page-head"><div><h1>llama.cpp servers</h1><p>{models.length} GGUF models available · launched through VRAM OPS</p></div></header>
      <div className="vram-content">
        <section className="vram-panel">
          <header><h3><Rocket size={15} /> Launch a model</h3><span className="panel-hint">Context size and KV cache control VRAM use</span></header>
          <div className="launch-grid">
            <label className="field span2"><span className="field-label">GGUF model</span>
              <select value={path} onChange={(e) => { setPath(e.target.value); setPlan(null) }}>
                <option value="">Select a model…</option>
                {models.map((m) => <option key={m.path} value={m.path}>{m.name} · {gb(m.file_mib)} GB{m.moe ? ' · MoE' : ''}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Context size</span>
              <select value={ctx} onChange={(e) => { setCtx(Number(e.target.value)); setPlan(null) }}>
                {steps.map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">KV cache</span>
              <select value={kv} onChange={(e) => { setKv(e.target.value); setPlan(null) }}>
                {KV_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">MoE layers in RAM</span><input type="number" min="0" value={moe} onChange={(e) => setMoe(Number(e.target.value))} /></label>
            <label className="field"><span className="field-label">Replace port</span>
              <select value={replace} onChange={(e) => setReplace(Number(e.target.value))}>
                <option value="0">New server</option>
                {servers.map((s) => <option key={s.port} value={s.port}>:{s.port} {s.name || s.kind}</option>)}
              </select>
            </label>
          </div>
          {selected && <div className="model-info">Arch {selected.arch || '—'} · {selected.params || '—'} params · {selected.layers || '—'} layers · trained ctx {selected.ctx_train?.toLocaleString?.() || '—'}</div>}
          {plan && (
            <div className={`plan-result ${plan.fits ? 'ok' : 'bad'}`}>
              <strong>{plan.fits ? 'Fits in VRAM' : 'Does not fit'}</strong>
              <span>Estimated {gb(plan.vram_mib || plan.pick?.vram_mib)} GB · budget {gb(plan.budget_mib)} GB</span>
            </div>
          )}
          <div className="vram-form-row">
            <button type="button" className="btn ghost" disabled={!path || busy} onClick={planIt}><SlidersHorizontal size={15} /> Check fit</button>
            <button type="button" className="btn primary" disabled={!path || busy} onClick={async () => {
              const result = await act('/llamacpp/launch', { path, ctx, kv, n_cpu_moe: moe, replace_port: replace }, `Launched on port ${result?.port || '…'}`)
              if (result?.port) setReplace(result.port)
            }}><Rocket size={15} /> Launch server</button>
          </div>
        </section>

        <section className="vram-panel">
          <header><h3>Known servers</h3></header>
          <div className="server-list">
            {servers.length === 0 && <div className="empty-mini">No llama.cpp servers running.</div>}
            {servers.map((s) => (
              <div className="server-row" key={s.port}>
                <span className={`model-dot ${s.running ? 'running' : ''}`} />
                <div className="server-info"><strong>:{s.port} <em>{s.kind}</em></strong><span>{s.running ? `${gb(s.vram_mib)} GB · ${(s.models || []).map((m) => m.name).join(', ') || 'no model'}` : (s.known ? 'Known, stopped' : 'Stopped')}</span></div>
                <div className="model-actions">
                  {s.running ? <button type="button" className="btn ghost small" disabled={busy} onClick={() => act(`/llamacpp/${s.port}/stop`, undefined, `Stopped :${s.port}`)}><Square size={12} /> Stop</button>
                    : <button type="button" className="btn ghost small" disabled={busy} onClick={() => act(`/llamacpp/${s.port}/start`, undefined, `Started :${s.port}`)}><Play size={12} /> Start</button>}
                  <button type="button" className="icon-btn danger" title="Forget server" disabled={busy} onClick={() => act(`/llamacpp/${s.port}/forget`, undefined, `Forgot :${s.port}`)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------------------------- hugging face ---------------------------- */
function HuggingFaceSection({ targets, setNotice, refresh }) {
  const [query, setQuery] = useState('Qwen3.5')
  const [sort, setSort] = useState('downloads')
  const [gguf, setGguf] = useState(true)
  const [results, setResults] = useState([])
  const [tree, setTree] = useState({})
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState(targets[0]?.id || 'llamacpp')
  const [pullIds, setPullIds] = useState({})
  const [open, setOpen] = useState(null)

  const search = async () => {
    setLoading(true)
    try {
      const data = await api(`/hf/search?q=${encodeURIComponent(query)}&gguf=${gguf ? 1 : 0}&sort=${sort}&limit=24`)
      setResults(data)
    } catch (e) { setNotice({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }
  useEffect(() => { search() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const showFiles = async (id) => {
    if (open === id) { setOpen(null); return }
    setOpen(id)
    if (tree[id]) return
    try {
      const files = await api(`/hf/tree?repo=${encodeURIComponent(id)}`)
      setTree((t) => ({ ...t, [id]: files }))
    } catch (e) { setNotice({ type: 'error', text: e.message }) }
  }

  const download = async (repo, file) => {
    try {
      await post('/hf/download', { repo, file, target })
      setNotice({ type: 'success', text: `Downloading ${file} to ${targets.find((t) => t.id === target)?.name || target}` })
      refresh()
    } catch (e) { setNotice({ type: 'error', text: e.message }) }
  }

  return (
    <div className="vram-page">
      <header className="ai-page-head"><div><h1>Hugging Face</h1><p>Search GGUF models and download them straight into your model folders</p></div>
        <a className="btn ghost" href="https://huggingface.co/models?filter=gguf" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Browse HF</a>
      </header>
      <div className="vram-content">
        <section className="vram-panel">
          <div className="hf-search-row">
            <div className="search-box"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search models, e.g. Qwen3.5 GGUF" /></div>
            <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="downloads">Most downloaded</option><option value="likes">Most liked</option><option value="lastModified">Recently updated</option></select>
            <label className="hf-check"><input type="checkbox" checked={gguf} onChange={(e) => setGguf(e.target.checked)} /> GGUF only</label>
            <button type="button" className="btn primary" onClick={search} disabled={loading}>{loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />} Search</button>
          </div>
          <label className="hf-target"><span className="field-label">Download destination</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.dir}</option>)}
            </select>
          </label>
        </section>

        <div className="hf-results">
          {results.length === 0 && !loading && <div className="empty-mini">No models found.</div>}
          {results.map((m) => (
            <div className="hf-card" key={m.id}>
              <div className="hf-card-head">
                <div><strong>{m.id}</strong><span>{humanBytes(m.downloads)} downloads · {m.likes} likes {m.pipeline ? `· ${m.pipeline}` : ''}</span></div>
                <button type="button" className="btn ghost small" onClick={() => showFiles(m.id)}>{open === m.id ? 'Hide files' : 'Files'} <ChevronDown size={12} className={open === m.id ? 'flip' : ''} /></button>
              </div>
              <div className="hf-tags">{m.tags.slice(0, 5).map((t) => <em key={t}>{t}</em>)}</div>
              <div className="hf-pull">
                <input value={pullIds[m.id] ?? `hf.co/${m.id}:latest`} onChange={(e) => setPullIds((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="hf.co/...:tag" />
                <button type="button" className="btn ghost small" onClick={async () => {
                  const name = pullIds[m.id] || `hf.co/${m.id}:latest`
                  try { await post('/vram/ollama/pull', { model: name }); setNotice({ type: 'success', text: `Pulling ${name} via Ollama` }); refresh() }
                  catch (e) { setNotice({ type: 'error', text: e.message }) }
                }}><Download size={12} /> Pull via Ollama</button>
              </div>
              {open === m.id && (
                <div className="hf-files">
                  {!tree[m.id] && <div className="empty-mini">Loading files…</div>}
                  {tree[m.id]?.length === 0 && <div className="empty-mini">No GGUF files in this repository.</div>}
                  {tree[m.id]?.map((f) => (
                    <div className="hf-file" key={f.path}>
                      <div><strong>{f.name}</strong><em>{humanBytes(f.size)}</em></div>
                      <button type="button" className="btn primary small" onClick={() => download(m.id, f.path)}><Download size={12} /> Download</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ downloads ------------------------------ */
function DownloadsSection({ downloads, cancel }) {
  return (
    <div className="vram-page">
      <header className="ai-page-head"><div><h1>Downloads</h1><p>GGUF files downloading into your local model folders</p></div></header>
      <div className="vram-content">
        <section className="vram-panel">
          {downloads.length === 0 && <div className="empty-mini">No downloads yet. Find a model on Hugging Face to start one.</div>}
          {downloads.map((d) => {
            const pct = d.total ? Math.min(100, Math.round((d.bytes / d.total) * 100)) : 0
            return (
              <div className="download-row" key={d.id}>
                <div className="download-top">
                  <div><strong>{d.filename}</strong><em>{d.repo} · {d.dir}</em></div>
                  <span className={`status-badge ${d.status === 'complete' ? 'online' : d.status === 'error' ? 'offline' : ''}`}>{d.status}</span>
                </div>
                <div className="mini-bar"><i style={{ width: `${pct}%` }} /></div>
                <div className="download-foot">
                  <span>{humanBytes(d.bytes)} / {humanBytes(d.total)} {d.speed ? `· ${humanBytes(d.speed)}/s` : ''}</span>
                  {d.status === 'downloading' && <button type="button" className="icon-btn danger" title="Cancel" onClick={() => cancel(d.id)}><Trash2 size={14} /></button>}
                </div>
                {d.error && <div className="run-error"><AlertCircle size={13} /> {d.error}</div>}
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}
