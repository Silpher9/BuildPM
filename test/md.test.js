import { describe, it, expect } from 'vitest'
import { parseKanban, addCard, moveCard, completeCard, reopenCard, editCard, stampFollowUp } from '../server/md/kanban.js'
import { parseTables, insertRow, updateCell, splitRow } from '../server/md/tables.js'
import { parseTasks, setTask } from '../server/md/tasks.js'
import { parseQuestions, closeQuestion } from '../server/md/questions.js'
import { splitFrontmatter, setFrontmatterField } from '../server/md/frontmatter.js'
import { renderNote } from '../server/md/render.js'
import { makeResolver } from '../server/md/wikilinks.js'
import { insertLogEntry } from '../server/actions.js'
import { inferContext, parseAmount } from '../server/domain.js'

const BOARD = `---
kanban-plugin: board
reviewed: 2026-01-10
---

# Kanban

> Intro text.

## Nu — werk

- [ ] Eerste taak met [[Notitie_A]].
- [ ] Tweede taak.

## Wachten op extern

- [ ] Gemeente bellen over vergunning (sinds 2026-01-05).

## Backlog

## Klaar

- [x] Oude taak (2026-01-01).

%% kanban:settings
\`\`\`json
{"kanban-plugin":"board"}
\`\`\`
%%
`

describe('kanban', () => {
  it('parses lanes, roles and cards', () => {
    const { lanes } = parseKanban(BOARD)
    expect(lanes.map((l) => l.title)).toEqual(['Nu — werk', 'Wachten op extern', 'Backlog', 'Klaar'])
    expect(lanes.map((l) => l.role)).toEqual(['now', 'waiting', 'backlog', 'done'])
    expect(lanes[0].cards).toHaveLength(2)
    expect(lanes[3].cards[0].done).toBe(true)
  })

  it('completes a card into the done lane with a date stamp', () => {
    const id = parseKanban(BOARD).lanes[0].cards[1].id
    const out = completeCard(BOARD, id, '2026-02-02')
    const { lanes } = parseKanban(out)
    expect(lanes[0].cards).toHaveLength(1)
    expect(lanes[3].cards[0].text).toBe('Tweede taak. (afgerond 2026-02-02)')
    expect(lanes[3].cards[0].done).toBe(true)
    expect(out).toContain('%% kanban:settings')
    expect(out.startsWith('---\nkanban-plugin: board')).toBe(true)
  })

  it('reopens a completed card without the stamp', () => {
    const id = parseKanban(BOARD).lanes[0].cards[1].id
    const done = completeCard(BOARD, id, '2026-02-02')
    const doneId = parseKanban(done).lanes[3].cards[0].id
    const back = reopenCard(done, doneId)
    const { lanes } = parseKanban(back)
    expect(lanes[0].cards.map((c) => c.text)).toContain('Tweede taak.')
    expect(lanes[3].cards).toHaveLength(1)
  })

  it('adds into an empty lane and keeps blank lines tidy', () => {
    const out = addCard(BOARD, 'Backlog', 'Nieuwe backlogtaak')
    const { lanes } = parseKanban(out)
    expect(lanes[2].cards.map((c) => c.text)).toEqual(['Nieuwe backlogtaak'])
    expect(out).toContain('## Backlog\n\n- [ ] Nieuwe backlogtaak\n\n## Klaar')
  })

  it('moves a card and leaves no double blank lines', () => {
    const id = parseKanban(BOARD).lanes[1].cards[0].id
    const out = moveCard(BOARD, id, 'now', 'top')
    expect(parseKanban(out).lanes[0].cards[0].text).toMatch(/^Gemeente bellen/)
    expect(out).not.toMatch(/\n\n\n/)
  })

  it('edits and stamps follow-ups', () => {
    const id = parseKanban(BOARD).lanes[1].cards[0].id
    let out = stampFollowUp(BOARD, id, '2026-03-01')
    const id2 = parseKanban(out).lanes[1].cards[0].id
    out = stampFollowUp(out, id2, '2026-03-05')
    expect(out).toContain('(nagevraagd 2026-03-05)')
    expect(out).not.toContain('(nagevraagd 2026-03-01)')
    const id3 = parseKanban(out).lanes[1].cards[0].id
    out = editCard(out, id3, 'Anders geformuleerd')
    expect(parseKanban(out).lanes[1].cards[0].text).toBe('Anders geformuleerd')
  })

  it('rejects unknown ids with a conflict', () => {
    expect(() => completeCard(BOARD, 'nope', '2026-01-01')).toThrow(/niet gevonden/)
  })

  it('keeps multi-line cards together', () => {
    const multi = BOARD.replace('- [ ] Tweede taak.', '- [ ] Tweede taak.\n  met een tweede regel')
    const card = parseKanban(multi).lanes[0].cards[1]
    expect(card.text).toBe('Tweede taak.\nmet een tweede regel')
    const out = completeCard(multi, card.id, '2026-02-02')
    expect(out).toContain('- [x] Tweede taak. (afgerond 2026-02-02)\n  met een tweede regel')
  })
})

