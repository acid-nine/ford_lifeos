import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const config = JSON.parse(await fs.readFile(path.join(ROOT, 'server', 'config.json'), 'utf8'))

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
export const nowISO = () => new Date().toISOString()

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export async function fetchWithTimeout(url, options = {}, ms = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function getJson(url, ms = 4000) {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, ms)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/* Very small YAML reader for the handful of flat keys we need from Hermes config. */
export function simpleYaml(text) {
  const out = {}
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    const rawLine = raw.replace(/\s+#.*$/, '')
    const line = rawLine.trim()
    const indented = /^\s/.test(rawLine)
    if (!line || line.startsWith('#')) continue
    if (!indented) {
      const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
      if (top) {
        const [, key, value] = top
        if (value === '') { current = key; out[key] = {} }
        else { out[key] = value.replace(/^["']|["']$/g, ''); current = null }
      }
      continue
    }
    if (current) {
      const nested = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/)
      if (nested) out[current][nested[1]] = nested[2].replace(/^["']|["']$/g, '')
    }
  }
  return out
}

export function parseCron(expr) {
  // 5 fields: minute hour day-of-month month day-of-week. Supports *, */n, numbers, comma lists.
  const fields = String(expr || '').trim().split(/\s+/)
  if (fields.length !== 5) return null
  const limits = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
  const parsed = fields.map((f, i) => {
    const [lo, hi] = limits[i]
    if (f === '*') return { all: true, values: null }
    const step = f.match(/^\*\/(\d+)$/)
    if (step) return { all: false, values: new Set(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter((v) => v % Number(step[1]) === 0)) }
    const values = new Set()
    for (const part of f.split(',')) {
      const range = part.match(/^(\d+)(?:-(\d+))?$/)
      if (!range) return null
      const a = Number(range[1])
      const b = range[2] ? Number(range[2]) : a
      if (a < lo || b > hi) return null
      for (let v = a; v <= b; v++) values.add(v)
    }
    return { all: false, values }
  })
  if (parsed.some((p) => !p)) return null
  return (date) => {
    const vals = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()]
    if (vals[4] === 0) vals[4] = 7
    return parsed.every((p, i) => p.all || p.values.has(vals[i]))
  }
}
