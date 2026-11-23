import { LayoutDashboard, CheckSquare, CalendarDays, FileText, Settings as SettingsIcon, Bot, Gauge } from 'lucide-react'
import Dashboard from './Dashboard.jsx'
import Tasks from './Tasks.jsx'
import Calendar from './Calendar.jsx'
import Notes from './Notes.jsx'
import Settings from './Settings.jsx'
import AIStudio from './AIStudio.jsx'
import VRAM from './VRAM.jsx'

export const APPS = [
  { id: 'dashboard', title: 'Overview', icon: LayoutDashboard, component: Dashboard, w: 920, h: 620 },
  { id: 'tasks', title: 'Tasks & Projects', icon: CheckSquare, component: Tasks, w: 1000, h: 660 },
  { id: 'calendar', title: 'Calendar', icon: CalendarDays, component: Calendar, w: 1100, h: 680 },
  { id: 'notes', title: 'Notes & Knowledge', icon: FileText, component: Notes, w: 1060, h: 660 },
  { id: 'ai', title: 'AI Studio', icon: Bot, component: AIStudio, w: 1060, h: 680 },
  { id: 'vram', title: 'VRAM Control', icon: Gauge, component: VRAM, w: 1040, h: 700 },
  { id: 'settings', title: 'Settings', icon: SettingsIcon, component: Settings, w: 560, h: 640 },
]

export const APP_MAP = Object.fromEntries(APPS.map((a) => [a.id, a]))