const DECISIONS = `# Besluitenlog

| Datum | Bron | Besluit | Hoofdstuk | Impact |
|-------|------|---------|-----------|--------|
| 2026-01-02 | Eigenaar | Zie [[Notitie_A\\|alias]] | H2 / H4 | Groot |
| 2026-01-01 | Eigenaar | Eerste | H1 | Klein |
`

describe('tables', () => {
  it('splits cells with escaped pipes and wikilinks', () => {
    expect(splitRow('| a | [[x\\|y]] | c \\| d |')).toEqual(['a', '[[x|y]]', 'c | d'])
  })

  it('parses and inserts at the top', () => {
    const [t] = parseTables(DECISIONS)
    expect(t.headers).toEqual(['Datum', 'Bron', 'Besluit', 'Hoofdstuk', 'Impact'])
    expect(t.rows[0].cells[2]).toBe('Zie [[Notitie_A|alias]]')
    const out = insertRow(DECISIONS, { firstHeader: 'Datum' }, ['2026-02-01', 'Eigenaar', 'Nieuw | met pipe', 'H3', ''], 'top')
    const [t2] = parseTables(out)
    expect(t2.rows[0].cells).toEqual(['2026-02-01', 'Eigenaar', 'Nieuw | met pipe', 'H3', ''])
    expect(out.split('\n')[4]).toBe('| 2026-02-01 | Eigenaar | Nieuw \\| met pipe | H3 |  |')
  })

  it('updates one cell and keeps escaped wikilinks', () => {
    const [t] = parseTables(DECISIONS)
    const row = t.rows[0]
    const out = updateCell(DECISIONS, { firstHeader: 'Datum' }, { line: row.line, rowHash: row.hash, col: 4, value: 'Klein' })
    expect(out).toContain('| 2026-01-02 | Eigenaar | Zie [[Notitie_A\\|alias]] | H2 / H4 | Klein |')
  })

  it('refuses a stale row', () => {
    expect(() => updateCell(DECISIONS, { firstHeader: 'Datum' }, { line: 4, rowHash: 'stale', col: 1, value: 'x' })).toThrow()
  })
})

describe('tasks', () => {
  const NOTE = '# T\n\n## Stap 1\n\n- [ ] Meten\n- [x] Graven\n\n```\n- [ ] code\n```\n'
  it('finds tasks with headings, ignoring code', () => {
    const t = parseTasks(NOTE)
    expect(t).toHaveLength(2)
    expect(t[0].heading).toBe('Stap 1')
  })
  it('toggles by line and hash, even when lines shifted', () => {
    const [first] = parseTasks(NOTE)
    const shifted = 'extra\n' + NOTE
    const out = setTask(shifted, { line: first.line, taskId: first.hash, done: true })
    expect(out).toContain('- [x] Meten')
  })
})

