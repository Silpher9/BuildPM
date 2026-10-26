// Shared helpers for placing photo series in a reference 3D model with COLMAP (Docker).
// Units inside COLMAP are metres in the project's model frame; results are reported in cm.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

export const IMAGE = process.env.COLMAP_IMAGE || 'colmap/colmap:latest'

/** Run one COLMAP command in Docker. mounts: [[hostPath, containerPath, 'ro'?]]. */
export function colmap(args, { mounts = [], log, gpu = true } = {}) {
  const user = `${process.getuid()}:${process.getgid()}`
  const vols = mounts.flatMap(([h, c, mode]) => ['-v', `${h}:${c}${mode ? ':' + mode : ''}`])
  const argv = ['run', '--rm', ...(gpu ? ['--gpus', 'all'] : []), '--user', user, '-e', 'HOME=/tmp', ...vols, IMAGE, 'colmap', ...args]
  return new Promise((resolve, reject) => {
    const p = spawn('docker', argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const out = (d) => {
      tail = (tail + d).slice(-4000)
      if (log) fs.appendFileSync(log, d)
    }
    p.stdout.on('data', out)
    p.stderr.on('data', out)
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(tail) : reject(new Error(`colmap ${args[0]} faalde (${code}):\n${tail.slice(-1500)}`))))
  })
}

// ---------------------------------------------------------------- math

export const matMul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)))
export const matVec = (A, v) => A.map((r) => r.reduce((s, x, k) => s + x * v[k], 0))
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]))
export const det3 = (m) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])

/** Rotation matrix -> quaternion [w, x, y, z] (Hamilton, as COLMAP/Eigen). */
export function quatFromMat(R) {
  const t = R[0][0] + R[1][1] + R[2][2]
  let w, x, y, z
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2
    w = s / 4
    x = (R[2][1] - R[1][2]) / s
    y = (R[0][2] - R[2][0]) / s
    z = (R[1][0] - R[0][1]) / s
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2
    w = (R[2][1] - R[1][2]) / s
    x = s / 4
    y = (R[0][1] + R[1][0]) / s
    z = (R[0][2] + R[2][0]) / s
  } else if (R[1][1] > R[2][2]) {
    const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2
    w = (R[0][2] - R[2][0]) / s
    x = (R[0][1] + R[1][0]) / s
    y = s / 4
    z = (R[1][2] + R[2][1]) / s
  } else {
    const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2
    w = (R[1][0] - R[0][1]) / s
    x = (R[0][2] + R[2][0]) / s
    y = (R[1][2] + R[2][1]) / s
    z = s / 4
  }
  const n = Math.hypot(w, x, y, z) * (w < 0 ? -1 : 1)
  return [w / n, x / n, y / n, z / n]
}

export function matFromQuat([w, x, y, z]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ]
}

/** COLMAP cam_from_world (q, t) -> camera centre and viewing direction in world. */
export function cameraInWorld(q, t) {
  const R = matFromQuat(q)
  const Rt = transpose(R)
  const c = matVec(Rt, t).map((v) => -v)
  return { center: c, forward: matVec(Rt, [0, 0, 1]), down: matVec(Rt, [0, 1, 0]) }
}

// ---------------------------------------------------------------- COLMAP text models

/** Parse a COLMAP TXT model folder (cameras, images, points3D). */
export function readTextModel(dir) {
  const lines = (f) =>
    fs
      .readFileSync(path.join(dir, f), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
  const cameras = new Map()
  for (const l of lines('cameras.txt')) {
    const [id, model, w, h, ...p] = l.trim().split(/\s+/)
    cameras.set(Number(id), { id: Number(id), model, width: Number(w), height: Number(h), params: p.map(Number) })
  }
  const images = new Map()
  const il = lines('images.txt')
  for (let i = 0; i < il.length; i += 2) {
    const [id, qw, qx, qy, qz, tx, ty, tz, cam, ...name] = il[i].trim().split(/\s+/)
    const obs = (il[i + 1] || '').trim().split(/\s+/).filter(Boolean).map(Number)
    let seen = 0
    for (let k = 2; k < obs.length; k += 3) if (obs[k] !== -1) seen++
    images.set(Number(id), {
      id: Number(id),
      q: [qw, qx, qy, qz].map(Number),
      t: [tx, ty, tz].map(Number),
      camera: Number(cam),
      name: name.join(' '),
      points: seen,
    })
  }
  const points = []
  for (const l of lines('points3D.txt')) {
    const p = l.trim().split(/\s+/).map(Number)
    const track = []
    for (let k = 8; k < p.length; k += 2) track.push(p[k])
    points.push({ id: p[0], xyz: [p[1], p[2], p[3]], rgb: [p[4], p[5], p[6]], error: p[7], track })
  }
  return { cameras, images, points }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1))
  fs.renameSync(file + '.tmp', file)
}
