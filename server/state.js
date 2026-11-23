import path from 'node:path'
import { DATA_DIR, ensureDataDir, readJson, writeJson, nowISO } from './lib.js'

const FILE = path.join(DATA_DIR, 'fordos-state.json')
const listeners = new Set()

let cache = null

export async function initState() {
  await ensureDataDir()
  cache = await readJson(FILE, null)
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emit(type, payload = {}) {
  for (const fn of listeners) {
    try { fn(type, payload) } catch { /* ignore listener errors */ }
  }
}

export async function getState() {
  if (!cache) cache = await readJson(FILE, null)
  return cache
}

export async function putState(data, expectedRev) {
  const current = await getState()
  if (expectedRev != null && current && current.rev !== expectedRev) {
    return { conflict: true, state: current }
  }
  cache = {
    rev: (current?.rev || 0) + 1,
    updatedAt: nowISO(),
    data,
  }
  await writeJson(FILE, cache)
  emit('state', { rev: cache.rev })
  return { conflict: false, state: cache }
}

/* Used by tools and scheduled agents: mutate the canonical data on the server. */
export async function mutateState(mutator) {
  const current = await getState()
  const data = JSON.parse(JSON.stringify(current?.data || { tasks: [], events: [], notes: [], projects: [], settings: {} }))
  const result = await mutator(data)
  cache = {
    rev: (current?.rev || 0) + 1,
    updatedAt: nowISO(),
    data,
  }
  await writeJson(FILE, cache)
  emit('state', { rev: cache.rev })
  return { result, state: cache }
}