describe('questions', () => {
  const CENTRAL = `# Vragen

## ✅ Bevestigd
- ✅ **V1:** klaar?

## Technische punten

### BELANGRIJK — ontwerp

**Badkamer**
21. Welke tegels?
22. **Statement zonder vraagteken**
23. **Beantwoord 2026-01-01:** al gedaan?

### Niet meer nodig
- ~~V9 (x)~~ — weg?

## Bronnen
- [[Notitie_A]]
`
  it('extracts open central questions with group and priority', () => {
    const qs = parseQuestions(CENTRAL, { central: true })
    const open = qs.filter((q) => !q.closed)
    expect(open.map((q) => q.number)).toEqual([21])
    expect(open[0].group).toBe('Badkamer')
    expect(open[0].priority).toBe('belangrijk')
  })

  it('reads question sections in ordinary notes', () => {
    const note = '# Memo\n\n## Vragen voor Eigenaar\n\n1. Keuze A of B.\n2. **Beantwoord 2026-01-01:** ja\n\n## Analyse\n\n3. Geen vraag?\n'
    const qs = parseQuestions(note)
    expect(qs.map((q) => [q.number, q.closed])).toEqual([
      [1, false],
      [2, true],
    ])
  })

  it('closes a question in place', () => {
    const [q] = parseQuestions(CENTRAL, { central: true })
    const out = closeQuestion(CENTRAL, { line: q.line, itemHash: q.hash, answer: 'Warme tegels', date: '2026-02-02' })
    expect(out).toContain('21. **Beantwoord 2026-02-02:** Warme tegels — zie [[Besluitenlog]]. Vraag was: Welke tegels?')
    expect(parseQuestions(out, { central: true }).filter((x) => !x.closed)).toHaveLength(0)
  })
})

describe('frontmatter', () => {
  it('splits and sets fields without touching the rest', () => {
    const text = '---\ntype: x\nreviewed: 2026-01-01\n---\n\n# Body\n'
    const { data, bodyLine } = splitFrontmatter(text)
    expect(data.reviewed).toBe('2026-01-01')
    expect(text.split('\n')[bodyLine]).toBe('')
    expect(setFrontmatterField(text, 'reviewed', '2026-05-05')).toBe('---\ntype: x\nreviewed: 2026-05-05\n---\n\n# Body\n')
    expect(setFrontmatterField('# Geen fm\n', 'reviewed', '2026-05-05')).toBe('---\nreviewed: 2026-05-05\n---\n\n# Geen fm\n')
  })
})

describe('render', () => {
  const files = [{ path: 'a/Notitie_A.md' }, { path: 'img/foto.jpg' }]
  const resolve = makeResolver(files, { projectDir: 'project', isArchived: () => false })
  it('renders wikilinks, embeds, callouts and checkboxes', () => {
    const text = '> [!important] Let op\n> Inhoud\n\n- [ ] Doen [[Notitie_A|A]]\n\n![[foto.jpg]]\n\n[[Ontbreekt]]\n'
    const { html, headings } = renderNote(text, { resolve, lines: text.split('\n') })
    expect(html).toContain('class="callout callout-important"')
    expect(html).toContain('<span class="callout-title">Let op</span>')
    expect(html).toContain('data-line="3"')
    expect(html).toContain('href="/n/a/Notitie_A.md"')
    expect(html).toContain('/api/file?path=img%2Ffoto.jpg&amp;w=1200')
    expect(html).toContain('wl-missing')
    expect(headings).toEqual([])
  })
  it('resolves project-prefixed paths', () => {
    expect(resolve('project/a/Notitie_A')?.path).toBe('a/Notitie_A.md')
    expect(resolve('Notitie_A')?.path).toBe('a/Notitie_A.md')
  })
})

describe('logbook', () => {
  it('creates a day and puts new entries on top', () => {
    let t = '# Bouwlogboek\n\n> Intro\n'
    t = insertLogEntry(t, { date: '2026-01-01', time: '10:00', body: ['Eerste'] })
    t = insertLogEntry(t, { date: '2026-01-01', time: '11:00', body: ['Tweede', '![[f.jpg]]'] })
    t = insertLogEntry(t, { date: '2026-01-02', time: '09:00', body: ['Nieuwe dag'] })
    expect(t).toBe('# Bouwlogboek\n\n> Intro\n\n## 2026-01-02\n\n- 09:00 — Nieuwe dag\n\n## 2026-01-01\n\n- 11:00 — Tweede\n  ![[f.jpg]]\n- 10:00 — Eerste\n')
  })
})

