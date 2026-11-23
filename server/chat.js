import { spawn } from 'node:child_process'
import { config, fetchWithTimeout } from './lib.js'
import { discover } from './discovery.js'

export async function resolveModel(engineId, modelId) {
  const { engines } = await discover(true)
  const engine = engines.find((e) => e.id === engineId)
  if (!engine) throw new Error(`Unknown engine: ${engineId}`)
  const model = engine.models?.find((m) => m.id === modelId) || null
  return { engine, model }
}

function asMessages(system, messages) {
  const out = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages || []) {
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })
  }
  return out
}

async function streamOllama(engine, modelId, messages, onDelta, signal) {
  const res = await fetchWithTimeout(`${engine.endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
    signal,
  }, 600000)
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`)
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
      if (!line.trim()) continue
      let obj
      try { obj = JSON.parse(line) } catch { continue }
      const delta = obj.message?.content || ''
      if (delta) { text += delta; onDelta?.(delta) }
      if (obj.done) break
    }
  }
  return text
}

async function streamOpenAI(endpoint, modelId, messages, onDelta, signal) {
  const res = await fetchWithTimeout(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages, stream: true, temperature: 0.3 }),
    signal,
  }, 600000)
  if (!res.ok) throw new Error(`Endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`)
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
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let obj
      try { obj = JSON.parse(payload) } catch { continue }
      const delta = obj.choices?.[0]?.delta?.content || ''
      if (delta) { text += delta; onDelta?.(delta) }
    }
  }
  return text
}

function runCli(exe, args, prompt, onDelta, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, shell: false })
    let text = ''
    let error = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) { settled = true; child.kill(); reject(new Error('CLI timed out')) }
    }, timeoutMs)
    child.stdout.on('data', (buf) => {
      const s = buf.toString('utf8')
      text += s
      onDelta?.(s)
    })
    child.stderr.on('data', (buf) => { error += buf.toString('utf8') })
    child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e) } })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`CLI exit ${code}: ${error.slice(0, 400)}`))
      else resolve(text.trim())
    })
    if (prompt != null) { child.stdin.write(prompt); child.stdin.end() }
    else child.stdin.end()
  })
}

function toTranscript(system, messages) {
  const parts = []
  if (system) parts.push(`SYSTEM INSTRUCTIONS:\n${system}`)
  for (const m of messages || []) {
    parts.push(`${m.role === 'assistant' ? 'ASSISTANT' : 'USER'}: ${m.content}`)
  }
  return parts.join('\n\n')
}

export async function chat({ engineId, model, system, messages, onDelta, timeoutMs = config.agentDefaults.timeoutMs }) {
  const { engine, model: meta } = await resolveModel(engineId, model)
  const modelId = model || meta?.id
  if (!modelId) throw new Error(`No model specified for ${engineId}`)

  if (engine.kind === 'delegate') {
    const transcript = toTranscript(system, messages)
    if (engine.id === 'hermes') {
      const args = ['chat', '--query-file', '-', '--oneshot', '-Q', '--format', 'text']
      if (engine.endpoint) args.push('--provider', 'custom', '--base-url', engine.endpoint)
      if (modelId) args.push('-m', modelId)
      return { text: await runCli(engine.exe, args, transcript, onDelta, timeoutMs), engineId, model: modelId }
    }
    const args = ['run']
    if (modelId) args.push('-m', modelId)
    args.push(transcript)
    const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '')
    const output = await runCli(engine.cli, args, null, (s) => onDelta?.(stripAnsi(s)), timeoutMs)
    return { text: stripAnsi(output), engineId, model: modelId }
  }

  const msgs = asMessages(system, messages)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let text
    if (engine.id === 'ollama') {
      text = await streamOllama(engine, modelId, msgs, onDelta, controller.signal)
    } else {
      let endpoint = engine.endpoint
      if (meta?.port && engine.id === 'llamacpp') endpoint = `http://127.0.0.1:${meta.port}/v1`
      const rawModel = String(modelId).replace(/^\d+:/, '')
      text = await streamOpenAI(endpoint, rawModel, msgs, onDelta, controller.signal)
    }
    return { text, engineId, model: modelId }
  } finally {
    clearTimeout(timer)
  }
}
