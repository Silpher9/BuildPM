import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import Icon from '../components/Icon.jsx'
import { PageHead, Gate, Empty, NoteHtml, ChapterChips, useLightbox } from '../components/ui.jsx'
import { useApi, useLive } from '../lib/api.js'
import { SeriesBadge } from '../components/Series.jsx'
import { fileUrl, monthTitle, shortDate, noteHref } from '../lib/format.js'

const KINDS = [
  { key: 'all', label: 'Alles' },
  { key: 'log', label: 'Logboek' },
  { key: 'decision', label: 'Besluiten' },
  { key: 'milestone', label: 'Mijlpalen' },
  { key: 'task', label: 'Taken' },
]
const KIND_LABEL = { log: 'Logboek', decision: 'Besluit', milestone: 'Mijlpaal', task: 'Taak afgerond' }

function Photos({ images }) {
  const open = useLightbox()
  if (!images?.length) return null
  return (
    <div className="tl-photos">
      {images.map((p, i) => (
        <button key={p} onClick={() => open(images, i)} aria-label="Foto openen">
          <img src={fileUrl(p, 240)} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  )
}

export default function Logbook() {
  const state = useApi('/api/logbook')
  const { openCapture } = useLive()
  const [kind, setKind] = useState('all')
  const [limit, setLimit] = useState(40)
  const total = state.data ? state.data.timeline.filter((t) => kind === 'all' || t.kind === kind).length : 0

  const groups = useMemo(() => {
    if (!state.data) return []
    const items = state.data.timeline.filter((t) => kind === 'all' || t.kind === kind).slice(0, limit)
    const out = []
    for (const t of items) {
      const key = t.date.slice(0, 7)
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push(t)
      else out.push({ key, items: [t] })
    }
    return out
  }, [state.data, kind, limit])

  return (
    <>
      <PageHead
        no="09"
        title="Logboek"
        crumbs={[{ label: 'Logboek' }]}
        lede="Wat er feitelijk gebeurd is, met foto’s, naast besluiten, mijlpalen en afgeronde taken. Eén tijdlijn, zonder dubbel bijhouden."
      >
        <button className="btn mark" onClick={() => openCapture('log')}>
          <Icon name="camera" size={16} /> Logboek + foto
        </button>
        {state.data && (
          <Link href={noteHref(state.data.path)} className="btn ghost">
            Notitie
          </Link>
        )}
      </PageHead>
      <div className="seg scroll" role="group" aria-label="Soort">
        {KINDS.map((k) => (
          <button
            key={k.key}
            aria-pressed={kind === k.key}
            onClick={() => {
              setKind(k.key)
              setLimit(40)
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <Gate state={state}>
        {(d) =>
          groups.length ? (
            <>
              {groups.map((g) => (
                <section key={g.key} style={{ marginTop: 18 }}>
                  <h2 className="month-head">{monthTitle(g.key + '-01')}</h2>
                  {g.items.map((t) => (
                    <div key={t.id} className={`tl-item kind-${t.kind}`}>
                      <div className="when">
                        {shortDate(t.date)}
                        <small>{t.time || ''}</small>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <span className="label">
                          <span className={`kind-dot kd-${t.kind}`} />
                          {KIND_LABEL[t.kind]}
                          {t.kind === 'decision' && t.source ? ` · ${t.source}` : ''}
                        </span>
                        <NoteHtml html={t.html} className="what" />
                        <Photos images={t.images} />
                        <SeriesBadge series={t.series} />
                        {t.chapters && (
                          <div className="chips" style={{ marginTop: 6 }}>
                            <ChapterChips chapters={t.chapters} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
              {total > limit && (
                <button className="btn ghost" style={{ marginTop: 18 }} onClick={() => setLimit((l) => l + 60)}>
                  Ouder ({total - limit})
                </button>
              )}
            </>
          ) : (
            <Empty title={kind === 'log' ? 'Het logboek is nog leeg' : 'Niets gevonden'}>
              {d.entries === 0 && 'Leg met de gele knop vast wat er vandaag gebeurd is. Een foto erbij is genoeg.'}
            </Empty>
          )
        }
      </Gate>
    </>
  )
}
