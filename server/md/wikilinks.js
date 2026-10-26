// Obsidian wikilinks: [[target]], [[target#heading]], [[target|alias]], ![[embed]].

export const WIKILINK_RE = /(!?)\[\[([^\]\n]+?)\]\]/g

export function parseWikilink(inner) {
  // Inside tables the alias pipe is escaped as \|
  const [targetPart, ...aliasParts] = inner.replace(/\\\|/g, '|').split('|')
  const alias = aliasParts.join('|').trim() || null
  const [target, heading] = targetPart.split('#')
  return { target: target.trim(), heading: heading ? heading.trim() : null, alias }
}

export function wikilinksIn(text) {
  const out = []
  for (const m of String(text).matchAll(WIKILINK_RE)) {
    out.push({ embed: m[1] === '!', ...parseWikilink(m[2]) })
  }
  return out
}

/**
 * Build a resolver like Obsidian's: match by vault path (with or without the
 * project prefix and extension) first, then by file name; prefer active notes.
 */
export function makeResolver(files, { projectDir, isArchived }) {
  const byPath = new Map()
  const byName = new Map()
  for (const f of files) {
    const lower = f.path.toLowerCase()
    byPath.set(lower, f)
    byPath.set(lower.replace(/\.md$/, ''), f)
    const name = f.path.split('/').pop().toLowerCase()
    for (const key of [name, name.replace(/\.md$/, '')]) {
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key).push(f)
    }
  }
  const prefix = projectDir.toLowerCase() + '/'
  return function resolve(target) {
    if (!target) return null
    let t = target
      .trim()
      .replace(/^\.?\//, '')
      .toLowerCase()
    if (t.startsWith(prefix)) t = t.slice(prefix.length)
    if (t.includes('/')) {
      const hit = byPath.get(t) || byPath.get(t + '.md')
      if (hit) return hit
      t = t.split('/').pop()
    }
    const candidates = byName.get(t) || byName.get(t + '.md')
    if (!candidates) return null
    return candidates.find((c) => !isArchived(c.path)) || candidates[0]
  }
}
