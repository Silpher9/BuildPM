// Parser and edit operations for Obsidian Kanban boards (`kanban-plugin: board`).
//
// Board layout:   ## Lane title
//                 - [ ] card text
//                   indented continuation lines belong to the card above
// Everything before the first lane (frontmatter, title, intro) and from the
// `%% kanban:settings` block or a `***` archive divider onward is kept verbatim.

import { hash } from '../util.js'

const LANE_RE = /^##\s+(.+?)\s*$/
const CARD_RE = /^- \[([ xX])\] ?(.*)$/
const STOP_RE = /^(%% kanban:settings|\*\*\*\s*$)/

export function laneRole(title, index) {
  const t = title.toLowerCase()
  if (/klaar|gereed|afgerond|done|historisch/.test(t)) return 'done'
  if (/wacht|verificat|blokkade|extern/.test(t)) return 'waiting'
  if (/backlog|later|ooit|parkeer/.test(t)) return 'backlog'
  if (/^nu\b|doing|bezig|deze week/.test(t) || index === 0) return 'now'
  return 'other'
}

export function parseKanban(text) {
  const lines = text.split('\n')
  const lanes = []
  let lane = null
  let card = null
  let stopAt = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (STOP_RE.test(line)) {
      stopAt = i
      break
    }
    const laneM = line.match(LANE_RE)
    if (laneM) {
      lane = { title: laneM[1], line: i, cards: [] }
      lanes.push(lane)
      card = null
      continue
    }
    if (!lane) continue
    const cardM = line.match(CARD_RE)
    if (cardM) {
      card = { done: cardM[1] !== ' ', text: cardM[2], start: i, end: i }
      lane.cards.push(card)
      continue
    }
    if (card && /^\s+\S/.test(line)) {
      card.end = i
      card.text += '\n' + line.trim()
      continue
    }
    if (line.trim() === '') card = null
  }
  // Stable ids from the card text; duplicates get an occurrence suffix.
  const seen = new Map()
  lanes.forEach((l, li) => {
    l.role = laneRole(l.title, li)
    l.index = li
    for (const c of l.cards) {
      const base = hash(c.text.trim())
      const n = seen.get(base) || 0
      seen.set(base, n + 1)
      c.id = n ? `${base}-${n}` : base
      c.lane = l.title
    }
  })
  return { lanes, lines, stopAt }
}

function findCard(board, id) {
  for (const lane of board.lanes) {
    const card = lane.cards.find((c) => c.id === id)
    if (card) return { lane, card }
  }
  return null
}

function findLane(board, laneRef) {
  if (typeof laneRef === 'number') return board.lanes[laneRef]
  return board.lanes.find((l) => l.title === laneRef) || board.lanes.find((l) => l.role === laneRef)
}

/** Index in `lines` where a card should be inserted into `lane`. */
function insertIndex(board, lane, position) {
  if (position === 'top') {
    if (lane.cards.length) return lane.cards[0].start
  } else if (lane.cards.length) {
    return lane.cards[lane.cards.length - 1].end + 1
  }
  // Empty lane: right after the header and its blank line.
  let i = lane.line + 1
  const next = board.lanes[lane.index + 1]
  const limit = next ? next.line : board.stopAt
  while (i < limit && board.lines[i].trim() === '') i++
  // Skip non-card intro text directly under the lane header.
  if (i < limit && !CARD_RE.test(board.lines[i]) && !LANE_RE.test(board.lines[i])) {
    while (i < limit && board.lines[i].trim() !== '') i++
    while (i < limit && board.lines[i].trim() === '') i++
    if (i >= limit) return insertBeforeBlank(board, limit)
  }
  if (i >= limit) return insertBeforeBlank(board, limit)
  return i
}

function insertBeforeBlank(board, limit) {
  let i = limit
  while (i > 0 && board.lines[i - 1].trim() === '') i--
  return i
}

function cardLines(card) {
  const [first, ...rest] = card.text.split('\n')
  return [`- [${card.done ? 'x' : ' '}] ${first}`, ...rest.map((r) => `  ${r}`)]
}

function spliceText(lines, start, deleteCount, insert = []) {
  const copy = lines.slice()
  copy.splice(start, deleteCount, ...insert)
  return copy
}

/** Make sure an inserted card is separated from a following lane header by a blank line. */
function tidy(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (LANE_RE.test(line) && out.length && out[out.length - 1].trim() !== '') out.push('')
    out.push(line)
    if (LANE_RE.test(line) && lines[i + 1] !== undefined && lines[i + 1].trim() !== '') out.push('')
  }
  return out
}

