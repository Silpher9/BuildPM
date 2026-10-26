import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { Sheet } from './ui.jsx'
import { useAction, useApi, uploadPhotos, useLive } from '../lib/api.js'

// One place to put anything down, from the phone on site:
// a log entry (with photos), a task, a decision or a purchase.

const KINDS = [
  { key: 'log', label: 'Logboek', hint: 'Wat is er gebeurd? Foto’s erbij.' },
  { key: 'task', label: 'Taak', hint: 'Komt op het Kanban-bord.' },
  { key: 'decision', label: 'Besluit', hint: 'Komt bovenaan het besluitenlog.' },
  { key: 'buy', label: 'Aankoop', hint: 'Komt in voorraad & kosten.' },
]
const MAX_PHOTOS = 8

/** How to walk a series: step sideways, keep aiming at the same spot. */
function SeriesHowTo() {
  return (
    <div className="series-howto">
      <svg viewBox="0 0 220 96" aria-hidden="true">
        <line x1="8" y1="12" x2="212" y2="12" className="wall" />
        <circle cx="110" cy="14" r="5" className="aim" />
        {[38, 86, 134, 182].map((x, i) => (
          <g key={x}>
            <line x1={x} y1="70" x2="110" y2="18" className="sight" />
            <rect x={x - 7} y="68" width="14" height="22" rx="3" className="phone" />
            <text x={x} y="83" textAnchor="middle" className="n">
              {i + 1}
            </text>
          </g>
        ))}
        <path d="M48 94 H76 M70 91 L76 94 L70 97" className="step" />
      </svg>
      <ul>
        <li>
          <b>Stap na elke foto 30–50 cm opzij</b> en richt weer op hetzelfde punt.
        </li>
        <li>Niet op één plek draaien: dan zie ik geen diepte.</li>
        <li>Steeds de 1×-lens, niet zoomen. Een rolmaat in beeld helpt.</li>
      </ul>
    </div>
  )
}

