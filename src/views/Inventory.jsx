import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import Icon from '../components/Icon.jsx'
import { PageHead, Gate, Dim, Empty, NoteHtml } from '../components/ui.jsx'
import { useApi, useAction, useLive } from '../lib/api.js'
import { euro, noteHref } from '../lib/format.js'

const STATES = [
  { key: 'aanwezig', label: 'Aanwezig' },
  { key: 'besteld', label: 'Besteld' },
  { key: 'nodig', label: 'Nog nodig' },
  { key: 'verwerkt', label: 'Verwerkt' },
]

export default function Inventory() {
  const state = useApi('/api/inventory')
  const { openCapture } = useLive()
  const act = useAction()
  const [filter, setFilter] = useState(null)

  const rows = useMemo(() => (state.data?.rows || []).filter((r) => !filter || r.status === filter), [state.data, filter])

  return (
    <>
      <PageHead
        no="10"
        title="Voorraad & kosten"
        crumbs={[{ label: 'Voorraad & kosten' }]}
        lede="Wat er al ligt, wat besteld is en wat nog moet komen. Bedragen tellen automatisch op."
      >
        <button className="btn mark" onClick={() => openCapture('buy')}>
          <Icon name="plus" size={16} /> Item of aankoop
        </button>
        {state.data && !state.data.missing && (
          <Link href={noteHref(state.data.path)} className="btn ghost">
            Notitie
          </Link>
        )}
      </PageHead>
      <Gate state={state}>
        {(d) =>
          d.missing ? (
            <Empty title="Nog geen voorraadlijst">Leg het eerste item vast; de notitie wordt dan in de vault aangemaakt.</Empty>
          ) : (
            <>
              <div className="money">
                <div className="panel">
                  <span className="label">Uitgegeven (vastgelegd)</span>
                  <b>{euro(d.totals.spent)}</b>
                </div>
                <div className="panel">
                  <span className="label">Raming nog nodig</span>
                  <b>{euro(d.totals.planned)}</b>
                </div>
                <div className="panel">
                  <span className="label">Items</span>
                  <b>{d.rows.length}</b>
                </div>
              </div>
              <Dim count={rows.length}>Items</Dim>
              <div className="seg scroll" role="group" aria-label="Status" style={{ marginBottom: 8 }}>
                <button aria-pressed={!filter} onClick={() => setFilter(null)}>
                  Alle <span className="n">{d.rows.length}</span>
                </button>
                {STATES.map((s) => (
                  <button key={s.key} aria-pressed={filter === s.key} onClick={() => setFilter(filter === s.key ? null : s.key)}>
                    {s.label} <span className="n">{d.totals.counts[s.key] || 0}</span>
                  </button>
                ))}
              </div>
              <div style={{ borderTop: '1.5px solid var(--ink)' }}>
                {rows.map((r) => (
                  <div key={r.id} className="inv-row">
                    <div style={{ minWidth: 0 }}>
                      <NoteHtml html={r.itemHtml} className="t" />
                      <div className="s">
                        {[r.amount, r.purpose && null].filter(Boolean).join(' · ')}
                        {r.purpose && (
                          <>
                            {r.amount ? ' · ' : ''}
                            <NoteHtml html={r.purposeHtml} inline className="" />
                          </>
                        )}
                      </div>
                      {r.source && <NoteHtml html={r.sourceHtml} className="label" />}
                    </div>
                    <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                      <select
                        value={r.status}
                        aria-label={`Status van ${r.item}`}
                        onChange={(e) => act('/api/inventory/status', { line: r.line, hash: r.id, status: e.target.value, col: d.statusCol })}
                      >
                        {STATES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {r.cost != null && <span className="cost">{euro(r.cost)}</span>}
                    </div>
                  </div>
                ))}
                {!rows.length && <Empty>Geen items met deze status.</Empty>}
              </div>
            </>
          )
        }
      </Gate>
    </>
  )
}
