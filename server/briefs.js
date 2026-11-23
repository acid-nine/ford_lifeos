import path from 'node:path'
import { DATA_DIR, readJson, writeJson, uid, nowISO } from './lib.js'
import { emit } from './state.js'

const FILE = path.join(DATA_DIR, 'fordos-briefs.json')
let cache = []

export async function initBriefs() {
  const data = await readJson(FILE, [])
  cache = Array.isArray(data) ? data : []
}

export function listBriefs(limit = 60) {
  return cache.slice(0, limit)
}

export function getBrief(id) {
  return cache.find((b) => b.id === id) || null
}

export async function saveBrief(input) {
  const brief = {
    id: uid(),
    title: input.title || 'Untitled brief',
    body: input.body || '',
    agentId: input.agentId || null,
    agentName: input.agentName || 'Agent',
    runId: input.runId || null,
    prompt: input.prompt || '',
    createdAt: nowISO(),
  }
  cache = [brief, ...cache].slice(0, 200)
  await writeJson(FILE, cache)
  emit('brief', brief)
  return brief
}

export async function deleteBrief(id) {
  cache = cache.filter((b) => b.id !== id)
  await writeJson(FILE, cache)
  emit('brief', { deleted: id })
  return { ok: true }
}
