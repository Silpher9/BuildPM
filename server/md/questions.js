// Open questions: numbered list items in question sections.
//
// Central list: every numbered item with a "?" outside the answered/archive sections.
// Other notes: every numbered item inside a "Vragen ..." section.
// Answered items keep their place and get a `**Beantwoord <datum>:**` prefix —
// the convention the vault already uses.

import { hash } from '../util.js'

const ITEM_RE = /^(\s*)(\d+)\.(\s+)(.*)$/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/
const CLOSED_RE = /^(\*\*(Beantwoord|Vervallen)\b|✅|~~)/
const SKIP_SECTIONS = /bevestigd|achterhaald|niet meer nodig|afgerond|bronnen|kruisverband|^doel$/i

export function isClosed(itemText) {
  return CLOSED_RE.test(itemText.trim())
}

export function parseQuestions(text, { central = false } = {}) {
  const lines = text.split('\n')
  const out = []
  let h2 = ''
  let section = ''
  let sectionLevel = 0
  let inQuestionSection = false
  let skip = false
  let group = ''
  let fence = false
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fence = !fence
    if (fence) return
    const h = line.match(HEADING_RE)
    if (h) {
      const level = h[1].length
      const title = h[2].replace(/[✅*]/g, '').trim()
      if (level <= 2) h2 = title
      if (central) {
        if (level <= 3) {
          section = title
          sectionLevel = level
          skip = SKIP_SECTIONS.test(title) || (level === 3 && SKIP_SECTIONS.test(h2))
          group = ''
        }
      } else if (/vragen/i.test(title)) {
        inQuestionSection = true
        sectionLevel = level
        section = title
      } else if (inQuestionSection && level <= sectionLevel) {
        inQuestionSection = false
      }
      return
    }
    if (!central && /^---\s*$/.test(line)) inQuestionSection = false
    const bold = line.match(/^\*\*([^*]+)\*\*\s*$/)
    if (bold) {
      group = bold[1].trim()
      return
    }
    const m = line.match(ITEM_RE)
    if (!m || m[1].length > 0) return
    const itemText = m[4].trim()
    if (central ? skip || !itemText.includes('?') : !inQuestionSection) return
    out.push({
      line: i,
      number: Number(m[2]),
      text: itemText,
      closed: isClosed(itemText),
      section,
      group,
      priority: /blokkerend/i.test(section) ? 'blokkerend' : /belangrijk/i.test(section) ? 'belangrijk' : '',
      hash: hash(line),
    })
  })
  return out
}

function locate(lines, { line, itemHash }) {
  if (lines[line] !== undefined && hash(lines[line]) === itemHash) return line
  return lines.findIndex((l) => hash(l) === itemHash)
}

/** Mark a question as answered (or dropped) in place. */
export function closeQuestion(text, { line, itemHash, answer, date, dropped = false }) {
  const lines = text.split('\n')
  const idx = locate(lines, { line, itemHash })
  if (idx < 0) throw Object.assign(new Error('Vraag niet gevonden; de notitie is intussen gewijzigd'), { status: 409 })
  const m = lines[idx].match(ITEM_RE)
  if (!m) throw Object.assign(new Error('Regel is geen genummerde vraag'), { status: 409 })
  const original = m[4].trim()
  const clean = String(answer || '')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
  lines[idx] = dropped
    ? `${m[1]}${m[2]}.${m[3]}**Vervallen ${date}:** ~~${original}~~${clean ? ` — ${clean}` : ''}`
    : `${m[1]}${m[2]}.${m[3]}**Beantwoord ${date}:** ${clean} — zie [[Besluitenlog]]. Vraag was: ${original}`
  return lines.join('\n')
}
