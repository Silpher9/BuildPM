// Markdown (GFM) tables: parse with line positions, insert rows, update cells.

import { hash } from '../util.js'

const SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/

/** Split a table row into cells; respects `\|` escapes, [[wikilinks|alias]] and `code`. */
export function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells = []
  let cur = ''
  let link = 0
  let code = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (ch === '`') code = !code
    if (!code && ch === '[' && s[i + 1] === '[') {
      link++
      cur += '[['
      i++
      continue
    }
    if (!code && link && ch === ']' && s[i + 1] === ']') {
      link--
      cur += ']]'
      i++
      continue
    }
    if (ch === '|' && !link && !code) {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells
}

export function escapeCell(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\\\|/g, '|')
    .replace(/\|/g, '\\|')
    .trim()
}

export function formatRow(cells) {
  return `| ${cells.map(escapeCell).join(' | ')} |`
}

export function parseTables(text) {
  const lines = text.split('\n')
  const tables = []
  let heading = ''
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(HEADING_RE)
    if (h) {
      heading = h[2]
      continue
    }
    if (lines[i].includes('|') && SEP_RE.test(lines[i + 1] || '') && lines[i + 1].includes('-')) {
      const headers = splitRow(lines[i])
      const table = { heading, start: i, sepLine: i + 1, headers, rows: [] }
      let j = i + 2
      while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
        table.rows.push({ line: j, cells: splitRow(lines[j]), hash: hash(lines[j]) })
        j++
      }
      table.end = j - 1
      tables.push(table)
      i = j - 1
    }
  }
  return tables
}

/** Find a table by (partial) heading or by its first header cell. */
export function findTable(text, { heading, firstHeader } = {}) {
  const tables = parseTables(text)
  return (
    tables.find((t) => heading && t.heading.toLowerCase().includes(heading.toLowerCase())) ||
    tables.find((t) => firstHeader && t.headers[0]?.toLowerCase() === firstHeader.toLowerCase()) ||
    (!heading && !firstHeader ? tables[0] : undefined)
  )
}

function notFound(msg) {
  return Object.assign(new Error(msg), { status: 409 })
}

/** Insert a row at the top (right below the separator) or bottom of a table. */
export function insertRow(text, locator, cells, position = 'top') {
  const table = findTable(text, locator)
  if (!table) throw notFound('Tabel niet gevonden in notitie')
  const lines = text.split('\n')
  const padded = table.headers.map((_, i) => cells[i] ?? '')
  const at = position === 'top' ? table.sepLine + 1 : table.end + 1
  lines.splice(at, 0, formatRow(padded))
  return lines.join('\n')
}

/** Replace one cell; the row is located by line + hash, falling back to the hash alone. */
export function updateCell(text, locator, { line, rowHash, col, value }) {
  const table = findTable(text, locator)
  if (!table) throw notFound('Tabel niet gevonden in notitie')
  const row = table.rows.find((r) => r.line === line && r.hash === rowHash) || table.rows.find((r) => r.hash === rowHash)
  if (!row) throw notFound('Rij is intussen gewijzigd; ververs en probeer opnieuw')
  const cells = table.headers.map((_, i) => row.cells[i] ?? '')
  cells[col] = value
  const lines = text.split('\n')
  lines[row.line] = formatRow(cells)
  return lines.join('\n')
}

/** Table rows as objects keyed by header text. */
export function rowsAsObjects(table) {
  return table.rows.map((r) => {
    const obj = { _line: r.line, _hash: r.hash, _cells: r.cells }
    table.headers.forEach((h, i) => (obj[h] = r.cells[i] ?? ''))
    return obj
  })
}
