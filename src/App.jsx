import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, Switch, useLocation } from 'wouter'
import Icon, { BrandMark } from './components/Icon.jsx'
import { Lightbox, LightboxContext } from './components/ui.jsx'
import Capture from './components/Capture.jsx'
import Palette from './components/Palette.jsx'
import { LiveContext, getJson, postJson } from './lib/api.js'
import { SECTIONS } from './lib/format.js'
import Home from './views/Home.jsx'
import Board from './views/Board.jsx'
import Phases from './views/Phases.jsx'
import Chapters, { Chapter } from './views/Chapters.jsx'
import Decisions from './views/Decisions.jsx'
import Questions from './views/Questions.jsx'
import Work from './views/Work.jsx'
import Knowledge, { Note } from './views/Knowledge.jsx'
import Design from './views/Design.jsx'
import Logbook from './views/Logbook.jsx'
import Inventory from './views/Inventory.jsx'
import Review from './views/Review.jsx'

function useLiveVersion() {
  const [version, setVersion] = useState(0)
  const [online, setOnline] = useState(true)
  useEffect(() => {
    let es
    let retry
    const connect = () => {
      es = new EventSource('/api/events')
      es.addEventListener('hello', (e) => {
        setOnline(true)
        setVersion((v) => Math.max(v, JSON.parse(e.data).version) + 0.001)
      })
      es.addEventListener('change', (e) => setVersion(JSON.parse(e.data).version))
      es.onerror = () => {
        setOnline(false)
        es.close()
        retry = setTimeout(connect, 4000)
      }
    }
    connect()
    return () => {
      clearTimeout(retry)
      es?.close()
    }
  }, [])
  return { version, online, bump: () => setVersion((v) => v + 0.001) }
}

function useToasts() {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (t) => {
      const id = ++seq.current
      setToasts((list) => [...list.slice(-2), { ...t, id }])
      setTimeout(() => dismiss(id), t.undo ? 7000 : t.error ? 6000 : 3200)
    },
    [dismiss],
  )
  return { toasts, toast, dismiss }
}

function PinScreen({ onDone }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="pin-screen">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await postJson('/api/login', { pin })
            onDone()
          } catch (x) {
            setErr(x.message)
          }
        }}
      >
        <BrandMark className="brand-mark" />
        <h1 className="page-title" style={{ fontSize: 28 }}>
          BuildPM
        </h1>
        <label className="field">
          <span>Pincode</span>
          <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
        </label>
        {err && <div className="error-box">{err}</div>}
        <button className="btn mark">Openen</button>
      </form>
    </div>
  )
}

