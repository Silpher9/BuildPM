// Turns vault notes into dashboard data. Nothing here is stored separately:
// every view is derived from the notes on each request.

import { config } from './config.js'
import { splitFrontmatter } from './md/frontmatter.js'
import { parseKanban } from './md/kanban.js'
import { findTable, rowsAsObjects } from './md/tables.js'
import { parseTasks } from './md/tasks.js'
import { parseQuestions } from './md/questions.js'
import { renderNote, renderInline } from './md/render.js'
import { wikilinksIn } from './md/wikilinks.js'
import { today, daysBetween, latestDate, datesIn, fold, plain, hash } from './util.js'

const F = config.files

// ---------------------------------------------------------------- helpers

function safeRead(vault, rel) {
  try {
    return vault.read(rel)
  } catch {
    return null
  }
}

/** Lines of the section under the first heading matching `re` (until a heading of the same or higher level). */
export function sectionLines(text, re) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && re.test(l.replace(/^#+\s+/, '')))
  if (start < 0) return []
  const level = lines[start].match(/^#+/)[0].length
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+)\s/)
    if (h && h[1].length <= level) break
    out.push({ text: lines[i], line: i })
  }
  return out
}

function listItems(lines) {
  return lines
    .map((l) => l.text.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/))
    .filter(Boolean)
    .map((m) => m[1].trim())
}

function noteRef(vault, rel) {
  const n = vault.idx.byPath.get(rel)
  return n ? { path: n.path, title: n.title, name: n.name } : null
}

function resolveLinks(vault, text) {
  const seen = new Set()
  const out = []
  for (const l of wikilinksIn(text)) {
    const hit = vault.idx.resolve(l.target)
    if (!hit || seen.has(hit.path) || !hit.path.endsWith('.md')) continue
    seen.add(hit.path)
    out.push({ path: hit.path, title: vault.idx.byPath.get(hit.path)?.title || hit.path, label: l.alias || l.target.split('/').pop() })
  }
  return out
}

const html = (vault, text) => renderInline(text, { resolve: vault.idx.resolve })

// ---------------------------------------------------------------- chapters

function chapterOfPath(rel) {
  const name = rel.split('/').pop().replace(/\.md$/, '')
  const hits = []
  for (const [n, c] of Object.entries(config.chapters)) {
    if (c.notes.includes(name) || c.folders.some((f) => rel.startsWith(f + '/'))) hits.push(Number(n))
  }
  return hits
}

function chaptersForText(text, linkedPaths = []) {
  const hits = new Set(linkedPaths.flatMap(chapterOfPath))
  const t = fold(text)
  for (const [n, c] of Object.entries(config.chapters)) {
    if (c.keywords.some((k) => t.includes(fold(k)))) hits.add(Number(n))
  }
  return [...hits].sort()
}

// ---------------------------------------------------------------- tasks (kanban)

const CONTEXT_TAGS = { doen: 'doen', regelen: 'regelen', bellen: 'regelen', mailen: 'regelen', uitzoeken: 'uitzoeken' }
const REGELEN = [
  'bellen',
  'mail',
  'opvragen',
  'aanvragen',
  'melding',
  'melden',
  'offerte',
  'inplannen',
  'laten saneren',
  'laten beoordelen',
  'netbeheerder',
  'waterschap',
  'gemeente',
  'omgevingsloket',
  'ncg',
  'bevoegde partij',
  'bevestigen bij',
  'specialistisch',
]
const DOEN = [
  'inmeten',
  'meten',
  'metselen',
  'graven',
  'storten',
  'plaatsen',
  'opschonen',
  'egaliseren',
  'leggen',
  'monteren',
  'zagen',
  'uitzetten',
  'slopen',
  'opruimen',
  'ter plaatse',
  'afhangen',
  'bouwen',
]

