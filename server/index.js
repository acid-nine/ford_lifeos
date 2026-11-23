import http from 'node:http'
import fs from 'node:fs'
import path3 from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { config, DATA_DIR, ROOT, readJson, writeJson } from './lib.js'
import { initState, getState, putState, subscribe, emit } from './state.js'
import { discover } from './discovery.js'
import { chat } from './chat.js'
import { TOOLS } from './tools.js'
import { initAgents, listAgents, getAgent, saveAgent, deleteAgent, listRuns, runAgent, startScheduler, extractBrief, briefTitle } from './agents.js'
import { vramRequest, hfSearch, hfTree, startDownload, cancelDownload, listDownloads, downloadTargets } from './vram.js'
import { initBriefs, listBriefs, getBrief, saveBrief, deleteBrief } from './briefs.js'

await initState()
await initAgents()
await initBriefs()
/* Backfill briefs from successful runs that predate the brief store. */
try {
  const existing = new Set(listBriefs(200).map((b) => b.runId))
  for (const run of listRuns(200)) {
    if (run.status !== 'success' || !run.output?.trim() || existing.has(run.id)) continue
    const body = extractBrief(run.output)
    if (!body) continue
    await saveBrief({ title: briefTitle(run.agentName || 'Agent', body), body, agentId: run.agentId, agentName: run.agentName, runId: run.id, prompt: run.prompt })
  }
} catch { /* best effort */ }

/* Access code — generated once and reused, or taken from config.json */
let accessCode = String(config.accessCode || '').trim()
if (!accessCode) {
  const file = path3.join(DATA_DIR, 'access-code.json')
  let stored = await readJson(file, null)
  if (!stored?.code) {
    stored = { code: crypto.randomBytes(3).toString('hex').toUpperCase() }
    await writeJson(file, stored)
  }
  accessCode = stored.code
}
console.log(`FordOS access code: ${accessCode}`)

const lanAddresses = () => {
  const out = []
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface, address: a.address })
    }
  }
  return out
}

const SHARED_DIR = path3.join(DATA_DIR, 'shared')
await fs.promises.mkdir(SHARED_DIR, { recursive: true })
startScheduler()

const PORT = config.port || 8787
const sseClients = new Set()

subscribe((type, payload) => {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of sseClients) {
    try { res.write(msg) } catch { /* dead client */ }
  }
})

