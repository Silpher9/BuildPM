#!/usr/bin/env node
// Place one photo series in the reference model (see reference.mjs) and describe the result.
//
//   node tools/fotoserie/register.mjs --reference <ref dir> --out <series dir> [--render <scene.blend>]
//
// <series dir>/job.json lists the photos: { "images": ["/abs/photo1.jpg", ...] }.
// Writes status.json (running/done/failed), result.json, plan.jpg, points.ply and, with
// --render, vergelijk-N.jpg: each photo next to the reference scene seen from the same spot.
// The heavy work folder is removed afterwards.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { cameraInWorld, colmap, matFromQuat, readTextModel, transpose, writeJson } from './lib.mjs'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null))
    .filter(Boolean),
)
const out = path.resolve(args.out)
const ref = path.resolve(args.reference)
const work = path.join(out, 'work')
const log = path.join(out, 'colmap.log')
const status = (s) => writeJson(path.join(out, 'status.json'), { ...s, at: new Date().toISOString() })
const t0 = Date.now()
const step = (s) => {
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`)
  status({ state: 'running', step: s })
}

try {
  await run()
} catch (err) {
  console.error(err)
  status({ state: 'failed', error: friendly(err) })
  process.exitCode = 1
} finally {
  if (!process.env.KEEP_WORK) fs.rmSync(work, { recursive: true, force: true })
}

function friendly(err) {
  const m = String(err.message || err)
  if (/docker/i.test(m) && /not found|ENOENT|permission denied/i.test(m)) return 'COLMAP (Docker) is niet beschikbaar op de server.'
  if (/No good initial|could not register|0 images/i.test(m)) return 'Geen enkele foto kon in de scan worden geplaatst.'
  return m.split('\n')[0].slice(0, 300)
}

async function run() {
  const job = JSON.parse(fs.readFileSync(path.join(out, 'job.json'), 'utf8'))
  const photos = job.images.filter((f) => fs.existsSync(f))
  if (photos.length < 2) throw new Error('Te weinig foto’s gevonden voor een serie')
  fs.rmSync(work, { recursive: true, force: true })
  fs.mkdirSync(work, { recursive: true })

  // ---------------------------------------------------------------- inputs
  step('foto’s klaarzetten')
  // COLMAP reads raw pixels (EXIF rotation is not applied), so photos are grouped by raw size:
  // one camera per group, shared by its photos.
  const list = []
  for (const [i, f] of photos.entries()) {
    const meta = await sharp(f, { failOn: 'none' }).metadata()
    const group = `${meta.width}x${meta.height}`
    const name = `new/${group}/${String(i + 1).padStart(2, '0')}${path.extname(f).toLowerCase() || '.jpg'}`
    fs.mkdirSync(path.join(work, 'images', path.dirname(name)), { recursive: true })
    fs.copyFileSync(f, path.join(work, 'images', name))
    list.push({ n: i + 1, file: f, name, orientation: meta.orientation || 1, width: meta.width, height: meta.height })
  }
  fs.mkdirSync(path.join(work, 'images', 'ref'), { recursive: true })
  fs.writeFileSync(path.join(work, 'new_list.txt'), list.map((p) => p.name).join('\n') + '\n')
  fs.copyFileSync(path.join(ref, 'database.db'), path.join(work, 'database.db'))
  const mounts = [
    [work, '/work'],
    [ref, '/ref', 'ro'],
  ]

  step('kenmerken zoeken')
  await colmap(
    [
      'feature_extractor',
      '--database_path=/work/database.db',
      '--image_path=/work/images',
      '--image_list_path=/work/new_list.txt',
      '--ImageReader.single_camera_per_folder=1',
      '--ImageReader.camera_model=SIMPLE_RADIAL',
      '--FeatureExtraction.max_image_size=2400',
    ],
    { mounts, log },
  )

  // Every new photo against every reference photo, and against each other.
  const refModel = readTextModel(path.join(ref, 'sparse_txt'))
  const refNames = [...refModel.images.values()].map((im) => im.name)
  const pairs = []
  for (const [i, p] of list.entries()) {
    for (const r of refNames) pairs.push(`${p.name} ${r}`)
    for (const q of list.slice(i + 1)) pairs.push(`${p.name} ${q.name}`)
  }
  fs.writeFileSync(path.join(work, 'pairs.txt'), pairs.join('\n') + '\n')
  step(`vergelijken met ${refNames.length} foto’s van de scan`)
  await colmap(['matches_importer', '--database_path=/work/database.db', '--match_list_path=/work/pairs.txt', '--match_type=pairs'], { mounts, log })

  step('plaatsen in de scan')
  for (const d of ['reg', 'tri', 'tri_txt']) fs.mkdirSync(path.join(work, d), { recursive: true })
  await colmap(['image_registrator', '--database_path=/work/database.db', '--input_path=/ref/sparse', '--output_path=/work/reg'], { mounts, log })
  step('nieuwe punten driehoeksmeten')
  await colmap(
    [
      'point_triangulator',
      '--database_path=/work/database.db',
      '--image_path=/work/images',
      '--input_path=/work/reg',
      '--output_path=/work/tri',
      '--clear_points=0',
      '--refine_intrinsics=0',
    ],
    { mounts, log },
  )
  await colmap(['model_converter', '--input_path=/work/tri', '--output_path=/work/tri_txt', '--output_type=TXT'], { mounts, log, gpu: false })

  // ---------------------------------------------------------------- results
  step('resultaat beschrijven')
  const model = readTextModel(path.join(work, 'tri_txt'))
  const byName = new Map([...model.images.values()].map((im) => [im.name, im]))
  const sql = new DatabaseSync(path.join(work, 'database.db'))
  const dbIds = new Map(
    sql
      .prepare("SELECT image_id, name FROM images WHERE name LIKE 'new/%'")
      .all()
      .map((r) => [r.name, r.image_id]),
  )
  sql.close()
  const newIds = new Set(list.map((p) => byName.get(p.name)?.id).filter(Boolean))
  const cm = (v) => v.map((x) => Math.round(x * 1000) / 10)
  const images = list.map((p) => {
    const im = byName.get(p.name)
    if (!im) return { n: p.n, file: path.basename(p.file), registered: false, id: dbIds.get(p.name) || null }
    const cam = model.cameras.get(im.camera)
    const w = cameraInWorld(im.q, im.t)
    return {
      n: p.n,
      file: path.basename(p.file),
      registered: true,
      center_cm: cm(w.center),
      forward: w.forward.map((v) => Math.round(v * 1000) / 1000),
      points: im.points,
      camera: { model: cam.model, width: cam.width, height: cam.height, params: cam.params },
      q: im.q,
      t: im.t,
      orientation: p.orientation,
    }
  })
  const reg = images.filter((i) => i.registered)
  const steps = reg.slice(1).map((im, i) => Math.round(Math.hypot(...im.center_cm.map((v, k) => v - reg[i].center_cm[k]))))
  const seen = model.points.filter((pt) => pt.track.some((id) => newIds.has(id)))
  const own = seen.filter((pt) => pt.track.filter((id) => newIds.has(id)).length >= 2)
  const err = seen.length ? seen.reduce((s, p) => s + p.error, 0) / seen.length : null

  const advice = []
  for (const im of images)
    if (!im.registered) advice.push(`Foto ${im.n} kon ik niet plaatsen: te weinig herkenbaar (te dichtbij, onscherp of iets wat in 2023 nog niet bestond).`)
  steps.forEach((d, i) => {
    if (d < 15) advice.push(`Foto ${reg[i].n} en ${reg[i + 1].n} zijn bijna vanaf dezelfde plek genomen (${d} cm): stap verder opzij, 30–50 cm.`)
  })
  if (reg.length < 3) advice.push('Voor diepte zijn minstens drie geplaatste foto’s nodig.')

  writePly(
    path.join(out, 'points.ply'),
    own.map((p) => ({ xyz: cm(p.xyz), rgb: p.rgb })),
  )
  await planImage(path.join(out, 'plan.jpg'), refModel, images, own)

  let compare = []
  if (args.render && fs.existsSync(args.render) && reg.length) {
    step('scan vanaf dezelfde plek renderen')
    try {
      compare = await renderCompare(reg, list)
    } catch (e) {
      console.error('render overgeslagen:', e.message)
    }
  }

  const fmt = (n) => n.toLocaleString('nl-NL')
  const text =
    `${reg.length} van ${images.length} foto’s geplaatst in de scan.` +
    (steps.length ? ` Stap tussen de foto’s ${Math.min(...steps)}–${Math.max(...steps)} cm.` : '') +
    (own.length ? ` ${fmt(own.length)} punten in 3D uit deze serie.` : '')
  writeJson(path.join(out, 'result.json'), {
    created: new Date().toISOString(),
    frame: 'model frame, cm',
    registered: reg.length,
    total: images.length,
    steps_cm: steps,
    points_seen: seen.length,
    points_series: own.length,
    reproj_px: err && Math.round(err * 100) / 100,
    images,
    advice,
    plan: 'plan.jpg',
    compare,
  })
  status({ state: 'done', summary: { registered: reg.length, total: images.length, text } })
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] klaar: ${text}`)
}

