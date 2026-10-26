import { useState } from 'react'
import { Link } from 'wouter'
import TaskCard from '../components/TaskCard.jsx'
import { PageHead, Gate, Dim, Empty, NoteHtml } from '../components/ui.jsx'
import { DecisionRow } from './Decisions.jsx'
import { QuestionCard } from './Questions.jsx'
import { NoteRow } from './Knowledge.jsx'
import { useApi, useAction } from '../lib/api.js'

export default function Chapters() {
  const state = useApi('/api/chapters')
  return (
    <>
      <PageHead
        no="03"
        title="Hoofdstukken"
        crumbs={[{ label: 'Hoofdstukken' }]}
        lede="Zes sporen die samen het hele project dekken. Elk hoofdstuk bundelt de taken, besluiten, vragen en notities die erbij horen."
      />
      <Gate state={state}>
        {(d) =>
          d.chapters.length ? (
            <div className="grid-cards">
              {d.chapters.map((c) => (
                <Link key={c.n} href={`/hoofdstukken/${c.n}`} className="tile">
                  <span className="big-no">H{c.n}</span>
                  <h3>{c.title}</h3>
                  <span className="status">{c.status}</span>
                  <NoteHtml html={c.noteHtml} className="note" />
                  <span className="stats">
                    <span>
                      <b>{c.open}</b> taken
                    </span>
                    <span>
                      <b>{c.questionCount}</b> vragen
                    </span>
                    <span>
                      <b>{c.decisionCount}</b> besluiten
                    </span>
                    <span>
                      <b>{c.noteCount}</b> notities
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Geen hoofdstukken gevonden">Het dashboard verwacht een tabel onder “Status per hoofdstuk” in Dashboard.md.</Empty>
          )
        }
      </Gate>
    </>
  )
}

function StatusEditor({ c }) {
  const act = useAction()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(c.status)
  if (!open)
    return (
      <button className="btn ghost small" onClick={() => setOpen(true)}>
        Status bijwerken
      </button>
    )
  return (
    <form
      className="form-grid panel"
      style={{ padding: 14, width: '100%' }}
      onSubmit={async (e) => {
        e.preventDefault()
        await act('/api/chapters/status', { line: c.line, hash: c.hash, status })
        setOpen(false)
      }}
    >
      <label className="field">
        <span>Status</span>
        <input value={status} onChange={(e) => setStatus(e.target.value)} autoFocus />
      </label>
      <div className="chips">
        <button className="btn small">Opslaan</button>
        <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

export function Chapter({ n }) {
  const state = useApi(`/api/chapters/${n}`)
  const [allDecisions, setAllDecisions] = useState(false)
  return (
    <Gate state={state}>
      {(c) => (
        <>
          <PageHead no={`H${c.n}`} title={c.title} crumbs={[{ href: '/hoofdstukken', label: 'Hoofdstukken' }, { label: `H${c.n}` }]}>
            <StatusEditor c={c} />
          </PageHead>
          <div className="panel" style={{ padding: '14px 16px' }}>
            <span className="label">Status</span>
            <p style={{ fontWeight: 650, fontSize: 18, margin: '4px 0 6px' }}>{c.status}</p>
            <NoteHtml html={c.noteHtml} className="note" />
          </div>

          <Dim count={c.tasks.length}>Open taken</Dim>
          {c.tasks.length ? (
            <div className="cards">
              {c.tasks.map((t) => (
                <TaskCard key={t.id} card={t} showLane />
              ))}
            </div>
          ) : (
            <Empty>Geen open taken in dit hoofdstuk.</Empty>
          )}

          {c.questions.length > 0 && (
            <>
              <Dim count={c.questions.length}>Open vragen</Dim>
              <div className="cards">
                {c.questions.slice(0, 6).map((q) => (
                  <QuestionCard key={q.id} q={q} />
                ))}
              </div>
              {c.questions.length > 6 && (
                <p style={{ marginTop: 10 }}>
                  <Link href="/vragen">Alle {c.questions.length} vragen →</Link>
                </p>
              )}
            </>
          )}

          <Dim count={c.decisions.length}>Besluiten</Dim>
          {c.decisions.length ? (
            <ul className="rule-list">
              {(allDecisions ? c.decisions : c.decisions.slice(0, 8)).map((d) => (
                <DecisionRow key={d.id} d={d} />
              ))}
            </ul>
          ) : (
            <Empty>Nog geen besluiten in dit hoofdstuk.</Empty>
          )}
          {!allDecisions && c.decisions.length > 8 && (
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setAllDecisions(true)}>
              Toon alle {c.decisions.length} besluiten
            </button>
          )}

          <Dim count={c.notes.length}>Notities</Dim>
          <div>
            {c.notes.map((note) => (
              <NoteRow key={note.path} n={note} />
            ))}
          </div>
          {c.done > 0 && (
            <p className="label" style={{ marginTop: 20 }}>
              {c.done} afgeronde taken in dit hoofdstuk staan in <Link href="/taken">Klaar</Link>
            </p>
          )}
        </>
      )}
    </Gate>
  )
}
