import { useId, useState } from 'react'

// Section drawing ("doorsnede") of the barn with the new house inside and the
// yard works outside. Each part is inked according to its build phase:
//   klaar    solid ink with hatching
//   bezig    ink + yellow marker underlay, pulsing tag
//   volgende dashed outline ("uitgezet")
//   later    faint dotted pencil
// The existing barn is always drawn solid.

const W = 960
const H = 400

// Where each part's numbered tag sits (viewBox coordinates).
const TAGS = {
  permits: [82, 156],
  fence: [36, 242],
  services: [203, 244],
  septic: [808, 376],
  reedbed: [908, 236],
  floor: [480, 284],
  walls: [301, 228],
  roof: [392, 121],
  finish: [420, 236],
  living: [612, 196],
}

const STATE_LABEL = { klaar: 'Klaar', bezig: 'Bezig', volgende: 'Volgende', later: 'Later' }

function Part({ state, children }) {
  return <g className={`el st-${state}`}>{children}</g>
}

export default function BarnDrawing({ phases = [], onTag, compact = false }) {
  const uid = useId().replace(/:/g, '')
  const id = (n) => `${uid}-${n}`
  const url = (n) => `url(#${id(n)})`
  const [open, setOpen] = useState(null)

  const byArt = {}
  for (const p of phases) if (p.art && !byArt[p.art]) byArt[p.art] = p
  const st = (key) => byArt[key]?.state || 'later'

  return (
    <div className="hero">
      <div className="hero-sheet">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Doorsnede van de schuur met de nieuwe woning en de buitenwerken">
          <defs>
            <pattern id={id('earth')} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="var(--rule-strong)" strokeWidth="1" />
            </pattern>
            <pattern id={id('brick')} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink-2)" strokeWidth="1" />
            </pattern>
            <pattern id={id('insul')} width="8" height="14" patternUnits="userSpaceOnUse">
              <polyline points="0,0 4,14 8,0" fill="none" stroke="var(--ink-2)" strokeWidth=".8" />
            </pattern>
            <pattern id={id('insulv')} width="10" height="8" patternUnits="userSpaceOnUse">
              <polyline points="0,0 10,4 0,8" fill="none" stroke="var(--ink-2)" strokeWidth=".8" />
            </pattern>
            <pattern id={id('concrete')} width="14" height="12" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r=".9" fill="var(--ink-2)" />
              <circle cx="10" cy="8" r=".7" fill="var(--ink-2)" />
              <path d="M7 2.5l1.6 2.6H5.4z" fill="none" stroke="var(--ink-2)" strokeWidth=".6" />
            </pattern>
            <pattern id={id('dots')} width="4" height="4" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r=".65" fill="var(--ink-2)" />
            </pattern>
            <pattern id={id('gravel')} width="7" height="6" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.6" fill="none" stroke="var(--ink-2)" strokeWidth=".7" />
              <circle cx="5.5" cy="4.6" r="1.2" fill="none" stroke="var(--ink-2)" strokeWidth=".7" />
            </pattern>
            <pattern id={id('mesh')} width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 0H8M0 0V8" fill="none" stroke="var(--ink-2)" strokeWidth=".7" />
            </pattern>
            <pattern id={id('aac')} width="10" height="6" patternUnits="userSpaceOnUse">
              <path d="M0 0H10M5 0V3M0 3H10M0 3V6" fill="none" stroke="var(--ink-2)" strokeWidth=".6" />
            </pattern>
          </defs>

          <g className="dw">
            {/* ground */}
            <rect x="0" y="300" width={W} height="100" fill={url('earth')} stroke="none" />
            <line className="mid" x1="0" y1="300" x2={W} y2="300" />
            <text x="8" y="318">
              MAAIVELD
            </text>

            {/* existing barn: always solid */}
            <g>
              <polygon className="thick fill-paper" points="226,226 480,40 734,226 724,226 480,48 236,226" />
              <rect className="mid" x="250" y="212" width="12" height="88" fill={url('brick')} />
              <rect className="mid" x="698" y="212" width="12" height="88" fill={url('brick')} />
              <rect className="thin" x="262" y="292" width="436" height="8" fill={url('concrete')} />
              {/* existing solar panels on the roof */}
              <line x1="300" y1="166" x2="446" y2="59" stroke="var(--klei)" strokeWidth="5" strokeDasharray="20 3" />
              <text x="480" y="28" textAnchor="middle">
                SCHUUR · WEERKAP
              </text>
            </g>

            {/* 1 permits: site board */}
            <Part state={st('permits')}>
              <rect className="hl" x="32" y="162" width="100" height="62" />
              <line className="mid" x1="56" y1="218" x2="56" y2="300" />
              <line className="mid" x1="108" y1="218" x2="108" y2="300" />
              <rect className="mid fill-paper" x="40" y="170" width="84" height="48" />
              <rect className="fill-when-done" x="47" y="177" width="22" height="14" fill="var(--mark)" stroke="none" />
              <path className="thin" d="M74 180h42M74 186h34M47 198h70M47 204h56M47 210h62" />
            </Part>

            {/* 2 fence around the children's field */}
            <Part state={st('fence')}>
              <rect className="hl" x="14" y="248" width="152" height="56" />
              <rect className="thin fill-when-done" x="22" y="262" width="116" height="36" fill={url('mesh')} stroke="none" />
              {[22, 51, 80, 109, 138].map((x) => (
                <line key={x} className="mid" x1={x} y1="256" x2={x} y2="300" />
              ))}
              <path className="thin" d="M22 262H138M22 298H138" />
              <path className="mid" d="M140 264h20v34h-20zM140 298l20-34" />
            </Part>

            {/* heat pump outside + ventilation unit in the attic */}
            <Part state={st('services')}>
              <rect className="hl" x="172" y="250" width="60" height="54" />
              <rect className="hl" x="452" y="92" width="56" height="30" />
              <rect className="mid fill-paper" x="178" y="258" width="50" height="42" />
              <circle className="thin" cx="200" cy="279" r="13" />
              <path className="thin" d="M200 266v26M187 279h26M219 264v30M223 264v30" />
              <path className="thin" d="M228 286H296M228 291H296" />
              <rect className="mid fill-paper" x="460" y="98" width="40" height="18" />
              <path className="thin" d="M460 107H420L392 132M500 107H540L568 132" />
            </Part>

            {/* new floor: cellular-concrete kerb, stabilisé, PIR, concrete with heating */}
            <Part state={st('floor')}>
              <rect className="hl" x="288" y="254" width="384" height="46" />
              <rect className="thin fill-when-done" x="296" y="262" width="10" height="30" fill={url('aac')} />
              <rect className="thin fill-when-done" x="654" y="262" width="10" height="30" fill={url('aac')} />
              <rect className="thin fill-when-done" x="306" y="285" width="348" height="7" fill={url('dots')} />
              <rect className="thin fill-when-done" x="306" y="271" width="348" height="14" fill={url('insul')} />
              <rect className="mid fill-when-done" x="306" y="262" width="348" height="9" fill={url('concrete')} />
              {Array.from({ length: 28 }, (_, i) => (
                <circle key={i} className="thin" cx={314 + i * 12.2} cy="266.5" r="2" />
              ))}
            </Part>

            {/* timber-frame walls, upper floor and the closed central core */}
            <Part state={st('walls')}>
              <rect className="hl" x="290" y="124" width="380" height="140" />
              <rect className="mid fill-when-done" x="296" y="190" width="10" height="72" fill={url('insulv')} />
              <rect className="mid fill-when-done" x="654" y="190" width="10" height="72" fill={url('insulv')} />
              <rect className="mid fill-paper" x="306" y="184" width="132" height="6" />
              <rect className="mid fill-paper" x="522" y="184" width="132" height="6" />
              <rect className="mid" x="452" y="130" width="56" height="54" />
              <path className="thin" d="M472 184v-22h16v22" />
            </Part>

            {/* inner roof under the barn roof, and the polycarbonate roof light */}
            <Part state={st('roof')}>
              <polygon className="hl" points="290,194 480,52 670,194" />
              <polygon className="mid fill-when-done" points="296,190 480,58 664,190 654,190 480,67 306,190" fill={url('insul')} />
              <line x1="566" y1="103" x2="640" y2="157" stroke="var(--klei)" strokeWidth="6" strokeDasharray="3 3" opacity=".8" />
            </Part>

            {/* finishing: the double stair, kitchen island, beds upstairs */}
            <Part state={st('finish')}>
              <rect className="hl" x="322" y="164" width="320" height="98" />
              <path className="mid" d="M392 262h8v-12h8v-12h8v-12h8v-12h8v-12h8v-12" />
              <path className="mid" d="M568 262h-8v-12h-8v-12h-8v-12h-8v-12h-8v-12h-8v-12" />
              <rect className="mid fill-paper" x="330" y="240" width="50" height="22" />
              <line className="mid" x1="326" y1="240" x2="384" y2="240" />
              <rect className="thin" x="330" y="174" width="40" height="10" />
              <rect className="thin" x="590" y="174" width="40" height="10" />
            </Part>

            {/* living: a family and a lamp */}
            <Part state={st('living')}>
              <rect className="hl" x="568" y="196" width="84" height="66" />
              <circle className="fill-when-done" cx="352" cy="214" r="16" fill="var(--mark)" stroke="none" opacity=".45" />
              <path className="thin" d="M352 190v16M344 212l8-6 8 6z" />
              {[
                [616, 50],
                [636, 46],
                [598, 28],
                [586, 22],
              ].map(([x, h]) => (
                <g key={x} className="mid">
                  <circle cx={x} cy={262 - h + 4} r={h > 30 ? 4.5 : 3.5} />
                  <path
                    d={`M${x} ${262 - h + 9}v${h * 0.45}M${x} ${262 - h + 9 + h * 0.45}l-4 ${h * 0.4}M${x} ${262 - h + 9 + h * 0.45}l4 ${h * 0.4}M${x - 6} ${262 - h + 16}l6 -3 6 3`}
                  />
                </g>
              ))}
            </Part>

            {/* septic tank (buried) */}
            <Part state={st('septic')}>
              <rect className="hl" x="760" y="292" width="96" height="72" />
              <path className="thin" d="M698 296L742 306L770 324" />
              <rect className="mid fill-paper" x="770" y="316" width="76" height="40" rx="10" />
              <rect className="mid fill-paper" x="784" y="300" width="12" height="16" />
              <rect className="mid fill-paper" x="820" y="300" width="12" height="16" />
              <path className="thick" d="M781 300h18M817 300h18" />
              <path className="thin" d="M846 330L868 334" />
            </Part>

            {/* reed-bed filter */}
            <Part state={st('reedbed')}>
              <rect className="hl" x="858" y="250" width="98" height="100" />
              <path className="thin fill-when-done" d="M871 318L876 336H942L947 318z" fill={url('dots')} />
              <path className="thin fill-when-done" d="M876 336L878 344H940L942 336z" fill={url('gravel')} />
              <path className="mid" d="M866 300L878 344H940L952 300" />
              {[884, 896, 908, 920, 932].map((x, i) => (
                <g key={x} className="thin">
                  <path d={`M${x} 318C${x - 1} 296 ${x + 2} 282 ${x + (i % 2 ? 3 : -2)} ${262 + (i % 3) * 4}`} />
                  <ellipse cx={x + (i % 2 ? 3 : -2)} cy={258 + (i % 3) * 4} rx="1.8" ry="5" />
                  <path d={`M${x} 300c-6-4-9-10-10-16M${x} 306c6-3 9-8 11-14`} />
                </g>
              ))}
            </Part>
          </g>
        </svg>

        {phases
          .filter((p) => p.art && TAGS[p.art] && byArt[p.art] === p)
          .map((p) => {
            const [x, y] = TAGS[p.art]
            const isOpen = open === p.art
            return (
              <button
                key={p.art}
                type="button"
                className={`tag ${p.state}`}
                style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
                aria-label={`${p.n}. ${p.name}: ${STATE_LABEL[p.state]}`}
                aria-expanded={isOpen}
                onMouseEnter={() => setOpen(p.art)}
                onMouseLeave={() => setOpen((o) => (o === p.art ? null : o))}
                onFocus={() => setOpen(p.art)}
                onBlur={() => setOpen(null)}
                onClick={() => (onTag ? onTag(p) : setOpen(isOpen ? null : p.art))}
              >
                {p.n}
              </button>
            )
          })}
        {open && byArt[open] && (
          <div className="tag-tip" style={{ left: `${(TAGS[open][0] / W) * 100}%`, top: `${(TAGS[open][1] / H) * 100}%` }}>
            <small>{STATE_LABEL[byArt[open].state]}</small>
            {byArt[open].name}
          </div>
        )}
      </div>
      {!compact && (
        <div className="hero-caption">
          <span className="label">Doorsnede A–A · schematisch</span>
          <span className="label">
            <Legend />
          </span>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <span style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
      <span>■ klaar</span>
      <span style={{ color: 'var(--ink)' }}>
        <span style={{ background: 'var(--mark)', padding: '0 4px' }}>▤</span> bezig
      </span>
      <span>┄ volgende</span>
      <span>⋯ later</span>
    </span>
  )
}
