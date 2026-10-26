import { useState } from 'react'
import { Link } from 'wouter'
import { PageHead, Gate, Dim, Empty, NoteHtml, useLightbox } from '../components/ui.jsx'
import { NoteRow } from './Knowledge.jsx'
import { useApi } from '../lib/api.js'
import { fileUrl, shortDate, noteHref } from '../lib/format.js'

function caption(img, withDate) {
  const base = img.name
    .split('---')[0]
    .replace(/\.\w+$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}_?/, '')
    .replace(/_/g, ' ')
  return withDate && img.date ? `${shortDate(img.date)} · ${base}` : base
}

function ImageSet({ set }) {
  const [open, setOpen] = useState(!set.superseded)
  return (
    <section>
      <Dim
        count={set.images.length}
        right={
          set.note && (
            <Link href={noteHref(set.note.path)} className="label">
              notitie →
            </Link>
          )
        }
      >
        {set.title}
        {set.date ? ` · ${shortDate(set.date, true)}` : ''}
      </Dim>
      {set.superseded && (
        <p className="chips" style={{ alignItems: 'center', margin: '-4px 0 12px' }}>
          <span className="chip brick">Verouderd</span>
          <button className="more-btn label" onClick={() => setOpen((o) => !o)}>
            {open ? '− verbergen' : '+ toon de oude beelden'}
          </button>
        </p>
      )}
      {open && <Gallery images={set.images} withDate={!set.date} />}
    </section>
  )
}

function Gallery({ images, withDate = true }) {
  const open = useLightbox()
  const paths = images.map((i) => i.path)
  return (
    <div className="gallery">
      {images.map((img, i) => (
        <button key={img.path} onClick={() => open(paths, i)} aria-label={`Open ${img.name}`}>
          <img src={fileUrl(img.path, 480)} alt={img.name} loading="lazy" />
          <span className="cap">{caption(img, withDate)}</span>
        </button>
      ))}
    </div>
  )
}

function Room({ r }) {
  const [more, setMore] = useState(false)
  return (
    <article id={`ruimte-${r.n}`} className="room">
      <h3>
        <span className="no">{String(r.n).padStart(2, '0')}</span>
        {r.name}
      </h3>
      <p className="rol">{r.rol}</p>
      {r.risicos.length > 0 && (
        <>
          <div className="label">Risico’s</div>
          <ul>
            {r.risicos.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {more && (
        <>
          {r.relaties.length > 0 && (
            <>
              <div className="label">Relaties</div>
              <ul>
                {r.relaties.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {r.kwaliteiten.length > 0 && (
            <>
              <div className="label">Kwaliteiten</div>
              <ul>
                {r.kwaliteiten.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {r.checks.length > 0 && (
            <>
              <div className="label">Later checken</div>
              <ul>
                {r.checks.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <button className="more-btn label" style={{ padding: '4px 0' }} onClick={() => setMore((m) => !m)}>
        {more ? '− minder' : '+ relaties, kwaliteiten, checks'}
      </button>
    </article>
  )
}

export default function Design() {
  const state = useApi('/api/design')
  return (
    <>
      <PageHead
        no="08"
        title="Ontwerp"
        crumbs={[{ label: 'Ontwerp' }]}
        lede="Het actuele ontwerpmodel, ook in de gescande schuur, met daaronder de bestaande toestand. Het ruimteboek houdt per kamer bij waar het op moet letten."
      />
      <Gate state={state}>
        {(d) => {
          return (
            <>
              {d.sets.length ? d.sets.map((s) => <ImageSet key={s.folder} set={s} />) : <Empty>Geen beelden gevonden.</Empty>}
              <Dim
                count={d.rooms.length}
                right={
                  <Link href={noteHref(d.roomsNote)} className="label">
                    notitie →
                  </Link>
                }
              >
                Ruimteboek
              </Dim>
              {d.roomsWarning && (
                <div className="error-box" style={{ borderLeftColor: 'var(--mark)', background: 'var(--mark-soft)', marginBottom: 12 }}>
                  <NoteHtml html={d.roomsWarning} className="" />
                </div>
              )}
              <div className="grid-cards">
                {d.rooms.map((r) => (
                  <Room key={r.n} r={r} />
                ))}
              </div>
              <Dim count={d.notes.length}>Ontwerpnotities</Dim>
              <div>
                {d.notes.map((n) => (
                  <NoteRow key={n.path} n={n} />
                ))}
              </div>
            </>
          )
        }}
      </Gate>
    </>
  )
}
