import { useState } from 'react'
import { Link } from 'wouter'
import Icon from './Icon.jsx'
import { NoteHtml, ChapterChips, useDismiss } from './ui.jsx'
import { useAction } from '../lib/api.js'
import { CONTEXTS, ROLE_LABEL, noteHref, shortDate } from '../lib/format.js'

export function ContextChip({ context }) {
  const c = CONTEXTS[context]
  if (!c) return null
  return (
    <span className="chip" title={c.hint}>
      <Icon name={c.icon} size={12} />
      {c.label}
    </span>
  )
}

export function AgeChip({ card }) {
  if (card.done || card.role !== 'waiting' || card.age == null) return null
  const hot = card.age >= 30
  return (
    <span
      className={`chip ${hot ? 'brick' : ''}`}
      title={card.followUp ? `Laatst nagevraagd ${shortDate(card.followUp, true)}` : `Open sinds ${shortDate(card.since, true)}`}
    >
      <Icon name="clock" size={12} />
      {card.age} d{card.followUp ? ' · nagevraagd' : ''}
    </span>
  )
}

export default function TaskCard({ card, lanes = [], showLane = false, flash = false }) {
  const act = useAction()
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(card.text)
  const [busy, setBusy] = useState(false)
  const ref = useDismiss(menu, setMenu)

  const run = async (body) => {
    setBusy(true)
    setMenu(false)
    try {
      await act('/api/kanban', { id: card.id, ...body })
    } finally {
      setBusy(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    await run({ op: 'edit', text })
    setEditing(false)
  }

  return (
    <article
      id={card.id}
      className={`card ${card.done ? 'done' : ''} ${card.role === 'waiting' && !card.done ? 'waiting' : ''} ${flash ? 'flash' : ''}`}
      ref={ref}
      aria-busy={busy}
    >
      <button
        className={`check ${card.done ? 'on' : ''}`}
        onClick={() => run({ op: card.done ? 'reopen' : 'complete' })}
        disabled={busy}
        aria-label={card.done ? 'Terugzetten naar Nu' : 'Markeer als gedaan'}
        title={card.done ? 'Terugzetten' : 'Gedaan'}
      >
        <Icon name="check" size={15} />
      </button>
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <form onSubmit={save} className="form-grid">
            <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
            <div className="chips">
              <button className="btn small" type="submit" disabled={busy}>
                Opslaan
              </button>
              <button className="btn ghost small" type="button" onClick={() => setEditing(false)}>
                Annuleren
              </button>
            </div>
          </form>
        ) : (
          <NoteHtml html={card.html} className="card-text" />
        )}
        <div className="card-foot">
          {showLane && <span className="chip ink">{ROLE_LABEL[card.role] || card.lane}</span>}
          {!card.done && <ContextChip context={card.context} />}
          <AgeChip card={card} />
          {card.done && card.doneOn && <span className="chip sloot">{shortDate(card.doneOn, true)}</span>}
          <ChapterChips chapters={card.chapters} />
          <span className="spacer" />
          <button className="more-btn" onClick={() => setMenu((m) => !m)} aria-label="Meer acties" aria-expanded={menu}>
            <Icon name="more" size={18} />
          </button>
        </div>
      </div>
      {menu && (
        <div className="menu" role="menu">
          {!card.done && (
            <button onClick={() => run({ op: 'complete' })}>
              <Icon name="check" size={16} /> Gedaan
            </button>
          )}
          {card.role === 'waiting' && !card.done && (
            <button onClick={() => run({ op: 'followup' })}>
              <Icon name="phone" size={16} /> Vandaag nagevraagd
            </button>
          )}
          <button
            onClick={() => {
              setText(card.text)
              setEditing(true)
              setMenu(false)
            }}
          >
            <Icon name="book" size={16} /> Tekst aanpassen
          </button>
          {card.links.map((l) => (
            <Link key={l.path} href={noteHref(l.path)} onClick={() => setMenu(false)}>
              <Icon name="link" size={16} /> {l.label.replace(/_/g, ' ')}
            </Link>
          ))}
          {lanes.filter((l) => l.title !== card.lane).length > 0 && <div className="label">Verplaats naar</div>}
          {lanes
            .filter((l) => l.title !== card.lane)
            .map((l) => (
              <button key={l.title} onClick={() => run({ op: l.role === 'done' ? 'complete' : card.done ? 'reopen' : 'move', lane: l.title, position: 'top' })}>
                <Icon name="right" size={16} /> {l.title.split(/\s[—–-]\s/)[0]}
              </button>
            ))}
        </div>
      )}
    </article>
  )
}
