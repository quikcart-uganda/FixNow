import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { WRENCH_OCCUPANCY } from './brand-geometry.mjs'

const root = process.cwd()
const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

const metadata = async (path) => sharp(path).metadata()
const exists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const measureOpaqueBounds = async (path) => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4
      const alpha = data[i + 3]
      const isWhiteMark = alpha > 8 && data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240
      if (isWhiteMark) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX < 0) return null
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    canvas: info.width,
    occupancy: Math.max(width, height) / info.width,
  }
}

const iosDir = join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
const iosContents = JSON.parse(await readFile(join(iosDir, 'Contents.json'), 'utf8'))
for (const image of iosContents.images) {
  const path = join(iosDir, image.filename)
  check(await exists(path), `Missing iOS icon: ${image.filename}`)
  if (!(await exists(path))) continue
  const meta = await metadata(path)
  const expected = Math.round(Number.parseFloat(image.size) * Number.parseFloat(image.scale))
  check(meta.width === expected && meta.height === expected, `Wrong iOS size: ${image.filename}`)
  check(meta.hasAlpha === false, `iOS icon contains transparency: ${image.filename}`)
}

const androidSizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}
for (const [density, size] of Object.entries(androidSizes)) {
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    const path = join(root, 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`, name)
    const meta = await metadata(path)
    check(meta.width === size && meta.height === size, `Wrong Android size: ${density}/${name}`)
  }
}

const requiredFiles = [
  'public/assets/icons/icon-192.png',
  'public/assets/icons/icon-512.png',
  'public/assets/icons/icon-maskable-512.png',
  'public/assets/icons/apple-touch-icon.png',
  'public/assets/icons/favicon-16.png',
  'public/assets/icons/favicon-32.png',
  'public/assets/icons/notification-badge-96.png',
  'public/safari-pinned-tab.svg',
  'public/brand/fixnow-mark.svg',
  'public/favicon.svg',
  'android/app/src/main/res/drawable/ic_stat_fixnow.xml',
  'android/app/src/main/res/drawable/ic_launcher_monochrome.xml',
  'android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml',
  'scripts/brand-geometry.mjs',
]
for (const relative of requiredFiles) {
  check(await exists(join(root, relative)), `Missing required brand asset: ${relative}`)
}

const markSvg = await readFile(join(root, 'public', 'brand', 'fixnow-mark.svg'), 'utf8')
check(markSvg.includes('scale(0.58)'), 'Web mark does not use restored 58% wrench scale')
check(markSvg.includes('#004AC6'), 'Web mark brand color drifted')

const manifest = JSON.parse(await readFile(join(root, 'public', 'manifest.webmanifest'), 'utf8'))
const manifestIcons = new Set(manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`))
check(manifestIcons.has('192x192:any'), 'PWA manifest lacks 192x192 icon')
check(manifestIcons.has('512x512:any'), 'PWA manifest lacks 512x512 icon')
check(manifestIcons.has('512x512:maskable'), 'PWA manifest lacks maskable icon')

const androidManifest = await readFile(
  join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  'utf8',
)
check(androidManifest.includes('@mipmap/ic_launcher'), 'Android launcher icon is not configured')
check(androidManifest.includes('@mipmap/ic_launcher_round'), 'Android round icon is not configured')
check(androidManifest.includes('@drawable/ic_stat_fixnow'), 'Android notification small icon is not configured')

const adaptiveXml = await readFile(
  join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'),
  'utf8',
)
check(!adaptiveXml.includes('android:inset'), 'Adaptive icon still applies inset (double-shrink)')

const foreground = await measureOpaqueBounds(join(root, 'resources', 'icon-foreground.png'))
check(Boolean(foreground), 'Adaptive foreground has no opaque wrench pixels')
if (foreground) {
  const safeMargin = foreground.canvas * 0.12
  check(foreground.minX >= safeMargin && foreground.minY >= safeMargin, 'Adaptive foreground exceeds the top/left safe zone')
  check(
    foreground.maxX <= foreground.canvas - safeMargin && foreground.maxY <= foreground.canvas - safeMargin,
    'Adaptive foreground exceeds the bottom/right safe zone',
  )
  check(
    foreground.occupancy >= 0.5 && foreground.occupancy <= 0.66,
    `Adaptive foreground occupancy ${foreground.occupancy.toFixed(3)} outside restored 50–66% ink range`,
  )
}

const master = await measureOpaqueBounds(join(root, 'resources', 'icon-only.png'))
check(Boolean(master), 'Master icon-only.png has no white wrench pixels')
if (master) {
  // Path viewBox occupancy is locked at 58%; ink bbox is slightly smaller due to glyph padding.
  check(
    master.occupancy >= 0.48 && master.occupancy <= 0.62,
    `Master icon occupancy ${master.occupancy.toFixed(3)} outside restored breathing-room range (target path occupancy ${WRENCH_OCCUPANCY})`,
  )
  const padRatio = master.minX / master.canvas
  check(padRatio >= 0.18 && padRatio <= 0.28, `Master icon padding ${padRatio.toFixed(3)} is not balanced`)
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log(
  `Verified ${iosContents.images.length} iOS icon slots, Android density icons, adaptive/monochrome resources, PWA icons, and restored ${Math.round(WRENCH_OCCUPANCY * 100)}% wrench proportions.`,
)
