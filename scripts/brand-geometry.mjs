/**
 * Single source of truth for FixNow brand mark geometry.
 * Every platform asset must derive from these constants — do not hand-tune sizes.
 *
 * Target: white wrench occupies 58% of the canvas with ~21% equal padding.
 * Color and corner ratio are locked to the restored FixNow identity.
 */

export const BRAND_BLUE = '#004AC6'
export const BRAND_BLUE_DARK = '#002A74'
export const BRAND_BLUE_DARKER = '#001A49'
export const BRAND_WHITE = '#FFFFFF'

/** Wrench path is authored in a 24×24 Material-style viewBox. */
export const WRENCH_PATH_SIZE = 24
export const WRENCH_PATH =
  'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z'

/** Restored occupancy for in-app / splash plates: 55–60% target → lock at 58%. */
export const WRENCH_OCCUPANCY = 0.58

/**
 * Android adaptive launcher foreground: keep well inside the 66dp safe zone
 * (of 108dp). Smaller wrench + more padding so circular/squircle masks never
 * crop the brand mark.
 */
export const ADAPTIVE_ICON_OCCUPANCY = 0.42

/** Corner radius as a fraction of canvas (5.25 / 24). */
export const CORNER_RATIO = 5.25 / 24

export function wrenchLayout(canvas, occupancy = WRENCH_OCCUPANCY) {
  const size = canvas * occupancy
  const pad = Number(((canvas - size) / 2).toFixed(4))
  const scale = Number((size / WRENCH_PATH_SIZE).toFixed(8))
  return { canvas, occupancy, size, pad, scale }
}

export function cornerRadius(canvas) {
  return Number((canvas * CORNER_RATIO).toFixed(4))
}

export function brandedMarkSvg(canvas = 24, { labeled = true } = {}) {
  const { pad, scale } = wrenchLayout(canvas)
  const rx = cornerRadius(canvas)
  const label = labeled ? ' role="img" aria-label="FixNow"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" fill="none"${label}>
  <rect width="${canvas}" height="${canvas}" rx="${rx}" fill="${BRAND_BLUE}"/>
  <path
    fill="${BRAND_WHITE}"
    transform="translate(${pad} ${pad}) scale(${scale})"
    d="${WRENCH_PATH}"
  />
</svg>
`
}

export function iconOnlySvg(canvas = 1024) {
  const { pad, scale } = wrenchLayout(canvas)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" fill="none">
  <rect width="${canvas}" height="${canvas}" fill="${BRAND_BLUE}"/>
  <path
    fill="${BRAND_WHITE}"
    transform="translate(${pad} ${pad}) scale(${scale})"
    d="${WRENCH_PATH}"
  />
</svg>
`
}

export function iconForegroundSvg(canvas = 108) {
  const { pad, scale } = wrenchLayout(canvas, ADAPTIVE_ICON_OCCUPANCY)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" fill="none">
  <path
    fill="${BRAND_WHITE}"
    transform="translate(${pad} ${pad}) scale(${scale})"
    d="${WRENCH_PATH}"
  />
</svg>
`
}

export function iconBackgroundSvg(canvas = 108) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}">
  <rect width="${canvas}" height="${canvas}" fill="${BRAND_BLUE}"/>
</svg>
`
}

export function splashSvg(canvas = 2732, plate = 532, background = BRAND_BLUE_DARK) {
  const plateOrigin = (canvas - plate) / 2
  const { pad, scale } = wrenchLayout(plate)
  const rx = cornerRadius(plate)
  const tx = plateOrigin + pad
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" fill="none">
  <rect width="${canvas}" height="${canvas}" fill="${background}"/>
  <rect x="${plateOrigin}" y="${plateOrigin}" width="${plate}" height="${plate}" rx="${rx}" fill="${BRAND_BLUE}"/>
  <path
    fill="${BRAND_WHITE}"
    transform="translate(${tx} ${tx}) scale(${scale})"
    d="${WRENCH_PATH}"
  />
</svg>
`
}
