import { useState } from 'react'
import { Link } from 'wouter'
import Icon from '../components/Icon.jsx'
import { PageHead, Gate, Empty, NoteHtml } from '../components/ui.jsx'
import { QuestionCard } from './Questions.jsx'
import { useApi, useAction, useLive } from '../lib/api.js'
import { shortDate, ago } from '../lib/format.js'

// "Rondje bouw": a short walk past everything that goes stale on its own.
// Every step is optional and every action is one tap.

function MiniCard({ card, waiting }) {
  const act = useAction()
  const run = (body) => act('/api/kanban', { id: card.id, ...body })
  return (
    <div className="mini">
      <div style={{ minWidth: 0 }}>
        <NoteHtml html={card.html} className="card-text" />
        {waiting && card.age != null && (
          <span className="label">
            {card.followUp ? `nagevraagd ${shortDate(card.followUp)}` : `open sinds ${shortDate(card.since, true)}`} · {card.age} d
          </span>
        )}
      </div>
      <div className="acts">
        {waiting && (
          <button className="btn ghost small" onClick={() => run({ op: 'followup' })} title="Vandaag nagevraagd">
            <Icon name="phone" size={14} />
          </button>
        )}
        <button className="btn small" onClick={() => run({ op: 'complete' })} title="Gedaan">
          <Icon name="check" size={14} />
        </button>
        {!waiting && (
          <button className="btn ghost small" onClick={() => run({ op: 'move', lane: 'backlog', position: 'top' })} title="Naar backlog">
            Later
          </button>
        )}
      </div>
    </div>
  )
}

export default function Review() {
  const state = useApi('/api/review')
  const act = useAction()
  const { openCapture } = useLive()
  const [done, setDone] = useState({})
  const mark = (k) => setDone((d) => ({ ...d, [k]: true }))

  return (
    <>
      <PageHead
        title="Rondje bouw"
        crumbs={[{ label: 'Rondje bouw' }]}
        lede="Drie minuten, één keer per week. Je loopt langs wat vanzelf veroudert, en het dashboard blijft kloppen zonder dat je losse administratie bijhoudt."
      />
      <Gate state={state}>
        {(r) => (
          <>
            <section className={`step ${done.now ? 'done' : ''}`}>
              <span className="num">1</span>
              <div>
                <h2>Klopt “Nu” nog?</h2>
                <p className="why">Vink af wat klaar is, schuif door wat deze week niet gaat gebeuren.</p>
                <div className="mini-list">
                  {r.now.map((c) => (
                    <MiniCard key={c.id} card={c} />
                  ))}
                  {!r.now.length && <Empty>Niets op Nu. Kies iets van de backlog op het bord.</Empty>}
                </div>
                <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => mark('now')}>
                  Klopt
                </button>
              </div>
            </section>

            <section className={`step ${done.wait ? 'done' : ''}`}>
              <span className="num">2</span>
              <div>
                <h2>Nieuws van buiten?</h2>
                <p className="why">Langst wachtend bovenaan. Gebeld of gemaild? Tik op de telefoon; de teller begint opnieuw.</p>
                <div className="mini-list">
                  {r.waiting.map((c) => (
                    <MiniCard key={c.id} card={c} waiting />
                  ))}
                  {!r.waiting.length && <Empty>Je wacht nergens op.</Empty>}
                </div>
                <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => mark('wait')}>
                  Bijgewerkt
                </button>
              </div>
            </section>

            <section className={`step ${done.q ? 'done' : ''}`}>
              <span className="num">3</span>
              <div>
                <h2>Eén vraag beantwoorden</h2>
                <p className="why">
                  Nog {r.questionsLeft} open. Eén per rondje is genoeg; het antwoord wordt meteen een besluit. <Link href="/vragen">Alle vragen</Link>
                </p>
                {r.question ? <QuestionCard key={r.question.id} q={r.question} onDone={() => mark('q')} /> : <Empty>Geen open vragen.</Empty>}
              </div>
            </section>

            <section className={`step ${done.log ? 'done' : ''}`}>
              <span className="num">4</span>
              <div>
                <h2>Wat is er gebeurd?</h2>
                <p className="why">
                  {r.lastLog ? `Laatste logboekregel: ${shortDate(r.lastLog.date, true)} (${ago(r.lastLogAge)}).` : 'Het logboek is nog leeg.'} Een zin en een
                  foto zijn genoeg.
                </p>
                <button
                  className="btn mark"
                  onClick={() => {
                    openCapture('log')
                    mark('log')
                  }}
                >
                  <Icon name="camera" size={16} /> Logboek bijwerken
                </button>
              </div>
            </section>

            <section className={`step ${done.peil ? 'done' : ''}`}>
              <span className="num">5</span>
              <div>
                <h2>Status bevestigen</h2>
                <p className="why">
                  Zet de peildatum van het bord en het dashboard op vandaag. Dan weet iedereen (ook de agents in Discord) dat de status klopt.
                  {r.peildatum && ` Nu: ${shortDate(r.peildatum, true)}, ${ago(r.peilAge)}.`}
                </p>
                <button
                  className="btn"
                  onClick={async () => {
                    await act('/api/status/confirm')
                    mark('peil')
                  }}
                >
                  <Icon name="check" size={16} /> Peildatum op vandaag
                </button>
              </div>
            </section>
          </>
        )}
      </Gate>
    </>
  )
}