export default function Capture({
  onClose,
  initial = 'log',
  photos: initialPhotos = [],
  link: initialLink = '',
  heading: initialHeading = '',
  series = 0,
  pref,
}) {
  const [kind, setKind] = useState(initial)
  const [text, setText] = useState('')
  const [extra, setExtra] = useState('')
  const [lane, setLane] = useState('now')
  const [chapter, setChapter] = useState('')
  const [amount, setAmount] = useState('')
  const [cost, setCost] = useState('')
  const [status, setStatus] = useState('aanwezig')
  const [link, setLink] = useState(initialLink || '')
  const [heading, setHeading] = useState(initialHeading || '')
  // Claude's preference for this spot: 0 = one photo, n = a series of n, undefined = none.
  const [want, setWant] = useState(pref == null ? (series ? { series } : null) : { series: pref })
  const [mode, setMode] = useState(series ? 'series' : 'single')
  const [target, setTarget] = useState(series || pref || 4)
  const [photos, setPhotos] = useState(() => [...initialPhotos].slice(0, MAX_PHOTOS).map((f) => ({ file: f, url: URL.createObjectURL(f) })))
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const camRef = useRef(null)
  const urls = useRef([])
  urls.current = photos.map((p) => p.url)
  const act = useAction()
  const { toast } = useLive()
  const board = useApi(kind === 'task' ? '/api/board' : null)
  const links = useApi('/api/links')
  const requests = useApi(kind === 'log' && !initialLink ? '/api/photo-requests' : null)

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const addPhotos = (files) => {
    const list = [...files].slice(0, MAX_PHOTOS - photos.length).map((f) => ({ file: f, url: URL.createObjectURL(f) }))
    setPhotos((p) => [...p, ...list])
  }

  const pickRequest = (r) => {
    setLink(r.path)
    setHeading(r.heading)
    setWant({ series: r.series, reason: r.reason })
    if (r.series) setTarget(r.series)
    if (!photos.length) setMode(r.series ? 'series' : 'single')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (kind === 'log') {
        let images = []
        if (photos.length) {
          toast({ text: `${photos.length} foto${photos.length > 1 ? '’s' : ''} uploaden…` })
          const res = await uploadPhotos(
            photos.map((p) => p.file),
            text.split(/\s+/).slice(0, 4).join(' ') || heading || (mode === 'series' ? 'serie' : 'logboek'),
          )
          images = res.paths
        }
        await act('/api/logbook', { text, images, link: link || undefined, heading: heading || undefined, series: mode === 'series' && images.length > 1 })
      } else if (kind === 'task') {
        const linkNote = links.data?.notes.find((n) => n.path === link)
        const name = linkNote ? linkNote.path.split('/').pop().replace(/\.md$/, '') : ''
        await act('/api/kanban', { op: 'add', lane, text: name ? `${text} → [[${name}]]` : text, position: 'top' })
      } else if (kind === 'decision') {
        await act('/api/decisions', { decision: text, chapter, impact: extra })
      } else if (kind === 'buy') {
        await act('/api/inventory', { item: text, amount, status, purpose: extra, cost })
      }
      onClose()
    } catch {
      // toast already shown
    } finally {
      setBusy(false)
    }
  }

  const lanes = board.data?.lanes.filter((l) => l.role !== 'done') || []
  const current = KINDS.find((k) => k.key === kind)

  return (
    <Sheet title={kind === 'log' && mode === 'series' ? 'Fotoserie' : 'Vastleggen'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="seg scroll" role="group" aria-label="Soort">
          {KINDS.map((k) => (
            <button type="button" key={k.key} aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="label" style={{ margin: 0 }}>
          {current.hint}
        </p>

        <label className="field">
          <span>{kind === 'buy' ? 'Wat' : kind === 'decision' ? 'Besluit' : kind === 'task' ? 'Taak' : 'Notitie'}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={kind === 'buy' ? 2 : 3}
            autoFocus={kind !== 'log' || (!initialPhotos.length && !series)}
            required={kind !== 'log' || !photos.length}
            placeholder={
              kind === 'log'
                ? 'Bijv. vloer op 12 punten ingemeten, max. verloop 9 cm'
                : kind === 'task'
                  ? 'Bijv. Waterschap bellen over meldingsformulier'
                  : kind === 'decision'
                    ? 'Bijv. Douche oudersbadkamer komt 4 cm hoger voor afschot'
                    : 'Bijv. WÜPOR cellenbetonblokken 600×200×100'
            }
          />
        </label>

        {kind === 'log' && (
          <PhotoPart
            photos={photos}
            setPhotos={setPhotos}
            mode={mode}
            setMode={setMode}
            target={target}
            want={want}
            camRef={camRef}
            fileRef={fileRef}
            addPhotos={addPhotos}
          />
        )}

        {kind === 'log' && !link && requests.data?.requests.length > 0 && (
          <div className="field">
            <span>Gevraagd door Claude</span>
            <div className="req-list">
              {requests.data.requests.slice(0, 6).map((r) => (
                <button type="button" key={r.path + r.heading} className="req" onClick={() => pickRequest(r)}>
                  <span className="t">{r.heading || r.title}</span>
                  <span className="d">
                    {r.series ? `Liefst een serie van ${r.series}` : 'Eén foto is genoeg'} · {r.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === 'task' && (
          <label className="field">
            <span>Kolom</span>
            <select value={lane} onChange={(e) => setLane(e.target.value)}>
              {lanes.length ? (
                lanes.map((l) => (
                  <option key={l.title} value={l.title}>
                    {l.title}
                  </option>
                ))
              ) : (
                <option value="now">Nu</option>
              )}
            </select>
          </label>
        )}

        {heading && link && kind === 'log' && (
          <p className="chips" style={{ margin: 0 }}>
            <span className="chip mark">Bij: {heading}</span>
          </p>
        )}
        {(kind === 'log' || kind === 'task') && (
          <label className="field">
            <span>Hoort bij (optioneel)</span>
            <select
              value={link}
              onChange={(e) => {
                setLink(e.target.value)
                setHeading('')
              }}
            >
              <option value="">—</option>
              {links.data?.notes.map((n) => (
                <option key={n.path} value={n.path}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {kind === 'decision' && (
          <div className="form-row">
            <label className="field">
              <span>Hoofdstuk</span>
              <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={`H${n}`}>
                    H{n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Impact (optioneel)</span>
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Wat verandert hierdoor?" />
            </label>
          </div>
        )}

        {kind === 'buy' && (
          <>
            <div className="form-row">
              <label className="field">
                <span>Hoeveelheid</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bijv. 60 st." />
              </label>
              <label className="field">
                <span>Kosten (€)</span>
                <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="Bijv. 412,50" />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="aanwezig">Aanwezig</option>
                  <option value="besteld">Besteld</option>
                  <option value="nodig">Nog nodig</option>
                  <option value="verwerkt">Verwerkt</option>
                </select>
              </label>
              <label className="field">
                <span>Bestemd voor</span>
                <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Bijv. Vloer — kim" />
              </label>
            </div>
          </>
        )}

        <div className="sheet-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuleren
          </button>
          <button type="submit" className="btn mark" disabled={busy}>
            {busy ? 'Bezig…' : mode === 'series' && kind === 'log' && photos.length > 1 ? `Serie vastleggen (${photos.length})` : 'Vastleggen'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

/** Photos for a log entry: one photo or a guided series, with Claude's preference marked. */
function PhotoPart({ photos, setPhotos, mode, setMode, target, want, camRef, fileRef, addPhotos }) {
  const prefSeries = want?.series > 0
  const prefSingle = want != null && !want.series
  const n = photos.length
  return (
    <div className="field">
      <span>Foto’s</span>
      <div className="seg photo-mode" role="group" aria-label="Eén foto of een serie">
        <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
          1 foto{prefSingle && <em>voorkeur</em>}
        </button>
        <button type="button" aria-pressed={mode === 'series'} onClick={() => setMode('series')}>
          Serie voor 3D{prefSeries && <em>voorkeur</em>}
        </button>
      </div>
      {want && (
        <p className="pref-note">
          {prefSeries ? `Claude heeft hier liever een serie van ${want.series}` : 'Eén foto is hier genoeg'}
          {want.reason ? `: ${want.reason}` : '.'}
        </p>
      )}
      {mode === 'series' && <SeriesHowTo />}
      <div className="photo-row">
        {photos.map((p, i) => (
          <div className="thumb" key={p.url}>
            <img src={p.url} alt="" />
            {mode === 'series' && <span className="thumb-n">{i + 1}</span>}
            <button type="button" aria-label="Foto verwijderen" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        {mode === 'series' &&
          Array.from({ length: Math.max(0, target - n) }, (_, i) => (
            <div className="thumb slot" key={'s' + i}>
              {n + i + 1}
            </div>
          ))}
        {n < MAX_PHOTOS && (
          <>
            <button type="button" className="btn mark" onClick={() => camRef.current?.click()}>
              <Icon name="camera" size={16} /> {mode === 'series' ? (n < target ? `Foto ${n + 1} van ${target}` : 'Nog een foto') : n ? 'Nog een' : 'Camera'}
            </button>
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
              Uit galerij
            </button>
          </>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
      </div>
      {mode === 'series' && (
        <p className="label" style={{ margin: 0 }}>
          {n === 0
            ? 'Begin aan één kant.'
            : n < 3
              ? 'Minstens 3 foto’s zijn nodig voor 3D.'
              : n < target
                ? 'Genoeg voor 3D. Meer mag.'
                : 'Klaar om vast te leggen.'}
        </p>
      )}
      {mode === 'single' && n === 1 && prefSeries && (
        <button type="button" className="btn ghost small nudge" onClick={() => setMode('series')}>
          Toch een serie: nog {Math.max(2, want.series - 1)} foto’s, steeds een stap opzij
        </button>
      )}
    </div>
  )
}
