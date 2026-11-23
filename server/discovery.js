import fs from 'node:fs/promises'
import path from 'node:path'
import { config, getJson, fetchWithTimeout, simpleYaml, readJson } from './lib.js'

let cache = { at: 0, value: null }
const TTL = 8000

async function exists(p) {
  try { await fs.access(p); return true } catch { return false }
}

async function getVramOps() {
  try {
    const res = await fetchWithTimeout(`${config.vramops.url}/api/state`, {}, 2500)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function discoverOllama() {
  try {
    const tags = await getJson(`${config.ollama.url}/api/tags`, 2500)
    let running = []
    try {
      const ps = await getJson(`${config.ollama.url}/api/ps`, 2000)
      running = ps.models || []
    } catch { /* not fatal */ }
    const runningNames = new Set(running.map((m) => m.name))
    const models = (tags.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      label: m.name,
      sizeGB: Math.round((m.size / 1e9) * 10) / 10,
      family: m.details?.family || 'unknown',
      modified: m.modified_at || null,
      running: runningNames.has(m.name),
    }))
    return {
      id: 'ollama', name: 'Ollama', kind: 'native', status: 'online',
      endpoint: config.ollama.url, models,
      note: `${models.length} local models · ${running.length} resident in VRAM`,
    }
  } catch (e) {
    return { id: 'ollama', name: 'Ollama', kind: 'native', status: 'offline', endpoint: config.ollama.url, models: [], note: e.message }
  }
}

async function ggufModels() {
  const out = []
  for (const dir of config.llamacpp.modelDirs || []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !/\.gguf$/i.test(entry.name)) continue
        const full = path.join(dir, entry.name)
        try {
          const stat = await fs.stat(full)
          const label = entry.name.replace(/\.gguf$/i, '')
          out.push({
            id: `llamacpp:${label}`,
            name: label,
            label,
            path: full.replace(/\\/g, '/'),
            sizeGB: Math.round((stat.size / 1e9) * 10) / 10,
            running: false,
          })
        } catch { /* ignore */ }
      }
    } catch { /* directory missing */ }
  }
  return out
}

async function discoverLlamacpp(vram) {
  const known = [...new Set([...(config.llamacpp.ports || []), ...(vram?.llamacpp?.servers || []).map((s) => Number(s.port)).filter(Boolean)])]
  const servers = []
  for (const port of known) {
    try {
      const res = await fetchWithTimeout(`http://127.0.0.1:${port}/v1/models`, {}, 1200)
      if (!res.ok) continue
      const body = await res.json()
      const models = (body.data || []).map((m) => ({ id: `${port}:${m.id}`, name: m.id, label: m.id, running: true, port }))
      servers.push({ port, models })
    } catch { /* port closed */ }
  }
  const fileModels = await ggufModels()
  const runningIds = new Set(servers.flatMap((s) => s.models.map((m) => m.name)))
  const models = [
    ...servers.flatMap((s) => s.models),
    ...fileModels.map((m) => ({ ...m, running: runningIds.has(m.name) })),
  ]
  const serverExists = await exists(config.llamacpp.server)
  const online = servers.length > 0
  return {
    id: 'llamacpp', name: 'llama.cpp', kind: 'openai', status: online ? 'online' : (serverExists ? 'available' : 'offline'),
    endpoint: `http://127.0.0.1:${known[0] || 18080}/v1`,
    ports: known, servers, models,
    note: online ? `${servers.length} server(s) running · ${fileModels.length} GGUF files` : `${fileModels.length} GGUF files · launch via VRAM OPS`,
    vramOps: !!vram,
  }
}

async function discoverHermes() {
  const cfgPath = config.hermes.config
  let defaultModel = null
  let provider = 'custom'
  let baseUrl = null
  try {
    const parsed = simpleYaml(await fs.readFile(cfgPath, 'utf8'))
    defaultModel = parsed.model?.default || null
    provider = parsed.model?.provider || 'custom'
    baseUrl = parsed.model?.base_url || null
  } catch { /* config unavailable */ }

  const cache = await readJson(config.hermes.modelCache, null)
  const cached = cache?.huggingface?.models || []
  const installed = []; const cloud = []
  for (const m of cached) {
    (String(m).startsWith('ollama/') || String(m).startsWith('hf.co/') ? installed : cloud).push(m)
  }
  const models = []
  if (defaultModel) models.push({ id: defaultModel, name: defaultModel, label: defaultModel, running: false, selected: true })
  for (const m of [...installed.slice(0, 20), ...cloud.slice(0, 20)]) {
    if (models.some((x) => x.id === m)) continue
    models.push({ id: m, name: m, label: m, running: false })
  }
  const exe = await exists(config.hermes.exe)
  return {
    id: 'hermes', name: 'Hermes', kind: 'delegate', status: exe ? 'available' : 'offline',
    endpoint: baseUrl, models, exe: config.hermes.exe,
    note: exe ? `Default: ${defaultModel || 'none'} · ${provider} · CLI ready` : 'CLI not found',
  }
}

async function discoverOpencode() {
  const cfg = await readJson(config.opencode.config, null)
  const models = []
  for (const [provider, pcfg] of Object.entries(cfg?.providers || {})) {
    for (const [name, meta] of Object.entries(pcfg?.models || {})) {
      models.push({
        id: `${provider}/${name}`,
        name,
        label: meta?.name || name,
        provider,
        context: meta?.limit?.context || null,
        output: meta?.limit?.output || null,
        reasoning: meta?.settings?.reasoningEffort || null,
        running: false,
      })
    }
  }
  const cli = await exists(config.opencode.cli)
  return {
    id: 'opencode', name: 'OpenCode', kind: 'delegate', status: cli ? 'available' : 'offline',
    endpoint: null, models, cli: config.opencode.cli,
    note: cli ? `${models.length} configured models · CLI ready` : 'CLI not found',
  }
}

async function discoverGeneric() {
  const out = []
  for (const ep of config.genericEndpoints || []) {
    if (ep.enabled === false) continue
    try {
      const body = await getJson(`${ep.url.replace(/\/$/, '')}/models`, 2000)
      const models = (body.data || []).map((m) => ({ id: m.id, name: m.id, label: m.id, running: true }))
      out.push({ id: ep.id, name: ep.name, kind: 'openai', status: 'online', endpoint: ep.url, models, note: `${models.length} models` })
    } catch {
      out.push({ id: ep.id, name: ep.name, kind: 'openai', status: 'offline', endpoint: ep.url, models: [], note: 'endpoint unreachable' })
    }
  }
  return out
}

export async function discover(force = false) {
  if (!force && cache.value && Date.now() - cache.at < TTL) return cache.value
  const vram = await getVramOps()
  const [ollama, llamacpp, hermes, opencode, generic] = await Promise.all([
    discoverOllama(), discoverLlamacpp(vram), discoverHermes(), discoverOpencode(), discoverGeneric(),
  ])
  cache.value = {
    engines: [ollama, llamacpp, hermes, opencode, ...generic],
    integrations: {
      vramOps: vram ? { status: 'online', url: config.vramops.url, gpu: vram.gpu || null } : { status: 'offline', url: config.vramops.url },
    },
    discoveredAt: new Date().toISOString(),
  }
  cache.at = Date.now()
  return cache.value
}
