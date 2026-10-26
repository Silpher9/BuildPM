import { Link } from 'wouter'
import { PageHead, Gate, Empty, NoteHtml, Tape } from '../components/ui.jsx'
import { useApi } from '../lib/api.js'
import { noteHref } from '../lib/format.js'

const STATE = {
  active: { label: 'Actief', cls: 'mark' },
  paused: { label: 'Gepauzeerd', cls: '' },
  later: { label: 'Later', cls: '' },
  unplanned: { label: 'Niet gepland', cls: '' },
  completed: { label: 'Afgerond', cls: 'sloot' },
}

function WorkGroup({ g }) {
  const st = STATE[g.state] || { label: g.state, cls: '' }
  const prepCards = g.cards
  return (
    <section id={g.key} className="work">
      <div className="work-head">
        <h2>{g.title}</h2>
        <span className={`chip ${st.cls}`}>{st.label}</span>
        {g.lead && (
          <Link href={noteHref(g.lead)} className="btn ghost small">
            Open werkpakket
          </Link>
        )}
      </div>
      <div className="work-stats">
        {prepCards.total > 0 && (
          <div>
            <span className="label">Taken op het bord</span>
            <Tape value={prepCards.done} total={prepCards.total} label="Gekoppelde taken afgerond" />
          </div>
        )}
        {g.tasks.total > 0 && g.state !== 'completed' && (
          <div>
            <span className="label">Afvinklijsten in de notities</span>
            <Tape value={g.tasks.done} total={g.tasks.total} label="Checkboxes afgevinkt" />
          </div>
        )}
      </div>
      {g.notes.map((n) => (
        <div key={n.path} className="work-note">
          <h3>
            <Link href={noteHref(n.path)}>{n.title}</Link>
          </h3>
          <div className="chips" style={{ marginTop: 6 }}>
            {n.cards.map((c) => (
              <span key={c.id} className={`chip ${c.done ? 'sloot' : c.role === 'now' ? 'mark' : ''}`}>
                {c.done ? 'Taak klaar' : c.role === 'now' ? 'Taak staat op Nu' : 'Taak op het bord'}
              </span>
            ))}
            {n.tasks.total > 0 && (
              <span className="chip">
                {n.tasks.done}/{n.tasks.total} afgevinkt
              </span>
            )}
          </div>
          {n.criteria.length > 0 && (
            <details className="disclose" style={{ marginTop: 8 }}>
              <summary>Klaar als ({n.criteria.length})</summary>
              <ul>
                {n.criteria.map((c, i) => (
                  <li key={i}>
                    <NoteHtml html={c.html} inline className="" />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
      {g.background.length > 0 && (
        <div className="work-note">
          <span className="label">Achtergrond</span>
          <div className="chips" style={{ marginTop: 8 }}>
            {g.background.map((b) => (
              <Link key={b.path} href={noteHref(b.path)} className="chip">
                {b.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default function Work() {
  const state = useApi('/api/work')
  return (
    <>
      <PageHead
        no="06"
        title="Werkpakketten"
        crumbs={[{ label: 'Werkpakketten' }]}
        lede="Uitvoering per pakket. De voortgang komt uit de taken op het bord die naar deze notities verwijzen en uit de afvinklijsten in de notities zelf."
      />
      <Gate state={state}>
        {(d) =>
          d.groups.length ? (
            [...d.groups].sort((a, b) => (a.state === 'completed') - (b.state === 'completed')).map((g) => <WorkGroup key={g.key} g={g} />)
          ) : (
            <Empty>Geen werkpakketten gevonden.</Empty>
          )
        }
      </Gate>
    </>
  )
}