const sendJson = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const readBody = async (req) => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 5_000_000) throw new Error('Request too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  if (path.startsWith('/api/') && path !== '/api/health' && path !== '/api/login') {
    const supplied = req.headers['x-fordos-token'] || url.searchParams.get('token')
    if (!supplied || supplied !== accessCode) return sendJson(res, 401, { error: 'Access code required' })
  }

  try {
    /* ---------------- health / meta ---------------- */
    if (path === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, service: 'fordos-api', time: new Date().toISOString() })
    }

    if (path === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write('event: hello\ndata: {}\n\n')
      sseClients.add(res)
      const heartbeat = setInterval(() => { try { res.write(': ping\n\n') } catch { /* noop */ } }, 20000)
      req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res) })
      return
    }

    /* ---------------- remote access ---------------- */
    if (path === '/api/login' && req.method === 'POST') {
      const body = await readBody(req)
      return String(body.code || '').trim() === accessCode
        ? sendJson(res, 200, { ok: true })
        : sendJson(res, 401, { error: 'Wrong access code' })
    }
    if (path === '/api/access' && req.method === 'GET') {
      const port = PORT
      return sendJson(res, 200, {
        code: accessCode, port,
        sharedDir: SHARED_DIR,
        addresses: lanAddresses(),
        appUrl: config.appUrl || `http://<ip>:${port}`,
      })
    }

    /* ---------------- shared files ---------------- */
    if (path === '/api/files' && req.method === 'GET') {
      const entries = await fs.promises.readdir(SHARED_DIR, { withFileTypes: true })
      const list = await Promise.all(entries.map(async (e) => {
        if (!e.isFile()) return null
        try {
          const stat = await fs.promises.stat(path3.join(SHARED_DIR, e.name))
          return { name: e.name, size: stat.size, modified: stat.mtime.toISOString() }
        } catch { return null }
      }))
      return sendJson(res, 200, list.filter(Boolean).sort((a, b) => b.modified.localeCompare(a.modified)))
    }
    if (path === '/api/files' && req.method === 'POST') {
      const body = await readBody(req)
      const name = path3.basename(String(body.name || '')).replace(/[^A-Za-z0-9._ -]/g, '_')
      if (!name || name === '.' || name === '..') return sendJson(res, 400, { error: 'Invalid filename' })
      await fs.promises.writeFile(path3.join(SHARED_DIR, name), Buffer.from(body.contentBase64 || '', 'base64'))
      emit('files', { name })
      return sendJson(res, 200, { ok: true, name })
    }
    if (path === '/api/files/download' && req.method === 'GET') {
      const name = path3.basename(String(url.searchParams.get('name') || ''))
      const file = path3.join(SHARED_DIR, name)
      if (!name || !file.startsWith(SHARED_DIR)) return sendJson(res, 400, { error: 'Invalid filename' })
      try {
        const stat = await fs.promises.stat(file)
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
        })
        fs.createReadStream(file).pipe(res)
      } catch { return sendJson(res, 404, { error: 'File not found' }) }
      return
    }
    if (path === '/api/files' && req.method === 'DELETE') {
      const name = path3.basename(String(url.searchParams.get('name') || ''))
      if (name) { await fs.promises.unlink(path3.join(SHARED_DIR, name)).catch(() => {}); emit('files', { deleted: name }) }
      return sendJson(res, 200, { ok: true })
    }

    /* ---------------- engine discovery ---------------- */
    if (path === '/api/engines' && req.method === 'GET') {
      const data = await discover(url.searchParams.get('refresh') === '1')
      return sendJson(res, 200, data)
    }

    if (path === '/api/integrations' && req.method === 'GET') {
      const data = await discover(false)
      return sendJson(res, 200, data.integrations)
    }

    /* ---------------- chat ---------------- */
    if (path === '/api/chat' && req.method === 'POST') {
      const body = await readBody(req)
      if (!body.engineId || !body.model) return sendJson(res, 400, { error: 'engineId and model are required' })
      const wantsStream = body.stream !== false
      if (wantsStream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      }
      try {
        const result = await chat({
          engineId: body.engineId,
          model: body.model,
          system: body.system,
          messages: body.messages || [],
          onDelta: (text) => {
            if (wantsStream) res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`)
          },
        })
        if (wantsStream) {
          res.write(`event: done\ndata: ${JSON.stringify({ engineId: result.engineId, model: result.model })}\n\n`)
          res.end()
        } else sendJson(res, 200, result)
      } catch (e) {
        if (wantsStream) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`)
          res.end()
        } else sendJson(res, 500, { error: e.message })
      }
      return
    }

    /* ---------------- FordOS state ---------------- */
    if (path === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, await getState())
    }
    if (path === '/api/state' && req.method === 'PUT') {
      const body = await readBody(req)
      const result = await putState(body.data, body.rev)
      return sendJson(res, result.conflict ? 409 : 200, result)
    }

    /* ---------------- tools ---------------- */
    if (path === '/api/tools' && req.method === 'GET') {
      return sendJson(res, 200, TOOLS.map(({ name, description, input }) => ({ name, description, input })))
    }

    /* ---------------- agents ---------------- */
    if (path === '/api/agents' && req.method === 'GET') {
      return sendJson(res, 200, listAgents())
    }
    if (path === '/api/agents' && req.method === 'POST') {
      return sendJson(res, 200, await saveAgent(await readBody(req)))
    }
    if (path.startsWith('/api/agents/') && req.method === 'DELETE') {
      const id = path.split('/')[3]
      return sendJson(res, 200, await deleteAgent(id))
    }
    if (path.startsWith('/api/agents/') && path.endsWith('/run') && req.method === 'POST') {
      const id = path.split('/')[3]
      const body = await readBody(req).catch(() => ({}))
      if (!getAgent(id)) return sendJson(res, 404, { error: 'Agent not found' })
      const run = await runAgent(id, { prompt: body.prompt, trigger: 'manual' })
      return sendJson(res, 200, run)
    }

    /* ---------------- runs ---------------- */
    if (path === '/api/runs' && req.method === 'GET') {
      return sendJson(res, 200, listRuns(Number(url.searchParams.get('limit')) || 80))
    }

    /* ---------------- VRAM OPS proxy ---------------- */
    if (path.startsWith('/api/vram/')) {
      const route = `/api${path.slice('/api/vram'.length)}${url.search}`
      try {
        if (req.method === 'GET') return sendJson(res, 200, await vramRequest(route))
        if (req.method === 'POST') return sendJson(res, 200, await vramRequest(route, 'POST', await readBody(req)))
        return sendJson(res, 405, { error: 'Method not allowed' })
      } catch (e) {
        return sendJson(res, e.status || 502, { error: e.message, detail: e.payload || null })
      }
    }

    /* ---------------- Hugging Face ---------------- */
    if (path === '/api/hf/search' && req.method === 'GET') {
      try {
        const result = await hfSearch(url.searchParams.get('q') || '', {
          gguf: url.searchParams.get('gguf') !== '0',
          limit: Number(url.searchParams.get('limit')) || 20,
          sort: url.searchParams.get('sort') || 'downloads',
        })
        return sendJson(res, 200, result)
      } catch (e) { return sendJson(res, 502, { error: e.message }) }
    }
    if (path === '/api/hf/tree' && req.method === 'GET') {
      try { return sendJson(res, 200, await hfTree(url.searchParams.get('repo') || '')) }
      catch (e) { return sendJson(res, 502, { error: e.message }) }
    }
    if (path === '/api/hf/targets' && req.method === 'GET') {
      return sendJson(res, 200, downloadTargets())
    }
    if (path === '/api/hf/download' && req.method === 'POST') {
      try { return sendJson(res, 200, startDownload(await readBody(req))) }
      catch (e) { return sendJson(res, 400, { error: e.message }) }
    }

    /* ---------------- briefs ---------------- */
    if (path === '/api/briefs' && req.method === 'GET') {
      return sendJson(res, 200, listBriefs(Number(url.searchParams.get('limit')) || 60))
    }
    if (path.startsWith('/api/briefs/') && req.method === 'GET') {
      const brief = getBrief(path.split('/')[3])
      return brief ? sendJson(res, 200, brief) : sendJson(res, 404, { error: 'Brief not found' })
    }
    if (path.startsWith('/api/briefs/') && req.method === 'DELETE') {
      return sendJson(res, 200, await deleteBrief(path.split('/')[3]))
    }

    /* ---------------- downloads ---------------- */
    if (path === '/api/downloads' && req.method === 'GET') {
      return sendJson(res, 200, listDownloads())
    }
    if (path.startsWith('/api/downloads/') && req.method === 'DELETE') {
      const id = path.split('/')[3]
      return sendJson(res, 200, { ok: cancelDownload(id) })
    }

    /* ---------------- static app ---------------- */
    if (!path.startsWith('/api/') && req.method === 'GET') {
      const dist = path3.resolve(ROOT, 'dist')
      const requested = path3.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.[/\\])+/, '')
      let file = path3.join(dist, requested)
      if (!file.startsWith(dist)) file = path3.join(dist, 'index.html')
      try {
        const stat = await fs.promises.stat(file)
        if (stat.isDirectory()) file = path3.join(file, 'index.html')
      } catch { file = path3.join(dist, 'index.html') }
      const ext = path3.extname(file).toLowerCase()
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' })
      fs.createReadStream(file).on('error', () => { res.writeHead(404); res.end('Not found') }).pipe(res)
      return
    }

    return sendJson(res, 404, { error: 'Not found' })
  } catch (e) {
    return sendJson(res, 500, { error: e.message || String(e) })
  }
})

server.listen(PORT, config.host || '0.0.0.0', () => {
  console.log(`FordOS listening on http://0.0.0.0:${PORT}`)
})
