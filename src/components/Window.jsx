import React, { useLayoutEffect, useRef } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

const TOPBAR = 46
const DOCKBAR = 96
const clamp = (n, min, max) => Math.min(Math.max(n, min), max)
const reduced = () => document.documentElement.classList.contains('reduce-motion')
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

/* macOS-style genie: the window bends, narrows and slides into its dock icon. */
function genieOut(from, to) {
  const a = center(from)
  const b = center(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  return [
    { transform: 'translate(0px, 0px) scale(1, 1) skewX(0deg)', borderRadius: '16px', opacity: 1, offset: 0 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.55}px) scale(.55, .32) skewX(9deg)`, borderRadius: '22px', opacity: .85, offset: .45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.05, .02) skewX(-14deg)`, borderRadius: '50%', opacity: 0, offset: 1 },
  ]
}

function genieIn(from, to) {
  const a = center(from)
  const b = center(to)
  const dx = a.x - b.x
  const dy = a.y - b.y
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(.05, .02) skewX(-14deg)`, borderRadius: '50%', opacity: 0, offset: 0 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.55}px) scale(.55, .32) skewX(9deg)`, borderRadius: '22px', opacity: .85, offset: .45 },
    { transform: 'translate(0px, 0px) scale(1, 1) skewX(0deg)', borderRadius: '16px', opacity: 1, offset: 1 },
  ]
}

const closeFrames = [
  { transform: 'scale(1) translateY(0)', opacity: 1, filter: 'blur(0px)' },
  { transform: 'scale(.84) translateY(-10px)', opacity: 0, filter: 'blur(4px)' },
]

export default function Window({ app, win, onUpdate, onFocus, onClose, onMinimize, restoreFrom, onRestoreDone, children }) {
  const Icon = app.icon
  const dragRef = useRef(null)
  const sectionRef = useRef(null)

  /* Restore: grow out of the dock icon into the saved window position. */
  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return undefined
    if (!restoreFrom) return undefined
    if (reduced() || typeof el.animate !== 'function') { onRestoreDone?.(); return undefined }
    const to = el.getBoundingClientRect()
    const anim = el.animate(genieIn(restoreFrom, to), {
      duration: 460, easing: 'cubic-bezier(.18,.9,.22,1)', fill: 'both',
    })
    anim.onfinish = () => { anim.cancel(); onRestoreDone?.() }
    return () => anim.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreFrom])

  const flyOut = (target, kind, done) => {
    const el = sectionRef.current
    if (reduced() || !el || typeof el.animate !== 'function') { done(); return }
    const from = el.getBoundingClientRect()
    const to = target || { left: from.left + from.width / 2 - 20, top: from.top + from.height / 2 - 20, width: 40, height: 40 }
    const ghost = el.cloneNode(true)
    Object.assign(ghost.style, {
      position: 'fixed', left: `${from.left}px`, top: `${from.top}px`,
      width: `${from.width}px`, height: `${from.height}px`, margin: '0',
      zIndex: '9500', pointerEvents: 'none', animation: 'none',
    })
    document.body.appendChild(ghost)
    const frames = kind === 'minimize' ? genieOut(from, to) : closeFrames
    const anim = ghost.animate(frames, {
      duration: kind === 'minimize' ? 430 : 240,
      easing: kind === 'minimize' ? 'cubic-bezier(.35,.05,.25,1)' : 'ease-out',
      fill: 'forwards',
    })
    anim.onfinish = () => ghost.remove()
    done()
  }

  const dockRect = () => {
    const button = [...document.querySelectorAll('.dock button')].find((b) => b.getAttribute('aria-label') === app.title)
    return button?.getBoundingClientRect() || null
  }

  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button') || win.maximized) return
    onFocus()
    dragRef.current = { sx: e.clientX, sy: e.clientY, x: win.x, y: win.y }
    const move = (ev) => {
      const s = dragRef.current
      if (!s) return
      onUpdate({
        x: clamp(s.x + ev.clientX - s.sx, 0, window.innerWidth - 120),
        y: clamp(s.y + ev.clientY - s.sy, TOPBAR, window.innerHeight - DOCKBAR - 80),
      })
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startResize = (e) => {
    if (e.button !== 0 || win.maximized) return
    e.stopPropagation()
    onFocus()
    const s = { sx: e.clientX, sy: e.clientY, w: win.w, h: win.h }
    const move = (ev) => {
      onUpdate({
        w: clamp(s.w + ev.clientX - s.sx, 420, window.innerWidth - win.x - 12),
        h: clamp(s.h + ev.clientY - s.sy, 320, window.innerHeight - win.y - DOCKBAR + 12),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const toggleMaximize = () => {
    const el = sectionRef.current
    if (!reduced() && el?.animate) {
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)', offset: .45 }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' })
    }
    onUpdate({ maximized: !win.maximized })
  }

  if (win.minimized) return null

  return (
    <section
      ref={sectionRef}
      className={`window ${win.maximized ? 'is-maximized' : ''}`}
      style={win.maximized ? { zIndex: win.z } : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onPointerDown={onFocus}
      aria-label={app.title}
    >
      <header className="window-bar" onPointerDown={startDrag}>
        <div className="traffic">
          <button type="button" className="traffic-btn close" onClick={() => flyOut(null, 'close', onClose)} aria-label="Close window"><X size={11} strokeWidth={3} /></button>
          <button type="button" className="traffic-btn min" onClick={() => flyOut(dockRect(), 'minimize', onMinimize)} aria-label="Minimize window"><Minus size={11} strokeWidth={3} /></button>
          <button type="button" className="traffic-btn max" onClick={toggleMaximize} aria-label="Maximize window">
            {win.maximized ? <Maximize2 size={10} strokeWidth={3} /> : <Square size={10} strokeWidth={3} />}
          </button>
        </div>
        <div className="window-title">
          <Icon size={14} />
          <span>{app.title}</span>
        </div>
        <div className="window-bar-spacer" />
      </header>
      <div className="window-content">{children}</div>
      {!win.maximized && <div className="window-resize" onPointerDown={startResize} aria-hidden="true" />}
    </section>
  )
}
