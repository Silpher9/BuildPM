import crypto from 'node:crypto'
import { config } from './config.js'

export function hash(text, len = 10) {
  return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, len)
}

/** Today as YYYY-MM-DD in the project's time zone. */
export function today(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: config.timeZone }).format(date)
}

/** Current time as HH:MM in the project's time zone. */
export function nowTime(date = new Date()) {
  return new Intl.DateTimeFormat('nl-NL', { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit' }).format(date)
}

export function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA + 'T12:00:00Z')
  const b = Date.parse(isoB + 'T12:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

const ISO_DATE = /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g
const NL_DATE = /(?<![\d-])(\d{1,2})-(\d{1,2})-(20\d{2})(?!\d)/g

/** All dates mentioned in a text, as ISO strings (supports 2026-07-29 and 14-03-2026). */
export function datesIn(text) {
  const out = []
  for (const m of String(text).matchAll(ISO_DATE)) out.push(`${m[1]}-${m[2]}-${m[3]}`)
  for (const m of String(text).matchAll(NL_DATE)) out.push(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  return out.filter(isValidIso).sort()
}

export function isValidIso(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
}

export function latestDate(text) {
  const d = datesIn(text)
  return d.length ? d[d.length - 1] : null
}

/** Lowercase and strip accents, for forgiving search and keyword matching. */
export function fold(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function slugify(text, max = 40) {
  const full = fold(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  let s = full.slice(0, max)
  // Do not cut a word in half when there is an earlier word boundary.
  if (full.length > max && full[max] !== '-' && s.includes('-')) s = s.slice(0, s.lastIndexOf('-'))
  return s.replace(/-+$/g, '') || 'item'
}

/** Strip markdown decoration for plain-text previews. */
export function plain(md) {
  return String(md)
    .replace(/!\[\[([^\]]+)\]\]/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\\?\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target.split('/').pop().replace(/_/g, ' '))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^>\s?(\[![^\]]+\]\s*)?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