/** Where can this be done: on site (doen), on the phone (regelen) or behind a laptop (uitzoeken)? */
export function inferContext(text) {
  const tag = String(text).match(/#(doen|regelen|bellen|mailen|uitzoeken)\b/i)
  if (tag) return CONTEXT_TAGS[tag[1].toLowerCase()]
  // Keywords only count at the start of a word ("vastleggen" is not "leggen").
  const t = ' ' + fold(plain(text))
  const has = (k) => t.includes(' ' + k) || new RegExp(`[^a-z]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)
  if (REGELEN.some(has)) return 'regelen'
  if (DOEN.some(has)) return 'doen'
  return 'uitzoeken'
}

export function board(vault) {
  const text = safeRead(vault, F.kanban)
  if (text == null) return { lanes: [], missing: true }
  const { data } = splitFrontmatter(text)
  const { lanes } = parseKanban(text)
  const now = today()
  const reviewed = data.reviewed ? String(data.reviewed) : null
  // Undated cards were at least open on the board's peildatum.
  const peil = text.match(/\*\*Peildatum:\*\*\s*(\d{4}-\d{2}-\d{2})/)?.[1] || reviewed
  return {
    path: F.kanban,
    reviewed,
    lanes: lanes.map((lane) => ({
      title: lane.title,
      role: lane.role,
      index: lane.index,
      cards: lane.cards.map((c) => {
        const links = resolveLinks(vault, c.text)
        const since = latestDate(c.text.replace(/\(afgerond [^)]*\)/, '')) || peil
        const followUp = c.text.match(/\(nagevraagd (\d{4}-\d{2}-\d{2})\)/)?.[1] || null
        const doneOn = c.text.match(/\(afgerond (\d{4}-\d{2}-\d{2})\)/)?.[1] || (c.done ? latestDate(c.text) : null)
        return {
          id: c.id,
          text: c.text,
          html: html(vault, c.text),
          plain: plain(c.text),
          done: c.done,
          lane: lane.title,
          role: lane.role,
          context: inferContext(c.text),
          links,
          chapters: chaptersForText(
            c.text,
            links.map((l) => l.path),
          ),
          since,
          age: since ? daysBetween(since, now) : null,
          followUp,
          doneOn,
        }
      }),
    })),
  }
}

function allCards(b) {
  return b.lanes.flatMap((l) => l.cards)
}

/** Next-step candidates per context, plus the context that fits this moment. */
export function nextSteps(b, date = new Date()) {
  const byRole = (role) =>
    b.lanes
      .filter((l) => l.role === role)
      .flatMap((l) => l.cards)
      .filter((c) => !c.done)
  const now = byRole('now')
  const waiting = byRole('waiting').sort((a, b2) => (b2.age ?? 0) - (a.age ?? 0))
  const backlog = byRole('backlog')
  const pick = (ctx, pools) =>
    pools
      .flat()
      .filter((c) => c.context === ctx)
      .slice(0, 6)
  const lists = {
    regelen: pick('regelen', [now, waiting, backlog]),
    doen: pick('doen', [now, backlog]),
    uitzoeken: pick('uitzoeken', [now, backlog]),
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  const weekday = get('weekday')
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  const weekend = weekday === 'Sat' || weekday === 'Sun'
  let moment
  if (!weekend && minutes >= 8 * 60 + 30 && minutes < 17 * 60) moment = 'regelen'
  else if (minutes >= 8 * 60 && minutes < 18 * 60) moment = 'doen'
  else moment = 'uitzoeken'
  const reasons = {
    regelen: 'Kantooruren: goed moment om te bellen of te mailen',
    doen: weekend ? 'Weekend overdag: tijd voor werk op de bouw' : 'Daglicht: tijd voor werk op de bouw',
    uitzoeken: 'Avond: tijd om uit te zoeken en uit te werken',
  }
  const names = { regelen: 'regelen', doen: 'op de bouw', uitzoeken: 'uitzoeken' }
  let suggested = moment
  let reason = reasons[moment]
  if (!lists[moment].length) {
    suggested = ['regelen', 'uitzoeken', 'doen'].find((k) => lists[k].length) || moment
    reason = `${reasons[moment].split(':')[0]}, maar er staat nu niets voor ${names[moment]} op het bord`
  }
  return { suggested, moment, reason, lists }
}

// ---------------------------------------------------------------- dashboard note

const PHASE_STATES = ['klaar', 'bezig', 'volgende', 'later']

function normState(s) {
  const t = fold(plain(s))
  return PHASE_STATES.find((k) => t.startsWith(k)) || (t.includes('afgerond') ? 'klaar' : 'later')
}

const ART = [
  ['permits', /vergunning|subsidie|voorbereiding/],
  ['septic', /septic|afvalwater/],
  ['fence', /omheining|hek/],
  ['reedbed', /helofyt|filter/],
  ['floor', /vloer/],
  ['walls', /hsb|wand|binnenschil/],
  ['roof', /dak|lichtstraat/],
  ['services', /installatie|warmtepomp|wtw|elektra/],
  ['finish', /afbouw|interieur|keuken|badkamer/],
  ['living', /wonen|oplevering|verhuiz|intrek/],
]

export function dashboardInfo(vault) {
  const text = safeRead(vault, F.dashboard)
  if (text == null) return { missing: true, chapters: [], phases: [], milestones: [] }
  const { data } = splitFrontmatter(text)
  const phaseLine = sectionLines(text, /huidige fase/i).find((l) => l.text.trim())
  const phaseMatch = phaseLine?.text.match(/^\*\*(.+?)\*\*\s*(.*)$/)
  const peildatum = text.match(/\*\*Peildatum:\*\*\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null

  const chapterTable = findTable(text, { heading: 'per hoofdstuk' })
  const chapters = chapterTable
    ? rowsAsObjects(chapterTable).map((r) => {
        const [num, title, status, note] = r._cells
        return { n: Number(num), title, status, note, noteHtml: html(vault, note || ''), line: r._line, hash: r._hash }
      })
    : []

  const phaseTable = findTable(text, { heading: 'bouwfasen' })
  const phases = phaseTable
    ? rowsAsObjects(phaseTable).map((r) => {
        const [num, name, status, note] = r._cells
        const key = fold(name)
        return {
          n: Number(num) || 0,
          name: plain(name),
          state: normState(status),
          status,
          note: note || '',
          noteHtml: html(vault, note || ''),
          art: ART.find(([, re]) => re.test(key))?.[0] || null,
          line: r._line,
          hash: r._hash,
        }
      })
    : []

  const milestones = parseTasks(text)
    .filter((t) => /mijlpal/i.test(t.heading))
    .map((t) => ({ text: t.text, html: html(vault, t.text), done: t.done, date: datesIn(t.text).pop() || null }))

  return {
    path: F.dashboard,
    reviewed: data.reviewed ? String(data.reviewed) : null,
    peildatum,
    phase: phaseMatch ? phaseMatch[1].replace(/\.$/, '') : null,
    phaseNote: phaseMatch ? phaseMatch[2] : phaseLine?.text || '',
    chapters,
    phases,
    phaseTable: phaseTable ? { exists: true } : null,
    milestones,
  }
}

// ---------------------------------------------------------------- decisions & blockers

export function decisions(vault) {
  const text = safeRead(vault, F.decisions)
  if (text == null) return { rows: [], missing: true }
  const table = findTable(text, { firstHeader: 'Datum' }) || findTable(text)
  if (!table) return { rows: [] }
  const rows = rowsAsObjects(table).map((r) => {
    const [date, source, decision, chapter, impact] = r._cells
    const chapters = [...String(chapter || '').matchAll(/H(\d)/g)].map((m) => Number(m[1]))
    if (/projectsturing/i.test(chapter)) chapters.push(1)
    const d = plain(decision)
    return {
      id: r._hash,
      line: r._line,
      date,
      iso: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      source,
      decision,
      decisionHtml: html(vault, decision),
      chapter,
      chapters: [...new Set(chapters)].sort(),
      impact,
      impactHtml: html(vault, impact),
      kind: /^non-besluit/i.test(d) ? 'non' : /^vervangen|historische|^historisch/i.test(d) ? 'superseded' : 'decision',
    }
  })
  return { path: F.decisions, headers: table.headers, rows }
}

export function blockers(vault) {
  const text = safeRead(vault, F.blockers)
  if (text == null) return { rows: [], missing: true }
  const table = findTable(text, { heading: 'blokkades' }) || findTable(text)
  const rows = table
    ? rowsAsObjects(table).map((r) => {
        const [topic, what, status] = r._cells
        return {
          id: r._hash,
          topic: plain(topic),
          what,
          whatHtml: html(vault, what),
          status,
          statusHtml: html(vault, status),
          open: !/afgerond|opgelost|gesloten/i.test(plain(status)) || /niet afgerond/i.test(plain(status)),
        }
      })
    : []
  return { path: F.blockers, rows }
}

// ---------------------------------------------------------------- questions

/** Notes cited in the central list's sources are consolidated; their own lists are history. */
function consolidatedNotes(vault, centralText) {
  const lines = sectionLines(centralText, /^bronnen$/i)
  return new Set(resolveLinks(vault, lines.map((l) => l.text).join('\n')).map((l) => l.path))
}

export function questions(vault) {
  const central = safeRead(vault, F.questions)
  const out = []
  const consolidated = central ? consolidatedNotes(vault, central) : new Set()
  if (central) {
    for (const q of parseQuestions(central, { central: true })) {
      if (q.closed) continue
      out.push({ ...q, path: F.questions, source: 'Centrale vragenlijst', chapters: chaptersForText(`${q.group} ${q.text}`), html: html(vault, q.text) })
    }
  }
  for (const note of vault.idx.notes) {
    if (note.archived || note.path === F.questions || consolidated.has(note.path)) continue
    if (!/vragen/i.test(note.body)) continue
    const text = safeRead(vault, note.path)
    for (const q of parseQuestions(text)) {
      if (q.closed) continue
      out.push({ ...q, path: note.path, source: note.title, chapters: chapterOfPath(note.path), html: html(vault, q.text) })
    }
  }
  return out.map((q) => ({ ...q, id: hash(q.path + q.hash) }))
}

// ---------------------------------------------------------------- logbook

const ENTRY_RE = /^- (?:(\d{1,2}:\d{2})\s*[—–-]\s*)?(.*)$/

export function logbook(vault) {
  const text = safeRead(vault, F.logbook)
  if (text == null) return { entries: [], missing: true, path: F.logbook }
  const lines = text.split('\n')
  const entries = []
  let date = null
  let cur = null
  lines.forEach((line, i) => {
    const h = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\b/)
    if (h) {
      date = h[1]
      cur = null
      return
    }
    if (/^#/.test(line)) {
      date = null
      cur = null
      return
    }
    if (!date) return
    const m = line.match(ENTRY_RE)
    if (m) {
      cur = { date, time: m[1] || null, raw: m[2], line: i }
      entries.push(cur)
      return
    }
    if (cur && /^\s+\S/.test(line)) cur.raw += '\n' + line.trim()
    else if (!line.trim()) cur = null
  })
  return {
    path: F.logbook,
    entries: entries.map((e) => {
      const images = wikilinksIn(e.raw)
        .filter((l) => l.embed)
        .map((l) => vault.idx.resolve(l.target)?.path)
        .filter(Boolean)
      const textOnly = e.raw.replace(/!\[\[[^\]]+\]\]/g, '').trim()
      return { ...e, text: textOnly, html: html(vault, textOnly), images, links: resolveLinks(vault, textOnly), id: hash(e.date + e.line + e.raw) }
    }),
  }
}

/** Everything with a date, newest first: own log, decisions, milestones, completed cards. */
export function timeline(vault) {
  const items = []
  for (const e of logbook(vault).entries)
    items.push({ kind: 'log', date: e.date, time: e.time, html: e.html, images: e.images, links: e.links, id: 'l' + e.id })
  for (const d of decisions(vault).rows) {
    if (d.iso) items.push({ kind: 'decision', date: d.iso, html: d.decisionHtml, source: d.source, chapters: d.chapters, id: 'd' + d.id, decisionKind: d.kind })
  }
  for (const m of dashboardInfo(vault).milestones) {
    if (m.date && m.done) items.push({ kind: 'milestone', date: m.date, html: m.html, id: 'm' + hash(m.text) })
  }
  const b = board(vault)
  for (const c of allCards(b)) {
    if (c.done && c.doneOn && /\(afgerond /.test(c.text)) items.push({ kind: 'task', date: c.doneOn, html: c.html, id: 't' + c.id })
  }
  return items.sort((a, b2) => (b2.date + (b2.time || '')).localeCompare(a.date + (a.time || '')))
}

// ---------------------------------------------------------------- inventory

export function parseAmount(s) {
  const t = String(s || '')
    .replace(/[€\s]/g, '')
    .replace(/[^\d,.-]/g, '')
  if (!t) return null
  let n
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''))
  else n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const INVENTORY_STATES = ['aanwezig', 'besteld', 'nodig', 'verwerkt']

export function inventory(vault) {
  const text = safeRead(vault, F.inventory)
  if (text == null) return { rows: [], missing: true, path: F.inventory }
  const table = findTable(text, { firstHeader: 'Item' }) || findTable(text)
  if (!table) return { rows: [], path: F.inventory }
  const rows = rowsAsObjects(table).map((r) => {
    const obj = {}
    table.headers.forEach((h, i) => (obj[fold(h).replace(/[^a-z]/g, '')] = r._cells[i] ?? ''))
    const status = fold(obj.status || '')
    return {
      id: r._hash,
      line: r._line,
      cells: r._cells,
      item: obj.item || r._cells[0],
      itemHtml: html(vault, obj.item || r._cells[0]),
      amount: obj.hoeveelheid || '',
      status: INVENTORY_STATES.find((s) => status.startsWith(s)) || status || 'nodig',
      purpose: obj.bestemdvoor || '',
      purposeHtml: html(vault, obj.bestemdvoor || ''),
      cost: parseAmount(obj.kosten),
      costRaw: obj.kosten || '',
      date: obj.datum || '',
      source: obj.bronnotitie || obj.bron || '',
      sourceHtml: html(vault, obj.bronnotitie || obj.bron || ''),
    }
  })
  const sum = (pred) => rows.filter(pred).reduce((a, r) => a + (r.cost || 0), 0)
  return {
    path: F.inventory,
    headers: table.headers,
    statusCol: table.headers.findIndex((h) => /status/i.test(h)),
    rows,
    totals: {
      spent: sum((r) => r.status !== 'nodig'),
      planned: sum((r) => r.status === 'nodig'),
      counts: Object.fromEntries(INVENTORY_STATES.map((s) => [s, rows.filter((r) => r.status === s).length])),
    },
  }
}

// ---------------------------------------------------------------- work packages

function doneCriteria(text) {
  for (const re of [/^klaar als/i, /definitie van klaar/i, /^resultaat van fase/i]) {
    const items = listItems(sectionLines(text, re))
    if (items.length) return items
  }
  return []
}

export function work(vault) {
  const b = board(vault)
  const cards = allCards(b)
  return config.workGroups
    .map((g) => {
      const re = new RegExp(g.match, 'i')
      const members = vault.idx.notes
        .filter((n) => !n.archived && n.folder.startsWith('03_') && re.test(n.name))
        .sort((a, c) => (a.name === g.lead ? -1 : c.name === g.lead ? 1 : a.path.localeCompare(c.path)))
      const lead = members.find((n) => n.name === g.lead) || members[0]
      const notes = members.map((n) => {
        const text = safeRead(vault, n.path) || ''
        const related = cards.filter((c) => c.links.some((l) => l.path === n.path))
        return {
          path: n.path,
          title: n.title,
          state: n.fm.project_state || null,
          tasks: n.tasks,
          criteria: doneCriteria(text).map((c) => ({ text: c, html: html(vault, c) })),
          cards: related.map((c) => ({ id: c.id, html: c.html, done: c.done, role: c.role })),
        }
      })
      const background = (lead?.links || [])
        .filter((p) => p.startsWith('01_Research') || p.startsWith('02_Design'))
        .map((p) => noteRef(vault, p))
        .filter(Boolean)
      const groupCards = cards.filter((c) => c.links.some((l) => members.some((m) => m.path === l.path)))
      const tasks = notes.reduce((a, n) => ({ total: a.total + n.tasks.total, done: a.done + n.tasks.done }), { total: 0, done: 0 })
      let state = lead?.fm.project_state || null
      if (!state) state = tasks.total && tasks.done === tasks.total ? 'completed' : groupCards.some((c) => !c.done && c.role === 'now') ? 'active' : 'later'
      return {
        key: g.key,
        title: g.title,
        lead: lead?.path || null,
        state,
        tasks,
        cards: { total: groupCards.length, done: groupCards.filter((c) => c.done).length },
        notes,
        background,
      }
    })
    .filter((g) => g.notes.length)
}

// ---------------------------------------------------------------- rooms & images

export function rooms(vault) {
  const text = safeRead(vault, F.rooms)
  if (!text) return []
  const out = []
  let room = null
  let sub = null
  for (const line of text.split('\n')) {
    const h2 = line.match(/^##\s+(\d+)\.\s+(.+?)\s*$/)
    if (h2) {
      room = { n: Number(h2[1]), name: h2[2], rol: '', relaties: [], kwaliteiten: [], risicos: [], checks: [] }
      out.push(room)
      sub = null
      continue
    }
    if (/^##\s/.test(line)) {
      room = null
      continue
    }
    if (!room) continue
    const h3 = line.match(/^###\s+(.+)$/)
    if (h3) {
      const t = fold(h3[1])
      sub = t.startsWith('rol')
        ? 'rol'
        : t.startsWith('relatie')
          ? 'relaties'
          : t.includes('kwaliteit')
            ? 'kwaliteiten'
            : t.startsWith('risico')
              ? 'risicos'
              : t.includes('check')
                ? 'checks'
                : null
      continue
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/)
    if (sub === 'rol' && line.trim()) room.rol += (room.rol ? ' ' : '') + line.trim()
    else if (sub && item) room[sub].push(item[1].trim())
  }
  return out
}

export function images(vault) {
  return vault.idx.assets
    .filter((a) => !a.archived && /\.(jpe?g|png|webp|gif|avif)$/i.test(a.path))
    .map((a) => ({
      path: a.path,
      folder: a.path.slice(0, a.path.lastIndexOf('/')),
      name: a.path.split('/').pop(),
      date: datesIn(a.path)[0] || null,
      render: a.path.startsWith(config.rendersDir),
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.path.localeCompare(b.path))
}

// ---------------------------------------------------------------- knowledge base

const FOLDER_LABELS = {
  '01_Research': 'Onderzoek',
  '02_Design': 'Ontwerp',
  '03_Projectmanagement': 'Projectmanagement',
  '90_Archive': 'Archief',
}

function segmentLabel(seg, full) {
  if (FOLDER_LABELS[full]) return FOLDER_LABELS[full]
  const m = seg.match(/^([A-Z])_(.+)$/)
  if (m) return `${m[1]} · ${m[2].replace(/_/g, ' ')}`
  return seg.replace(/^\d+_/, '').replace(/_/g, ' ')
}

export function folderLabel(folder) {
  if (!folder) return 'Project'
  const parts = folder.split('/')
  const labels = parts.map((seg, i) => segmentLabel(seg, parts.slice(0, i + 1).join('/')))
  // Inside a research or design area only the deepest part is informative.
  if (!parts.some((p) => config.archiveDirs.includes(p)) && labels.length > 1) return labels[labels.length - 1]
  return labels.join(' / ')
}

export function noteSummary(n) {
  const stale = n.fm.reviewed ? daysBetween(String(n.fm.reviewed), today()) : null
  return {
    path: n.path,
    name: n.name,
    title: n.title,
    folder: n.folder,
    archived: n.archived,
    status: n.fm.status || null,
    authority: n.fm.authority || null,
    reviewed: n.fm.reviewed ? String(n.fm.reviewed) : null,
    reviewedAge: stale,
    mtime: n.mtime,
    tasks: n.tasks,
    chapters: chapterOfPath(n.path),
  }
}

export function notesTree(vault) {
  const groups = new Map()
  for (const n of vault.idx.notes) {
    const key = n.folder || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(noteSummary(n))
  }
  return [...groups.entries()]
    .map(([folder, notes]) => ({
      folder,
      label: folderLabel(folder),
      archived: notes.every((n) => n.archived),
      notes: notes.sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => a.folder.localeCompare(b.folder))
}

export function note(vault, rel) {
  const n = vault.idx.byPath.get(rel)
  if (!n) return null
  const text = vault.read(rel)
  const { body, bodyLine } = splitFrontmatter(text)
  const { html: bodyHtml, headings } = renderNote(body, { resolve: vault.idx.resolve, lineOffset: bodyLine, lines: text.split('\n'), readOnly: n.archived })
  return {
    ...noteSummary(n),
    fm: n.fm,
    html: bodyHtml,
    headings,
    backlinks: vault.idx
      .backlinks(rel)
      .map((p) => noteRef(vault, p))
      .filter(Boolean),
    obsidian: `obsidian://open?vault=${encodeURIComponent(config.vaultName)}&file=${encodeURIComponent(config.projectDir + '/' + rel.replace(/\.md$/, ''))}`,
  }
}

// ---------------------------------------------------------------- chapter detail

export function chapter(vault, n) {
  const info = dashboardInfo(vault)
  const c = info.chapters.find((x) => x.n === n)
  if (!c) return null
  const b = board(vault)
  return {
    ...c,
    tasks: allCards(b).filter((card) => card.chapters.includes(n) && !card.done),
    done: allCards(b).filter((card) => card.chapters.includes(n) && card.done).length,
    decisions: decisions(vault).rows.filter((d) => d.chapters.includes(n)),
    notes: vault.idx.notes.filter((x) => !x.archived && chapterOfPath(x.path).includes(n)).map(noteSummary),
    questions: questions(vault).filter((q) => q.chapters.includes(n)),
  }
}

// ---------------------------------------------------------------- overview

export function overview(vault) {
  const readme = safeRead(vault, F.overview) || ''
  const { body } = splitFrontmatter(readme)
  const title = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(/\s+[—–-]\s+.*$/, '') || 'Bouwproject'
  const subtitle = body.match(/^#\s+.+?\s+[—–-]\s+(.+?)\s*$/m)?.[1] || ''
  const dash = dashboardInfo(vault)
  const b = board(vault)
  const cards = allCards(b)
  const open = cards.filter((c) => !c.done)
  const dec = decisions(vault)
  const qs = questions(vault)
  const log = logbook(vault)
  const inv = inventory(vault)
  const wk = work(vault)
  const blk = blockers(vault)
  const pics = images(vault)
  const counts = {
    now: open.filter((c) => c.role === 'now').length,
    waiting: open.filter((c) => c.role === 'waiting').length,
    backlog: open.filter((c) => c.role === 'backlog').length,
    done: cards.filter((c) => c.done).length,
    decisions: dec.rows.length,
    lastDecision:
      dec.rows
        .map((r) => r.iso)
        .filter(Boolean)
        .sort()
        .pop() || null,
    questions: qs.length,
    blockers: blk.rows.filter((r) => r.open).length,
    notes: vault.idx.notes.filter((n) => !n.archived).length,
    renders: pics.filter((p) => p.render).length,
    photos: pics.filter((p) => !p.render).length,
    rooms: rooms(vault).length,
    lastLog: log.entries[0]?.date || null,
    logEntries: log.entries.length,
    inventory: inv.rows.length,
    spent: inv.totals?.spent || 0,
    phasesDone: dash.phases.filter((p) => p.state === 'klaar').length,
    phases: dash.phases.length,
    work: wk.filter((w) => w.state !== 'completed').map((w) => w.title),
  }
  return {
    title,
    subtitle,
    projectDir: config.projectDir,
    today: today(),
    phase: dash.phase,
    phaseNote: dash.phaseNote,
    peildatum: dash.peildatum,
    peildatumAge: dash.peildatum ? daysBetween(dash.peildatum, today()) : null,
    phases: dash.phases,
    chapters: dash.chapters.map(({ n, title: t, status }) => ({ n, title: t, status })),
    counts,
    next: nextSteps(b),
    review: reviewSummary(vault, { b, qs, log, dash }),
  }
}

// ---------------------------------------------------------------- review round

function reviewSummary(vault, { b, qs, log, dash }) {
  const now = today()
  const waitingStale = allCards(b).filter((c) => !c.done && c.role === 'waiting' && (c.age ?? 0) >= 14)
  const peilAge = dash.peildatum ? daysBetween(dash.peildatum, now) : null
  const lastLogAge = log.entries[0] ? daysBetween(log.entries[0].date, now) : null
  const items = []
  if (peilAge == null || peilAge > 14) items.push('peildatum')
  if (waitingStale.length) items.push('wachten')
  if (qs.length) items.push('vraag')
  if (lastLogAge == null || lastLogAge > 7) items.push('logboek')
  return { items, peilAge, waitingStale: waitingStale.length, lastLogAge }
}

export function review(vault) {
  const b = board(vault)
  const dash = dashboardInfo(vault)
  const qs = questions(vault)
  const log = logbook(vault)
  const cards = allCards(b).filter((c) => !c.done)
  const order = { blokkerend: 0, belangrijk: 1, '': 2 }
  return {
    ...reviewSummary(vault, { b, qs, log, dash }),
    peildatum: dash.peildatum,
    now: cards.filter((c) => c.role === 'now'),
    waiting: cards.filter((c) => c.role === 'waiting').sort((a, c) => (c.age ?? 0) - (a.age ?? 0)),
    question: [...qs].sort((a, c) => order[a.priority] - order[c.priority])[0] || null,
    questionsLeft: qs.length,
    lastLog: log.entries[0] || null,
  }
}

// ---------------------------------------------------------------- search

export function search(vault, q) {
  const terms = fold(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const results = []
  const score = (fields) => {
    let total = 0
    for (const t of terms) {
      let best = 0
      for (const [text, weight] of fields) if (text.includes(t)) best = Math.max(best, weight)
      if (!best) return 0
      total += best
    }
    return total
  }
  const snippet = (text) => {
    const f = fold(text)
    const at = Math.max(0, f.indexOf(terms[0]) - 60)
    return (at ? '…' : '') + text.slice(at, at + 180).trim() + (text.length > at + 180 ? '…' : '')
  }
  for (const n of vault.idx.notes) {
    const body = plain(n.body)
    const s = score([
      [fold(n.title), 10],
      [fold(n.headings.map((h) => h.text).join(' ')), 5],
      [fold(n.path), 4],
      [fold(body), 1],
    ])
    if (s)
      results.push({
        kind: 'note',
        score: s - (n.archived ? 6 : 0),
        title: n.title,
        sub: folderLabel(n.folder),
        href: `/n/${n.path}`,
        snippet: snippet(body),
        archived: n.archived,
      })
  }
  for (const c of allCards(board(vault))) {
    const s = score([[fold(c.plain), 6]])
    if (s) results.push({ kind: 'task', score: s + (c.done ? 0 : 2), title: c.plain.slice(0, 120), sub: c.lane, href: `/taken#${c.id}`, done: c.done })
  }
  for (const d of decisions(vault).rows) {
    const s = score([
      [fold(plain(d.decision)), 5],
      [fold(plain(d.impact)), 2],
    ])
    if (s) results.push({ kind: 'decision', score: s, title: plain(d.decision).slice(0, 140), sub: d.date, href: `/besluiten#${d.id}` })
  }
  for (const q2 of questions(vault)) {
    const s = score([[fold(plain(q2.text)), 5]])
    if (s) results.push({ kind: 'question', score: s, title: plain(q2.text).slice(0, 140), sub: q2.source, href: `/vragen#${q2.id}` })
  }
  for (const r of rooms(vault)) {
    const s = score([
      [fold(r.name), 8],
      [fold(r.rol), 2],
    ])
    if (s) results.push({ kind: 'room', score: s, title: r.name, sub: 'Ruimteboek', href: `/ontwerp#ruimte-${r.n}` })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 40)
}
