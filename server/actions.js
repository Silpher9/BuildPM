// Every change the dashboard can make, written straight into the vault notes
// in the formats those notes already use.

import { config } from './config.js'
import { setFrontmatterField } from './md/frontmatter.js'
import { addCard, editCard, moveCard, completeCard, reopenCard, stampFollowUp, stampSince } from './md/kanban.js'
import { insertRow, updateCell, findTable } from './md/tables.js'
import { setTask } from './md/tasks.js'
import { closeQuestion } from './md/questions.js'
import { questions, INVENTORY_STATES } from './domain.js'
import { today, nowTime, HttpError, slugify, latestDate, hash } from './util.js'
import { splitFrontmatter } from './md/frontmatter.js'

const F = config.files

function need(value, msg) {
  if (value === undefined || value === null || String(value).trim() === '') throw new HttpError(400, msg)
  return String(value).trim()
}

const oneLine = (s) =>
  String(s ?? '')
    .replace(/\s*\n\s*/g, ' ')
    .trim()

// ---------------------------------------------------------------- kanban

export function kanbanAction(vault, body) {
  const { op, id, lane, text, position } = body
  const date = today()
  const labels = {
    add: 'Taak toegevoegd',
    edit: 'Taak aangepast',
    move: 'Taak verplaatst',
    complete: 'Taak afgerond',
    reopen: 'Taak heropend',
    followup: 'Opvolging vastgelegd',
  }
  if (!labels[op]) throw new HttpError(400, 'Onbekende actie')
  vault.update(
    F.kanban,
    (t) => {
      switch (op) {
        case 'add':
          return addCard(t, lane ?? 'now', need(text, 'Tekst ontbreekt'), position || 'bottom')
        case 'edit':
          return editCard(t, need(id, 'Kaart ontbreekt'), need(text, 'Tekst ontbreekt'))
        case 'move':
          return moveCard(t, need(id, 'Kaart ontbreekt'), lane, position || 'bottom')
        case 'complete':
          return completeCard(t, need(id, 'Kaart ontbreekt'), date)
        case 'reopen':
          return reopenCard(t, need(id, 'Kaart ontbreekt'), lane)
        case 'followup':
          return stampFollowUp(t, need(id, 'Kaart ontbreekt'), date)
      }
    },
    { label: labels[op] },
  )
  return { label: labels[op] }
}

// ---------------------------------------------------------------- decisions

export function addDecision(vault, { decision, chapter, impact, source }) {
  const row = [
    today(),
    oneLine(source) || `${config.owner} (dashboard)`,
    need(oneLine(decision), 'Besluit ontbreekt'),
    oneLine(chapter) || '',
    oneLine(impact) || '',
  ]
  vault.update(F.decisions, (t) => insertRow(t, { firstHeader: 'Datum' }, row, 'top'), { label: 'Besluit vastgelegd' })
  return { label: 'Besluit vastgelegd' }
}

// ---------------------------------------------------------------- questions

/** Answer (or drop) a question: marks it in its own note and logs the decision. */
export function answerQuestion(vault, { id, answer, chapter, impact, dropped = false }) {
  const q = questions(vault).find((x) => x.id === id)
  if (!q) throw new HttpError(409, 'Vraag niet gevonden; misschien al beantwoord')
  const date = today()
  const text = oneLine(answer)
  if (!dropped && !text) throw new HttpError(400, 'Antwoord ontbreekt')
  return vault.group(dropped ? 'Vraag vervallen' : 'Vraag beantwoord', () => {
    vault.update(q.path, (t) => closeQuestion(t, { line: q.line, itemHash: q.hash, answer: text, date, dropped }))
    if (!dropped) {
      const note = vault.idx.byPath.get(q.path)
      const chapterText = oneLine(chapter) || q.chapters.map((n) => `H${n}`).join(' / ')
      vault.update(F.decisions, (t) =>
        insertRow(
          t,
          { firstHeader: 'Datum' },
          [date, `${config.owner} (dashboard, antwoord op vraag in [[${note?.name || q.path}]])`, text, chapterText, oneLine(impact)],
          'top',
        ),
      )
    }
    return { label: dropped ? 'Vraag vervallen' : 'Vraag beantwoord en vastgelegd als besluit' }
  })
}

// ---------------------------------------------------------------- notes

