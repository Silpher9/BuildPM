import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import Icon from '../components/Icon.jsx'
import BarnDrawing from '../components/BarnDrawing.jsx'
import { ContextChip, AgeChip } from '../components/TaskCard.jsx'
import { Dim, Gate, NoteHtml, ChapterChips, Empty } from '../components/ui.jsx'
import { useApi, useAction } from '../lib/api.js'
import { CONTEXTS, SECTIONS, ROLE_LABEL, shortDate, euro, noteHref, ago } from '../lib/format.js'

function sectionMeta(href, c) {
  switch (href) {
    case '/taken':
      return `${c.now} nu · ${c.waiting} wacht`
    case '/fasen':
      return c.phases ? `${c.phasesDone}/${c.phases} klaar` : ''
    case '/hoofdstukken':
      return '6 sporen'
    case '/besluiten':
      return c.lastDecision ? `laatste ${shortDate(c.lastDecision)}` : `${c.decisions}`
    case '/vragen':
      return `${c.questions} open · ${c.blockers} blok.`
    case '/werk':
      return c.work.length ? `${c.work.length} actief` : ''
    case '/kennis':
      return `${c.notes} notities`
    case '/ontwerp':
      return `${c.renders} renders`
    case '/logboek':
      return c.lastLog ? `laatst ${shortDate(c.lastLog)}` : 'nog leeg'
    case '/voorraad':
      return c.inventory ? `${c.inventory} items${c.spent ? ` · ${euro(c.spent)}` : ''}` : 'nog leeg'
    default:
      return ''
  }
}

// Offer a break point at Dutch compound joints ("uitvoerings|voorbereiding").
const softHyphens = (w) => (w.length > 14 ? w.replace(/(ings|heids|teits|schaps|ties)(?=[a-z]{5,})/g, '$1\u00AD') : w)

function PhaseTitle({ text }) {
  if (!text) return <h1 className="phase-title">Bouwproject</h1>
  const parts = text.split(/\s*\/\s*/).map((p) => p.split(' ').map(softHyphens).join(' '))
  return (
    <h1 className="phase-title">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="slash"> / </span>}
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </span>
      ))}
    </h1>
  )
}

