import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { PageHead, Gate, Dim, Empty, NoteHtml, ChapterChips } from '../components/ui.jsx'
import { useApi, useAction } from '../lib/api.js'
import { noteHref } from '../lib/format.js'

export function QuestionCard({ q, onDone }) {
  const act = useAction()
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState('')
  const [impact, setImpact] = useState('')
  const [chapter, setChapter] = useState(q.chapters.map((n) => `H${n}`).join(' / '))
  const [busy, setBusy] = useState(false)

  const send = async (dropped) => {
    setBusy(true)
    try {
      await act('/api/questions/answer', { id: q.id, answer, impact, chapter, dropped })
      setOpen(false)
      onDone?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <article id={q.id} className="q-card">
      <div className="chips">
        {q.priority === 'blokkerend' && <span className="chip brick">Blokkerend</span>}
        {q.group && <span className="chip">{q.group}</span>}
        <ChapterChips chapters={q.chapters} />
      </div>
      <NoteHtml html={q.html} className="q" />
      {open ? (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault()
            send(false)
          }}
        >
          <label className="field">
            <span>Antwoord — wordt een besluit</span>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} autoFocus required />
          </label>
          <div className="form-row">
            <label className="field">
              <span>Impact (optioneel)</span>
              <input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Wat verandert hierdoor?" />
            </label>
            <label className="field">
              <span>Hoofdstuk</span>
              <input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Bijv. H2 / H4" />
            </label>
          </div>
          <div className="chips">
            <button className="btn mark" disabled={busy || !answer.trim()}>
              Vastleggen
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Annuleren
            </button>
          </div>
        </form>
      ) : (
        <div className="chips" style={{ alignItems: 'center' }}>
          <button className="btn small" onClick={() => setOpen(true)}>
            Beantwoorden
          </button>
          <button
            className="btn ghost small"
            disabled={busy}
            onClick={() => send(true)}
            title="Markeer als niet meer relevant (blijft zichtbaar in de notitie, doorgestreept)"
          >
            Vervalt
          </button>
          <Link href={noteHref(q.path)} className="label" style={{ marginLeft: 'auto' }}>
            {q.source} →
          </Link>
        </div>
      )}
    </article>
  )
}

function QuestionGroup({ g, open: initiallyOpen }) {
  const [open, setOpen] = useState(initiallyOpen)
  useEffect(() => setOpen((o) => o || initiallyOpen), [initiallyOpen])
  return (
    <section>
      <button className="q-group-title" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="mono" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
        {g.key}
        <small>
          {g.central ? 'centrale lijst' : 'notitie'} · {g.items.length}
        </small>
      </button>
      {open && (
        <div className="cards">
          {g.items.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function Questions() {
  const state = useApi('/api/questions')
  const [filter, setFilter] = useState('all')
  const hash = window.location.hash.slice(1)
  useEffect(() => {
    if (hash && state.data) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: 'center' }), 150)
  }, [hash, state.data])

  const groups = useMemo(() => {
    if (!state.data) return []
    const qs = state.data.questions.filter(
      (q) => filter === 'all' || (filter === 'blocking' ? q.priority === 'blokkerend' : q.source !== 'Centrale vragenlijst'),
    )
    const map = new Map()
    for (const q of qs) {
      const key = q.source === 'Centrale vragenlijst' ? q.group || q.source : q.source
      if (!map.has(key)) map.set(key, { key, central: q.source === 'Centrale vragenlijst', items: [] })
      map.get(key).items.push(q)
    }
    return [...map.values()]
  }, [state.data, filter])

  return (
    <>
      <PageHead
        no="05"
        title="Vragen & blokkades"
        crumbs={[{ label: 'Vragen & blokkades' }]}
        lede="Eén antwoord doet twee dingen: de vraag wordt in haar notitie als beantwoord gemarkeerd en het antwoord komt als besluit in het besluitenlog."
      />
      <Gate state={state}>
        {(d) => (
          <>
            <Dim count={d.blockers.rows.filter((b) => b.open).length}>Blokkades</Dim>
            {d.blockers.rows.length ? (
              <div className="grid-cards">
                {d.blockers.rows.map((b) => (
                  <div key={b.id} className="blocker" style={!b.open ? { borderLeftColor: 'var(--sloot)' } : undefined}>
                    <h3>{b.topic}</h3>
                    <NoteHtml html={b.whatHtml} className="what" />
                    <NoteHtml html={b.statusHtml} className="label" />
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Geen blokkades vastgelegd.</Empty>
            )}
            <p className="label" style={{ marginTop: 10 }}>
              Opvolging van blokkades loopt via <Link href="/taken">het takenbord</Link> (kolom Wacht).
            </p>

            <Dim count={d.questions.length}>Open vragen</Dim>
            <div className="seg" role="group" aria-label="Filter">
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                Alle
              </button>
              <button aria-pressed={filter === 'blocking'} onClick={() => setFilter('blocking')}>
                Blokkerend
              </button>
              <button aria-pressed={filter === 'notes'} onClick={() => setFilter('notes')}>
                Uit recente notities
              </button>
            </div>
            {groups.length ? (
              groups.map((g, i) => (
                <QuestionGroup
                  key={g.key}
                  g={g}
                  open={filter !== 'all' || i === 0 || g.items.some((q) => q.priority === 'blokkerend') || g.items.some((q) => q.id === hash)}
                />
              ))
            ) : (
              <Empty title="Geen open vragen">Alles is beantwoord of vervallen.</Empty>
            )}
          </>
        )}
      </Gate>
    </>
  )
}
