// Markdown → HTML for vault notes, with Obsidian flavour:
// wikilinks and image embeds, callouts, interactive checkboxes, heading anchors.

import MarkdownIt from 'markdown-it'
import { parseWikilink } from './wikilinks.js'
import { TASK_RE, taskHash } from './tasks.js'
import { slugify, hash } from '../util.js'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i

const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false })

const esc = (s) => md.utils.escapeHtml(String(s ?? ''))

export function noteHref(path, heading) {
  return `/n/${path.split('/').map(encodeURIComponent).join('/')}${heading ? '#' + slugify(heading, 80) : ''}`
}

export function fileHref(path, width) {
  return `/api/file?path=${encodeURIComponent(path)}${width ? `&w=${width}` : ''}`
}

md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const { src, pos } = state
  let start = pos
  let embed = false
  if (src.charCodeAt(pos) === 0x21 && src.startsWith('[[', pos + 1)) {
    embed = true
    start = pos + 1
  } else if (!src.startsWith('[[', pos)) return false
  const end = src.indexOf(']]', start + 2)
  if (end < 0) return false
  const inner = src.slice(start + 2, end)
  if (!inner || inner.includes('\n')) return false
  if (!silent) {
    const tok = state.push('wikilink', '', 0)
    tok.meta = { embed, ...parseWikilink(inner) }
  }
  state.pos = end + 2
  return true
})

md.renderer.rules.wikilink = (tokens, idx, _opts, env) => {
  const { embed, target, heading, alias } = tokens[idx].meta
  const hit = env.resolve?.(target)
  const label = alias || (heading && !target ? heading : target.split('/').pop().replace(/\.md$/, '').replace(/_/g, ' '))
  if (embed && hit && IMAGE_EXT.test(hit.path)) {
    return `<a class="embed-img" href="${esc(fileHref(hit.path))}" data-lightbox="${esc(hit.path)}"><img src="${esc(fileHref(hit.path, 1200))}" alt="${esc(alias || label)}" loading="lazy"></a>`
  }
  if (!target && heading) return `<a class="wl" href="#${slugify(heading, 80)}">${esc(label)}</a>`
  if (!hit) return `<span class="wl wl-missing" title="Niet gevonden in dit project">${esc(label)}</span>`
  if (!hit.path.endsWith('.md')) {
    return `<a class="wl wl-file" href="${esc(fileHref(hit.path))}" target="_blank" rel="noopener">${esc(label)}</a>`
  }
  return `<a class="wl" href="${noteHref(hit.path, heading)}" data-note="${esc(hit.path)}">${esc(label)}</a>`
}

// Checkboxes in list items become real inputs that know their source line.
md.core.ruler.after('inline', 'tasks', (state) => {
  const { env, tokens } = state
  for (let i = 2; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type !== 'inline' || tokens[i - 2]?.type !== 'list_item_open') continue
    const first = tok.children?.[0]
    const m = first?.type === 'text' && first.content.match(/^\[([ xX])\]\s?/)
    if (!m) continue
    const line = (tokens[i - 2].map?.[0] ?? 0) + (env.lineOffset || 0)
    const src = env.lines?.[line] ?? ''
    if (!TASK_RE.test(src)) continue
    first.content = first.content.slice(m[0].length)
    const checked = m[1] !== ' '
    const box = new state.Token('html_inline', '', 0)
    box.content = `<input type="checkbox" class="task" data-line="${line}" data-task="${taskHash(src)}"${checked ? ' checked' : ''}${env.readOnly ? ' disabled' : ''}>`
    tok.children.unshift(box)
    tokens[i - 2].attrJoin('class', checked ? 'task-item done' : 'task-item')
  }
})

// > [!type] Title  →  callout box.
md.core.ruler.after('inline', 'callouts', (state) => {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].type !== 'blockquote_open' || tokens[i + 2].type !== 'inline') continue
    const inline = tokens[i + 2]
    const first = inline.children?.[0]
    const m = first?.type === 'text' && first.content.match(/^\[!([\w-]+)\][+-]?\s*(.*)$/)
    if (!m) continue
    const type = m[1].toLowerCase()
    tokens[i].attrJoin('class', `callout callout-${type}`)
    // The title runs until the first line break; it may contain bold or links.
    let cut = 1
    while (cut < inline.children.length && !/break$/.test(inline.children[cut].type)) cut++
    const rest = md.renderer.renderInline(inline.children.slice(1, cut), md.options, state.env)
    const titleHtml = (esc(m[2]) + rest).trim() || esc(type.charAt(0).toUpperCase() + type.slice(1))
    const title = new state.Token('html_inline', '', 0)
    title.content = `<span class="callout-title">${titleHtml}</span>`
    inline.children.splice(0, cut + 1, title)
  }
})

// Heading anchors (and a table of contents in env.headings).
md.core.ruler.after('inline', 'anchors', (state) => {
  const used = new Map()
  const env = state.env
  env.headings = []
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue
    const text = tokens[i + 1].children.map((c) => (c.type === 'wikilink' ? c.meta.alias || c.meta.target : c.content)).join('')
    let slug = slugify(text, 80)
    const n = used.get(slug) || 0
    used.set(slug, n + 1)
    if (n) slug = `${slug}-${n}`
    tokens[i].attrSet('id', slug)
    env.headings.push({ level: Number(tokens[i].tag.slice(1)), text: text.trim(), slug })
  }
})

