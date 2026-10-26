import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import express from 'express'
import Busboy from 'busboy'
import { config, ensureDirs } from './config.js'
import { Vault } from './vault.js'
import * as D from './domain.js'
import * as A from './actions.js'
import { imageFile, keepOriginal, prepareUpload } from './images.js'
import { SERIES_FILES, enqueueSeries, onSeriesChange, resumeSeries, seriesDir, seriesEnabled, seriesStatus } from './series.js'
import { HttpError } from './util.js'

ensureDirs()
const vault = new Vault()
if (!fs.existsSync(vault.root)) {
  console.error(`[buildpm] Projectmap niet gevonden: ${vault.root}\nZet VAULT_PATH en PROJECT_DIR in .env`)
  process.exit(1)
}
vault.watch()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

// ---------------------------------------------------------------- optional PIN

const pinToken = config.pin
  ? crypto
      .createHash('sha256')
      .update('buildpm:' + config.pin)
      .digest('hex')
  : null
const hasPin = (req) => !pinToken || (req.headers.cookie || '').split(/;\s*/).includes(`buildpm=${pinToken}`)

app.post('/api/login', (req, res) => {
  if (!pinToken) return res.json({ ok: true })
  if (String(req.body?.pin || '') !== config.pin) return res.status(401).json({ error: 'Onjuiste pincode' })
  res.setHeader('Set-Cookie', `buildpm=${pinToken}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`)
  res.json({ ok: true })
})

app.use('/api', (req, res, next) => {
  if (hasPin(req)) return next()
  res.status(401).json({ error: 'pin' })
})

// ---------------------------------------------------------------- helpers

/** GET results are cached until the vault changes. */
const cache = new Map()
let seriesVersion = 0 // photo-series results live outside the vault but show up in its views
function cached(key, fn) {
  const version = `${vault.version}:${seriesVersion}`
  const hit = cache.get(key)
  if (hit && hit.version === version) return hit.value
  const value = fn()
  cache.set(key, { version, value })
  if (cache.size > 200) cache.delete(cache.keys().next().value)
  return value
}

const get = (route, fn) =>
  app.get(route, (req, res, next) => {
    try {
      res.json(fn(req))
    } catch (err) {
      next(err)
    }
  })

const post = (route, fn) =>
  app.post(route, (req, res, next) => {
    try {
      const result = fn(req.body || {}, req) || {}
      res.json({ ok: true, version: vault.version, undo: vault.lastGroup ? vault.lastGroup.label : null, ...result })
    } catch (err) {
      next(err)
    }
  })

// ---------------------------------------------------------------- live updates

const clients = new Set()
app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.write(`event: hello\ndata: ${JSON.stringify({ version: vault.version })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
})
vault.on('change', (e) => {
  for (const res of clients) res.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`)
})
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n')
}, 25000).unref()
onSeriesChange((id) => {
  seriesVersion++
  for (const res of clients) res.write(`event: series\ndata: ${JSON.stringify({ id })}\n\n`)
})

// ---------------------------------------------------------------- reads

get('/api/meta', () => ({ version: vault.version, undo: vault.lastGroup?.label || null, pin: !!pinToken }))
get('/api/overview', () => cached('overview', () => D.overview(vault)))
get('/api/board', () => cached('board', () => D.board(vault)))
get('/api/phases', () =>
  cached('phases', () => {
    const d = D.dashboardInfo(vault)
    return { phases: d.phases, milestones: d.milestones, phase: d.phase, phaseNote: d.phaseNote, peildatum: d.peildatum, hasTable: !!d.phaseTable }
  }),
)
get('/api/chapters', () =>
  cached('chapters', () => {
    const d = D.dashboardInfo(vault)
    return { chapters: d.chapters.map((c) => ({ ...c, ...summaryCounts(D.chapter(vault, c.n)) })), peildatum: d.peildatum, phase: d.phase }
  }),
)
get('/api/chapters/:n', (req) => {
  const c = cached('chapter' + req.params.n, () => D.chapter(vault, Number(req.params.n)))
  if (!c) throw new HttpError(404, 'Hoofdstuk niet gevonden')
  return c
})
get('/api/decisions', () => cached('decisions', () => D.decisions(vault)))
get('/api/questions', () => cached('questions', () => ({ questions: D.questions(vault), blockers: D.blockers(vault) })))
get('/api/work', () => cached('work', () => ({ groups: D.work(vault) })))
get('/api/notes', () => cached('notes', () => ({ tree: D.notesTree(vault) })))
get('/api/note', (req) => {
  const n = D.note(vault, String(req.query.path || ''))
  if (!n) throw new HttpError(404, 'Notitie niet gevonden')
  return n
})
get('/api/design', () =>
  cached('design', () => ({
    rooms: D.rooms(vault),
    roomsNote: config.files.rooms,
    roomsWarning: D.noteWarning(vault, config.files.rooms),
    sets: D.imageSets(vault),
    notes: vault.idx.notes.filter((n) => n.folder.startsWith('02_Design') && !n.archived).map(D.noteSummary),
  })),
)
get('/api/logbook', () => cached('logbook', () => ({ path: config.files.logbook, timeline: D.timeline(vault), entries: D.logbook(vault).entries.length })))
get('/api/photo-requests', () => cached('photoRequests', () => ({ requests: D.photoRequests(vault), series: seriesEnabled() })))
get('/api/series/:id', (req) => {
  const st = seriesStatus(req.params.id)
  if (!st) throw new HttpError(404, 'Fotoserie niet gevonden')
  let result = null
  try {
    result = JSON.parse(fs.readFileSync(path.join(seriesDir(req.params.id), 'result.json'), 'utf8'))
  } catch {
    // not finished
  }
  return { ...st, result }
})
app.get('/api/series/:id/:file', (req, res, next) => {
  if (!SERIES_FILES.test(req.params.file) || /[^\w.-]/.test(req.params.id)) return next(new HttpError(404, 'Niet gevonden'))
  const f = path.join(seriesDir(req.params.id), req.params.file)
  if (!fs.existsSync(f)) return next(new HttpError(404, 'Niet gevonden'))
  res.type('image/jpeg').sendFile(f)
})
post('/api/series/retry', (b) => {
  const e = D.logbook(vault).entries.find((x) => x.series?.id === b.id)
  if (!e) throw new HttpError(404, 'Fotoserie niet gevonden')
  enqueueSeries(e.images, { force: true })
  return { label: 'Fotoserie opnieuw in de wachtrij' }
})
get('/api/inventory', () => cached('inventory', () => D.inventory(vault)))
get('/api/review', () => cached('review', () => D.review(vault)))
get('/api/search', (req) => ({ results: D.search(vault, String(req.query.q || '')) }))
get('/api/links', () =>
  cached('links', () => ({
    notes: vault.idx.notes
      .filter((n) => !n.archived && (n.folder.startsWith('03_') || n.folder.startsWith('01_Research')))
      .map((n) => ({ path: n.path, title: n.title })),
  })),
)

