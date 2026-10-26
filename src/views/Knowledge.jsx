import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import Icon from '../components/Icon.jsx'
import { PageHead, Gate, Dim, Empty, NoteHtml, useLightbox } from '../components/ui.jsx'
import { useApi, useAction } from '../lib/api.js'
import { noteHref, shortDate, ago, fileUrl } from '../lib/format.js'
import { SeriesBadge } from '../components/Series.jsx'

const STALE_DAYS = 60

export function NoteRow({ n }) {
  const bits = [
    n.authority === 'canonical' && 'gezaghebbend',
    n.reviewed && `gecontroleerd ${shortDate(n.reviewed, true)}`,
    !n.reviewed && `gewijzigd ${shortDate(new Date(n.mtime).toISOString().slice(0, 10), true)}`,
    n.tasks.total > 0 && `${n.tasks.done}/${n.tasks.total} afgevinkt`,
  ].filter(Boolean)
  return (
    <Link href={noteHref(n.path)} className="kb-row">
      <span className="t">{n.title}</span>
      {n.reviewedAge > STALE_DAYS ? <span className="chip brick">check</span> : <span />}
      <span className="s">{bits.join(' · ')}</span>
    </Link>
  )
}

const AREA_ORDER = ['', '03_Projectmanagement', '02_Design', '01_Research']

export default function Knowledge() {
  const state = useApi('/api/notes')
  const [q, setQ] = useState('')
  const [archive, setArchive] = useState(false)

  const groups = useMemo(() => {
    if (!state.data) return []
    const term = q.trim().toLowerCase()
    return state.data.tree
      .filter((g) => archive || !g.archived)
      .map((g) => ({ ...g, notes: g.notes.filter((n) => !term || (n.title + ' ' + n.path).toLowerCase().includes(term)) }))
      .filter((g) => g.notes.length)
      .sort((a, b) => {
        const ra = AREA_ORDER.findIndex((x) => (x ? a.folder.startsWith(x) : a.folder === ''))
        const rb = AREA_ORDER.findIndex((x) => (x ? b.folder.startsWith(x) : b.folder === ''))
        return a.archived - b.archived || (ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb) || a.folder.localeCompare(b.folder)
      })
  }, [state.data, q, archive])

  return (
    <>
      <PageHead
        no="07"
        title="Kennisbank"
        crumbs={[{ label: 'Kennisbank' }]}
        lede="Alle notities van het project, zoals ze in de vault staan. Afvinklijsten werken hier ook; wijzigingen gaan direct naar de notitie."
      />
      <div className="toolbar">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter op titel…" aria-label="Filter notities" />
        <label className="label" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} /> Archief tonen
        </label>
      </div>
      <Gate state={state}>
        {() =>
          groups.length ? (
            groups.map((g) => (
              <section key={g.folder} className="kb-group">
                <h2>
                  {g.label}
                  <span className="n">{g.notes.length}</span>
                </h2>
                {g.notes.map((n) => (
                  <NoteRow key={n.path} n={n} />
                ))}
              </section>
            ))
          ) : (
            <Empty>Niets gevonden.</Empty>
          )
        }
      </Gate>
    </>
  )
}

