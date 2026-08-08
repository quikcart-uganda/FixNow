import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { BRAND_BLUE } from './brand-geometry.mjs'

const root = process.cwd()
const resources = join(root, 'resources')

await mkdir(resources, { recursive: true })

const render = async (source, target, size, { alpha = false } = {}) => {
  let pipeline = sharp(join(resources, source), { density: 384 }).resize(size, size, {
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  })

  if (!alpha) {
    pipeline = pipeline.flatten({ background: BRAND_BLUE })
  }

  await pipeline
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toFile(join(resources, target))
}

await Promise.all([
  render('icon-only.svg', 'icon-only.png', 1024),
  render('icon-foreground.svg', 'icon-foreground.png', 1024, { alpha: true }),
  render('icon-background.svg', 'icon-background.png', 1024),
  render('splash.svg', 'splash.png', 2732),
  render('splash-dark.svg', 'splash-dark.png', 2732),
])

console.log('Prepared lossless FixNow source PNGs from the canonical 58% wrench masters.')