function summaryCounts(c) {
  return c ? { open: c.tasks.length, done: c.done, decisionCount: c.decisions.length, noteCount: c.notes.length, questionCount: c.questions.length } : {}
}

app.get('/api/file', async (req, res, next) => {
  try {
    const rel = String(req.query.path || '')
    const full = vault.abs(rel)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new HttpError(404, 'Bestand niet gevonden')
    const { file, type } = await imageFile(full, req.query.w)
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'private, max-age=86400')
    fs.createReadStream(file).pipe(res)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------- writes

post('/api/kanban', (b) => A.kanbanAction(vault, b))
post('/api/decisions', (b) => A.addDecision(vault, b))
post('/api/questions/answer', (b) => A.answerQuestion(vault, b))
post('/api/notes/task', (b) => A.toggleTask(vault, b))
post('/api/notes/reviewed', (b) => A.markReviewed(vault, b))
post('/api/notes/fill', (b) => A.fillNoteField(vault, b))
post('/api/status/confirm', () => A.confirmStatus(vault))
post('/api/phases', (b) => A.setPhase(vault, b))
post('/api/chapters/status', (b) => A.setChapterStatus(vault, b))
post('/api/logbook', (b) => {
  const res = A.addLog(vault, b)
  if (b.series && b.images?.length > 1) enqueueSeries(b.images)
  return res
})
post('/api/inventory', (b) => A.addInventory(vault, b))
post('/api/inventory/status', (b) => A.setInventoryStatus(vault, b))
post('/api/undo', () => {
  const g = vault.undoLast()
  return { label: `Ongedaan: ${g.label}`, undo: null }
})

app.post('/api/upload', (req, res, next) => {
  let busboy
  try {
    busboy = Busboy({ headers: req.headers, limits: { files: 8, fileSize: 30 * 1024 * 1024 } })
  } catch (err) {
    return next(new HttpError(400, 'Ongeldige upload'))
  }
  const saved = []
  const pending = []
  let hint = ''
  let failed = null
  busboy.on('field', (name, value) => {
    if (name === 'hint') hint = value
  })
  busboy.on('file', (_name, stream, info) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('limit', () => (failed = new HttpError(413, 'Foto is te groot (max 30 MB)')))
    pending.push(
      new Promise((resolve) => {
        stream.on('end', async () => {
          try {
            if (!/^image\//.test(info.mimeType)) throw new HttpError(400, 'Alleen foto’s zijn toegestaan')
            const raw = Buffer.concat(chunks)
            const buf = await prepareUpload(raw)
            const name = A.assetName('foto.jpg', hint)
            const rel = A.assetPath(name)
            keepOriginal(raw, name, info.filename)
            vault.writeBinary(rel, buf)
            saved.push(rel)
          } catch (err) {
            failed = err.status ? err : new HttpError(400, 'Foto kon niet verwerkt worden (formaat niet ondersteund?)')
          }
          resolve()
        })
      }),
    )
  })
  busboy.on('finish', async () => {
    await Promise.all(pending)
    if (failed) return next(failed)
    res.json({ ok: true, paths: saved })
  })
  req.pipe(busboy)
})

// ---------------------------------------------------------------- errors

app.use('/api', (req, res) => res.status(404).json({ error: 'Onbekende route' }))
app.use((err, req, res, _next) => {
  const status = err.status || 500
  if (status >= 500) console.error('[buildpm]', err)
  res.status(status).json({ error: err.message || 'Er ging iets mis' })
})

// ---------------------------------------------------------------- frontend

if (process.env.NODE_ENV === 'development') {
  const { createServer } = await import('vite')
  const vite = await createServer({ root: config.repoRoot, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const dist = path.join(config.repoRoot, 'dist')
  app.use(express.static(dist, { index: false, maxAge: '7d', setHeaders: (res, file) => file.endsWith('sw.js') && res.setHeader('Cache-Control', 'no-cache') }))
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(config.port, config.host, () => {
  console.log(`[buildpm] ${config.projectRoot}`)
  console.log(`[buildpm] http://${config.host}:${config.port}`)
  if (seriesEnabled()) resumeSeries(D.logbook(vault).entries)
})
