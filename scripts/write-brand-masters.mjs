/**
 * Writes every FixNow master brand SVG from scripts/brand-geometry.mjs.
 * Run before prepare/finalize so no hand-edited proportions drift.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  brandedMarkSvg,
  iconBackgroundSvg,
  iconForegroundSvg,
  iconOnlySvg,
  splashSvg,
  wrenchLayout,
  BRAND_BLUE_DARK,
  BRAND_BLUE_DARKER,
  WRENCH_PATH,
} from './brand-geometry.mjs'

const root = process.cwd()
const resources = join(root, 'resources')
const publicRoot = join(root, 'public')
const brandDir = join(publicRoot, 'brand')

await Promise.all([mkdir(resources, { recursive: true }), mkdir(brandDir, { recursive: true })])

const mark = brandedMarkSvg(24, { labeled: true })
const favicon = brandedMarkSvg(24, { labeled: false })
const { pad, scale } = wrenchLayout(24)
const safariPinned = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path transform="translate(${pad} ${pad}) scale(${scale})" d="${WRENCH_PATH}"/>
</svg>
`

await Promise.all([
  writeFile(join(resources, 'icon-only.svg'), iconOnlySvg(1024)),
  writeFile(join(resources, 'icon-foreground.svg'), iconForegroundSvg(108)),
  writeFile(join(resources, 'icon-background.svg'), iconBackgroundSvg(108)),
  writeFile(join(resources, 'splash.svg'), splashSvg(2732, 532, BRAND_BLUE_DARK)),
  writeFile(join(resources, 'splash-dark.svg'), splashSvg(2732, 532, BRAND_BLUE_DARKER)),
  writeFile(join(brandDir, 'fixnow-mark.svg'), mark),
  writeFile(join(publicRoot, 'favicon.svg'), favicon),
  writeFile(join(publicRoot, 'safari-pinned-tab.svg'), safariPinned),
])

console.log('Wrote FixNow master brand SVGs (58% plate / 42% adaptive icon occupancy).')