export function toggleTask(vault, { path, line, taskId, done }) {
  vault.update(need(path, 'Pad ontbreekt'), (t) => setTask(t, { line: Number(line), taskId, done: !!done }), {
    label: done ? 'Afgevinkt' : 'Vinkje weggehaald',
  })
  return { label: done ? 'Afgevinkt' : 'Vinkje weggehaald' }
}

/** Write a value into the n-th `____` placeholder of a line. */
export function fillField(text, { line, lineHash, idx, value }) {
  const lines = text.split('\n')
  let i = Number(line)
  if (!(lines[i] !== undefined && hash(lines[i]) === lineHash)) i = lines.findIndex((l) => hash(l) === lineHash)
  if (i < 0) throw new HttpError(409, 'Regel niet gevonden; de notitie is intussen gewijzigd')
  let n = -1
  const clean = oneLine(value).replace(/\*/g, '').replace(/\|/g, '/')
  if (!clean) throw new HttpError(400, 'Lege waarde')
  const next = lines[i].replace(/_{4,}/g, (m) => (++n === Number(idx) ? `**${clean}**` : m))
  if (next === lines[i]) throw new HttpError(409, 'Invulveld niet gevonden')
  lines[i] = next
  return lines.join('\n')
}

export function fillNoteField(vault, { path, ...rest }) {
  vault.update(need(path, 'Pad ontbreekt'), (t) => fillField(t, rest), { label: 'Ingevuld' })
  return { label: 'Ingevuld' }
}

export function markReviewed(vault, { path }) {
  vault.update(need(path, 'Pad ontbreekt'), (t) => setFrontmatterField(t, 'reviewed', today()), { label: 'Gemarkeerd als gecontroleerd' })
  return { label: 'Gemarkeerd als gecontroleerd' }
}

/** Confirm the current status: bump `reviewed` and the "Peildatum" line in board and dashboard. */
export function confirmStatus(vault) {
  const date = today()
  return vault.group('Peildatum bijgewerkt', () => {
    // Waiting cards without a date only had the old peildatum to say how long
    // they are open; write that down before the peildatum moves.
    if (vault.exists(F.kanban)) vault.update(F.kanban, (t) => stampWaitingSince(t))
    for (const rel of [F.dashboard, F.kanban]) {
      if (!vault.exists(rel)) continue
      vault.update(rel, (t) => setFrontmatterField(t, 'reviewed', date).replace(/(\*\*Peildatum:\*\*\s*)\d{4}-\d{2}-\d{2}/, `$1${date}`))
    }
    return { label: `Peildatum bijgewerkt naar ${date}` }
  })
}

function stampWaitingSince(text) {
  const peil = text.match(/\*\*Peildatum:\*\*\s*(\d{4}-\d{2}-\d{2})/)?.[1] || splitFrontmatter(text).data.reviewed
  if (!peil) return text
  return stampSince(text, (card, lane) => lane.role === 'waiting' && !card.done && !latestDate(card.text), String(peil))
}

// ---------------------------------------------------------------- dashboard tables

export function setPhase(vault, { line, hash: rowHash, state, note }) {
  const label = 'Bouwfase bijgewerkt'
  vault.update(
    F.dashboard,
    (t) => {
      let next = t
      if (state !== undefined) next = updateCell(next, { heading: 'bouwfasen' }, { line: Number(line), rowHash, col: 2, value: state })
      if (note !== undefined) {
        const table = findTable(next, { heading: 'bouwfasen' })
        const row = table?.rows.find((r) => r.line === Number(line))
        next = updateCell(next, { heading: 'bouwfasen' }, { line: Number(line), rowHash: row?.hash, col: 3, value: note })
      }
      return next
    },
    { label },
  )
  return { label }
}

export function setChapterStatus(vault, { line, hash: rowHash, status, note }) {
  const label = 'Hoofdstukstatus bijgewerkt'
  vault.update(
    F.dashboard,
    (t) => {
      let next = t
      if (status !== undefined) next = updateCell(next, { heading: 'per hoofdstuk' }, { line: Number(line), rowHash, col: 2, value: status })
      if (note !== undefined) {
        const table = findTable(next, { heading: 'per hoofdstuk' })
        const row = table?.rows.find((r) => r.line === Number(line))
        next = updateCell(next, { heading: 'per hoofdstuk' }, { line: Number(line), rowHash: row?.hash, col: 3, value: note })
      }
      return next
    },
    { label },
  )
  return { label }
}

