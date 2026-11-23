import path from 'node:path'
import { config, DATA_DIR, fetchWithTimeout, readJson, writeJson } from './lib.js'

const FILE = path.join(DATA_DIR, 'google.json')

export async function googleSettings() {
  return { ...(config.google || {}), ...(await readJson(FILE, {})) }
}

export async function saveGoogleSettings(patch) {
  const current = await googleSettings()
  const next = {
    webAppUrl: String(patch.webAppUrl ?? current.webAppUrl ?? '').trim(),
    secret: String(patch.secret ?? current.secret ?? ''),
    autoMinutes: Number(patch.autoMinutes ?? current.autoMinutes ?? 0),
  }
  await writeJson(FILE, next)
  return { webAppUrl: next.webAppUrl, autoMinutes: next.autoMinutes, configured: !!(next.webAppUrl && next.secret) }
}

async function call(action, extra = {}) {
  const s = await googleSettings()
  if (!s.webAppUrl || !s.secret) throw new Error('Google bridge is not configured')
  if (!/^https:\/\/script\.google\.com\//i.test(s.webAppUrl)) throw new Error('Web app URL must be a script.google.com URL')
  const res = await fetchWithTimeout(s.webAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: s.secret, action, ...extra }),
  }, 30000)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`Bridge returned invalid JSON (${res.status})`) }
  if (!res.ok || !data.ok) throw new Error(data.error || `Bridge error ${res.status}`)
  return data
}

export const googlePing = () => call('ping')
export const googleList = async () => (await call('list')).files || []
export const googleDelete = (name) => call('delete', { name })

export async function googleUpload(name, content) {
  return call('upload', { name, contentBase64: Buffer.from(content, 'utf8').toString('base64') })
}

export async function googleDownload(name) {
  const data = await call('download', { name })
  return Buffer.from(data.contentBase64 || '', 'base64').toString('utf8')
}
