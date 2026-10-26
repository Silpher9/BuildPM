import YAML from 'yaml'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Split a note into frontmatter and body.
 * `bodyLine` is the 0-based line index in the original text where the body starts,
 * so positions found in the body can be mapped back to the file.
 */
export function splitFrontmatter(text) {
  const m = text.match(FM_RE)
  if (!m) return { data: {}, raw: '', body: text, bodyLine: 0 }
  let data = {}
  try {
    data = YAML.parse(m[1]) || {}
    if (typeof data !== 'object' || Array.isArray(data)) data = {}
  } catch {
    data = {}
  }
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Date) data[k] = v.toISOString().slice(0, 10)
  }
  const bodyLine = m[0].split('\n').length - (m[0].endsWith('\n') ? 1 : 0)
  return { data, raw: m[1], body: text.slice(m[0].length), bodyLine }
}

/** Set (or add) a single scalar frontmatter field, leaving every other line untouched. */
export function setFrontmatterField(text, key, value) {
  const m = text.match(FM_RE)
  const line = `${key}: ${value}`
  if (!m) return `---\n${line}\n---\n\n${text}`
  const lines = m[1].split(/\r?\n/)
  const idx = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (idx >= 0) lines[idx] = line
  else lines.push(line)
  return text.replace(FM_RE, `---\n${lines.join('\n')}\n---\n`)
}
