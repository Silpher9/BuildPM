// Checkbox items (`- [ ]` / `- [x]`) anywhere in a note.

import { hash } from '../util.js'

export const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s?)(.*)$/

export function parseTasks(text) {
  const lines = text.split('\n')
  const tasks = []
  let heading = ''
  let fence = false
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fence = !fence
    if (fence) return
    const h = line.match(/^#{1,6}\s+(.+)$/)
    if (h) heading = h[1].trim()
    const m = line.match(TASK_RE)
    if (m) tasks.push({ line: i, done: m[2] !== ' ', text: m[4], heading, hash: taskHash(line) })
  })
  return tasks
}

/** Hash of the task text, independent of its checked state. */
export function taskHash(line) {
  const m = line.match(TASK_RE)
  return hash(m ? m[1] + m[4] : line)
}

/** Toggle a checkbox; located by line + hash, or by hash alone when lines shifted. */
export function setTask(text, { line, taskId, done }) {
  const lines = text.split('\n')
  let idx = line
  if (!(lines[idx] && TASK_RE.test(lines[idx]) && taskHash(lines[idx]) === taskId)) {
    idx = lines.findIndex((l) => TASK_RE.test(l) && taskHash(l) === taskId)
  }
  if (idx < 0) throw Object.assign(new Error('Checkbox niet gevonden; de notitie is intussen gewijzigd'), { status: 409 })
  lines[idx] = lines[idx].replace(TASK_RE, (_, a, _b, c, d) => `${a}${done ? 'x' : ' '}${c}${d}`)
  return lines.join('\n')
}

export function taskStats(text) {
  const tasks = parseTasks(text)
  return { total: tasks.length, done: tasks.filter((t) => t.done).length }
}