function NextStep({ next }) {
  const [ctx, setCtx] = useState(next.suggested)
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const act = useAction()
  const [, navigate] = useLocation()
  useEffect(() => setI(0), [ctx])
  useEffect(() => setCtx(next.suggested), [next.suggested])
  const list = next.lists[ctx] || []
  const card = list[i % Math.max(1, list.length)]

  const run = async (body) => {
    setBusy(true)
    try {
      await act('/api/kanban', { id: card.id, ...body })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Volgende stap">
      <Dim right={<Link href="/taken">alle taken →</Link>}>Volgende stap</Dim>
      <div className="seg" role="group" aria-label="Waar ben je?">
        {Object.entries(CONTEXTS).map(([k, c]) => (
          <button key={k} aria-pressed={ctx === k} onClick={() => setCtx(k)} title={c.hint}>
            <Icon name={c.icon} size={14} />
            {c.label}
            <span className="n">{next.lists[k].length}</span>
          </button>
        ))}
      </div>
      <p className="ctx-reason">{ctx === next.suggested ? next.reason : `${CONTEXTS[ctx].label}: ${CONTEXTS[ctx].hint}`}</p>
      {card ? (
        <div className="next-card">
          <div className="next-meta">
            <span className="chip ink">{ROLE_LABEL[card.role]}</span>
            <ContextChip context={card.context} />
            <AgeChip card={card} />
            <ChapterChips chapters={card.chapters} />
          </div>
          <NoteHtml html={card.html} className="next-text" />
          <div className="next-actions">
            <button className="btn mark" disabled={busy} onClick={() => run({ op: 'complete' })}>
              <Icon name="check" size={16} /> Gedaan
            </button>
            {card.role === 'waiting' && (
              <button className="btn ghost" disabled={busy} onClick={() => run({ op: 'followup' })} title="Leg vast dat je vandaag hebt nagevraagd">
                <Icon name="phone" size={16} /> Nagevraagd
              </button>
            )}
            {card.links[0] && (
              <button className="btn ghost" onClick={() => navigate(noteHref(card.links[0].path))}>
                <Icon name="book" size={16} /> Open
              </button>
            )}
            {list.length > 1 && (
              <>
                <button className="btn ghost" onClick={() => setI((x) => x + 1)} aria-label="Volgende suggestie">
                  <Icon name="right" size={16} />
                </button>
                <span className="pager">
                  {(i % list.length) + 1}/{list.length}
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <Empty title={`Niets voor “${CONTEXTS[ctx].label.toLowerCase()}” op het bord`}>
          {ctx === 'doen' ? (
            <>
              Concreet werk op de bouw staat in de <Link href="/werk">werkpakketten</Link>. Zet wat je deze week wilt doen als taak op het bord.
            </>
          ) : (
            <>Kies een andere context of zet een taak op het bord.</>
          )}
        </Empty>
      )}
    </section>
  )
}

export default function Home() {
  const state = useApi('/api/overview')
  const [, navigate] = useLocation()
  return (
    <Gate state={state} what="Vault lezen">
      {(o) => {
        const busy = o.phases.filter((p) => p.state === 'bezig')
        const next = o.phases.filter((p) => p.state === 'volgende')
        const reviewCount = o.review.items.length
        return (
          <>
            <header className="home-head">
              <span className="label">Huidige fase</span>
              <PhaseTitle text={o.phase} />
              <div className="phase-meta">
                <span>
                  {o.title}
                  {o.subtitle ? ` — ${o.subtitle}` : ''}
                </span>
                {o.peildatum && (
                  <span title="Datum waarop de projectstatus voor het laatst is bevestigd">
                    {o.peildatumAge > 30 && <span className="stale-dot" />}
                    Peildatum {shortDate(o.peildatum, true)}
                    {o.peildatumAge > 0 && <span className="muted"> · {ago(o.peildatumAge)}</span>}
                  </span>
                )}
              </div>
            </header>

            <BarnDrawing phases={o.phases} onTag={() => navigate('/fasen')} />
            {o.phases.length > 0 && (
              <div className="now-strip">
                {busy.map((p) => (
                  <span key={p.n}>
                    <span className="state bezig" />
                    Bezig: <b>{p.name}</b>
                  </span>
                ))}
                {next.slice(0, 1).map((p) => (
                  <span key={p.n}>
                    <span className="state volgende" />
                    Hierna: <b>{p.name}</b>
                  </span>
                ))}
                <Link href="/fasen" className="muted">
                  {o.counts.phasesDone} van {o.counts.phases} fasen klaar →
                </Link>
              </div>
            )}

            <div className="home-grid">
              <NextStep next={o.next} />
              <section aria-label="Onderdelen">
                <Dim>Tekeningenlijst</Dim>
                <ul className="index">
                  {SECTIONS.map((s) => (
                    <li key={s.href}>
                      <Link href={s.href}>
                        <span className="no">{s.no}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="t">{s.title}</span>
                          <span className="d">{s.desc}</span>
                        </span>
                        <span className="m">{sectionMeta(s.href, o.counts)}</span>
                        <Icon name="right" size={16} className="arrow" />
                      </Link>
                    </li>
                  ))}
                </ul>
                {reviewCount > 0 && (
                  <Link href="/rondje" className="review-nudge">
                    <Icon name="round" size={26} />
                    <span>
                      <b>Rondje bouw · ±3 minuten</b>
                      <span>
                        {[
                          o.review.items.includes('peildatum') && 'status bevestigen',
                          o.review.items.includes('wachten') && `${o.review.waitingStale} keer nabellen`,
                          o.review.items.includes('vraag') && 'één vraag beantwoorden',
                          o.review.items.includes('logboek') && 'logboek bijwerken',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </Link>
                )}
              </section>
            </div>

            <footer className="titleblock" aria-label="Projectgegevens">
              <div>
                <span className="label">Project</span>
                <b>{o.title}</b>
              </div>
              <div>
                <span className="label">Fase</span>
                <b>{o.phase || '—'}</b>
              </div>
              <div>
                <span className="label">Peildatum</span>
                <b className="mono">{o.peildatum || '—'}</b>
              </div>
              <div className="foot">
                <span>{o.subtitle || 'BuildPM'}</span>
                <span>Vault: {o.projectDir}/ · blad 00</span>
              </div>
            </footer>
          </>
        )
      }}
    </Gate>
  )
}
