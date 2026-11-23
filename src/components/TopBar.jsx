import React, { useEffect, useState } from 'react'
import { Search, Settings, Command, ChevronDown, Wifi, BatteryFull, Volume2 } from 'lucide-react'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function TopBar({ name, onOpenApp, onCommand }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="brand" onClick={() => onOpenApp('dashboard')} aria-label="Open overview">
          <span className="brand-mark">F</span>
          <span className="brand-name">FordOS</span>
        </button>
        <span className="topbar-divider" />
        <nav className="topbar-nav">
          <button type="button" onClick={() => onOpenApp('dashboard')}>Overview</button>
          <button type="button" onClick={() => onOpenApp('tasks')}>Tasks</button>
          <button type="button" onClick={() => onOpenApp('calendar')}>Calendar</button>
          <button type="button" onClick={() => onOpenApp('notes')}>Notes</button>
          <button type="button" onClick={() => onOpenApp('ai')}>AI Studio</button>
          <button type="button" onClick={() => onOpenApp('vram')}>VRAM</button>
          <button type="button" onClick={() => onOpenApp('core')}>Core</button>
        </nav>
      </div>

      <button type="button" className="topbar-search" onClick={onCommand}>
        <Search size={14} />
        <span>Search or jump to…</span>
        <kbd><Command size={11} /> K</kbd>
      </button>

      <div className="topbar-right">
        <div className="status-icons" aria-hidden="true">
          <Wifi size={14} /><Volume2 size={14} /><BatteryFull size={16} />
        </div>
        <button type="button" className="clock" onClick={() => onOpenApp('calendar')} aria-label="Open calendar">
          <span className="clock-time">{time}</span>
          <span className="clock-date">{date}</span>
        </button>
        <button type="button" className="icon-btn" onClick={() => onOpenApp('settings')} aria-label="Open settings">
          <Settings size={17} />
        </button>
        <button type="button" className="avatar" onClick={() => onOpenApp('settings')} aria-label="Your profile">
          {(name || 'A').trim().charAt(0).toUpperCase()}
          <ChevronDown size={11} />
        </button>
      </div>
    </header>
  )
}
