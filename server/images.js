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
    await sharp(absPath, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(tmp)
    fs.renameSync(tmp, out)
  }
  return { file: out, type: 'image/webp' }
}

/**
 * Keep the untouched upload next to the vault copy (same base name), so focal length and
 * full resolution stay available for 3D work. Never fails the upload: falls back to .data.
 */
export function keepOriginal(buffer, assetName, originalName) {
  const ext = (String(originalName).match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg')
  const name = assetName.replace(/\.[a-z0-9]+$/i, '') + '.' + ext
  for (const dir of [config.originalsDir, path.join(config.dataDir, 'originals')]) {
    try {
      const out = path.join(dir, assetName.slice(0, 7), name)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(`${out}.tmp`, buffer)
      fs.renameSync(`${out}.tmp`, out)
      return out
    } catch (err) {
      console.warn('[images] origineel niet bewaard in', dir, err.message)
    }
  }
  return null
}

/** Where keepOriginal put the original of a vault asset, or null. */
export function originalOf(assetPath) {
  const base = path.basename(assetPath).replace(/\.[a-z0-9]+$/i, '')
  for (const dir of [config.originalsDir, path.join(config.dataDir, 'originals')]) {
    const month = path.join(dir, base.slice(0, 7))
    try {
      const hit = fs.readdirSync(month).find((f) => f.replace(/\.[a-z0-9]+$/i, '') === base)
      if (hit) return path.join(month, hit)
    } catch {
      // no such folder
    }
  }
  return null
}

/** Normalise an uploaded photo: honour EXIF rotation, cap the size, re-encode as JPEG. */
export async function prepareUpload(buffer) {
  if (!sharp) return buffer
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}
