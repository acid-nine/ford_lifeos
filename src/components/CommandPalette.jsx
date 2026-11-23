import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'

export default function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.group} ${c.hint || ''}`.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => { if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 10) } }, [open])
  useEffect(() => setActive(0), [query])

  if (!open) return null

  const run = (cmd) => { cmd?.run(); onClose() }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % Math.max(filtered.length, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[active]) }
    else if (e.key === 'Escape') onClose()
  }

  let lastGroup = null

  return (
    <div className="palette-scrim" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search apps, actions, notes…"
            aria-label="Command search"
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-empty">No results for “{query}”</div>}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup
            lastGroup = cmd.group
            const Icon = cmd.icon
            return (
              <React.Fragment key={cmd.id}>
                {showGroup && <div className="palette-group">{cmd.group}</div>}
                <button
                  type="button"
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(cmd)}
                >
                  <span className="palette-item-icon">{Icon && <Icon size={16} />}</span>
                  <span className="palette-item-label">{cmd.label}</span>
                  {cmd.hint && <span className="palette-item-hint">{cmd.hint}</span>}
                  {i === active && <CornerDownLeft size={14} className="palette-enter" />}
                </button>
              </React.Fragment>
            )
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span>FordOS command bar</span>
        </div>
      </div>
    </div>
  )
}
