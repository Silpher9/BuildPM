import { useState } from 'react'
import { Sheet, useLightbox } from './ui.jsx'
import { useAction, useApi } from '../lib/api.js'

// A photo series (log entry tagged #fotoserie) and where it landed in the reference 3D model.

const LABEL = {
  queued: '3D · in de wachtrij',
  running: '3D · wordt geplaatst…',
  done: '3D · geplaatst',
  failed: '3D · niet gelukt',
  off: 'Fotoserie',
}

export function SeriesBadge({ series }) {
  const [open, setOpen] = useState(false)
  if (!series) return null
  const n = series.summary?.registered
  const label = series.state === 'done' && n != null ? `${LABEL.done} · ${n}/${series.summary.total}` : LABEL[series.state] || LABEL.off
  return (
    <>
      <button
        type="button"
        className={`chip series-chip st-${series.state}`}
        onClick={() => series.state !== 'off' && setOpen(true)}
        disabled={series.state === 'off'}
      >
        {label}
      </button>
      {open && <SeriesSheet id={series.id} onClose={() => setOpen(false)} />}
    </>
  )
}

function SeriesSheet({ id, onClose }) {
  const state = useApi(`/api/series/${encodeURIComponent(id)}`)
  const act = useAction()
  const openLightbox = useLightbox()
  const s = state.data
  const r = s?.result
  const file = (f) => `/api/series/${encodeURIComponent(id)}/${f}`
  return (
    <Sheet title="Fotoserie in 3D" onClose={onClose}>
      {!s && <p className="label">Laden…</p>}
      {s && s.state !== 'done' && s.state !== 'failed' && (
        <p>
          {s.state === 'queued' ? 'Staat in de wachtrij.' : 'Wordt nu in het 3D-model van de scan geplaatst.'} Dit duurt een paar minuten. Je kunt dit venster
          sluiten.
        </p>
      )}
      {s?.state === 'failed' && (
        <>
          <div className="error-box">{s.error || 'Plaatsen is niet gelukt.'}</div>
          <button className="btn ghost" onClick={() => act('/api/series/retry', { id }).then(onClose, () => {})}>
            Opnieuw proberen
          </button>
        </>
      )}
      {r && (
        <div className="series-result">
          <p className="series-sum">{s.summary?.text}</p>
          {r.advice?.length > 0 && (
            <ul className="series-advice">
              {r.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {r.plan && (
            <button className="series-img" onClick={() => openLightbox([file(r.plan)], 0, { raw: true })} aria-label="Plattegrond vergroten">
              <img src={file(r.plan)} alt="Plattegrond met de camerastanden van deze serie" />
            </button>
          )}
          {r.compare?.length > 0 && (
            <>
              <p className="label">Jouw foto naast de scan van 2023, vanaf dezelfde plek</p>
              {r.compare.map((f) => (
                <button key={f} className="series-img" onClick={() => openLightbox(r.compare.map(file), r.compare.indexOf(f), { raw: true })}>
                  <img src={file(f)} alt="Foto naast de scan vanaf dezelfde plek" loading="lazy" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
