import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  brandedMarkSvg,
  wrenchLayout,
  BRAND_BLUE,
  BRAND_WHITE,
  WRENCH_PATH,
} from './brand-geometry.mjs'

const root = process.cwd()
const resources = join(root, 'resources')
const publicRoot = join(root, 'public')
const publicIcons = join(publicRoot, 'assets', 'icons')
const iosIcons = join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
const androidDrawableNoDpi = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi')
const androidRes = join(root, 'android', 'app', 'src', 'main', 'res')

await Promise.all([
  mkdir(join(publicRoot, 'brand'), { recursive: true }),
  mkdir(publicIcons, { recursive: true }),
  mkdir(iosIcons, { recursive: true }),
  mkdir(androidDrawableNoDpi, { recursive: true }),
])

const renderIcon = async (size, target) => {
  await sharp(join(resources, 'icon-only.svg'), { density: 384 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .flatten({ background: BRAND_BLUE })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toFile(target)
}

const renderForeground = async (size, target) => {
  await sharp(join(resources, 'icon-foreground.svg'), { density: 384 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toFile(target)
}

await Promise.all([
  renderIcon(16, join(publicIcons, 'favicon-16.png')),
  renderIcon(32, join(publicIcons, 'favicon-32.png')),
  renderIcon(180, join(publicIcons, 'apple-touch-icon.png')),
  renderIcon(192, join(publicIcons, 'icon-192.png')),
  renderIcon(512, join(publicIcons, 'icon-512.png')),
  renderIcon(512, join(publicIcons, 'icon-maskable-512.png')),
  renderIcon(150, join(publicIcons, 'mstile-150.png')),
  renderIcon(256, join(androidDrawableNoDpi, 'ic_notification_large.png')),
  renderForeground(96, join(publicIcons, 'notification-badge-96.png')),
])

const iosDefinitions = [
  ['AppIcon-20.png', 20, 'ipad', '20x20', '1x'],
  ['AppIcon-20@2x.png', 40, 'iphone', '20x20', '2x'],
  ['AppIcon-20@2x-ipad.png', 40, 'ipad', '20x20', '2x'],
  ['AppIcon-20@3x.png', 60, 'iphone', '20x20', '3x'],
  ['AppIcon-29.png', 29, 'ipad', '29x29', '1x'],
  ['AppIcon-29@2x.png', 58, 'iphone', '29x29', '2x'],
  ['AppIcon-29@2x-ipad.png', 58, 'ipad', '29x29', '2x'],
  ['AppIcon-29@3x.png', 87, 'iphone', '29x29', '3x'],
  ['AppIcon-40.png', 40, 'ipad', '40x40', '1x'],
  ['AppIcon-40@2x.png', 80, 'iphone', '40x40', '2x'],
  ['AppIcon-40@2x-ipad.png', 80, 'ipad', '40x40', '2x'],
  ['AppIcon-40@3x.png', 120, 'iphone', '40x40', '3x'],
  ['AppIcon-60@2x.png', 120, 'iphone', '60x60', '2x'],
  ['AppIcon-60@3x.png', 180, 'iphone', '60x60', '3x'],
  ['AppIcon-76.png', 76, 'ipad', '76x76', '1x'],
  ['AppIcon-76@2x.png', 152, 'ipad', '76x76', '2x'],
  ['AppIcon-83.5@2x.png', 167, 'ipad', '83.5x83.5', '2x'],
]

const uniqueIosFiles = new Map(iosDefinitions.map(([name, pixels]) => [name, pixels]))
await Promise.all(
  [...uniqueIosFiles].map(([name, pixels]) => renderIcon(pixels, join(iosIcons, name))),
)

const appStoreIcon = 'AppIcon-512@2x.png'
await renderIcon(1024, join(iosIcons, appStoreIcon))

const contents = {
  images: [
    ...iosDefinitions.map(([filename, , idiom, size, scale]) => ({
      filename,
      idiom,
      size,
      scale,
    })),
    {
      filename: appStoreIcon,
      idiom: 'ios-marketing',
      size: '1024x1024',
      scale: '1x',
    },
  ],
  info: { author: 'xcode', version: 1 },
}
await writeFile(join(iosIcons, 'Contents.json'), `${JSON.stringify(contents, null, 2)}\n`)

const brandSvg = brandedMarkSvg(24, { labeled: true })
await Promise.all([
  writeFile(join(publicRoot, 'brand', 'fixnow-mark.svg'), brandSvg),
  writeFile(join(publicRoot, 'favicon.svg'), brandedMarkSvg(24, { labeled: false })),
])

const webManifest = {
  name: 'FixNow',
  short_name: 'FixNow',
  description: 'Trusted technicians near you — book verified help in minutes.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#002a74',
  theme_color: '#002a74',
  lang: 'en',
  icons: [
    {
      src: '/assets/icons/icon-192.png',
      type: 'image/png',
      sizes: '192x192',
      purpose: 'any',
    },
    {
      src: '/assets/icons/icon-512.png',
      type: 'image/png',
      sizes: '512x512',
      purpose: 'any',
    },
    {
      src: '/assets/icons/icon-maskable-512.png',
      type: 'image/png',
      sizes: '512x512',
      purpose: 'maskable',
    },
  ],
}
await writeFile(
  join(publicRoot, 'manifest.webmanifest'),
  `${JSON.stringify(webManifest, null, 2)}\n`,
)

const { pad: androidPad, scale: androidScale } = wrenchLayout(108)
const adaptiveV26 = `<?xml version="1.0" encoding="utf-8"?>
<!-- Proportions come from the master foreground SVG. Do not add a second inset. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
const adaptiveV33 = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 13 themed icon uses the same canonical wrench geometry. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`
const monochromeVector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:translateX="${androidPad}"
        android:translateY="${androidPad}"
        android:scaleX="${androidScale}"
        android:scaleY="${androidScale}">
        <path android:fillColor="${BRAND_WHITE}" android:pathData="${WRENCH_PATH}" />
    </group>
</vector>
`
const notificationVector = monochromeVector
  .replace('android:width="108dp"', 'android:width="24dp"')
  .replace('android:height="108dp"', 'android:height="24dp"')

await Promise.all([
  writeFile(join(androidRes, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptiveV26),
  writeFile(join(androidRes, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptiveV26),
  writeFile(join(androidRes, 'mipmap-anydpi-v33', 'ic_launcher.xml'), adaptiveV33),
  writeFile(join(androidRes, 'mipmap-anydpi-v33', 'ic_launcher_round.xml'), adaptiveV33),
  writeFile(join(androidRes, 'drawable', 'ic_launcher_monochrome.xml'), monochromeVector),
  writeFile(join(androidRes, 'drawable', 'ic_stat_fixnow.xml'), notificationVector),
])

console.log('Finalized FixNow iOS, PWA, favicon, and notification icon assets from master geometry.')