// ---------------------------------------------------------------- outputs

function writePly(file, pts) {
  const head = `ply\nformat ascii 1.0\ncomment model frame, cm\nelement vertex ${pts.length}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`
  fs.writeFileSync(file, head + pts.map((p) => `${p.xyz.join(' ')} ${p.rgb.join(' ')}`).join('\n') + '\n')
}

/** Top view: the scan's walls in grey, this series' points in yellow, numbered camera positions. */
async function planImage(file, refModel, images, own) {
  const wall = refModel.points.filter((p) => p.xyz[2] > 0.2 && p.xyz[2] < 2.5 && p.track.length >= 3)
  const reg = images.filter((i) => i.registered)
  const all = wall.map((p) => [p.xyz[0] * 100, p.xyz[1] * 100])
  const pick = (a, q) => [...a].sort((x, y) => x - y)[Math.floor(q * (a.length - 1))]
  // bounding box of the q..1-q quantiles, padded
  const box = (pts, pad, q) => {
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return { x0: pick(xs, q) - pad, x1: pick(xs, 1 - q) + pad, y0: pick(ys, q) - pad, y1: pick(ys, 1 - q) + pad }
  }
  const full = box(all, 40, 0.005)
  // The detail always holds every camera, plus the bulk of this series' points.
  const cx = reg.map((i) => i.center_cm[0])
  const cy = reg.map((i) => i.center_cm[1])
  const pb =
    own.length > 20
      ? box(
          own.map((p) => [p.xyz[0] * 100, p.xyz[1] * 100]),
          40,
          0.15,
        )
      : null
  const fb = reg.length
    ? {
        x0: Math.min(...cx, pb?.x0 ?? Infinity) - 80,
        x1: Math.max(...cx, pb?.x1 ?? -Infinity) + 80,
        y0: Math.min(...cy, pb?.y0 ?? Infinity) - 80,
        y1: Math.max(...cy, pb?.y1 ?? -Infinity) + 80,
      }
    : full
  // square, between 4 and 10 m wide
  const zx = (fb.x0 + fb.x1) / 2
  const zy = (fb.y0 + fb.y1) / 2
  const half = Math.min(500, Math.max(200, (fb.x1 - fb.x0) / 2, (fb.y1 - fb.y0) / 2))
  const zoom = { x0: zx - half, x1: zx + half, y0: zy - half, y1: zy + half }
  const W = 1400
  const H = 900
  const panel = (b, ox, oy, pw, ph) => {
    const s = Math.min(pw / (b.x1 - b.x0), ph / (b.y1 - b.y0))
    // front gable (largest y) at the top
    return { s, X: (x) => ox + (x - b.x0) * s + (pw - (b.x1 - b.x0) * s) / 2, Y: (y) => oy + (b.y1 - y) * s + (ph - (b.y1 - b.y0) * s) / 2 }
  }
  const L = panel(full, 30, 70, 380, 800)
  const Z = panel(zoom, 450, 70, 920, 800)
  const dots = (P, pts, r, cls, max = 40000) => {
    const stepN = Math.max(1, Math.ceil(pts.length / max))
    let s = ''
    for (let i = 0; i < pts.length; i += stepN) s += `<circle cx="${P.X(pts[i][0]).toFixed(1)}" cy="${P.Y(pts[i][1]).toFixed(1)}" r="${r}" class="${cls}"/>`
    return s
  }
  const inZoom = all.filter((p) => p[0] > zoom.x0 && p[0] < zoom.x1 && p[1] > zoom.y0 && p[1] < zoom.y1)
  const ownXY = own.map((p) => [p.xyz[0] * 100, p.xyz[1] * 100])
  // view directions first, so no ray crosses a numbered marker
  const cams = (P, big) =>
    (big
      ? reg
          .map((im) => {
            const [x, y] = im.center_cm
            const f = Math.hypot(im.forward[0], im.forward[1]) || 1
            return `<line x1="${P.X(x)}" y1="${P.Y(y)}" x2="${P.X(x + (im.forward[0] / f) * 90)}" y2="${P.Y(y + (im.forward[1] / f) * 90)}" class="ray"/>`
          })
          .join('')
      : '') +
    reg
      .map(
        (im) =>
          `<circle cx="${P.X(im.center_cm[0])}" cy="${P.Y(im.center_cm[1])}" r="${big ? 15 : 6}" class="cam"/>` +
          (big ? `<text x="${P.X(im.center_cm[0])}" y="${P.Y(im.center_cm[1]) + 6}" class="camn">${im.n}</text>` : ''),
      )
      .join('')
  const scaleBar = (P, x, y, cmLen, label) =>
    `<line x1="${x}" y1="${y}" x2="${x + cmLen * P.s}" y2="${y}" class="bar"/><text x="${x}" y="${y - 8}" class="lbl">${label}</text>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .bg{fill:#e9e7e1}.w{fill:#5d5a54;opacity:.35}.own{fill:#e0a800}.cam{fill:#b2432a;stroke:#fff;stroke-width:2}
    .ray{stroke:#b2432a;stroke-width:4}.camn{fill:#fff;font:700 17px DejaVu Sans;text-anchor:middle}
    .lbl{fill:#1d1c1a;font:600 15px DejaVu Sans Mono}.ttl{fill:#1d1c1a;font:700 22px DejaVu Sans}.bar{stroke:#1d1c1a;stroke-width:4}
    .frame{fill:none;stroke:#b2432a;stroke-width:2;stroke-dasharray:6 5}
  </style>
  <rect width="100%" height="100%" class="bg"/>
  <text x="30" y="40" class="ttl">Fotoserie in de scan</text>
  <text x="450" y="40" class="lbl">boven = kopgevel met de deur · grijs = muren uit de scan 2023 · geel = punten uit deze serie</text>
  ${dots(L, all, 0.8, 'w', 25000)}
  <text x="30" y="62" class="lbl">overzicht</text><text x="450" y="62" class="lbl">detail</text>
  <clipPath id="lp"><rect x="30" y="70" width="380" height="800"/></clipPath>
  <rect x="${L.X(zoom.x0)}" y="${L.Y(zoom.y1)}" width="${(zoom.x1 - zoom.x0) * L.s}" height="${(zoom.y1 - zoom.y0) * L.s}" class="frame" clip-path="url(#lp)"/>
  ${cams(L, false)}
  ${dots(Z, inZoom, 1.6, 'w', 30000)}
  ${dots(Z, ownXY, 2.2, 'own', 20000)}
  ${cams(Z, true)}
  ${scaleBar(Z, 470, 860, 100, '1 m')}
</svg>`
  await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(file)
}

