import { useState } from 'react'
import BarnDrawing from '../components/BarnDrawing.jsx'
import { PageHead, Gate, Dim, Empty, NoteHtml, Tape } from '../components/ui.jsx'
import { useApi, useAction } from '../lib/api.js'
import { PHASE_STATES, shortDate } from '../lib/format.js'

function PhaseItem({ p }) {
  const act = useAction()
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(p.note)
  const set = (state) => act('/api/phases', { line: p.line, hash: p.hash, state })
  return (
    <li id={`fase-${p.n}`} className={`phase-item ${p.state}`}>
      <span className="tagno">{p.n}</span>
      <div style={{ minWidth: 0 }}>
        <h3>{p.name}</h3>
        {editing ? (
          <form
            className="form-grid"
            style={{ marginBottom: 10 }}
            onSubmit={async (e) => {
              e.preventDefault()
              await act('/api/phases', { line: p.line, hash: p.hash, note })
              setEditing(false)
            }}
          >
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <div className="chips">
              <button className="btn small">Opslaan</button>
              <button className="btn ghost small" type="button" onClick={() => setEditing(false)}>
                Annuleren
              </button>
            </div>
          </form>
        ) : (
          <div className="note">
            {p.noteHtml ? <NoteHtml html={p.noteHtml} inline className="" /> : <span className="muted">Geen toelichting</span>}{' '}
            <button className="more-btn label" onClick={() => setEditing(true)}>
              bewerk
            </button>
          </div>
        )}
        <div className="seg" role="group" aria-label={`Status ${p.name}`}>
          {PHASE_STATES.map((s) => (
            <button key={s.key} aria-pressed={p.state === s.key} onClick={() => p.state !== s.key && set(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}

export default function Phases() {
  const state = useApi('/api/phases')
  return (
    <>
      <PageHead
        no="02"
        title="Bouwfasen"
        crumbs={[{ label: 'Bouwfasen' }]}
        lede="De fysieke volgorde van het hele project. Zet een fase op bezig of klaar en de tekening op de startpagina kleurt mee."
      />
      <Gate state={state}>
        {(d) => {
          const done = d.phases.filter((p) => p.state === 'klaar').length
          return (
            <>
              <BarnDrawing phases={d.phases} onTag={(p) => document.getElementById(`fase-${p.n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
              {d.phases.length ? (
                <>
                  <div style={{ margin: '18px 0 0' }}>
                    <Tape value={done} total={d.phases.length} label="Fasen klaar" />
                  </div>
                  <Dim count={d.phases.length}>Fasen</Dim>
                  <ol className="phase-list">
                    {d.phases.map((p) => (
                      <PhaseItem key={p.line} p={p} />
                    ))}
                  </ol>
                </>
              ) : (
                <Empty title="Nog geen bouwfasen">
                  Voeg in <code>Dashboard.md</code> een sectie <code>## Bouwfasen</code> toe met een tabel <code>| # | Fase | Status | Toelichting |</code>.
                </Empty>
              )}
              {d.milestones.length > 0 && (
                <>
                  <Dim count={d.milestones.length}>Bevestigde mijlpalen</Dim>
                  <ul className="rule-list">
                    {d.milestones.map((m, i) => (
                      <li key={i} className="row-item">
                        <div className="top">{m.date && <span className="date">{shortDate(m.date, true)}</span>}</div>
                        <NoteHtml html={m.html} className="body" />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )
        }}
      </Gate>
    </>
  )
}
