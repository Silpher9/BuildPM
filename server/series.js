// Photo series: log entries tagged #fotoserie are placed in the reference 3D model in the
// background (tools/fotoserie/register.mjs, one at a time). Results are derived data and live
// in .data/fotoserie/series/<id>/; the log entry in the vault stays the source.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { config } from './config.js'
import { originalOf } from './images.js'

export const SERIES_TAG = /#fotoserie\b/i
export const SERIES_FILES = /^(plan|vergelijk-\d+)\.jpg$/

const root = () => path.join(config.dataDir, 'fotoserie', 'series')
export const seriesDir = (id) => path.join(root(), id)
export const seriesId = (images) => path.basename(images[0]).replace(/\.[a-z0-9]+$/i, '')
export const seriesEnabled = () => !!config.seriesReference && fs.existsSync(path.join(config.seriesReference, 'sparse'))

export function seriesStatus(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(seriesDir(id), 'status.json'), 'utf8'))
  } catch {
    return null
  }
}

function writeStatus(id, status) {
  fs.mkdirSync(seriesDir(id), { recursive: true })
  const f = path.join(seriesDir(id), 'status.json')
  fs.writeFileSync(f + '.tmp', JSON.stringify({ ...status, at: new Date().toISOString() }))
  fs.renameSync(f + '.tmp', f)
}

const queue = []
let running = null
let changed = () => {}
export const onSeriesChange = (fn) => (changed = fn)

/** Queue a series unless it is done, failed or already waiting. `force` re-runs it. */
export function enqueueSeries(images, { force = false } = {}) {
  if (!seriesEnabled() || images.length < 2) return null
  const id = seriesId(images)
  const st = seriesStatus(id)
  const busy = running?.id === id || queue.some((j) => j.id === id)
  if (busy || (st && st.state !== 'queued' && st.state !== 'running' && !force)) return id
  const files = images.map((p) => originalOf(p) || path.join(config.projectRoot, p))
  fs.mkdirSync(seriesDir(id), { recursive: true })
  fs.writeFileSync(path.join(seriesDir(id), 'job.json'), JSON.stringify({ images: files, vault: images }, null, 1))
  writeStatus(id, { state: 'queued' })
  queue.push({ id })
  changed(id)
  pump()
  return id
}

function pump() {
  if (running || !queue.length) return
  running = queue.shift()
  const { id } = running
  const script = path.join(config.repoRoot, 'tools', 'fotoserie', 'register.mjs')
  const args = ['--no-warnings', script, '--reference', config.seriesReference, '--out', seriesDir(id)]
  if (process.env.SERIES_RENDER_BLEND) args.push('--render', path.resolve(config.repoRoot, process.env.SERIES_RENDER_BLEND))
  const logFile = fs.openSync(path.join(seriesDir(id), 'run.log'), 'a')
  const child = spawn(process.execPath, args, { stdio: ['ignore', logFile, logFile] })
  const done = (code) => {
    fs.closeSync(logFile)
    const st = seriesStatus(id)
    if (!st || st.state === 'running' || st.state === 'queued') writeStatus(id, { state: 'failed', error: `Verwerking stopte onverwacht (code ${code})` })
    running = null
    changed(id)
    pump()
  }
  child.on('error', () => done(-1))
  child.on('close', done)
}

/** After a restart: queue every tagged entry that has no finished result yet. */
export function resumeSeries(entries) {
  for (const e of entries) if (SERIES_TAG.test(e.text) && e.images.length >= 2) enqueueSeries(e.images)
}

/** Compact status for the UI; null when the entry is no series. */
export function seriesInfo(entry) {
  if (!SERIES_TAG.test(entry.text) || entry.images.length < 2) return null
  const id = seriesId(entry.images)
  const st = seriesStatus(id)
  return { id, state: st?.state || (seriesEnabled() ? 'queued' : 'off'), summary: st?.summary || null, error: st?.error || null }
}
