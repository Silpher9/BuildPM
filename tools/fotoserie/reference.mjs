#!/usr/bin/env node
// Build the reference model that new photo series are placed in.
//
// Input is an existing, aligned Metashape project: its camera calibration and poses are taken
// as they are (no new structure-from-motion), moved into the project's model frame with a
// fixed 4x4 transform, and COLMAP only triangulates points for them. The result is a sparse
// model in metres, in the same frame as the design model.
//
//   node tools/fotoserie/reference.mjs --doc chunk.zip --images <photo dir> \
//     --transform transform.json --out <dir> [--holdout 4x3]
//
// transform.json: { "chunkToModelCm": [[...4], [...4], [...4], [0, 0, 0, 1]] }
// --holdout 4x3 keeps three runs of four consecutive photos out, as a test set with known poses.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { colmap, det3, matVec, matMul, quatFromMat, transpose, writeJson } from './lib.mjs'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null))
    .filter(Boolean),
)
for (const k of ['doc', 'images', 'transform', 'out']) if (!args[k]) throw new Error(`--${k} ontbreekt`)
const out = path.resolve(args.out)
fs.mkdirSync(out, { recursive: true })
const log = path.join(out, 'reference.log')
const t0 = Date.now()
const step = (s) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`)

// ---------------------------------------------------------------- Metashape chunk

const xml = args.doc.endsWith('.zip')
  ? execFileSync('unzip', ['-p', args.doc, 'doc.xml'], { maxBuffer: 1 << 28 }).toString()
  : fs.readFileSync(args.doc, 'utf8')
const num = (tag, s) => Number(s.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1] ?? 0)
const calib = xml.match(/<calibration type="frame" class="adjusted">([\s\S]*?)<\/calibration>/)?.[1]
if (!calib) throw new Error('Geen aangepaste kalibratie in het Metashape-project')
const [, W, H] = calib.match(/<resolution width="(\d+)" height="(\d+)"/).map(Number)
const K = {
  f: num('f', calib),
  cx: num('cx', calib),
  cy: num('cy', calib),
  b1: num('b1', calib),
  k1: num('k1', calib),
  k2: num('k2', calib),
  k3: num('k3', calib),
  p1: num('p1', calib),
  p2: num('p2', calib),
}
// Metashape -> OpenCV: fx = f + b1 (skew b2 is dropped), principal point relative to the centre,
// and the tangential terms swap places (Metashape P1 multiplies r^2 + 2x^2, OpenCV p2 does).
const params = [K.f + K.b1, K.f, W / 2 + K.cx, H / 2 + K.cy, K.k1, K.k2, K.p2, K.p1, K.k3, 0, 0, 0]

const cams = [...xml.matchAll(/<camera id="(\d+)"[^>]*label="([^"]+)"[^>]*>([\s\S]*?)<\/camera>/g)]
  .map(([, id, label, body]) => ({
    id: Number(id),
    label,
    T: body
      .match(/<transform>([^<]+)<\/transform>/)?.[1]
      .trim()
      .split(/\s+/)
      .map(Number),
  }))
  .filter((c) => c.T?.length === 16)
  .sort((a, b) => a.label.localeCompare(b.label))

const MW = JSON.parse(fs.readFileSync(args.transform, 'utf8')).chunkToModelCm
const M3 = MW.slice(0, 3).map((r) => r.slice(0, 3))
const scale = Math.cbrt(det3(M3))
const Ralign = M3.map((r) => r.map((v) => v / scale))

const ext =
  fs
    .readdirSync(args.images)
    .find((f) => /\.jpe?g$/i.test(f))
    ?.match(/\.\w+$/)[0] || '.jpg'
const posed = cams.map((c) => {
  const Rc = [c.T.slice(0, 3), c.T.slice(4, 7), c.T.slice(8, 11)]
  const Cc = [c.T[3], c.T[7], c.T[11]]
  const C = matVec(M3, Cc).map((v, i) => (v + MW[i][3]) / 100) // metres, model frame
  const Rwc = transpose(matMul(Ralign, Rc)) // world -> camera
  const t = matVec(Rwc, C).map((v) => -v)
  return { name: `ref/${c.label}${ext}`, label: c.label, C, Rwc, q: quatFromMat(Rwc), t, forward: Rwc[2] }
})

let holdout = []
if (args.holdout) {
  const [len, runs] = args.holdout.split('x').map(Number)
  for (let r = 0; r < runs; r++) {
    const start = Math.round(((r + 0.5) / runs) * posed.length) - Math.floor(len / 2)
    holdout.push(posed.slice(start, start + len).map((p) => p.name))
  }
}
const held = new Set(holdout.flat())
const ref = posed.filter((p) => !held.has(p.name))
step(`${cams.length} uitgelijnde foto's, ${ref.length} als referentie, ${held.size} apart als test; schaal ${scale.toFixed(3)} cm per eenheid`)
writeJson(path.join(out, 'holdout.json'), {
  runs: holdout,
  truth: Object.fromEntries(posed.filter((p) => held.has(p.name)).map((p) => [p.name, { center_cm: p.C.map((v) => v * 100), forward: p.forward }])),
})

