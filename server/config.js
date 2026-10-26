import path from 'node:path'
import fs from 'node:fs'

// .env is optional; real environment variables win.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env'))
} catch {
  // no .env file
}

const repoRoot = path.resolve(import.meta.dirname, '..')
const env = process.env

const vaultRoot = path.resolve(repoRoot, env.VAULT_PATH || 'demo-vault')
const projectDir = env.PROJECT_DIR || 'project'

export const config = {
  repoRoot,
  vaultRoot,
  vaultName: path.basename(vaultRoot),
  projectDir,
  projectRoot: path.join(vaultRoot, projectDir),
  port: Number(env.PORT || 3080),
  host: env.HOST || '0.0.0.0',
  pin: env.BUILDPM_PIN || '',
  // Name used as the source when decisions are recorded from the dashboard.
  owner: env.OWNER_NAME || 'Eigenaar',
  dataDir: path.resolve(repoRoot, env.DATA_DIR || '.data'),
  timeZone: env.TZ_PROJECT || 'Europe/Amsterdam',
  // Script that regenerates the vault manifest after the dashboard wrote something.
  // Relative to the vault root; skipped when the file does not exist.
  manifestScript: env.MANIFEST_SCRIPT ?? '_system/scripts/build_manifest.py',
  // Folders inside the project that are history, never current status.
  archiveDirs: ['90_Archive', 'archief'],

  // Canonical notes, relative to the project folder.
  files: {
    kanban: '03_Projectmanagement/Kanban_Bord.md',
    decisions: '03_Projectmanagement/Besluitenlog.md',
    dashboard: '03_Projectmanagement/Dashboard.md',
    blockers: '03_Projectmanagement/Blokkades_En_Vragen.md',
    questions: env.QUESTIONS_FILE || '01_Research/99_Vragen.md',
    logbook: '03_Projectmanagement/Bouwlogboek.md',
    inventory: '03_Projectmanagement/Voorraad_En_Inkoop.md',
    overview: 'README.md',
    rooms: '02_Design/07_Ruimteboek_Per_Kamer_2026-03-13.md',
  },
  assetsDir: '03_Projectmanagement/assets',

  // How the six management chapters map onto the vault.
  chapters: {
    1: {
      notes: [
        'Besluitenlog',
        'Blokkades_En_Vragen',
        path.basename(env.QUESTIONS_FILE || '99_Vragen.md', '.md'),
        'Niet_Kritieke_Restvragen',
        '00_Projectsturing_Hoofdstukken_En_Sprints',
      ],
      folders: [],
      keywords: ['scope', 'projectkader', 'besluit'],
      decisionTags: ['Projectsturing'],
    },
    2: {
      notes: ['HSB_Wandvoetdetail_Vloer', 'Hoogteplan_Vloer'],
      folders: ['01_Research/A_Schil_Constructie'],
      keywords: [
        'schil',
        'wandvoet',
        'hoogteplan',
        'dak',
        'fundering',
        'luchtdicht',
        'spouw',
        'bodem',
        'zeeklei',
        'rc-doelen',
        'waterdicht',
        'bouwkundig',
        'constructie',
        'hsb',
        'isolatie',
        'dpm',
        'bevestigers',
        'koudebrug',
      ],
    },
    3: {
      notes: [],
      folders: ['02_Design'],
      keywords: ['leefruimte', 'plattegrond', 'trap', 'ruimtelijk', 'routing', 'zichtlijnen', 'keuken', 'ergonomie', 'toilet-indeling'],
    },
    4: {
      notes: ['Verdeler_Technische_Ruimte_Uitwerken', '17_Afvalwater_Septic_Tank'],
      folders: [
        '01_Research/B_Verwarming',
        '01_Research/C_Water_Sanitair',
        '01_Research/D_Ventilatie_Klimaat',
        '01_Research/E_Elektra_Energie',
        '01_Research/F_Domotica_Beveiliging',
      ],
      keywords: [
        'installatie',
        'warmtepomp',
        'monoblock',
        'wtw',
        'meterkast',
        'verdeler',
        'sanibroyeur',
        'elektra',
        'home assistant',
        'accu',
        'ampèrage',
        'hydraul',
        'load-balancing',
        'leiding',
        'afvoer',
        'ventilatie',
        'vloerverwarming',
        'badkamer',
        'domotica',
        'energie',
      ],
    },
    5: {
      notes: ['Helofytenfilter_Bouw'],
      folders: ['01_Research/G_Financieel_Regelgeving'],
      keywords: ['melding', 'ncg', 'quickscan', 'subsidie', 'lozing', 'waterschap', 'asbest', 'riolering', 'omgevingsloket', 'netbeheerder', 'buitenruimte'],
    },
    6: {
      notes: [
        'Werkpakket_Vloer_Storten',
        'Doorvoer_En_Mantelbuislijst_Vloer',
        'Helofytenfilter_Project',
        'Helofytenfilter_Locatie_Inmeten',
        'Omheining_Kinderveldje',
        'Voorraad_En_Inkoop',
        'Bouwlogboek',
      ],
      folders: [],
      keywords: ['werkpakket', 'inkoop', 'bestel', 'uitvoering', 'doorvoer', 'stort'],
    },
  },

  // Work packages: groups of execution notes shown together.
  workGroups: [
    { key: 'vloer', title: 'Vloer storten', lead: 'Werkpakket_Vloer_Storten', match: 'Vloer|Wandvoet|Hoogteplan|Doorvoer|Verdeler' },
    { key: 'helofytenfilter', title: 'Helofytenfilter', lead: 'Helofytenfilter_Project', match: 'Helofytenfilter' },
    { key: 'omheining', title: 'Omheining kinderveldje', lead: 'Omheining_Kinderveldje', match: 'Omheining' },
  ],
}

export function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true })
}
