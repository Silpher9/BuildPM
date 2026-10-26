// Line icons drawn on a 20×20 grid, 1.6 stroke, like pencil marks on a sheet.
const PATHS = {
  home: 'M3 9.5 10 3.5l7 6V17H12.5v-5h-5v5H3z',
  board: 'M3 3.5h4v13H3zM8 3.5h4v9H8zM13 3.5h4v6h-4z',
  plus: 'M10 4v12M4 10h12',
  book: 'M4 3.5h8.5L16 7v9.5H4zM12.5 3.5V7H16M7 10h6M7 13h6',
  menu: 'M3.5 6h13M3.5 10h13M3.5 14h13',
  search: 'M8.5 3.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12.2 12.2 16.5 16.5',
  phone: 'M5 3.5h3l1.3 3.4-1.9 1.3a8 8 0 0 0 4.4 4.4l1.3-1.9 3.4 1.3v3a1.5 1.5 0 0 1-1.6 1.5A13 13 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z',
  hammer: 'M11.5 3.5 16.5 8.5 14.5 10.5 9.5 5.5zM10.8 8.2 4 15a1.4 1.4 0 0 0 2 2l6.8-6.8M7.5 4l3.5-.8',
  compass: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM12.8 7.2 11.2 11.2 7.2 12.8 8.8 8.8z',
  check: 'M4.5 10.5 8.2 14 15.5 6',
  right: 'M4 10h11M11 6l4 4-4 4',
  left: 'M16 10H5M9 6l-4 4 4 4',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  external: 'M11 4h5v5M16 4l-7 7M14 12v4H4V6h4',
  camera: 'M3 6.5h3l1.5-2h5L14 6.5h3V16H3zM10 8.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  x: 'M5 5l10 10M15 5 5 15',
  undo: 'M7 5 3.5 8.5 7 12M3.5 8.5H12a4.5 4.5 0 0 1 0 9H9',
  round: 'M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.3h-3.3',
  flag: 'M5 17V3.5M5 4h9l-2 3 2 3H5',
  clock: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM10 6v4l2.5 2',
  link: 'M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2L10 5.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2L10 14.2',
  layers: 'M10 3 17 6.5 10 10 3 6.5zM3 10l7 3.5 7-3.5M3 13.5 10 17l7-3.5',
  eye: 'M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10zM10 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
}

export default function Icon({ name, size = 20, className, title }) {
  const d = PATHS[name] || PATHS.more
  const dots = name === 'more'
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={dots ? 3 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  )
}

/** The brand mark: a barn gable with a box inside, marked in yellow. */
export function BrandMark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="9" y="15" width="14" height="12" fill="var(--mark)" />
      <path d="M3 28V14L16 4l13 10v14" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M9 27V16.5L16 11l7 5.5V27" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M1.5 28h29" stroke="var(--ink)" strokeWidth="2.4" />
    </svg>
  )
}
