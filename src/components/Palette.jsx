import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import Icon from './Icon.jsx'
import { getJson } from '../lib/api.js'
import { SECTIONS } from '../lib/format.js'

const KIND = { note: 'N', task: 'T', decision: 'B', question: 'V', room: 'R', section: '§' }
const KIND_TITLE = { note: 'Notitie', task: 'Taak', decision: 'Besluit', question: 'Vraag', room: 'Ruimte', section: 'Onderdeel' }

export default function Palette({ onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [sel, setSel] = useState(0)
  const [, navigate] = useLocation()
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setResults(SECTIONS.map((s) => ({ kind: 'section', title: s.title, sub: s.desc, href: s.href })))
      setSel(0)
      return
    }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const lower = term.toLowerCase()
        const sections = SECTIONS.filter((s) => s.title.toLowerCase().includes(lower)).map((s) => ({
          kind: 'section',
          title: s.title,
          sub: s.desc,
          href: s.href,
        }))
        const res = await getJson(`/api/search?q=${encodeURIComponent(term)}`)
        if (alive) {
          setResults([...sections, ...res.results])
          setSel(0)
        }
      } catch {
        // ignore; keep previous results
      }
    }, 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const go = (r) => {
    if (!r) return
    onClose()
    navigate(r.href.split('#')[0])
    const hash = r.href.split('#')[1]
    setTimeout(() => {
      if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'center' })
      else window.scrollTo(0, 0)
    }, 250)
  }

  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(results.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[sel])
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Zoeken">
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Zoek in notities, taken, besluiten…"
            aria-label="Zoekterm"
          />
          <button className="icon-btn" onClick={onClose} aria-label="Sluiten">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="palette-results" role="listbox">
          {results.map((r, i) => (
            <a
              key={r.kind + r.href + i}
              href={r.href}
              className={i === sel ? 'sel' : ''}
              role="option"
              aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={(e) => {
                e.preventDefault()
                go(r)
              }}
            >
              <span className="k" title={KIND_TITLE[r.kind]}>
                {KIND[r.kind]}
              </span>
              <span className="t">{r.title}</span>
              <span className="s">
                {r.sub}
                {r.snippet ? ` — ${r.snippet}` : ''}
              </span>
            </a>
          ))}
          {q.trim() && !results.length && (
            <p className="label" style={{ padding: 14 }}>
              Niets gevonden
            </p>
          )}
        </div>
      </div>
    </>
  )
}