// Fill-in fields: `____` (4+ underscores) becomes an input that writes the value back
// into that line. `[📷 …](buildpm:foto)` becomes a photo button for the current section,
// followed by the photos already logged for it. Runs last, so heading ids exist.
export const FIELD_RE = /_{4,}/g
// A field followed by a unit, `×`, `(+0,5)` or `· verwacht 6` expects a number: small box, numeric keyboard.
const NUMERIC_AFTER = /^\s*(?:cm|mm|m\b|°|×|x\s|\(\s*[+\-−]?\d|·\s*(?:verwacht|aangenomen)\s+(?:ca\.\s*)?[+\-−]?\d)/i
md.core.ruler.push('fields_and_photos', (state) => {
  const { env, tokens } = state
  let section = null
  const perLine = new Map() // a table row holds fields from several cells
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type === 'heading_open') {
      const slug = tok.attrGet('id')
      section = { slug, text: (env.headings || []).find((h) => h.slug === slug)?.text || '' }
      continue
    }
    if (tok.type !== 'inline' || !tok.children) continue
    // Table cells carry no source map; their row (tr_open) does.
    let k = i - 1
    while (k >= 0 && !tokens[k].map) k--
    let line = (tokens[k]?.map?.[0] ?? 0) + (env.lineOffset || 0)
    const out = []
    for (let c = 0; c < tok.children.length; c++) {
      const ch = tok.children[c]
      if (ch.type === 'softbreak' || ch.type === 'hardbreak') line++
      if (ch.type === 'link_open' && ch.attrGet('href') === 'buildpm:foto') {
        let end = c
        while (end < tok.children.length && tok.children[end].type !== 'link_close') end++
        const h = new state.Token('html_inline', '', 0)
        const photos = (section && env.sectionPhotos?.[section.slug]) || []
        const gallery = photos
          .flatMap((e) =>
            e.images.map(
              (img) =>
                `<a class="embed-img" href="${esc(fileHref(img))}" data-lightbox="${esc(img)}" title="${esc(e.date + ' ' + (e.time || ''))}"><img src="${esc(fileHref(img, 480))}" alt="" loading="lazy"></a>`,
            ),
          )
          .join('')
        h.content =
          `<span class="note-photo">` +
          (env.readOnly
            ? ''
            : `<label class="btn small mark photo-btn">📷 Foto maken<input type="file" accept="image/*" capture="environment" multiple hidden data-photo-heading="${esc(section?.text || '')}"></label>`) +
          (photos.length
            ? `<span class="note-photo-count">${photos.length} logboekregel${photos.length > 1 ? 's' : ''} met foto’s</span><span class="note-photo-grid">${gallery}</span>`
            : '') +
          `</span>`
        out.push(h)
        c = end
        continue
      }
      if (ch.type === 'text' && FIELD_RE.test(ch.content) && !env.readOnly) {
        FIELD_RE.lastIndex = 0
        const src = env.lines?.[line] ?? ''
        let last = 0
        for (const m of ch.content.matchAll(FIELD_RE)) {
          if (m.index > last) {
            const t = new state.Token('text', '', 0)
            t.content = ch.content.slice(last, m.index)
            out.push(t)
          }
          const n = perLine.get(line) || 0
          perLine.set(line, n + 1)
          const inp = new state.Token('html_inline', '', 0)
          const num = NUMERIC_AFTER.test(ch.content.slice(m.index + m[0].length))
          inp.content =
            `<input type="text" class="fill${num ? ' num' : ''}"${num ? ' inputmode="decimal"' : ''} enterkeyhint="done" ` +
            `data-line="${line}" data-line-hash="${hash(src)}" data-idx="${n}" placeholder="${num ? '…' : 'invullen'}" aria-label="Invullen">`
          out.push(inp)
          last = m.index + m[0].length
        }
        if (last < ch.content.length) {
          const t = new state.Token('text', '', 0)
          t.content = ch.content.slice(last)
          out.push(t)
        }
        continue
      }
      out.push(ch)
    }
    tok.children = out
  }
})

md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n'
md.renderer.rules.table_close = () => '</table></div>\n'

const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, self) => self.renderToken(t, i, o))
md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
  const href = tokens[idx].attrGet('href') || ''
  if (/^(https?:|obsidian:|mailto:)/.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener')
  }
  return defaultLinkOpen(tokens, idx, opts, env, self)
}

/** Blank out Obsidian %% comments %% while keeping line numbers intact. */
export function stripComments(text) {
  return text.replace(/%%[\s\S]*?%%/g, (m) => '\n'.repeat((m.match(/\n/g) || []).length))
}

/**
 * Render a note body. `lineOffset` is where `body` starts in the file and `lines`
 * are the file's lines, so checkboxes can point back at their exact source line.
 */
export function renderNote(body, { resolve, lineOffset = 0, lines = [], readOnly = false, sectionPhotos = {} } = {}) {
  const env = { resolve, lineOffset, lines, readOnly, sectionPhotos }
  const html = md.render(stripComments(body), env)
  return { html, headings: env.headings || [] }
}

export function renderInline(text, { resolve } = {}) {
  return md.renderInline(String(text ?? ''), { resolve })
}
