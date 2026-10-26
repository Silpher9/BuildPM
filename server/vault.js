// Read/write access to the project folder inside the Obsidian vault.
//
// - Every path is relative to the project folder and checked against escapes.
// - Writes are atomic (temp file + rename) and the previous version is kept in
//   .data/history so a change can be undone from the dashboard.
// - A recursive watcher bumps `version` on any change (also changes made in
//   Obsidian or by agents), which clients hear about over server-sent events.

import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { config } from './config.js'
import { splitFrontmatter } from './md/frontmatter.js'
import { makeResolver, wikilinksIn } from './md/wikilinks.js'
import { taskStats } from './md/tasks.js'
import { hash, HttpError } from './util.js'

const NOTE_EXT = '.md'
const ASSET_EXT = /\.(jpe?g|png|webp|gif|avif|svg|pdf)$/i
const HISTORY_KEEP = 40

export class Vault extends EventEmitter {
  constructor(root = config.projectRoot) {
    super()
    this.root = root
    this.version = 0
    this.index = null
    this.ownWrites = new Map() // path -> content hash we wrote, to tag watcher events
    this.lastGroup = null // writes of the most recent action, for undo
    this.activeGroup = null
    this.manifestTimer = null
  }

  // ---------- paths ----------

  abs(rel) {
    const clean = String(rel || '').replace(/^\/+/, '')
    const full = path.resolve(this.root, clean)
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new HttpError(400, 'Pad buiten het project')
    if (clean.split('/').some((p) => p.startsWith('.'))) throw new HttpError(400, 'Verborgen bestanden zijn niet toegankelijk')
    return full
  }

  isArchived(rel) {
    return config.archiveDirs.some((d) => rel === d || rel.startsWith(d + '/'))
  }

  // ---------- index ----------

