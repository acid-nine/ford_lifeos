import http from 'node:http'
import { config } from './lib.js'
import { initState, getState, putState, subscribe } from './state.js'
import { discover } from './discovery.js'
import { chat } from './chat.js'
import { TOOLS } from './tools.js'
import { initAgents, listAgents, getAgent, saveAgent, deleteAgent, listRuns, runAgent, startScheduler } from './agents.js'
import { vramRequest, hfSearch, hfTree, startDownload, cancelDownload, listDownloads, downloadTargets } from './vram.js'

await initState()
await initAgents()
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

    /* ---------------- downloads ---------------- */
    if (path === '/api/downloads' && req.method === 'GET') {
      return sendJson(res, 200, listDownloads())
    }
    if (path.startsWith('/api/downloads/') && req.method === 'DELETE') {
      const id = path.split('/')[3]
      return sendJson(res, 200, { ok: cancelDownload(id) })
    }

    return sendJson(res, 404, { error: 'Not found' })
  } catch (e) {
    return sendJson(res, 500, { error: e.message || String(e) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`FordOS API listening on http://127.0.0.1:${PORT}`)
})
