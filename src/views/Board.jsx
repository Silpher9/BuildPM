import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import TaskCard from '../components/TaskCard.jsx'
import { PageHead, Gate, Empty } from '../components/ui.jsx'
import { useApi, useAction } from '../lib/api.js'
import { CONTEXTS, ROLE_LABEL, shortDate } from '../lib/format.js'

export function useWide(query = '(min-width: 1100px)') {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return wide
}

const LANE_HINT = {
  now: 'Waar je nu aan werkt. Houd dit kort.',
  waiting: 'Ligt bij een ander. De teller laat zien hoe lang al.',
  backlog: 'Later, maar niet vergeten.',
  done: 'Afgerond, met datum.',
}

function AddCard({ lane }) {
  const [text, setText] = useState('')
  const act = useAction()
  return (
    <form
      className="add-card"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        await act('/api/kanban', { op: 'add', lane: lane.title, text, position: lane.role === 'now' ? 'bottom' : 'top' })
        setText('')
      }}
    >
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nieuwe taak…" aria-label={`Nieuwe taak in ${lane.title}`} />
      <button className="btn" aria-label="Toevoegen">
        <Icon name="plus" size={16} />
      </button>
    </form>
  )
}

function Lane({ lane, lanes, ctx, flash }) {
  const [showAll, setShowAll] = useState(false)
  const cards = lane.cards.filter((c) => !ctx || c.done || c.context === ctx)
  const visible = lane.role === 'done' && !showAll ? cards.slice(0, 6) : cards
  return (
    <section aria-label={lane.title}>
      <div className="lane-head">
        <h2>{lane.title}</h2>
        <span className="n">{cards.length}</span>
      </div>
      {LANE_HINT[lane.role] && <p className="lane-sub">{LANE_HINT[lane.role]}</p>}
      <div className="cards">
        {visible.map((c) => (
          <TaskCard key={c.id} card={c} lanes={lanes} flash={flash === c.id} />
        ))}
        {!cards.length && <Empty>Leeg{ctx ? ' voor deze context' : ''}.</Empty>}
        {cards.length > visible.length && (
          <button className="btn ghost" onClick={() => setShowAll(true)}>
            Toon alle {cards.length}
          </button>
        )}
      </div>
      {lane.role !== 'done' && <AddCard lane={lane} />}
    </section>
  )
}

export default function Board() {
  const state = useApi('/api/board')
  const wide = useWide()
  const [tab, setTab] = useState(null)
  const [ctx, setCtx] = useState(null)
  const flash = window.location.hash.slice(1)

  useEffect(() => {
    if (!flash || !state.data) return
    const lane = state.data.lanes.find((l) => l.cards.some((c) => c.id === flash))
    if (lane) setTab(lane.title)
    setTimeout(() => document.getElementById(flash)?.scrollIntoView({ block: 'center' }), 150)
  }, [flash, state.data])

  return (
    <>
      <PageHead
        no="01"
        title="Taken"
        crumbs={[{ label: 'Taken' }]}
        lede={
          state.data?.reviewed
            ? `Rechtstreeks uit het Kanban-bord in de vault. Status laatst bevestigd op ${shortDate(state.data.reviewed, true)}.`
            : 'Rechtstreeks uit het Kanban-bord in de vault.'
        }
      />
      <Gate state={state} what="Bord lezen">
        {(b) => {
          if (b.missing) return <Empty title="Geen Kanban-bord gevonden">Maak in de vault een notitie met Obsidian Kanban-indeling.</Empty>
          const lanes = b.lanes.map(({ title, role }) => ({ title, role }))
          const active = b.lanes.find((l) => l.title === tab) || b.lanes[0]
          return (
            <>
              <div className="toolbar">
                <div className="seg" role="group" aria-label="Filter op context">
                  <button aria-pressed={!ctx} onClick={() => setCtx(null)}>
                    Alles
                  </button>
                  {Object.entries(CONTEXTS).map(([k, c]) => (
                    <button key={k} aria-pressed={ctx === k} onClick={() => setCtx(ctx === k ? null : k)} title={c.hint}>
                      <Icon name={c.icon} size={14} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              {wide ? (
                <div className="board columns" style={{ '--lanes': b.lanes.length }}>
                  {b.lanes.map((l) => (
                    <Lane key={l.title} lane={l} lanes={lanes} ctx={ctx} flash={flash} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="seg scroll" role="tablist" style={{ margin: '10px 0 16px' }}>
                    {b.lanes.map((l) => (
                      <button
                        key={l.title}
                        role="tab"
                        aria-pressed={active.title === l.title}
                        aria-selected={active.title === l.title}
                        onClick={() => setTab(l.title)}
                      >
                        {ROLE_LABEL[l.role] === 'Overig' ? l.title.split(/\s[—–-]\s/)[0] : ROLE_LABEL[l.role]}
                        <span className="n">{l.cards.filter((c) => !ctx || c.done || c.context === ctx).length}</span>
                      </button>
                    ))}
                  </div>
                  <Lane lane={active} lanes={lanes} ctx={ctx} flash={flash} />
                </>
              )}
            </>
          )
        }}
      </Gate>
    </>
  )
}
