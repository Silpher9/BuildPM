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

export default function Capture({ onClose, initial = 'log', photos: initialPhotos = [], link: initialLink = '', heading = '' }) {
  const [kind, setKind] = useState(initial)
  const [text, setText] = useState('')
  const [extra, setExtra] = useState('')
  const [lane, setLane] = useState('now')
  const [chapter, setChapter] = useState('')
  const [amount, setAmount] = useState('')
  const [cost, setCost] = useState('')
  const [status, setStatus] = useState('aanwezig')
  const [link, setLink] = useState(initialLink || '')
  const [photos, setPhotos] = useState(() => [...initialPhotos].slice(0, 6).map((f) => ({ file: f, url: URL.createObjectURL(f) })))
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const camRef = useRef(null)
  const urls = useRef([])
  urls.current = photos.map((p) => p.url)
  const act = useAction()
  const { toast } = useLive()
  const board = useApi(kind === 'task' ? '/api/board' : null)
  const links = useApi('/api/links')

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const addPhotos = (files) => {
    const list = [...files].slice(0, 6 - photos.length).map((f) => ({ file: f, url: URL.createObjectURL(f) }))
    setPhotos((p) => [...p, ...list])
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
            text.split(/\s+/).slice(0, 4).join(' ') || heading || 'logboek',
          )
          images = res.paths
        }
        await act('/api/logbook', { text, images, link: link || undefined, heading: link === initialLink ? heading || undefined : undefined })
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
    <Sheet title="Vastleggen" onClose={onClose}>
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
            autoFocus
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
          <div className="field">
            <span>Foto’s</span>
            <div className="photo-row">
              {photos.map((p, i) => (
                <div className="thumb" key={p.url}>
                  <img src={p.url} alt="" />
                  <button type="button" aria-label="Foto verwijderen" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <>
                  <button type="button" className="btn mark" onClick={() => camRef.current?.click()}>
                    <Icon name="camera" size={16} /> Camera
                  </button>
                  <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
                    Uit galerij
                  </button>
                </>
              )}
              <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))}
              />
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
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

        {heading && link === initialLink && kind === 'log' && (
          <p className="chips" style={{ margin: 0 }}>
            <span className="chip mark">Bij: {heading}</span>
          </p>
        )}
        {(kind === 'log' || kind === 'task') && (
          <label className="field">
            <span>Hoort bij (optioneel)</span>
            <select value={link} onChange={(e) => setLink(e.target.value)}>
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
            {busy ? 'Bezig…' : 'Vastleggen'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