  scan() {
    const files = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith(NOTE_EXT) || ASSET_EXT.test(entry.name)) {
          const stat = fs.statSync(full)
          files.push({ path: path.relative(this.root, full).split(path.sep).join('/'), mtime: stat.mtimeMs, size: stat.size })
        }
      }
    }
    if (fs.existsSync(this.root)) walk(this.root)
    return files
  }

  buildIndex() {
    const files = this.scan()
    const resolve = makeResolver(files, { projectDir: config.projectDir, isArchived: (p) => this.isArchived(p) })
    const notes = []
    const assets = []
    for (const f of files) {
      if (!f.path.endsWith(NOTE_EXT)) {
        assets.push({ ...f, archived: this.isArchived(f.path) })
        continue
      }
      const text = fs.readFileSync(this.abs(f.path), 'utf8')
      const { data, body } = splitFrontmatter(text)
      const name = f.path.split('/').pop().replace(/\.md$/, '')
      // Many research notes open with a "# Vragen voor …" heading; the real title is the next H1.
      const h1 = [...body.matchAll(/^#\s+(.+?)\s*$/gm)].find((m) => !/^vragen voor/i.test(m[1]))
      const headings = [...body.matchAll(/^(#{2,3})\s+(.+?)\s*$/gm)].map((m) => ({ level: m[1].length, text: m[2] }))
      const links = wikilinksIn(body)
        .map((l) => resolve(l.target)?.path)
        .filter(Boolean)
      notes.push({
        path: f.path,
        name,
        folder: f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '',
        title: (h1 ? h1[1] : name.replace(/^\d+[a-z]?_/, '').replace(/_/g, ' ')).replace(/[*`]/g, '').replace(/\.md$/, '').trim(),
        fm: data,
        mtime: f.mtime,
        size: f.size,
        archived: this.isArchived(f.path),
        headings,
        links: [...new Set(links)],
        tasks: taskStats(text),
        body,
      })
    }
    const backlinks = new Map()
    for (const n of notes) {
      for (const target of n.links) {
        if (target === n.path) continue
        if (!backlinks.has(target)) backlinks.set(target, new Set())
        backlinks.get(target).add(n.path)
      }
    }
    this.index = {
      notes,
      assets,
      resolve,
      byPath: new Map(notes.map((n) => [n.path, n])),
      backlinks: (p) => [...(backlinks.get(p) || [])],
      builtAt: Date.now(),
    }
    return this.index
  }

  get idx() {
    return this.index || this.buildIndex()
  }

  // ---------- read / write ----------

  exists(rel) {
    return fs.existsSync(this.abs(rel))
  }

  read(rel) {
    const full = this.abs(rel)
    if (!fs.existsSync(full)) throw new HttpError(404, `Notitie niet gevonden: ${rel}`)
    return fs.readFileSync(full, 'utf8')
  }

  /** Apply `fn(text) => newText` to a note atomically; returns the new text. */
  update(rel, fn, { create = false, label = 'Wijziging' } = {}) {
    const full = this.abs(rel)
    const exists = fs.existsSync(full)
    if (!exists && !create) throw new HttpError(404, `Notitie niet gevonden: ${rel}`)
    const before = exists ? fs.readFileSync(full, 'utf8') : ''
    const crlf = before.includes('\r\n')
    const next = fn(crlf ? before.replace(/\r\n/g, '\n') : before)
    if (typeof next !== 'string') throw new Error('update() verwacht tekst terug')
    if (next === before) return { text: before, changed: false }
    const out = crlf ? next.replace(/\n/g, '\r\n') : next
    const historyFile = this.saveHistory(rel, before, exists)
    this.writeAtomic(full, out)
    this.ownWrites.set(rel, hash(out))
    const record = { path: rel, hash: hash(out), historyFile, existed: exists }
    if (this.activeGroup) this.activeGroup.writes.push(record)
    else this.lastGroup = { label, at: Date.now(), writes: [record] }
    this.touch([rel])
    this.scheduleManifest()
    return { text: out, changed: true }
  }

  /** Run several updates as one undoable action. */
  group(label, fn) {
    const group = { label, at: Date.now(), writes: [] }
    this.activeGroup = group
    try {
      const result = fn()
      if (group.writes.length) this.lastGroup = group
      return result
    } finally {
      this.activeGroup = null
    }
  }

  writeAtomic(full, content) {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const tmp = path.join(path.dirname(full), `.buildpm-${process.pid}-${Date.now()}.tmp`)
    let mode
    try {
      mode = fs.statSync(full).mode
    } catch {
      mode = undefined
    }
    fs.writeFileSync(tmp, content, mode ? { mode } : undefined)
    fs.renameSync(tmp, full)
  }

  writeBinary(rel, buffer) {
    const full = this.abs(rel)
    if (fs.existsSync(full)) throw new HttpError(409, 'Bestand bestaat al')
    this.writeAtomic(full, buffer)
    this.touch([rel])
  }

  historyDir(rel) {
    return path.join(config.dataDir, 'history', rel.replace(/\//g, '__'))
  }

  saveHistory(rel, before, existed) {
    const dir = this.historyDir(rel)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${existed ? 'md' : 'new'}`)
    fs.writeFileSync(file, before)
    const versions = fs.readdirSync(dir).sort()
    for (const old of versions.slice(0, Math.max(0, versions.length - HISTORY_KEEP))) fs.rmSync(path.join(dir, old))
    return file
  }

  /** Restore every note touched by the most recent action, if nobody changed them since. */
  undoLast() {
    const group = this.lastGroup
    if (!group) throw new HttpError(400, 'Niets om ongedaan te maken')
    const latest = new Map(group.writes.map((w) => [w.path, w]))
    for (const w of latest.values()) {
      const full = this.abs(w.path)
      const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : ''
      if (hash(current) !== w.hash) throw new HttpError(409, 'De notitie is intussen ook ergens anders gewijzigd; ongedaan maken is niet veilig')
      if (!fs.existsSync(w.historyFile)) throw new HttpError(400, 'Eerdere versie niet meer beschikbaar')
    }
    for (const w of [...group.writes].reverse()) {
      const full = this.abs(w.path)
      if (w.existed) this.writeAtomic(full, fs.readFileSync(w.historyFile, 'utf8'))
      // A note that did not exist before is set aside in the history folder, never deleted.
      else fs.renameSync(full, path.join(this.historyDir(w.path), `${Date.now()}.undone.md`))
      fs.rmSync(w.historyFile)
    }
    this.lastGroup = null
    this.touch(group.writes.map((w) => w.path))
    this.scheduleManifest()
    return group
  }

  // ---------- change tracking ----------

  touch(paths = []) {
    this.index = null
    this.version++
    this.emit('change', { version: this.version, paths })
  }

  watch() {
    if (!fs.existsSync(this.root)) return
    let pending = new Set()
    let timer = null
    try {
      fs.watch(this.root, { recursive: true }, (_event, file) => {
        if (!file) return
        const rel = String(file).split(path.sep).join('/')
        if (rel.split('/').some((p) => p.startsWith('.'))) return
        pending.add(rel)
        clearTimeout(timer)
        timer = setTimeout(() => {
          const paths = [...pending].filter((p) => {
            // Ignore the echo of our own atomic write.
            const own = this.ownWrites.get(p)
            if (!own) return true
            try {
              const same = hash(fs.readFileSync(this.abs(p), 'utf8')) === own
              if (same) this.ownWrites.delete(p)
              return !same
            } catch {
              return true
            }
          })
          pending = new Set()
          if (paths.length) this.touch(paths)
        }, 250)
      })
    } catch (err) {
      console.warn('[vault] watcher niet beschikbaar:', err.message)
    }
  }

  /** Keep the vault's own manifest current after dashboard writes (debounced). */
  scheduleManifest() {
    if (!config.manifestScript) return
    const script = path.join(config.vaultRoot, config.manifestScript)
    if (!fs.existsSync(script)) return
    clearTimeout(this.manifestTimer)
    this.manifestTimer = setTimeout(() => {
      execFile('python3', [script], { cwd: config.vaultRoot, timeout: 60000 }, (err) => {
        if (err) console.warn('[vault] manifest bijwerken mislukt:', err.message)
      })
    }, 20000)
    this.manifestTimer.unref?.()
  }
}
