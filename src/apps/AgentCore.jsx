import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import { Bot, Activity, Cpu, Terminal as TerminalIcon, Zap, Radio, ChevronRight, Circle, Eye, X, Play, AlertCircle } from 'lucide-react'
import { AGENT_SHAPES, SHAPE_ICONS, AGENT_COLORS, agentVisual } from '../lib/visuals.js'

/* ------------------------------------------------------------------
   TUNEABLE VISUAL CONSTANTS
   ------------------------------------------------------------------ */
export const BLOOM_STRENGTH = 1.45
export const PARTICLE_COUNT = 500
export const HUD_HUE = 190 // 190 = cyan, 38 = amber

const DUST_COUNT = 700
const MAX_LINKS = 1400
const LINK_DISTANCE = 0.44
const RENDER_SCALE = 0.7
const MAX_FPS = 30

const STATES = [
  { id: 'idle', label: 'Idle', color: '#00f0ff' },
  { id: 'thinking', label: 'Thinking', color: '#ffaa00' },
  { id: 'executing', label: 'Executing tool', color: '#4fd1c5' },
  { id: 'speaking', label: 'Speaking', color: '#ff7ad9' },
]

const api = async (path, options) => {
  const res = await fetch(`/api${path}`, options)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/* ------------------------------------------------------------------
   3D CORE
   ------------------------------------------------------------------ */
function CoreScene({ personality, state, agent, onStats }) {
  const mountRef = useRef(null)
  const refs = useRef({ personality, state, agent })
  refs.current = { personality, state, agent }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0.4, 6.4)

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      mount.innerHTML = '<div class="core-fallback">WebGL is unavailable in this browser.<br />The agent telemetry and terminal still work.</div>'
      return undefined
    }
    renderer.setPixelRatio(1)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    // Software renderers (SwiftShader/llvmpipe in remote browsers) can't handle a
    // full-resolution bloom pipeline, so fall back to a lighter core.
    let lowPower = false
    try {
      const gl = renderer.getContext()
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
      lowPower = /swiftshader|llvmpipe|software|basic render/i.test(String(name))
    } catch { /* ignore */ }
    const nodeCount = lowPower ? 180 : PARTICLE_COUNT
    const dustCount = lowPower ? 220 : DUST_COUNT
    const maxLinks = lowPower ? 300 : MAX_LINKS

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 3.4
    controls.maxDistance = 11
    controls.enablePan = false

    const disposables = []
    const track = (obj) => { disposables.push(obj); return obj }

    /* ---- neural core ---- */
    const core = new THREE.Group()
    scene.add(core)

    const nodeBase = new Float32Array(nodeCount * 3)
    for (let i = 0; i < nodeCount; i++) {
      const u = Math.random(), v = Math.random()
      const theta = u * Math.PI * 2
      const phi = Math.acos(2 * v - 1)
      const r = 0.45 + Math.cbrt(Math.random()) * 0.75
      nodeBase[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      nodeBase[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      nodeBase[i * 3 + 2] = r * Math.cos(phi)
    }
    const nodeGeo = track(new THREE.BufferGeometry())
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodeBase.slice(), 3))
    nodeGeo.setDrawRange(0, nodeCount)
    const nodeMat = track(new THREE.PointsMaterial({ size: 0.032, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    const nodePoints = new THREE.Points(nodeGeo, nodeMat)
    core.add(nodePoints)

    const linkPositions = new Float32Array(maxLinks * 6)
    const linkGeo = track(new THREE.BufferGeometry())
    linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3))
    linkGeo.setDrawRange(0, 0)
    const linkMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false }))
    const linkLines = new THREE.LineSegments(linkGeo, linkMat)
    core.add(linkLines)

    /* ---- orbital rings ---- */
    const rings = []
    for (let k = 0; k < 4; k++) {
      const radius = 1.5 + k * 0.4
      const segments = 96
      const verts = []
      for (let s = 0; s < segments; s++) {
        if (s % 14 >= 10) continue // dashed gaps
        const a1 = (s / segments) * Math.PI * 2
        const a2 = ((s + 1) / segments) * Math.PI * 2
        verts.push(Math.cos(a1) * radius, 0, Math.sin(a1) * radius)
        verts.push(Math.cos(a2) * radius, 0, Math.sin(a2) * radius)
      }
      const geo = track(new THREE.BufferGeometry())
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      const mat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.62 - k * 0.09, blending: THREE.AdditiveBlending, depthWrite: false }))
      const ring = new THREE.LineSegments(geo, mat)
      ring.rotation.x = 0.35 + k * 0.34
      ring.rotation.y = k * 0.55
      core.add(ring)
      rings.push({ mesh: ring, speed: (k % 2 ? -1 : 1) * (0.12 + k * 0.05) })
    }

    /* ---- per-agent core mesh (rebuilt when the selected agent changes) ---- */
    let coreMesh = null
    let currentShape = null
    const buildCoreMesh = (shape) => {
      if (coreMesh) {
        core.remove(coreMesh)
        coreMesh.geometry.dispose()
        coreMesh.material.dispose()
        coreMesh = null
      }
      let geo = null
      switch (shape) {
        case 'icosahedron': geo = new THREE.IcosahedronGeometry(0.82, 1); break
        case 'dodecahedron': geo = new THREE.DodecahedronGeometry(0.85, 0); break
        case 'octahedron': geo = new THREE.OctahedronGeometry(0.92, 0); break
        case 'torusKnot': geo = new THREE.TorusKnotGeometry(0.58, 0.17, 100, 10); break
        case 'sphere': geo = new THREE.SphereGeometry(0.85, 20, 14); break
        case 'helix': geo = new THREE.TorusGeometry(0.72, 0.045, 8, 90); break
        default: break
      }
      if (!geo) return
      const mat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
      coreMesh = new THREE.Mesh(geo, mat)
      core.add(coreMesh)
    }

    /* ---- outer dust ---- */
    const dustBase = new Float32Array(dustCount * 3)
    for (let i = 0; i < dustCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 2.9 + Math.random() * 1.5
      dustBase[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      dustBase[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      dustBase[i * 3 + 2] = r * Math.cos(phi)
    }
    const dustGeo = track(new THREE.BufferGeometry())
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3))
    dustGeo.setDrawRange(0, dustCount)
    const dustMat = track(new THREE.PointsMaterial({ size: 0.017, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
    scene.add(new THREE.Points(dustGeo, dustMat))

    /* ---- orbiting sub-agent nodes ---- */
    const subGeo = track(new THREE.SphereGeometry(0.065, 12, 12))
    const subs = []
    for (let i = 0; i < 6; i++) {
      const mat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }))
      const mesh = new THREE.Mesh(subGeo, mat)
      scene.add(mesh)
      subs.push(mesh)
    }

    let composer = null
    let bloom = null
    if (!lowPower) {
      composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, camera))
      bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_STRENGTH, 0.55, 0.16)
      composer.addPass(bloom)
      composer.addPass(new OutputPass())
    }

    const noise = new ImprovedNoise()
    const cyan = new THREE.Color().setHSL(HUD_HUE / 360, 1, 0.6)
    const amber = new THREE.Color(0xffaa00)
    let frame = 0
    let raf = 0
    let last = performance.now()
    let fpsFrames = 0
    let fpsTime = last
    let currentLinks = 0

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(Math.max(1, Math.round(w * RENDER_SCALE)), Math.max(1, Math.round(h * RENDER_SCALE)), false)
      composer?.setSize(Math.max(1, Math.round(w * RENDER_SCALE)), Math.max(1, Math.round(h * RENDER_SCALE)))
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const animate = (now) => {
      raf = requestAnimationFrame(animate)
      if (now - last < (1000 / MAX_FPS) - 2) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      frame++
      fpsFrames++
      if (now - fpsTime > 400) {
        onStats?.({ fps: Math.round((fpsFrames * 1000) / (now - fpsTime)), nodes: nodeCount, links: currentLinks, dust: dustCount })
        fpsFrames = 0
        fpsTime = now
      }

      const p = refs.current
      const isUltron = p.personality === 'ultron'
      const thinking = p.state === 'thinking'
      const executing = p.state === 'executing'
      const speaking = p.state === 'speaking'
      const visual = agentVisual(p.agent)
      const identity = new THREE.Color().setHSL((Number(visual.hue) || 190) / 360, 0.9, 0.6)
      const color = identity.clone()
      if (thinking) color.lerp(amber, 0.5)
      if (executing) color.lerp(cyan, 0.35)
      if (speaking) color.lerp(new THREE.Color(0xff7ad9), 0.3)
      const speed = (thinking ? 3.1 : executing ? 2 : speaking ? 1.5 : 1) * (Number(visual.speed) || 1) * (isUltron ? 1.45 : 1)

      const shape = visual.shape || 'nebula'
      if (shape !== currentShape) { buildCoreMesh(shape); currentShape = shape }
      rings.forEach((r, i) => { r.mesh.visible = i < (Number(visual.rings) || 4) })
      if (coreMesh) {
        coreMesh.material.color.copy(color)
        coreMesh.rotation.y -= dt * 0.3 * speed
        coreMesh.rotation.x += dt * 0.12 * speed
        coreMesh.scale.setScalar(speaking ? 1 + Math.sin(now * 0.01) * 0.09 : 1)
      }

      nodeMat.color.copy(color)
      linkMat.color.copy(color)
      dustMat.color.copy(color)
      subs.forEach((s) => s.material.color.copy(color))
      rings.forEach((r) => r.mesh.material.color.copy(color))
      if (bloom) bloom.strength = BLOOM_STRENGTH * (speaking ? 1.15 + Math.sin(now * 0.012) * 0.22 : thinking ? 1.12 : 1)

      // rotation: smooth harmonic (JARVIS) vs twitchy (ULTRON)
      const jitter = isUltron ? (Math.random() - 0.5) * 0.02 : 0
      core.rotation.y += dt * 0.13 * speed + jitter
      core.rotation.x += dt * 0.04 * speed
      rings.forEach((r, i) => {
        r.mesh.rotation.z += dt * r.speed * speed + (isUltron ? (Math.random() - 0.5) * 0.012 : 0)
        if (speaking) r.mesh.scale.setScalar(1 + Math.sin(now * 0.009 + i) * 0.025)
        else r.mesh.scale.setScalar(1)
      })

      // speaking waveform + neural flash
      const pos = nodeGeo.attributes.position.array
      for (let i = 0; i < nodeCount; i++) {
        const ix = i * 3
        const f = speaking ? 1 + Math.sin(now * 0.008 + i * 0.28) * 0.16 : (thinking && Math.random() < 0.006 ? 1.12 : 1)
        pos[ix] = nodeBase[ix] * f
        pos[ix + 1] = nodeBase[ix + 1] * f
        pos[ix + 2] = nodeBase[ix + 2] * f
      }
      nodeGeo.attributes.position.needsUpdate = true

      // dynamic neural links (throttled)
      if (frame % 6 === 0) {
        let count = 0
        const thresholdSq = LINK_DISTANCE * LINK_DISTANCE
        for (let i = 0; i < nodeCount && count < maxLinks; i++) {
          const ix = i * 3
          for (let j = i + 1; j < nodeCount && count < maxLinks; j++) {
            const jx = j * 3
            const dx = nodeBase[ix] - nodeBase[jx]
            const dy = nodeBase[ix + 1] - nodeBase[jx + 1]
            const dz = nodeBase[ix + 2] - nodeBase[jx + 2]
            if (dx * dx + dy * dy + dz * dz > thresholdSq) continue
            const o = count * 6
            linkPositions[o] = pos[ix]; linkPositions[o + 1] = pos[ix + 1]; linkPositions[o + 2] = pos[ix + 2]
            linkPositions[o + 3] = pos[jx]; linkPositions[o + 4] = pos[jx + 1]; linkPositions[o + 5] = pos[jx + 2]
            count++
          }
        }
        currentLinks = count
        linkGeo.setDrawRange(0, count * 2)
        linkGeo.attributes.position.needsUpdate = true
      }

      // noise-driven dust
      if (frame % 3 === 0) {
        const dp = dustGeo.attributes.position.array
        const t = now * 0.00012
        for (let i = 0; i < dustCount; i++) {
          const ix = i * 3
          const n = noise.noise(dustBase[ix] * 0.5 + t, dustBase[ix + 1] * 0.5, dustBase[ix + 2] * 0.5 + t)
          dp[ix] = dustBase[ix] + n * 0.12
          dp[ix + 1] = dustBase[ix + 1] + n * 0.22
          dp[ix + 2] = dustBase[ix + 2] + n * 0.12
        }
        dustGeo.attributes.position.needsUpdate = true
      }

      // sub-agent nodes
      const toolCount = Math.min(Math.max(p.agent?.tools?.length || 3, 1), 6)
      subs.forEach((s, i) => {
        s.visible = executing || (i < toolCount && (p.state === 'idle' || thinking))
        if (!s.visible) return
        const angle = now * 0.0006 * (1 + i * 0.08) + (i / toolCount) * Math.PI * 2
        const radius = 1.85 + (i % 3) * 0.28
        s.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.7 + i) * 0.45, Math.sin(angle) * radius)
        s.scale.setScalar(executing ? 1.3 + Math.sin(now * 0.01 + i) * 0.25 : 1)
      })

      controls.update()
      if (composer) composer.render()
      else renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      disposables.forEach((d) => d.dispose?.())
      coreMesh?.geometry.dispose()
      coreMesh?.material.dispose()
      composer?.passes?.forEach((p) => p.dispose?.())
      composer.dispose?.()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="core-canvas" ref={mountRef} />
}