// ---------------------------------------------------------------- logbook

const LOGBOOK_TEMPLATE = (date) => `---
type: time-log
project: ${config.projectDir}
status: active
authority: canonical
provenance: user-confirmed
reviewed: ${date}
---

# Bouwlogboek

> Wat er feitelijk gebeurd is op de bouw, nieuwste bovenaan, met foto's. Besluiten staan in [[Besluitenlog]], acties in [[Kanban_Bord]].
`

/** Insert an entry under today's heading (created when needed), newest first. */
export function insertLogEntry(text, { date, time, body }) {
  const lines = text.split('\n')
  const entry = [`- ${time} — ${body[0]}`, ...body.slice(1).map((l) => `  ${l}`)]
  const dayIdx = lines.findIndex((l) => l.trim() === `## ${date}`)
  if (dayIdx >= 0) {
    let at = dayIdx + 1
    while (at < lines.length && lines[at].trim() === '') at++
    lines.splice(at, 0, ...entry)
    if (lines[dayIdx + 1].trim() !== '') lines.splice(dayIdx + 1, 0, '')
    return lines.join('\n')
  }
  const firstDay = lines.findIndex((l) => /^##\s+\d{4}-\d{2}-\d{2}/.test(l))
  const block = [`## ${date}`, '', ...entry, '']
  if (firstDay >= 0) lines.splice(firstDay, 0, ...block)
  else {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push('', ...block)
  }
  return lines.join('\n')
}

export function addLog(vault, { text, images = [], link, heading }) {
  const date = today()
  const main = oneLine(text)
  if (!main && !images.length) throw new HttpError(400, 'Leeg logboekitem')
  const linkNote = link ? vault.idx.byPath.get(link) : null
  const target = linkNote ? (heading ? `${linkNote.name}#${oneLine(heading).replace(/[[\]|#]/g, '')}` : linkNote.name) : null
  const first = (main || 'Foto') + (target ? ` → [[${target}]]` : '')
  const embeds = images.map((p) => `![[${p.split('/').pop()}]]`)
  vault.update(F.logbook, (t) => insertLogEntry(t || LOGBOOK_TEMPLATE(date), { date, time: nowTime(), body: [first, ...embeds] }), {
    create: true,
    label: 'Logboek bijgewerkt',
  })
  return { label: 'Logboek bijgewerkt' }
}

// ---------------------------------------------------------------- inventory

const INVENTORY_TEMPLATE = (date) => `---
type: inventory
project: ${config.projectDir}
status: active
authority: canonical
provenance: mixed
reviewed: ${date}
---

# Voorraad en inkoop

> Materiaal dat er is, besteld is of nog nodig is, met kosten waar bekend.

| Item | Hoeveelheid | Status | Bestemd voor | Kosten (€) | Datum | Bron / notitie |
|---|---|---|---|---|---|---|
`

export function addInventory(vault, { item, amount, status, purpose, cost, source }) {
  const st = INVENTORY_STATES.includes(status) ? status : 'nodig'
  const row = [need(oneLine(item), 'Item ontbreekt'), oneLine(amount), st, oneLine(purpose), oneLine(cost), today(), oneLine(source) || 'dashboard']
  vault.update(F.inventory, (t) => insertRow(t || INVENTORY_TEMPLATE(today()), { firstHeader: 'Item' }, row, 'top'), {
    create: true,
    label: 'Voorraad bijgewerkt',
  })
  return { label: 'Voorraad bijgewerkt' }
}

export function setInventoryStatus(vault, { line, hash: rowHash, status, col }) {
  if (!INVENTORY_STATES.includes(status)) throw new HttpError(400, 'Onbekende status')
  vault.update(F.inventory, (t) => updateCell(t, { firstHeader: 'Item' }, { line: Number(line), rowHash, col: Number(col), value: status }), {
    label: 'Status bijgewerkt',
  })
  return { label: 'Status bijgewerkt' }
}

// ---------------------------------------------------------------- uploads

export function assetName(originalName, hint, date = today()) {
  const ext = (String(originalName).match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg')
  const rand = Math.random().toString(36).slice(2, 6)
  return `${date}_${slugify(hint || 'foto', 32)}_${rand}.${ext === 'heic' || ext === 'heif' ? 'jpg' : ext}`
}

export function assetPath(name) {
  return `${config.assetsDir}/${name}`
}