export default function App() {
  const live = useLiveVersion()
  const { toasts, toast, dismiss } = useToasts()
  const [location] = useLocation()
  const [capture, setCapture] = useState(null)
  const [palette, setPalette] = useState(false)
  const [menu, setMenu] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const [needPin, setNeedPin] = useState(false)
  const [title, setTitle] = useState({ title: 'BuildPM', subtitle: '' })

  useEffect(() => {
    const onPin = () => setNeedPin(true)
    window.addEventListener('buildpm:pin', onPin)
    return () => window.removeEventListener('buildpm:pin', onPin)
  }, [])

  useEffect(() => {
    getJson('/api/overview')
      .then((o) => {
        setTitle({ title: o.title, subtitle: o.subtitle })
        document.title = `${o.title} · BuildPM`
      })
      .catch(() => {})
  }, [live.version])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPalette(true)
      } else if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setCapture('log')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setMenu(false), [location])

  const undo = useCallback(async () => {
    try {
      const res = await postJson('/api/undo')
      toast({ text: res.label })
    } catch (err) {
      toast({ text: err.message, error: true })
    }
  }, [toast])

  const ctx = useMemo(
    () => ({ version: live.version, online: live.online, toast, refresh: live.bump, openCapture: (k) => setCapture(k || 'log') }),
    [live.version, live.online, toast, live.bump],
  )
  const openLightbox = useCallback((items, index = 0) => setLightbox({ items, index: Math.max(0, index) }), [])

  if (needPin) return <PinScreen onDone={() => (setNeedPin(false), live.bump())} />

  const isActive = (href) => location === href || location.startsWith(href + '/')

  return (
    <LiveContext.Provider value={ctx}>
      <LightboxContext.Provider value={openLightbox}>
        <div className="app">
          <aside className="side">
            <Link href="/" className="brand">
              <BrandMark />
              <span className="brand-text">
                <b>{title.title}</b>
                <span>BuildPM</span>
              </span>
            </Link>
            <button className="side-search" onClick={() => setPalette(true)}>
              <Icon name="search" size={16} /> Zoeken <kbd>/</kbd>
            </button>
            <nav className="side-nav" aria-label="Onderdelen">
              <Link href="/" className={`home-link ${location === '/' ? 'active' : ''}`}>
                <span className="no">00</span>
                <span>Start</span>
              </Link>
              {SECTIONS.map((s) => (
                <Link key={s.href} href={s.href} className={isActive(s.href) ? 'active' : ''}>
                  <span className="no">{s.no}</span>
                  <span>{s.title}</span>
                </Link>
              ))}
            </nav>
            <div className="side-foot">
              <button className="btn mark" onClick={() => setCapture('log')}>
                <Icon name="plus" size={16} /> Vastleggen
              </button>
              <Link href="/rondje" className="btn ghost">
                <Icon name="round" size={16} /> Rondje bouw
              </Link>
              <span className={`live-dot ${live.online ? '' : 'off'}`}>{live.online ? 'Live met de vault' : 'Verbinding weg'}</span>
            </div>
          </aside>

          <div>
            <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
              <Link href="/" className="brand">
                <BrandMark />
                <span className="brand-text">
                  <b>{title.title}</b>
                  <span>BuildPM</span>
                </span>
              </Link>
              <button className="icon-btn" onClick={() => setPalette(true)} aria-label="Zoeken">
                <Icon name="search" />
              </button>
            </header>

            <main className="main">
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/taken" component={Board} />
                <Route path="/fasen" component={Phases} />
                <Route path="/hoofdstukken" component={Chapters} />
                <Route path="/hoofdstukken/:n">{(p) => <Chapter n={Number(p.n)} />}</Route>
                <Route path="/besluiten" component={Decisions} />
                <Route path="/vragen" component={Questions} />
                <Route path="/werk" component={Work} />
                <Route path="/kennis" component={Knowledge} />
                <Route path="/n/*">{(p) => <Note path={decodeURIComponent(p['*'])} />}</Route>
                <Route path="/ontwerp" component={Design} />
                <Route path="/logboek" component={Logbook} />
                <Route path="/voorraad" component={Inventory} />
                <Route path="/rondje" component={Review} />
                <Route>
                  <div className="page-head">
                    <h1 className="page-title">Niet gevonden</h1>
                    <p className="page-lede">
                      Deze pagina bestaat niet. <Link href="/">Terug naar start</Link>
                    </p>
                  </div>
                </Route>
              </Switch>
            </main>
          </div>

          <nav className="tabbar" aria-label="Hoofdmenu">
            <Link href="/" className={location === '/' ? 'active' : ''}>
              <Icon name="home" />
              Start
            </Link>
            <Link href="/taken" className={isActive('/taken') ? 'active' : ''}>
              <Icon name="board" />
              Taken
            </Link>
            <button className="capture-tab" onClick={() => setCapture('log')} aria-label="Vastleggen">
              <span className="capture-fab">
                <Icon name="plus" size={24} />
              </span>
            </button>
            <Link href="/kennis" className={isActive('/kennis') || location.startsWith('/n/') ? 'active' : ''}>
              <Icon name="book" />
              Kennis
            </Link>
            <button onClick={() => setMenu(true)} aria-label="Alle onderdelen">
              <Icon name="menu" />
              Meer
            </button>
          </nav>
        </div>

        {menu && <MenuSheet onClose={() => setMenu(false)} />}
        {capture && <Capture initial={capture} onClose={() => setCapture(null)} />}
        {palette && <Palette onClose={() => setPalette(false)} />}
        {lightbox && (
          <Lightbox
            items={lightbox.items}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
            onMove={(d) => setLightbox((l) => ({ ...l, index: (l.index + d + l.items.length) % l.items.length }))}
          />
        )}
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
              <span className="t">{t.text}</span>
              {t.undo && (
                <button
                  onClick={() => {
                    dismiss(t.id)
                    undo()
                  }}
                >
                  Ongedaan maken
                </button>
              )}
            </div>
          ))}
        </div>
      </LightboxContext.Provider>
    </LiveContext.Provider>
  )
}

function MenuSheet({ onClose }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Alle onderdelen">
        <div className="grip" />
        <div className="sheet-head">
          <h2>Alle onderdelen</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Sluiten">
            <Icon name="x" />
          </button>
        </div>
        <ul className="index">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} onClick={onClose}>
                <span className="no">{s.no}</span>
                <span>
                  <span className="t">{s.title}</span>
                  <span className="d">{s.desc}</span>
                </span>
                <span />
                <Icon name="right" size={16} className="arrow" />
              </Link>
            </li>
          ))}
          <li>
            <Link href="/rondje" onClick={onClose}>
              <span className="no">↻</span>
              <span>
                <span className="t">Rondje bouw</span>
                <span className="d">Drie minuten om alles weer bij te werken</span>
              </span>
              <span />
              <Icon name="right" size={16} className="arrow" />
            </Link>
          </li>
        </ul>
      </div>
    </>
  )
}
