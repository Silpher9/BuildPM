import { createContext, useContext, useEffect, useRef } from 'react'
import { Link, useLocation } from 'wouter'
import Icon from './Icon.jsx'
import { useAction, useLive } from '../lib/api.js'
import { fileUrl } from '../lib/format.js'

export function PageHead({ no, title, lede, crumbs = [], children }) {
  return (
    <header className="page-head">
      <nav className="crumbs label" aria-label="Kruimelpad">
        <Link href="/">Start</Link>
        {crumbs.map((c) => (
          <span key={c.href || c.label} style={{ display: 'contents' }}>
            <span className="sep">/</span>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
          </span>
        ))}
      </nav>
      <h1 className="page-title">
        {no && <span className="no">{no}</span>}
        {title}
      </h1>
      {lede && <p className="page-lede">{lede}</p>}
      {children && <div className="head-actions">{children}</div>}
    </header>
  )
}

export function Dim({ children, count, right }) {
  return (
    <div className="dim" role="heading" aria-level={2}>
      <span>
        {children}
        {count != null && <span className="count"> · {count}</span>}
      </span>
      {right}
    </div>
  )
}

export function Tape({ value = 0, total = 0, label }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="tape-row" title={label}>
      <div className="tape" style={{ '--pct': `${pct}%` }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} />
      <span className="val">
        {value}/{total}
      </span>
    </div>
  )
}

export function Loading({ what = 'Laden' }) {
  return <div className="loading label">{what}…</div>
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="error-box">{error.message || String(error)}</div>
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      {title && <b>{title}</b>}
      {children}
    </div>
  )
}

/** Wait for data; show the page skeleton meanwhile. */
export function Gate({ state, children, what }) {
  if (state.error && !state.data) return <ErrorBox error={state.error} />
  if (!state.data) return <Loading what={what} />
  return children(state.data)
}

export function ChapterChips({ chapters = [] }) {
  if (!chapters.length) return null
  return chapters.map((n) => (
    <Link key={n} href={`/hoofdstukken/${n}`} className="chip">
      H{n}
    </Link>
  ))
}

// ---------------------------------------------------------------- lightbox

export const LightboxContext = createContext(() => {})
export const useLightbox = () => useContext(LightboxContext)

export function Lightbox({ items, index, onClose, onMove }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onMove(1)
      if (e.key === 'ArrowLeft') onMove(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onMove])
  const item = items[index]
  if (!item) return null
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Afbeelding" onClick={onClose}>
      <img src={fileUrl(item, 1800)} alt={item.split('/').pop()} onClick={(e) => e.stopPropagation()} />
      <div className="bar" onClick={(e) => e.stopPropagation()}>
        <span className="name">{item.split('/').pop()}</span>
        {items.length > 1 && (
          <>
            <button className="btn ghost small" onClick={() => onMove(-1)} aria-label="Vorige">
              <Icon name="left" size={16} />
            </button>
            <span>
              {index + 1}/{items.length}
            </span>
            <button className="btn ghost small" onClick={() => onMove(1)} aria-label="Volgende">
              <Icon name="right" size={16} />
            </button>
          </>
        )}
        <a className="btn ghost small" href={fileUrl(item)} target="_blank" rel="noreferrer">
          Origineel
        </a>
        <button className="btn ghost small" onClick={onClose} aria-label="Sluiten">
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- vault html

/**
 * Renders HTML produced by the server for a note: wikilinks navigate inside the
 * app, embedded images open the lightbox, checkboxes write back to the note.
 */
export function NoteHtml({ html, path, className = 'prose', inline = false }) {
  const ref = useRef(null)
  const [, navigate] = useLocation()
  const openLightbox = useLightbox()
  const act = useAction()
  const { openCapture } = useLive()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClick = (e) => {
      const a = e.target.closest('a')
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return
      if (a.dataset.lightbox) {
        e.preventDefault()
        const all = [...el.querySelectorAll('a[data-lightbox]')].map((x) => x.dataset.lightbox)
        openLightbox(all, all.indexOf(a.dataset.lightbox))
        return
      }
      const href = a.getAttribute('href') || ''
      if (href.startsWith('/') && !href.startsWith('/api/')) {
        e.preventDefault()
        navigate(href)
        if (href.includes('#')) setTimeout(() => document.getElementById(decodeURIComponent(href.split('#')[1]))?.scrollIntoView(), 120)
        else window.scrollTo(0, 0)
      } else if (href.startsWith('#')) {
        e.preventDefault()
        document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
      }
    }
    const onChange = async (e) => {
      const box = e.target
      if (box.matches('input[type=file][data-photo-heading]') && path) {
        const files = [...box.files]
        box.value = ''
        if (files.length) openCapture?.('log', { photos: files, link: path, heading: box.dataset.photoHeading })
        return
      }
      if (box.matches('input.fill') && path) {
        const value = box.value.trim()
        if (!value) return
        box.disabled = true
        try {
          await act('/api/notes/fill', { path, line: Number(box.dataset.line), lineHash: box.dataset.lineHash, idx: Number(box.dataset.idx), value })
        } catch {
          box.disabled = false
        }
        return
      }
      if (!box.matches('input.task') || !path) return
      box.disabled = true
      try {
        await act('/api/notes/task', { path, line: Number(box.dataset.line), taskId: box.dataset.task, done: box.checked })
      } catch {
        box.checked = !box.checked
      } finally {
        box.disabled = false
      }
    }
    const onKey = (e) => {
      if (e.key === 'Enter' && e.target.matches('input.fill')) e.target.blur()
    }
    el.addEventListener('click', onClick)
    el.addEventListener('change', onChange)
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('click', onClick)
      el.removeEventListener('change', onChange)
      el.removeEventListener('keydown', onKey)
    }
  }, [navigate, openLightbox, act, path, openCapture])

  const Tag = inline ? 'span' : 'div'
  return <Tag ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

// ---------------------------------------------------------------- sheet

export function Sheet({ title, onClose, children, label }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label || title}>
        <div className="grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Sluiten">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

/** Close a popup menu on outside click or Escape. */
export function useDismiss(open, setOpen) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])
  return ref
}
