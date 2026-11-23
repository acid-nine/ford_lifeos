import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, MapPin, CalendarDays } from 'lucide-react'
import Modal, { Field } from '../components/Modal.jsx'
import { useData, useToast, todayISO } from '../store.jsx'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COLORS = ['#8b7cff', '#57d9ff', '#4fd1c5', '#ffc66d', '#ff8a9b', '#a0aec0']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromISO = (iso) => new Date(`${iso}T12:00:00`)

function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const emptyEvent = (date) => ({ title: '', date, start: '09:00', end: '10:00', color: '#8b7cff', notes: '' })

function EventModal({ event, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => event ? { ...event } : emptyEvent(todayISO()))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const submit = (e) => { e.preventDefault(); if (form.title.trim()) onSave({ ...form, title: form.title.trim() }) }

  return (
    <Modal title={event ? 'Edit event' : 'New event'} subtitle="Give it a time and a place" onClose={onClose}
      footer={<>
        {event && <button type="button" className="btn danger ghost" onClick={onDelete}><Trash2 size={15} /> Delete</button>}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary" form="event-form" disabled={!form.title.trim()}>{event ? 'Save changes' : 'Add event'}</button>
      </>}>
      <form id="event-form" onSubmit={submit} className="form-stack">
        <Field label="Title"><input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="What's happening?" /></Field>
        <Field label="Date"><input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <div className="form-row">
          <Field label="Starts"><input type="time" value={form.start} onChange={(e) => set('start', e.target.value)} /></Field>
          <Field label="Ends"><input type="time" value={form.end} onChange={(e) => set('end', e.target.value)} /></Field>
        </div>
        <Field label="Color">
          <div className="color-picker">
            {COLORS.map((c) => <button type="button" key={c} className={`color-swatch ${form.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set('color', c)} aria-label={`Color ${c}`} />)}
          </div>
        </Field>
        <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Add a detail…" /></Field>
      </form>
    </Modal>
  )
}

export default function Calendar({ initialDate = null }) {
  const { data, addEvent, updateEvent, deleteEvent } = useData()
  const toast = useToast()
  const today = todayISO()
  const [selected, setSelected] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today)
  const [cursor, setCursor] = useState(() => { const d = fromISO(selected); return { y: d.getFullYear(), m: d.getMonth() } })
  const [editing, setEditing] = useState(null)

  const cells = useMemo(() => monthCells(cursor.y, cursor.m), [cursor])
  const events = data.events
  const selectedEvents = events.filter((e) => e.date === selected).sort((a, b) => a.start.localeCompare(b.start))

  const changeMonth = (delta) => setCursor(({ y, m }) => {
    const d = new Date(y, m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const goToday = () => {
    const d = fromISO(today)
    setSelected(today)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  const pickDay = (d) => {
    setSelected(toISO(d))
    if (d.getMonth() !== cursor.m || d.getFullYear() !== cursor.y) setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }

  useEffect(() => {
    const onCreate = (e) => { if (e.detail === 'event') { e.preventDefault(); setEditing(emptyEvent(selected)) } }
    const onToday = (e) => { e.preventDefault(); goToday() }
    window.addEventListener('fordos:create', onCreate)
    window.addEventListener('fordos:today', onToday)
    return () => {
      window.removeEventListener('fordos:create', onCreate)
      window.removeEventListener('fordos:today', onToday)
    }
  })

  const save = (form) => {
    if (editing?.id) { updateEvent(editing.id, form); toast('Event updated', '✎') }
    else { addEvent(form); toast('Event added', '✓') }
    setEditing(null)
  }

  const miniMonthLabel = `${MONTHS[cursor.m]} ${cursor.y}`

  return (
    <div className="app calendar-app">
      <aside className="app-sidebar cal-sidebar">
        <div className="mini-cal">
          <div className="mini-cal-head">
            <strong>{miniMonthLabel}</strong>
            <div><button type="button" className="icon-btn small" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button><button type="button" className="icon-btn small" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button></div>
          </div>
          <div className="mini-grid">
            {WEEKDAYS.map((w) => <span key={w} className="mini-dow">{w[0]}</span>)}
            {cells.map((d) => {
              const iso = toISO(d)
              return <button type="button" key={iso} className={`mini-day ${d.getMonth() !== cursor.m ? 'outside' : ''} ${iso === selected ? 'selected' : ''} ${iso === today ? 'today' : ''} ${events.some((e) => e.date === iso) ? 'has-event' : ''}`} onClick={() => pickDay(d)}>{d.getDate()}</button>
            })}
          </div>
        </div>
        <button type="button" className="btn ghost full" onClick={goToday}><CalendarDays size={15} /> Jump to today</button>
        <button type="button" className="btn primary full" onClick={() => setEditing(emptyEvent(selected))}><Plus size={15} /> New event</button>

        <div className="sidebar-label with-gap">Upcoming</div>
        <div className="upcoming-list">
          {events.filter((e) => e.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 6).map((e) => (
            <button type="button" key={e.id} className="upcoming-item" onClick={() => { setSelected(e.date); const d = fromISO(e.date); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }}>
              <i style={{ background: e.color }} />
              <span><strong>{e.title}</strong><em>{e.date === today ? 'Today' : e.date} · {e.start}</em></span>
            </button>
          ))}
        </div>
      </aside>

      <main className="app-main cal-main">
        <header className="app-toolbar">
          <div>
            <h1>{MONTHS[cursor.m]} {cursor.y}</h1>
            <p>{events.filter((e) => e.date.slice(0, 7) === `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`).length} events this month</p>
          </div>
          <div className="toolbar-actions">
            <div className="month-nav">
              <button type="button" className="icon-btn" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
              <button type="button" className="btn ghost" onClick={goToday}>Today</button>
              <button type="button" className="icon-btn" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
            </div>
          </div>
        </header>

        <div className="cal-weekdays">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="cal-grid">
          {cells.map((d) => {
            const iso = toISO(d)
            const dayEvents = events.filter((e) => e.date === iso).sort((a, b) => a.start.localeCompare(b.start))
            return (
              <div key={iso} className={`cal-cell ${d.getMonth() !== cursor.m ? 'outside' : ''} ${iso === selected ? 'selected' : ''} ${iso === today ? 'today' : ''}`} onClick={() => setSelected(iso)} onDoubleClick={() => setEditing(emptyEvent(iso))}>
                <span className="cal-cell-num">{d.getDate()}</span>
                <div className="cal-cell-events">
                  {dayEvents.slice(0, 3).map((e) => (
                    <button type="button" key={e.id} className="cal-event" style={{ '--event-color': e.color }} onClick={(ev) => { ev.stopPropagation(); setEditing(e) }}>
                      <i /> <span>{e.start} {e.title}</span>
                    </button>
                  ))}
                  {dayEvents.length > 3 && <span className="cal-more">+{dayEvents.length - 3} more</span>}
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <aside className="agenda-panel">
        <header>
          <span className="eyebrow">Agenda</span>
          <h2>{fromISO(selected).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          <button type="button" className="btn primary full" onClick={() => setEditing(emptyEvent(selected))}><Plus size={15} /> Add event</button>
        </header>
        <div className="agenda-list">
          {selectedEvents.length === 0 && <div className="empty-mini">Nothing planned. A rare gift.</div>}
          {selectedEvents.map((e) => (
            <div className="agenda-item" key={e.id} onClick={() => setEditing(e)}>
              <span className="agenda-color" style={{ background: e.color }} />
              <div>
                <strong>{e.title}</strong>
                <span className="agenda-time"><Clock size={12} /> {e.start} – {e.end}</span>
                {e.notes && <p>{e.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {editing && <EventModal event={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={save} onDelete={() => { deleteEvent(editing.id); setEditing(null); toast('Event deleted', '✕') }} />}
    </div>
  )
}
