// Serving vault images: resized WebP copies cached outside the vault.

import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { hash } from './util.js'

let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  console.warn('[images] sharp niet beschikbaar; originele afbeeldingen worden geserveerd')
}

const RESIZABLE = /\.(jpe?g|png|webp|avif|gif)$/i
const WIDTHS = [240, 480, 800, 1200, 1800]

export const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

/** Returns { file, type } for the original or a cached resized copy. */
export async function imageFile(absPath, width) {
  const ext = path.extname(absPath).slice(1).toLowerCase()
  const original = { file: absPath, type: MIME[ext] || 'application/octet-stream' }
  if (!sharp || !width || !RESIZABLE.test(absPath)) return original
  const w = WIDTHS.find((x) => x >= Number(width)) || WIDTHS[WIDTHS.length - 1]
  const stat = fs.statSync(absPath)
  const dir = path.join(config.dataDir, 'thumbs')
  const out = path.join(dir, `${hash(absPath + stat.mtimeMs, 16)}-${w}.webp`)
  if (!fs.existsSync(out)) {
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${out}.${process.pid}.tmp`
    await sharp(absPath).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(tmp)
    fs.renameSync(tmp, out)
  }
  return { file: out, type: 'image/webp' }
}

/** Normalise an uploaded photo: honour EXIF rotation, cap the size, re-encode as JPEG. */
export async function prepareUpload(buffer) {
  if (!sharp) return buffer
  return sharp(buffer).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
}
