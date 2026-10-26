import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { PageHead, Gate, Empty, NoteHtml, ChapterChips } from '../components/ui.jsx'
import { useApi, useLive } from '../lib/api.js'
import { monthTitle, shortDate } from '../lib/format.js'

export function DecisionRow({ d }) {
  const [open, setOpen] = useState(false)
  return (
    <li id={d.id} className={`row-item ${d.kind !== 'decision' ? 'muted-row' : ''}`}>
      <div className="top">
        <span className="date">{d.iso ? shortDate(d.iso, true) : d.date}</span>
        {d.kind === 'non' && <span className="chip">Non-besluit</span>}
        {d.kind === 'superseded' && <span className="chip">Historisch</span>}
        <ChapterChips chapters={d.chapters} />
        <span className="label" style={{ marginLeft: 'auto' }}>
          {d.source}
        </span>
      </div>
      <NoteHtml html={d.decisionHtml} className="body" />
      {d.impact && (
        <>
          <button className="more-btn label" style={{ justifySelf: 'start', padding: '2px 0' }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? '− impact' : '+ impact'}
          </button>
          {open && <NoteHtml html={d.impactHtml} className="sub" />}
        </>
      )}
    </li>
  )
}

export default function Decisions() {
  const state = useApi('/api/decisions')
  const { openCapture } = useLive()
  const [chapter, setChapter] = useState(null)
  const [q, setQ] = useState('')
  const [hideOld, setHideOld] = useState(false)

  const groups = useMemo(() => {
    if (!state.data) return []
    const term = q.trim().toLowerCase()
    const rows = state.data.rows.filter(
      (d) =>
        (!chapter || d.chapters.includes(chapter)) &&
        (!hideOld || d.kind === 'decision') &&
        (!term || (d.decision + ' ' + d.impact + ' ' + d.source).toLowerCase().includes(term)),
    )
    const out = []
    for (const d of rows) {
      const key = d.iso ? d.iso.slice(0, 7) : d.date
      const last = out[out.length - 1]
      if (last && last.key === key) last.rows.push(d)
      else out.push({ key, title: d.iso ? monthTitle(d.iso) : d.date, rows: [d] })
    }
    return out
  }, [state.data, chapter, q, hideOld])

  const total = groups.reduce((a, g) => a + g.rows.length, 0)

  return (
    <>
      <PageHead
        no="04"
        title="Besluiten"
        crumbs={[{ label: 'Besluiten' }]}
        lede="Het besluitenlog uit de vault: nieuwste bovenaan. Alles wat hier staat, ligt vast tot een nieuw besluit het vervangt."
      >
        <button className="btn mark" onClick={() => openCapture('decision')}>
          <Icon name="plus" size={16} /> Besluit vastleggen
        </button>
      </PageHead>
      <div className="toolbar">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek in besluiten…" aria-label="Zoek in besluiten" />
        <div className="seg scroll" role="group" aria-label="Hoofdstuk">
          <button aria-pressed={!chapter} onClick={() => setChapter(null)}>
            Alle
          </button>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} aria-pressed={chapter === n} onClick={() => setChapter(chapter === n ? null : n)}>
              H{n}
            </button>
          ))}
        </div>
        <label className="label" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={hideOld} onChange={(e) => setHideOld(e.target.checked)} /> Verberg historisch
        </label>
      </div>
      <Gate state={state}>
        {() =>
          total ? (
            <>
              <p className="label">{total} besluiten</p>
              {groups.map((g, gi) => (
                <section key={`${g.key}-${gi}`}>
                  <h2 className="month-head">{g.title}</h2>
                  <ul className="rule-list" style={{ borderTop: 0 }}>
                    {g.rows.map((d) => (
                      <DecisionRow key={d.id} d={d} />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          ) : (
            <Empty>Geen besluiten gevonden.</Empty>
          )
        }
      </Gate>
    </>
  )
}