function requireCard(board, id) {
  const hit = findCard(board, id)
  if (!hit) throw Object.assign(new Error('Kaart niet gevonden (is het bord intussen aangepast?)'), { status: 409 })
  return hit
}

function requireLane(board, ref) {
  const lane = findLane(board, ref)
  if (!lane) throw Object.assign(new Error(`Kolom "${ref}" bestaat niet`), { status: 400 })
  return lane
}

export function addCard(text, laneRef, cardText, position = 'bottom') {
  const board = parseKanban(text)
  const lane = requireLane(board, laneRef)
  const clean = String(cardText)
    .replace(/\s*\n\s*/g, ' ')
    .trim()
  if (!clean) throw Object.assign(new Error('Lege kaart'), { status: 400 })
  const at = insertIndex(board, lane, position)
  return tidy(spliceText(board.lines, at, 0, [`- [ ] ${clean}`])).join('\n')
}

export function editCard(text, id, newText) {
  const board = parseKanban(text)
  const { card } = requireCard(board, id)
  const clean = String(newText)
    .replace(/\s*\n\s*/g, ' ')
    .trim()
  if (!clean) throw Object.assign(new Error('Lege kaart'), { status: 400 })
  const updated = { ...card, text: clean }
  return spliceText(board.lines, card.start, card.end - card.start + 1, cardLines(updated)).join('\n')
}

export function moveCard(text, id, laneRef, position = 'bottom', patch = {}) {
  const board = parseKanban(text)
  const { card } = requireCard(board, id)
  requireLane(board, laneRef)
  const moved = { ...card, ...patch }
  const without = spliceText(board.lines, card.start, card.end - card.start + 1)
  // Removing the last card of a lane leaves two blank lines behind; keep one.
  if (without[card.start - 1]?.trim() === '' && without[card.start]?.trim() === '') without.splice(card.start, 1)
  const board2 = parseKanban(without.join('\n'))
  const lane2 = requireLane(board2, typeof laneRef === 'number' ? laneRef : laneRef)
  const at = insertIndex(board2, lane2, position)
  return tidy(spliceText(board2.lines, at, 0, cardLines(moved))).join('\n')
}

const DONE_SUFFIX = /\s*\(afgerond \d{4}-\d{2}-\d{2}\)\s*$/

/** Check a card off and file it at the top of the done lane with today's date. */
export function completeCard(text, id, date) {
  const board = parseKanban(text)
  const { card } = requireCard(board, id)
  const doneLane = board.lanes.find((l) => l.role === 'done')
  const [first, ...rest] = card.text.split('\n')
  const stamped = DONE_SUFFIX.test(first) ? first : `${first} (afgerond ${date})`
  const patch = { done: true, text: [stamped, ...rest].join('\n') }
  if (!doneLane) {
    const updated = { ...card, ...patch }
    return spliceText(board.lines, card.start, card.end - card.start + 1, cardLines(updated)).join('\n')
  }
  return moveCard(text, id, doneLane.title, 'top', patch)
}

/** Undo a completion: uncheck, drop the date stamp, put it back in the given lane. */
export function reopenCard(text, id, laneRef) {
  const board = parseKanban(text)
  const { card } = requireCard(board, id)
  const [first, ...rest] = card.text.split('\n')
  const patch = { done: false, text: [first.replace(DONE_SUFFIX, ''), ...rest].join('\n') }
  const target = laneRef ?? board.lanes.find((l) => l.role === 'now')?.title ?? 0
  return moveCard(text, id, target, 'bottom', patch)
}

/** Append "(sinds <date>)" to every card matching `pred(card, lane)`. */
export function stampSince(text, pred, date) {
  const board = parseKanban(text)
  const lines = board.lines.slice()
  for (const lane of board.lanes) {
    for (const card of lane.cards) {
      if (!pred(card, lane)) continue
      lines[card.start] = lines[card.start].replace(/\s*$/, '') + ` (sinds ${date})`
    }
  }
  return lines.join('\n')
}

const FOLLOWUP = /\s*\(nagevraagd \d{4}-\d{2}-\d{2}\)/

/** Record that a waiting item was chased today; replaces an earlier stamp. */
export function stampFollowUp(text, id, date) {
  const board = parseKanban(text)
  const { card } = requireCard(board, id)
  const [first, ...rest] = card.text.split('\n')
  const updated = { ...card, text: [`${first.replace(FOLLOWUP, '')} (nagevraagd ${date})`, ...rest].join('\n') }
  return spliceText(board.lines, card.start, card.end - card.start + 1, cardLines(updated)).join('\n')
}