function NoteLog({ entries }) {
  const open = useLightbox()
  return (
    <section className="backlinks">
      <Dim count={entries.length}>Logboek bij deze notitie</Dim>
      {entries.map((e) => (
        <div key={e.id} className="tl-item kind-log">
          <div className="when">
            {shortDate(e.date)}
            <small>{e.time || ''}</small>
          </div>
          <div style={{ minWidth: 0 }}>
            {e.heading && <span className="label">{e.heading}</span>}
            <NoteHtml html={e.html} className="what" />
            {e.images.length > 0 && (
              <div className="tl-photos">
                {e.images.map((p, i) => (
                  <button key={p} onClick={() => open(e.images, i)} aria-label="Foto openen">
                    <img src={fileUrl(p, 240)} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            <SeriesBadge series={e.series} />
          </div>
        </div>
      ))}
    </section>
  )
}

export function Note({ path }) {
  const state = useApi(`/api/note?path=${encodeURIComponent(path)}`)
  const act = useAction()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash && state.data) setTimeout(() => document.getElementById(decodeURIComponent(hash))?.scrollIntoView(), 80)
  }, [state.data])

  return (
    <Gate state={state} what="Notitie lezen">
      {(n) => {
        const parts = n.folder ? n.folder.split('/') : []
        const toc = n.headings.filter((h) => h.level >= 2 && h.level <= 3)
        const stale = n.reviewedAge != null && n.reviewedAge > STALE_DAYS
        return (
          <>
            <PageHead
              title={n.title}
              crumbs={[{ href: '/kennis', label: 'Kennisbank' }, ...parts.map((p) => ({ label: p.replace(/^\d+_/, '').replace(/_/g, ' ') }))]}
            >
              <a className="btn ghost small" href={n.obsidian}>
                <Icon name="external" size={14} /> Open in Obsidian
              </a>
              {!n.archived && (
                <button
                  className={`btn small ${stale ? 'mark' : 'ghost'}`}
                  onClick={() => act('/api/notes/reviewed', { path: n.path })}
                  title="Zet 'reviewed' in de frontmatter op vandaag"
                >
                  <Icon name="check" size={14} /> Klopt nog
                </button>
              )}
            </PageHead>
            <div className="note-meta" style={{ marginTop: -6, marginBottom: 18 }}>
              {n.archived && <span className="chip brick">Archief · niet actueel</span>}
              {n.authority && <span className="chip">{n.authority === 'canonical' ? 'Gezaghebbend' : n.authority}</span>}
              {n.status && n.status !== 'active' && <span className="chip">{n.status}</span>}
              {n.fm.project_state && <span className="chip">{n.fm.project_state}</span>}
              {n.reviewed ? (
                <span className={`chip ${stale ? 'brick' : ''}`}>Gecontroleerd {ago(n.reviewedAge)}</span>
              ) : (
                <span className="chip">Gewijzigd {shortDate(new Date(n.mtime).toISOString().slice(0, 10), true)}</span>
              )}
              {n.tasks.total > 0 && (
                <span className="chip">
                  {n.tasks.done}/{n.tasks.total} afgevinkt
                </span>
              )}
              {n.chapters.map((c) => (
                <Link key={c} href={`/hoofdstukken/${c}`} className="chip">
                  H{c}
                </Link>
              ))}
            </div>
            {toc.length > 3 && (
              <details className="toc-mobile disclose">
                <summary>Inhoud ({toc.length})</summary>
                <nav className="toc" style={{ display: 'block', position: 'static', marginTop: 8 }}>
                  {toc.map((h) => (
                    <a key={h.slug} href={`#${h.slug}`} className={`l${h.level}`}>
                      {h.text}
                    </a>
                  ))}
                </nav>
              </details>
            )}
            <div className="note-layout">
              <div style={{ minWidth: 0 }}>
                <NoteHtml html={n.html} path={n.archived ? null : n.path} />
                {n.log?.length > 0 && <NoteLog entries={n.log} />}
                {n.backlinks.length > 0 && (
                  <section className="backlinks">
                    <Dim count={n.backlinks.length}>Verwijst hierheen</Dim>
                    {n.backlinks.map((b) => (
                      <Link key={b.path} href={noteHref(b.path)} className="kb-row">
                        <span className="t">{b.title}</span>
                        <span />
                        <span className="s">{b.path}</span>
                      </Link>
                    ))}
                  </section>
                )}
              </div>
              {toc.length > 3 && (
                <nav className="toc" aria-label="Inhoud">
                  <span className="label" style={{ display: 'block', marginBottom: 8 }}>
                    Inhoud
                  </span>
                  {toc.map((h) => (
                    <a
                      key={h.slug}
                      href={`#${h.slug}`}
                      className={`l${h.level}`}
                      onClick={(e) => (e.preventDefault(), document.getElementById(h.slug)?.scrollIntoView({ behavior: 'smooth' }))}
                    >
                      {h.text}
                    </a>
                  ))}
                </nav>
              )}
            </div>
          </>
        )
      }}
    </Gate>
  )
}
