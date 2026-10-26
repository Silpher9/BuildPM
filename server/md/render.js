// Markdown → HTML for vault notes, with Obsidian flavour:
// wikilinks and image embeds, callouts, interactive checkboxes, heading anchors.

import MarkdownIt from 'markdown-it'
import { parseWikilink } from './wikilinks.js'
import { TASK_RE, taskHash } from './tasks.js'
import { slugify } from '../util.js'

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
export function renderNote(body, { resolve, lineOffset = 0, lines = [], readOnly = false } = {}) {
  const env = { resolve, lineOffset, lines, readOnly }
  const html = md.render(stripComments(body), env)
  return { html, headings: env.headings || [] }
}

export function renderInline(text, { resolve } = {}) {
  return md.renderInline(String(text ?? ''), { resolve })
}
