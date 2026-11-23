import React, { useRef } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

const TOPBAR = 46
const DOCKBAR = 96
const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

export default function Window({ app, win, onUpdate, onFocus, onClose, onMinimize, children }) {
  const Icon = app.icon
  const dragRef = useRef(null)

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

  if (win.minimized) return null

  return (
    <section
      className={`window ${win.maximized ? 'is-maximized' : ''}`}
      style={win.maximized ? { zIndex: win.z } : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onPointerDown={onFocus}
      aria-label={app.title}
    >
      <header className="window-bar" onPointerDown={startDrag}>
        <div className="traffic">
          <button type="button" className="traffic-btn close" onClick={onClose} aria-label="Close window"><X size={11} strokeWidth={3} /></button>
          <button type="button" className="traffic-btn min" onClick={onMinimize} aria-label="Minimize window"><Minus size={11} strokeWidth={3} /></button>
          <button type="button" className="traffic-btn max" onClick={() => onUpdate({ maximized: !win.maximized })} aria-label="Maximize window">
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