/* ------------------------------------------------------------------
   MAIN APP
   ------------------------------------------------------------------ */
export default function AgentCore() {
  const [agents, setAgents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [personality, setPersonality] = useState('ultron')
  const [state, setState] = useState('idle')
  const [stats, setStats] = useState({ fps: 0, nodes: PARTICLE_COUNT, links: 0, dust: DUST_COUNT })
  const [vram, setVram] = useState(null)
  const [runs, setRuns] = useState([])
  const [lines, setLines] = useState([{ type: 'sys', text: 'FordOS Agent Core online. Type "help" for commands.' }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeRun, setActiveRun] = useState(null)
  const [watching, setWatching] = useState(false)
  const termRef = useRef(null)
  const feedRef = useRef(null)
  const stateTimer = useRef(null)

  const agent = agents.find((a) => a.id === selectedId) || agents[0] || null

  const load = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([api('/agents'), api('/runs?limit=12')])
      setAgents(a)
      setRuns(r)
      if (!selectedId && a.length) setSelectedId(a[0].id)
    } catch { /* API offline */ }
  }, [selectedId])

  useEffect(() => {
    load()
    const poll = setInterval(async () => {
      load()
      try { setVram(await api('/vram/state')) } catch { /* ignore */ }
    }, 3000)
    const source = new EventSource('/api/events')
    source.addEventListener('run', (e) => {
      try {
        const run = JSON.parse(e.data)
        setRuns((rs) => [run, ...rs.filter((r) => r.id !== run.id)].slice(0, 12))
        setActiveRun(run)
        if (run.status === 'running') {
          setState(run.steps?.some((s) => s.role === 'tool') ? 'executing' : 'thinking')
        } else {
          setState('speaking')
          clearTimeout(stateTimer.current)
          stateTimer.current = setTimeout(() => setState('idle'), 3500)
        }
      } catch { /* ignore */ }
    })
    return () => { clearInterval(poll); source.close(); clearTimeout(stateTimer.current) }
  }, [load])

  useEffect(() => { termRef.current?.scrollTo(0, termRef.current.scrollHeight) }, [lines])
  useEffect(() => { feedRef.current?.scrollTo(0, feedRef.current.scrollHeight) }, [activeRun?.steps?.length, activeRun?.output])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setWatching(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const push = (text, type = 'out') => setLines((l) => [...l.slice(-80), { type, text }])

  const runAgent = async (a) => {
    if (!a) { push('No agent selected.', 'err'); return }
    setState('thinking')
    setBusy(true)
    push(`Executing agent: ${a.name}`, 'sys')
    try {
      const run = await post(`/agents/${a.id}/run`, {})
      push(`${run.status === 'error' ? 'ERROR' : 'DONE'} — ${run.output?.slice(0, 220) || run.error}`, run.status === 'error' ? 'err' : 'ok')
      setState('speaking')
      clearTimeout(stateTimer.current)
      stateTimer.current = setTimeout(() => setState('idle'), 3500)
      load()
    } catch (e) { push(`ERROR ${e.message}`, 'err'); setState('idle') }
    finally { setBusy(false) }
  }

  const setVisual = async (patch) => {
    if (!agent) return
    try {
      await post('/agents', { ...agent, visual: { ...agentVisual(agent), ...patch } })
      load()
    } catch (e) { push(`Visual update failed: ${e.message}`, 'err') }
  }

  const command = async (e) => {
    e.preventDefault()
    const raw = input.trim()
    if (!raw) return
    setInput('')
    push(`> ${raw}`, 'cmd')
    const [verb, ...rest] = raw.split(/\s+/)
    const arg = rest.join(' ')
    switch (verb.toLowerCase()) {
      case 'help':
        push('Commands: help, agents, focus <name>, run <name>, state <idle|thinking|executing|speaking>, mode <jarvis|ultron>, status, clear', 'sys'); break
      case 'agents':
        agents.forEach((a) => push(`  ${a.name} — ${a.model} [${a.tools?.length || 0} tools]`, 'out')); break
      case 'focus': {
        const found = agents.find((a) => a.name.toLowerCase().includes(arg.toLowerCase()))
        if (found) { setSelectedId(found.id); push(`Focused ${found.name}`, 'ok') } else push('Agent not found.', 'err')
        break
      }
      case 'run': {
        const found = agents.find((a) => a.name.toLowerCase().includes(arg.toLowerCase())) || agent
        await runAgent(found)
        break
      }
      case 'state': {
        const found = STATES.find((s) => s.id === arg.toLowerCase())
        if (found) { setState(found.id); push(`State: ${found.label}`, 'ok') } else push('Unknown state.', 'err')
        break
      }
      case 'mode': {
        const m = arg.toLowerCase()
        if (m === 'jarvis' || m === 'ultron') { setPersonality(m); push(`Personality: ${m.toUpperCase()}`, 'ok') } else push('Use jarvis or ultron.', 'err')
        break
      }
      case 'watch':
        setWatching(true); push('Watch mode engaged. Press ESC or click CLOSE WATCH to exit.', 'sys'); break
      case 'status':
        push(`Core=${personality.toUpperCase()} State=${state.toUpperCase()} Agent=${agent?.name || 'none'} FPS=${stats.fps} Links=${stats.links}`, 'out'); break
      case 'clear': setLines([]); break
      default: push(`Unknown command: ${verb}`, 'err')
    }
  }

  const usedMib = vram?.gpu?.used_mib || 0
  const totalMib = vram?.gpu?.total_mib || 1
  const vramPct = Math.round((usedMib / totalMib) * 100)
  const tokS = vram?.tokens?.now?.total ?? 0
  const stateInfo = STATES.find((s) => s.id === state) || STATES[0]
  const selectedVisual = agentVisual(agent)
  const watchRun = activeRun || runs[0] || null
  const watchAgentName = watchRun?.agentName || agent?.name || 'Agent'
  const watchElapsed = watchRun
    ? Math.max(0, Math.round(((watchRun.endedAt ? new Date(watchRun.endedAt) : new Date()) - new Date(watchRun.startedAt)) / 1000))
    : 0

  return (
    <div className={`app core-app ${watching ? 'watching' : ''}`}>
      <aside className="core-panel core-left">
        <div className="core-panel-title"><Bot size={15} /> AGENT ROSTER <span>{agents.length}</span></div>
        <div className="core-agent-list">
          {agents.length === 0 && <div className="empty-mini">No agents. Create one in AI Studio.</div>}
          {agents.map((a) => {
            const v = agentVisual(a)
            const VIcon = SHAPE_ICONS[v.shape] || Bot
            return (
              <button type="button" key={a.id} className={`core-agent ${agent?.id === a.id ? 'active' : ''}`} onClick={() => setSelectedId(a.id)}>
                <span className="core-agent-shape" style={{ color: `hsl(${v.hue} 90% 68%)`, background: `hsla(${v.hue} 90% 60% / .14)`, borderColor: `hsla(${v.hue} 90% 60% / .35)` }}><VIcon size={13} /></span>
                <span><strong>{a.name}</strong><em>{v.shape} · {a.model || 'default'}</em></span>
                {activeRun?.agentId === a.id && activeRun.status === 'running' && <span className="core-live-dot" />}
                <ChevronRight size={13} />
              </button>
            )
          })}
        </div>
        {agent && (
          <div className="core-agent-detail">
            <span className="eyebrow">Selected core</span>
            <h3>{agent.name}</h3>
            <p>{agent.description || 'No description'}</p>
            <div className="core-chip-row">
              <span><Cpu size={11} /> {agent.engineId}</span>
              <span><Zap size={11} /> {agent.tools?.length || 0} tools</span>
            </div>
            <div className="core-visual-editor">
              <span className="eyebrow">Visual identity</span>
              <div className="core-visual-shapes">
                {AGENT_SHAPES.map((shape) => {
                  const SIcon = SHAPE_ICONS[shape]
                  return <button type="button" key={shape} title={shape} className={selectedVisual.shape === shape ? 'active' : ''} onClick={() => setVisual({ shape })}><SIcon size={14} /></button>
                })}
              </div>
              <div className="core-visual-colors">
                {AGENT_COLORS.map((hue) => <button type="button" key={hue} style={{ background: `hsl(${hue} 90% 60%)` }} className={selectedVisual.hue === hue ? 'active' : ''} onClick={() => setVisual({ hue })} aria-label={`Hue ${hue}`} />)}
              </div>
            </div>
            <button type="button" className="btn primary full" disabled={busy} onClick={() => runAgent(agent)}><Radio size={14} /> Run agent</button>
            {runs.length > 0 && <button type="button" className="btn ghost full" onClick={() => setWatching(true)}><Eye size={14} /> Watch last run</button>}
          </div>
        )}
      </aside>

      <main className="core-center">
        <div className="core-topbar">
          <div><span className="eyebrow"><Activity size={12} /> Neural interface</span><h1>{watching ? `${watchAgentName} · live run` : 'Agent Core'}</h1></div>
          <div className="core-hud-controls">
            <div className="core-mode-switch">
              {['jarvis', 'ultron'].map((m) => <button type="button" key={m} className={personality === m ? 'active' : ''} onClick={() => setPersonality(m)}>{m.toUpperCase()}</button>)}
            </div>
            <div className="core-state-switch">
              {STATES.map((s) => <button type="button" key={s.id} className={state === s.id ? 'active' : ''} style={{ '--state-color': s.color }} onClick={() => setState(s.id)}>{s.label}</button>)}
            </div>
          </div>
        </div>

        <div className="core-stage">
          <CoreScene personality={personality} state={state} agent={agent} onStats={setStats} />
          <div className="hud-bracket tl" /><div className="hud-bracket tr" /><div className="hud-bracket bl" /><div className="hud-bracket br" />
          <div className="core-state-label" style={{ color: stateInfo.color }}><span className="core-pulse" style={{ background: stateInfo.color }} />{stateInfo.label.toUpperCase()}</div>
          {activeRun?.status === 'running' && (
            <div className="core-running-banner">
              <span className="core-pulse" style={{ background: stateInfo.color }} />
              <span>{activeRun.agentName} is running</span>
              <button type="button" onClick={() => setWatching(true)}><Eye size={12} /> Watch live</button>
            </div>
          )}
          <div className="core-stage-foot">
            <span>FPS {stats.fps}</span><span>NODES {stats.nodes}</span><span>LINKS {stats.links}</span><span>DUST {stats.dust}</span>
            <span className="spacer" /><span>{selectedVisual.shape.toUpperCase()} · HUE {selectedVisual.hue}</span>
          </div>
        </div>

        <div className="core-telemetry">
          <div className="core-metric"><span>VRAM</span><strong>{usedMib ? `${(usedMib / 1024).toFixed(1)} / ${(totalMib / 1024).toFixed(1)} GB` : '—'}</strong><div className="mini-bar"><i style={{ width: `${vramPct}%` }} /></div></div>
          <div className="core-metric"><span>TOKENS/S</span><strong>{tokS || '—'}</strong><em>peak {vram?.tokens?.peak ?? '—'}</em></div>
          <div className="core-metric"><span>BLOOM</span><strong>{BLOOM_STRENGTH.toFixed(2)}</strong><em>radius 0.55</em></div>
          <div className="core-metric"><span>HUD HUE</span><strong>{HUD_HUE}°</strong><em>particles {PARTICLE_COUNT}</em></div>
        </div>
      </main>

      {watching && (
        <aside className="core-watch-feed">
          <header>
            <div><span className="eyebrow">Live run feed</span><h2>{watchAgentName}</h2></div>
            <button type="button" className="icon-btn" onClick={() => setWatching(false)} aria-label="Close watch mode"><X size={16} /></button>
          </header>
          <div className="core-watch-status">
            <span className={`status-badge ${watchRun?.status === 'success' ? 'online' : watchRun?.status === 'running' ? '' : 'offline'}`}>{watchRun?.status || 'idle'}</span>
            <span>{watchRun?.steps?.length || 0} steps</span>
            <span>{watchElapsed}s</span>
          </div>
          {watchRun?.prompt && <div className="core-watch-prompt"><strong>PROMPT</strong><p>{watchRun.prompt}</p></div>}
          <div className="core-watch-steps" ref={feedRef}>
            {!watchRun?.steps?.length && <div className="empty-mini">Waiting for the first step…</div>}
            {watchRun?.steps?.map((s, i) => (
              <div className={`core-step ${s.role}`} key={i}>
                <span className="core-step-index">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{s.role === 'tool' ? `TOOL · ${s.content?.tool || 'call'}` : s.role === 'stream' ? 'STREAMING' : 'ASSISTANT'}</strong>
                  <pre>{typeof s.content === 'string' ? s.content : JSON.stringify(s.content, null, 2)}</pre>
                </div>
              </div>
            ))}
          </div>
          {watchRun?.output && <div className="core-watch-output"><strong>RESULT</strong><p>{watchRun.output}</p></div>}
          {watchRun?.error && <div className="run-error"><AlertCircle size={13} /> {String(watchRun.error)}</div>}
        </aside>
      )}

      <aside className="core-panel core-right">
        <div className="core-panel-title"><TerminalIcon size={15} /> LIVE TELEMETRY</div>
        <div className="core-tool-list">
          <span className="eyebrow">Active tools</span>
          {(agent?.tools || []).length === 0 && <div className="empty-mini">No tools bound to this agent.</div>}
          {(agent?.tools || []).map((t) => <div className="core-tool" key={t}><Circle size={8} fill="currentColor" /> {t}</div>)}
        </div>
        <div className="core-run-list">
          <span className="eyebrow">Recent runs</span>
          {runs.slice(0, 8).map((r) => (
            <div className={`core-run ${r.status}`} key={r.id} onClick={() => { setActiveRun(r); setWatching(true) }}>
              <span className={`model-dot ${r.status === 'success' ? 'running' : ''}`} />
              <div><strong>{r.agentName}</strong><em>{r.status} · {r.trigger} · watch</em></div>
            </div>
          ))}
          {runs.length === 0 && <div className="empty-mini">No agent runs yet.</div>}
        </div>
      </aside>

      <form className="core-terminal" onSubmit={command}>
        <span className="core-terminal-prompt">fordos@core:~$</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a command — help, run <agent>, watch, mode jarvis, state thinking…" spellCheck="false" />
        <button type="submit" className="btn primary small"><ChevronRight size={14} /> Send</button>
        <div className="core-terminal-output" ref={termRef}>
          {lines.map((l, i) => <div key={i} className={`term-${l.type}`}>{l.text}</div>)}
        </div>
      </form>
    </div>
  )
}