describe('domain helpers', () => {
  it('infers where a task can be done', () => {
    expect(inferContext('Waterschap bellen over melding')).toBe('regelen')
    expect(inferContext('Peilen inmeten bij de sloot')).toBe('doen')
    expect(inferContext('Hydraulisch schema uitwerken')).toBe('uitzoeken')
    expect(inferContext('Hydraulisch schema uitwerken #doen')).toBe('doen')
  })
  it('parses Dutch amounts', () => {
    expect(parseAmount('€ 1.234,50')).toBe(1234.5)
    expect(parseAmount('1.250')).toBe(1250)
    expect(parseAmount('89.95')).toBe(89.95)
    expect(parseAmount('')).toBe(null)
  })
})

describe('kanban since stamps', () => {
  it('stamps only matching cards, on their first line', async () => {
    const { stampSince } = await import('../server/md/kanban.js')
    const out = stampSince(BOARD, (card, lane) => lane.role === 'waiting', '2026-01-10')
    expect(out).toContain('- [ ] Gemeente bellen over vergunning (sinds 2026-01-05). (sinds 2026-01-10)')
    expect(out).toContain('- [ ] Tweede taak.\n')
  })
})

describe('fill-in fields and section photos', () => {
  it('renders placeholders as inputs that point at their line', async () => {
    const { hash } = await import('../server/util.js')
    const text = '# T\n\n## 1. Breedte\n\n- A: ____ cm, B: ____ cm\n\n[📷 Foto maken](buildpm:foto)\n'
    const lines = text.split('\n')
    const resolve = makeResolver([{ path: 'img/x.jpg' }], { projectDir: 'p', isArchived: () => false })
    const { html } = renderNote(text, { resolve, lines, sectionPhotos: { '1-breedte': [{ date: '2026-01-01', images: ['img/x.jpg'] }] } })
    expect(html).toContain(`data-line="4" data-line-hash="${hash(lines[4])}" data-idx="0"`)
    expect(html).toContain('data-idx="1"')
    expect(html).toContain('data-photo-heading="1. Breedte"')
    expect(html).toContain('img%2Fx.jpg')
  })
  it('gives number fields a numeric keyboard and text fields a normal one', () => {
    const resolve = makeResolver([], { projectDir: 'p', isArchived: () => false })
    const field = (line) => renderNote(`- ${line}\n`, { resolve, lines: [`- ${line}`] }).html.match(/<input[^>]*class="fill[^"]*"[^>]*>/g)
    expect(field('A: ____ cm')[0]).toContain('inputmode="decimal"')
    expect(field('P2: ____ (+0,5)')[0]).toContain('inputmode="decimal"')
    expect(field('Aantal: ____ · verwacht 6')[0]).toContain('inputmode="decimal"')
    expect(field('Maat: ____ × ____ cm').every((f) => f.includes('inputmode="decimal"'))).toBe(true)
    expect(field('Staat: ____')[0]).not.toContain('inputmode')
    expect(field('Aanwezig (ja/nee): ____')[0]).not.toContain('inputmode')
  })
  it('numbers fields across the cells of one table row', async () => {
    const { hash } = await import('../server/util.js')
    const text = '| Rij | A | B |\n|---|---|---|\n| 1 | P1: ____ (+0,5) | P2: ____ (+1) |\n'
    const lines = text.split('\n')
    const resolve = makeResolver([], { projectDir: 'p', isArchived: () => false })
    const { html } = renderNote(text, { resolve, lines })
    expect(html).toContain(`data-line="2" data-line-hash="${hash(lines[2])}" data-idx="0"`)
    expect(html).toContain(`data-line="2" data-line-hash="${hash(lines[2])}" data-idx="1"`)
  })
  it('writes a value into the n-th placeholder only', async () => {
    const { fillField } = await import('../server/actions.js')
    const { hash } = await import('../server/util.js')
    const text = 'x\n- A: ____ cm, B: ____ cm\n'
    const out = fillField(text, { line: 1, lineHash: hash('- A: ____ cm, B: ____ cm'), idx: 1, value: '655' })
    expect(out).toBe('x\n- A: ____ cm, B: **655** cm\n')
  })
})
