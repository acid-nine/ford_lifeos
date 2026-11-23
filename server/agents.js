import path from 'node:path'
import { uid, nowISO, config, parseCron, readJson, writeJson, ensureDataDir, DATA_DIR } from './lib.js'
import { emit } from './state.js'
import { chat } from './chat.js'
import { TOOLS, runTool } from './tools.js'

const FILE = path.join(DATA_DIR, 'fordos-agents.json')
const active = new Set()
let store = { agents: [], runs: [] }
let scheduler = null

export async function initAgents() {
  await ensureDataDir()
  store = await readJson(FILE, { agents: [], runs: [] })
  if (!Array.isArray(store.agents)) store.agents = []
  if (!Array.isArray(store.runs)) store.runs = []
}

const persist = () => writeJson(FILE, store)

export function listAgents() { return store.agents }
export function getAgent(id) { return store.agents.find((a) => a.id === id) || null }
export function listRuns(limit = 80) { return store.runs.slice(0, limit) }

export async function saveAgent(input) {
  const now = nowISO()
  if (input.id) {
    const idx = store.agents.findIndex((a) => a.id === input.id)
    if (idx >= 0) {
      store.agents[idx] = { ...store.agents[idx], ...input, updatedAt: now }
      await persist()
      emit('agents', { id: input.id })
      return store.agents[idx]
    }
  }
  const agent = {
    id: uid(),
    name: input.name || 'Untitled agent',
    description: input.description || '',
    systemPrompt: input.systemPrompt || 'You are a helpful assistant.',
    prompt: input.prompt || '',
    engineId: input.engineId || 'ollama',
    model: input.model || '',
    tools: Array.isArray(input.tools) ? input.tools : [],
    trigger: input.trigger || { type: 'manual' },
    enabled: input.enabled !== false,
    maxSteps: Number(input.maxSteps) || config.agentDefaults.maxSteps,
    createdAt: now, updatedAt: now, lastRun: null, runCount: 0,
  }
  store.agents.push(agent)
  await persist()
  emit('agents', { id: agent.id })
  return agent
}

export async function deleteAgent(id) {
  store.agents = store.agents.filter((a) => a.id !== id)
  await persist()
  emit('agents', { id })
  return { ok: true }
}

function toolInstructions(allowed) {
  const list = TOOLS.filter((t) => allowed.includes('*') || allowed.includes(t.name))
  return [
    'TOOLS: You can change FordOS data by emitting a fenced tool block. Example:',
    '```tool',
    '{"tool":"create_task","args":{"title":"Call the dentist","priority":"high"}}',
    '```',
    'Rules: one tool call per block; use exact tool names; args must be a JSON object.',
    `Available tools:\n${list.map((t) => `- ${t.name}: ${t.description} Input: ${JSON.stringify(t.input)}`).join('\n')}`,
    'If no tool is needed, reply to the user normally. Always finish with a short plain-text summary.',
  ].join('\n')
}

function parseToolBlocks(text) {
  const calls = []
  const re = /```tool\s*([\s\S]*?)```/g
  let m
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj.tool) calls.push({ tool: obj.tool, args: obj.args || {} })
    } catch { /* ignore malformed blocks */ }
  }
  return calls
}

export async function runAgent(id, { prompt, trigger = 'manual' } = {}) {
  const agent = getAgent(id)
  if (!agent) throw new Error('Agent not found')
  if (active.has(id)) throw new Error('Agent is already running')

  active.add(id)
  const run = {
    id: uid(), agentId: id, agentName: agent.name, trigger,
    startedAt: nowISO(), endedAt: null, status: 'running',
    prompt: prompt || agent.prompt || agent.systemPrompt,
    engineId: agent.engineId, model: agent.model,
    steps: [], output: '', error: null,
  }
  store.runs.unshift(run)
  if (store.runs.length > 200) store.runs = store.runs.slice(0, 200)
  emit('run', run)
  await persist()

  const saveRun = async () => { await persist(); emit('run', run) }

  try {
    const system = [
      `You are ${agent.name}, an agent running inside FordOS, a personal life operating system.`,
      agent.systemPrompt,
    ].filter(Boolean).join('\n\n')
    const delegate = ['hermes', 'opencode'].includes(agent.engineId)
    const fullSystem = delegate ? system : `${system}\n\n${toolInstructions(agent.tools || [])}`
    const messages = [{ role: 'user', content: run.prompt }]

    if (delegate) {
      const result = await chat({ engineId: agent.engineId, model: agent.model, system: fullSystem, messages, timeoutMs: config.agentDefaults.timeoutMs })
      run.output = result.text
      run.steps.push({ role: 'assistant', content: result.text })
    } else {
      const maxSteps = Math.min(Math.max(agent.maxSteps || 4, 1), 8)
      for (let step = 0; step < maxSteps; step++) {
        const result = await chat({ engineId: agent.engineId, model: agent.model, system: fullSystem, messages, timeoutMs: config.agentDefaults.timeoutMs })
        messages.push({ role: 'assistant', content: result.text })
        run.steps.push({ role: 'assistant', content: result.text, step })

        const calls = parseToolBlocks(result.text)
        if (calls.length === 0) { run.output = result.text; break }

        const results = []
        for (const call of calls) {
          const res = await runTool(call.tool, call.args)
          results.push(res)
          run.steps.push({ role: 'tool', content: res, step })
        }
        messages.push({ role: 'user', content: `TOOL RESULTS:\n${JSON.stringify(results, null, 2)}\n\nContinue. When done, give a short final summary.` })
        await saveRun()
        if (step === maxSteps - 1) run.output = result.text
      }
      if (!run.output) run.output = 'Agent reached the step limit.'
    }

    run.status = 'success'
    agent.lastRun = nowISO()
    agent.runCount = (agent.runCount || 0) + 1
  } catch (e) {
    run.status = 'error'
    run.error = e.message
    run.output = run.output || `Error: ${e.message}`
  } finally {
    active.delete(id)
    run.endedAt = nowISO()
    await saveRun()
  }
  return run
}

function due(agent, now) {
  const t = agent.trigger || { type: 'manual' }
  if (t.type === 'interval') {
    const minutes = Number(t.minutes) || 60
    if (!agent.lastRun) return true
    return now.getTime() - new Date(agent.lastRun).getTime() >= minutes * 60000
  }
  if (t.type === 'cron') {
    const test = parseCron(t.expr)
    if (!test || !test(now)) return false
    if (!agent.lastRun) return true
    const last = new Date(agent.lastRun)
    return last.getMinutes() !== now.getMinutes() || last.getHours() !== now.getHours() || last.getDate() !== now.getDate()
  }
  return false
}

export function startScheduler() {
  if (scheduler) return
  scheduler = setInterval(async () => {
    const now = new Date()
    for (const agent of store.agents) {
      if (!agent.enabled || active.has(agent.id)) continue
      if (!due(agent, now)) continue
      try { await runAgent(agent.id, { trigger: 'schedule' }) } catch { /* logged in run record */ }
    }
  }, 20000)
  scheduler.unref?.()
}
