import { useState } from 'react'
import { PageHead, Gate, Dim, Empty, useLightbox } from '../components/ui.jsx'
import { NoteRow } from './Knowledge.jsx'
import { useApi } from '../lib/api.js'
import { fileUrl, shortDate } from '../lib/format.js'

function caption(img) {
  const base = img.name
    .split('---')[0]
    .replace(/\.\w+$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}_?/, '')
    .replace(/_/g, ' ')
  return img.date ? `${shortDate(img.date)} · ${base}` : base
}

function Gallery({ images }) {
  const open = useLightbox()
  const paths = images.map((i) => i.path)
  return (
    <div className="gallery">
      {images.map((img, i) => (
        <button key={img.path} onClick={() => open(paths, i)} aria-label={`Open ${img.name}`}>
          <img src={fileUrl(img.path, 480)} alt={img.name} loading="lazy" />
          <span className="cap">{caption(img)}</span>
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
        lede="De geannoteerde renders zijn de werkbasis; de foto’s laten de huidige toestand zien. Het ruimteboek houdt per kamer bij waar het op moet letten."
      />
      <Gate state={state}>
        {(d) => {
          const renders = d.images.filter((i) => i.render)
          const photos = d.images.filter((i) => !i.render)
          return (
            <>
              <Dim count={renders.length}>Renders</Dim>
              {renders.length ? <Gallery images={renders} /> : <Empty>Geen renders gevonden.</Empty>}
              {photos.length > 0 && (
                <>
                  <Dim count={photos.length}>Foto’s uit de vault</Dim>
                  <Gallery images={photos} />
                </>
              )}
              <Dim count={d.rooms.length}>Ruimteboek</Dim>
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
