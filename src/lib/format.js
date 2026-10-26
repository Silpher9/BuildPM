const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

export function shortDate(iso, withYear = false) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`
}

export function monthTitle(iso) {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

export function ago(days) {
  if (days == null) return ''
  if (days <= 0) return 'vandaag'
  if (days === 1) return 'gisteren'
  if (days < 14) return `${days} dagen geleden`
  if (days < 60) return `${Math.round(days / 7)} weken geleden`
  return `${Math.round(days / 30)} maanden geleden`
}

export function euro(n) {
  if (n == null) return ''
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

export const CONTEXTS = {
  regelen: { label: 'Regelen', hint: 'bellen, mailen, aanvragen', icon: 'phone' },
  doen: { label: 'Doen', hint: 'op de bouw', icon: 'hammer' },
  uitzoeken: { label: 'Uitzoeken', hint: 'achter de laptop', icon: 'compass' },
}

export const PHASE_STATES = [
  { key: 'klaar', label: 'Klaar' },
  { key: 'bezig', label: 'Bezig' },
  { key: 'volgende', label: 'Volgende' },
  { key: 'later', label: 'Later' },
]

export const ROLE_LABEL = { now: 'Nu', waiting: 'Wacht', backlog: 'Backlog', done: 'Klaar', other: 'Overig' }

export const SECTIONS = [
  { href: '/taken', no: '01', title: 'Taken', desc: 'Wat nu, waar je op wacht en wat later komt' },
  { href: '/fasen', no: '02', title: 'Bouwfasen', desc: 'Van vergunning tot wonen' },
  { href: '/hoofdstukken', no: '03', title: 'Hoofdstukken', desc: 'De zes inhoudelijke sporen' },
  { href: '/besluiten', no: '04', title: 'Besluiten', desc: 'Wat vastligt, met datum en impact' },
  { href: '/vragen', no: '05', title: 'Vragen & blokkades', desc: 'Wat nog beslist of geregeld moet' },
  { href: '/werk', no: '06', title: 'Werkpakketten', desc: 'Uitvoering per pakket' },
  { href: '/kennis', no: '07', title: 'Kennisbank', desc: 'Al het onderzoek en alle notities' },
  { href: '/ontwerp', no: '08', title: 'Ontwerp', desc: 'Renders, foto’s en ruimteboek' },
  { href: '/logboek', no: '09', title: 'Logboek', desc: 'Wat er gebeurd is, met foto’s' },
  { href: '/voorraad', no: '10', title: 'Voorraad & kosten', desc: 'Materiaal, bestellingen en uitgaven' },
]

/** Same as the server's slugify: heading text -> anchor id. */
export function slugify(text, max = 80) {
  const full = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  let s = full.slice(0, max)
  if (full.length > max && full[max] !== '-' && s.includes('-')) s = s.slice(0, s.lastIndexOf('-'))
  return s.replace(/-+$/g, '') || 'item'
}

export function noteHref(path, heading) {
  return '/n/' + path.split('/').map(encodeURIComponent).join('/') + (heading ? '#' + slugify(heading) : '')
}

export function fileUrl(path, w) {
  return `/api/file?path=${encodeURIComponent(path)}${w ? `&w=${w}` : ''}`
}
