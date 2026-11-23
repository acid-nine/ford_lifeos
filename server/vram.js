import fs from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { config, fetchWithTimeout, uid } from './lib.js'
import { emit } from './state.js'

const BASE = config.vramops.url.replace(/\/$/, '')

export async function vramRequest(route, method = 'GET', body) {
  const res = await fetchWithTimeout(`${BASE}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }, 20000)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text.slice(0, 500) }
  if (!res.ok) {
    const error = new Error(data?.detail?.msg || data?.detail || data?.error || `VRAM OPS ${res.status}`)
    error.status = res.status
    error.payload = data
    throw error
  }
  return data
}

/* --------------------------- Hugging Face --------------------------- */
const HF = 'https://huggingface.co'

export async function hfSearch(query, { gguf = true, limit = 20, sort = 'downloads' } = {}) {
  const params = new URLSearchParams({ search: query || '', limit: String(limit), sort, direction: '-1' })
  if (gguf) params.set('filter', 'gguf')
  const res = await fetchWithTimeout(`${HF}/api/models?${params}`, {}, 12000)
  if (!res.ok) throw new Error(`Hugging Face ${res.status}`)
  const list = await res.json()
  return list.map((m) => ({
    id: m.id,
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    tags: (m.tags || []).slice(0, 10),
    pipeline: m.pipeline_tag || null,
    modified: m.lastModified || null,
  }))
}

export async function hfTree(repo) {
  if (!/^[A-Za-z0-9._\-\/]+$/.test(repo) || repo.includes('..')) throw new Error('Invalid repository name')
  const res = await fetchWithTimeout(`${HF}/api/models/${repo}/tree/main?recursive=true&expand=false`, {}, 15000)
  if (!res.ok) throw new Error(`Hugging Face ${res.status}`)
  const files = await res.json()
  return files
    .filter((f) => f.type === 'file' && /\.gguf$/i.test(f.path))
    .map((f) => ({ path: f.path, name: f.path.split('/').pop(), size: f.size || 0 }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 40)
}

/* --------------------------- downloads --------------------------- */
const jobs = new Map()
export const listDownloads = () => [...jobs.values()]
export const getDownload = (id) => jobs.get(id) || null

export function cancelDownload(id) {
  const job = jobs.get(id)
  if (!job || job.status !== 'downloading') return false
  job.controller.abort()
  job.status = 'cancelled'
  return true
}

export function downloadTargets() {
  const dirs = config.llamacpp.modelDirs || []
  return [
    { id: 'llamacpp', name: 'llama.cpp models', dir: dirs[0] },
    { id: 'hermes', name: 'Hermes models', dir: dirs[1] || dirs[0] },
  ].filter((t) => t.dir)
}

export function startDownload({ repo, file, target = 'llamacpp' }) {
  if (!/^[A-Za-z0-9._\-\/]+$/.test(repo) || repo.includes('..')) throw new Error('Invalid repository name')
  if (!/^[A-Za-z0-9._\-\/]+$/.test(file) || file.includes('..')) throw new Error('Invalid file path')
  const dest = downloadTargets().find((t) => t.id === target)
  if (!dest) throw new Error('Unknown download target')
  const filename = path.basename(file)
  if (!/\.gguf$/i.test(filename)) throw new Error('Only .gguf files can be downloaded')
  const targetPath = path.join(dest.dir, filename)

  const job = {
    id: uid(), repo, file, filename, target, dir: dest.dir, targetPath,
    status: 'downloading', bytes: 0, total: 0, speed: 0,
    startedAt: new Date().toISOString(), error: null,
    controller: new AbortController(),
  }
  jobs.set(job.id, job)
  emit('download', publicJob(job))

  const url = `${HF}/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}?download=true`

  ;(async () => {
    let closed = false
    const notify = () => { if (!closed) emit('download', publicJob(job)) }
    try {
      const res = await fetch(url, { signal: job.controller.signal })
      if (!res.ok) throw new Error(`Hugging Face ${res.status}`)
      job.total = Number(res.headers.get('content-length')) || 0
      await fs.promises.mkdir(dest.dir, { recursive: true })
      let lastBytes = 0
      let lastAt = Date.now()
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          job.bytes += chunk.length
          const now = Date.now()
          const elapsed = (now - lastAt) / 1000
          if (elapsed > 0.5) {
            job.speed = Math.max(0, (job.bytes - lastBytes) / elapsed)
            lastBytes = job.bytes
            lastAt = now
            notify()
          }
          cb(null, chunk)
        },
      })
      const ws = fs.createWriteStream(targetPath)
      await pipeline(Readable.fromWeb(res.body), counter, ws)
      job.status = 'complete'
      job.speed = 0
      job.bytes = job.total || job.bytes
    } catch (e) {
      if (job.controller.signal.aborted) { job.status = 'cancelled'; job.error = 'Cancelled' }
      else { job.status = 'error'; job.error = e.message }
      try { await fs.promises.unlink(targetPath) } catch { /* ignore */ }
    } finally {
      closed = true
      job.finishedAt = new Date().toISOString()
      notify()
      setTimeout(() => { if (jobs.size > 40) jobs.delete(job.id) }, 60000)
    }
  })()

  return publicJob(job)
}

const publicJob = ({ controller, _lastAt, startedAtMs, ...rest }) => rest