// ---------------------------------------------------------------- features, pairs, triangulation

const mounts = [
  [out, '/work'],
  [path.resolve(args.images), '/work/images/ref', 'ro'],
]
fs.mkdirSync(path.join(out, 'images', 'ref'), { recursive: true })
fs.writeFileSync(path.join(out, 'ref_list.txt'), ref.map((p) => p.name).join('\n') + '\n')
const db = path.join(out, 'database.db')
if (!fs.existsSync(db)) {
  step('kenmerken zoeken in de referentiefoto’s')
  await colmap(
    [
      'feature_extractor',
      '--database_path=/work/database.db',
      '--image_path=/work/images',
      '--image_list_path=/work/ref_list.txt',
      '--ImageReader.single_camera=1',
      '--ImageReader.camera_model=FULL_OPENCV',
      `--ImageReader.camera_params=${params.join(',')}`,
      '--FeatureExtraction.max_image_size=2400',
    ],
    { mounts, log },
  )
}

const sql = new DatabaseSync(db)
const ids = new Map(
  sql
    .prepare('SELECT image_id, name, camera_id FROM images')
    .all()
    .map((r) => [r.name, r]),
)
const camRow = sql.prepare('SELECT camera_id, width, height FROM cameras').all()[0]
sql.close()
if (camRow.width !== W || camRow.height !== H) throw new Error(`Fotomaat ${camRow.width}×${camRow.height} wijkt af van de kalibratie ${W}×${H} (EXIF-rotatie?)`)

// Pairs from the known poses: the nearest cameras that look roughly the same way, plus neighbours in time.
const pairs = new Set()
const key = (a, b) => (a < b ? `${a} ${b}` : `${b} ${a}`)
ref.forEach((p, i) => {
  const near = ref
    .map((o, j) => ({ j, d: Math.hypot(...o.C.map((v, k) => v - p.C[k])), dot: o.forward.reduce((s, v, k) => s + v * p.forward[k], 0) }))
    .filter((o) => o.j !== i && o.dot > 0.25)
    .sort((a, b) => a.d - b.d)
    .slice(0, 25)
  for (const o of near) pairs.add(key(p.name, ref[o.j].name))
  for (let d = 1; d <= 4; d++) if (ref[i + d]) pairs.add(key(p.name, ref[i + d].name))
})
fs.writeFileSync(path.join(out, 'pairs.txt'), [...pairs].join('\n') + '\n')
if (!fs.existsSync(path.join(out, 'matched'))) {
  step(`${pairs.size} fotoparen vergelijken`)
  await colmap(['matches_importer', '--database_path=/work/database.db', `--match_list_path=/work/pairs.txt`, '--match_type=pairs'], { mounts, log })
  fs.writeFileSync(path.join(out, 'matched'), new Date().toISOString())
}

// Known-pose model in COLMAP's text format; COLMAP adds trivial rigs and frames itself.
const known = path.join(out, 'known')
fs.mkdirSync(known, { recursive: true })
fs.writeFileSync(path.join(known, 'cameras.txt'), `${camRow.camera_id} FULL_OPENCV ${W} ${H} ${params.join(' ')}\n`)
fs.writeFileSync(
  path.join(known, 'images.txt'),
  ref
    .filter((p) => ids.has(p.name))
    .map((p) => `${ids.get(p.name).image_id} ${p.q.join(' ')} ${p.t.join(' ')} ${camRow.camera_id} ${p.name}\n\n`)
    .join(''),
)
fs.writeFileSync(path.join(known, 'points3D.txt'), '')

step('punten driehoeksmeten met de vaste camerastanden')
fs.mkdirSync(path.join(out, 'sparse'), { recursive: true })
await colmap(
  [
    'point_triangulator',
    '--database_path=/work/database.db',
    '--image_path=/work/images',
    '--input_path=/work/known',
    '--output_path=/work/sparse',
    '--refine_intrinsics=0',
    '--Mapper.ba_refine_focal_length=0',
    '--Mapper.ba_refine_extra_params=0',
  ],
  { mounts, log },
)
fs.mkdirSync(path.join(out, 'sparse_txt'), { recursive: true })
await colmap(['model_converter', '--input_path=/work/sparse', '--output_path=/work/sparse_txt', '--output_type=TXT'], { mounts, log, gpu: false })

writeJson(path.join(out, 'meta.json'), {
  built: new Date().toISOString(),
  frame: 'model frame, metres (×100 = cm in the design model)',
  scaleCmPerUnit: scale,
  images: ref.length,
  camera: { model: 'FULL_OPENCV', width: W, height: H, params },
})
step('klaar')