/** Render the reference scene from each placed camera (Blender) and set it next to the photo. */
async function renderCompare(reg, list) {
  const cams = reg.map((im) => {
    const c2w = transpose(matFromQuat(im.q))
    return { n: im.n, center_cm: im.center_cm, c2w, camera: im.camera }
  })
  const camsFile = path.join(work, 'render_cams.json')
  fs.writeFileSync(camsFile, JSON.stringify(cams))
  const script = path.join(import.meta.dirname, 'render_views.py')
  await new Promise((resolve, reject) => {
    const p = spawn(process.env.BLENDER || 'blender', ['-b', args.render, '--python', script, '--', camsFile, path.join(work, 'renders')], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let tail = ''
    p.stdout.on('data', (d) => (tail = (tail + d).slice(-2000)))
    p.stderr.on('data', (d) => (tail = (tail + d).slice(-2000)))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Blender faalde: ' + tail.slice(-400)))))
  })
  const ROT = { 3: 180, 6: 90, 8: 270 }
  const names = []
  for (const im of reg) {
    const src = list.find((p) => p.n === im.n)
    const r = path.join(work, 'renders', `${im.n}.png`)
    if (!fs.existsSync(r)) continue
    const h = 700
    const photo = await sharp(src.file, { failOn: 'none' }).rotate().resize({ height: h }).toBuffer({ resolveWithObject: true })
    const render = await sharp(r)
      .rotate(ROT[src.orientation] || 0)
      .resize({ height: h })
      .toBuffer({ resolveWithObject: true })
    const gap = 12
    const label = (x, t) =>
      `<text x="${x + 14}" y="${h - 16}" style="fill:#fff;font:700 24px DejaVu Sans;paint-order:stroke;stroke:#000;stroke-width:4">${t}</text>`
    const W = photo.info.width + render.info.width + gap
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}">${label(0, `Foto ${im.n}`)}${label(photo.info.width + gap, 'Scan 2023, zelfde plek')}</svg>`
    const name = `vergelijk-${im.n}.jpg`
    await sharp({ create: { width: W, height: h, channels: 3, background: '#1d1c1a' } })
      .composite([
        { input: photo.data, left: 0, top: 0 },
        { input: render.data, left: photo.info.width + gap, top: 0 },
        { input: Buffer.from(svg), left: 0, top: 0 },
      ])
      .jpeg({ quality: 84 })
      .toFile(path.join(out, name))
    names.push(name)
  }
  return names
}
