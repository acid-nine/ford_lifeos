import React, { useEffect, useRef, useState } from 'react'
import { User, Palette, Image as ImageIcon, Database, Download, Upload, RotateCcw, Info, Check, MonitorSmartphone, Bot, Smartphone, Copy, KeyRound, Globe } from 'lucide-react'
import { Field } from '../components/Modal.jsx'
import { useData, useToast } from '../store.jsx'

const ACCENTS = [
  { color: '#8b7cff', name: 'Violet' },
  { color: '#57d9ff', name: 'Sky' },
  { color: '#4fd1c5', name: 'Teal' },
  { color: '#ffc66d', name: 'Amber' },
  { color: '#ff8a9b', name: 'Rose' },
  { color: '#a3e635', name: 'Lime' },
]
const WALLPAPERS = [
  { id: 'aurora', name: 'Aurora', colors: ['#8b7cff', '#57d9ff'] },
  { id: 'nebula', name: 'Nebula', colors: ['#ff6b9d', '#7c4dff'] },
  { id: 'sunset', name: 'Sunset', colors: ['#ff9a44', '#e1306c'] },
  { id: 'grid', name: 'Grid', colors: ['#4fd1c5', '#2b6cb0'] },
]

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="settings-section">
      <div className="settings-section-head"><span className="settings-icon"><Icon size={17} /></span><div><h3>{title}</h3><p>{description}</p></div></div>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}

export default function Settings({ onOpenApp }) {
  const { data, setSetting, resetData, importData } = useData()
  const toast = useToast()
  const fileRef = useRef(null)
  const [access, setAccess] = useState(null)
  const [copied, setCopied] = useState('')
  const s = data.settings

  useEffect(() => {
    const token = encodeURIComponent(localStorage.getItem('fordos.token') || '')
    fetch(`/api/access?token=${token}`).then((r) => r.json()).then(setAccess).catch(() => {})
  }, [])

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500) } catch { /* ignore */ }
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fordos-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Backup exported', '↓')
  }

  const onImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        importData(parsed)
        toast('Backup imported', '↑')
      } catch {
        toast('That file is not valid JSON', '!')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="app settings-app">
      <header className="settings-header">
        <span className="eyebrow"><MonitorSmartphone size={13} /> System preferences</span>
        <h1>Settings</h1>
        <p>Make FordOS feel like yours. Changes save automatically.</p>
      </header>

      <div className="settings-scroll">
        <Section icon={User} title="Profile" description="How the system greets you">
          <Field label="Your name"><input value={s.name} onChange={(e) => setSetting('name', e.target.value)} placeholder="Your name" /></Field>
        </Section>

        <Section icon={Palette} title="Accent color" description="Used across buttons, highlights and glows">
          <div className="accent-grid">
            {ACCENTS.map((a) => (
              <button type="button" key={a.color} className={`accent-option ${s.accent === a.color ? 'active' : ''}`} onClick={() => setSetting('accent', a.color)}>
                <span className="accent-swatch" style={{ background: a.color }}>{s.accent === a.color && <Check size={14} />}</span>
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section icon={ImageIcon} title="Wallpaper" description="Set the mood for your desktop">
          <div className="wallpaper-grid">
            {WALLPAPERS.map((w) => (
              <button type="button" key={w.id} className={`wallpaper-option ${s.wallpaper === w.id ? 'active' : ''}`} onClick={() => setSetting('wallpaper', w.id)}>
                <span className={`wallpaper-thumb wall-${w.id}`} style={{ '--w1': w.colors[0], '--w2': w.colors[1] }} />
                <span>{w.name}</span>
                {s.wallpaper === w.id && <Check size={13} className="wall-check" />}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Palette} title="Motion" description="Tone down animations if you prefer">
          <label className="switch-row">
            <span><strong>Reduce motion</strong><em>Minimize transitions and floating effects</em></span>
            <input type="checkbox" checked={s.reduceMotion} onChange={(e) => setSetting('reduceMotion', e.target.checked)} />
            <span className="switch" />
          </label>
        </Section>

        <Section icon={Database} title="Your data" description="Everything lives locally in this browser">
          <p className="settings-note">FordOS stores your tasks, events and notes in this browser's local storage. Export a backup regularly if you use it across devices.</p>
          <div className="settings-actions">
            <button type="button" className="btn ghost" onClick={exportData}><Download size={15} /> Export backup</button>
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}><Upload size={15} /> Import backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImport} hidden />
            <button type="button" className="btn danger ghost" onClick={() => { if (confirm('Reset all data back to the demo content? This cannot be undone.')) { resetData(); toast('Data reset to demo', '↺') } }}><RotateCcw size={15} /> Reset demo data</button>
          </div>
        </Section>

        <Section icon={Smartphone} title="Remote access" description="Open FordOS from your phone on the same Wi-Fi">
          <p className="settings-note">The server is reachable on your local network. Open one of these addresses on your phone and enter the access code below. For internet access, use a VPN or tunnel instead of port-forwarding this service.</p>
          <div className="remote-list">
            {access?.addresses?.map((a) => {
              const url = `http://${a.address}:${access.port}`
              return <div className="remote-row" key={a.address}><span><Globe size={13} /> {url} <em>{a.iface}</em></span><button type="button" className="btn ghost small" onClick={() => copy(url, a.address)}>{copied === a.address ? <Check size={13} /> : <Copy size={13} />} Copy</button></div>
            })}
            {!access?.addresses?.length && <div className="remote-row">No LAN address detected.</div>}
            <div className="remote-row code"><span><KeyRound size={13} /> Access code <strong>{access?.code || '—'}</strong></span><button type="button" className="btn ghost small" onClick={() => copy(access?.code || '', 'code')}>{copied === 'code' ? <Check size={13} /> : <Copy size={13} />} Copy</button></div>
          </div>
          <p className="settings-note">Exported backups, agents, briefs and shared files all live on this machine — nothing is uploaded anywhere.</p>
        </Section>

        <Section icon={Bot} title="AI & engines" description="Local inference, agents and automations">
          <p className="settings-note">FordOS discovers Ollama, llama.cpp, Hermes, OpenCode and any OpenAI-compatible endpoint through its local API service. Build tool-using agents and schedules in AI Studio.</p>
          <div className="settings-actions"><button type="button" className="btn ghost" onClick={() => onOpenApp?.('ai')}><Bot size={15} /> Open AI Studio</button></div>
        </Section>

        <Section icon={Info} title="About" description="The little OS that keeps it together">
          <div className="about-box">
            <div className="about-logo">F</div>
            <div><strong>FordOS</strong><span>Life operating system · v1.0.0</span></div>
          </div>
          <p className="settings-note">Built for focus, calm, and getting things done. Your data never leaves this machine.</p>
        </Section>
      </div>
    </div>
  )
}
