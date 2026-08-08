/**
 * Client-side Cloudinary URL helpers.
 * Rewrites delivery URLs with f_auto / q_auto and named size presets.
 * No Cloudinary SDK required in the browser.
 */

export type ClientMediaPreset =
  | 'avatar'
  | 'avatar2x'
  | 'thumbnail'
  | 'thumbnailSquare'
  | 'gallery'
  | 'hero'
  | 'banner'
  | 'bannerMobile'
  | 'bannerTablet'
  | 'cover'
  | 'blur'
  | 'poster'

const PRESET_TX: Record<ClientMediaPreset, string> = {
  avatar: 'c_fill,w_96,h_96,f_auto,q_auto',
  avatar2x: 'c_fill,w_192,h_192,f_auto,q_auto',
  thumbnail: 'c_fill,w_320,h_240,f_auto,q_auto',
  thumbnailSquare: 'c_fill,w_400,h_400,f_auto,q_auto',
  gallery: 'c_limit,w_960,f_auto,q_auto',
  hero: 'c_limit,w_1920,f_auto,q_auto',
  banner: 'c_fill,w_1440,h_480,f_auto,q_auto',
  bannerMobile: 'c_fill,w_750,h_420,f_auto,q_auto',
  bannerTablet: 'c_fill,w_1024,h_420,f_auto,q_auto',
  cover: 'c_fill,w_1200,h_630,f_auto,q_auto',
  blur: 'c_limit,w_40,e_blur:800,f_auto,q_30',
  poster: 'c_fill,w_640,h_360,f_auto,q_auto',
}

const CLOUDINARY_UPLOAD =
  /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video|raw)\/upload)\/(.*)$/i

/** True when a path segment is a Cloudinary transformation chunk (not public_id). */
function isTransformSegment(seg: string): boolean {
  if (!seg) return false
  if (/^v\d+$/i.test(seg)) return true // version
  // f_auto, q_auto, c_fill,w_400,h_400,f_auto,q_auto, etc.
  if (/^[a-z]+_/i.test(seg)) return true
  if (seg.includes(',') && /^[a-z0-9_,.:-]+$/i.test(seg)) return true
  return false
}

/**
 * Strip transformation + version prefixes; keep public_id path.
 * Handles:
 *   f_auto,q_auto/v1/fixnow/categories/electrical
 *   c_fill,w_400,h_400,f_auto,q_auto/v1/fixnow/categories/electrical
 *   v123456/fixnow/profiles/abc
 */
export function stripCloudinaryUploadPrefix(rest: string): string {
  const parts = String(rest || '')
    .split('/')
    .filter(Boolean)
  let i = 0
  while (i < parts.length && isTransformSegment(parts[i]!)) i += 1
  return parts.slice(i).join('/')
}

export function isCloudinaryDeliveryUrl(url?: string | null): boolean {
  return /res\.cloudinary\.com\//i.test(String(url || ''))
}

/**
 * Inject (or replace) a transformation segment in a Cloudinary delivery URL.
 * Non-Cloudinary URLs pass through unchanged.
 */
export function withCloudinaryTransform(
  url: string | null | undefined,
  transform: string | ClientMediaPreset,
): string {
  const value = String(url || '').trim()
  if (!value) return ''
  const match = value.match(CLOUDINARY_UPLOAD)
  if (!match) return value

  const base = match[1]
  const publicId = stripCloudinaryUploadPrefix(match[2] || '')
  if (!publicId) return value

  const tx = PRESET_TX[transform as ClientMediaPreset] || transform
  return `${base}/${tx}/${publicId}`
}

export function cloudinaryPresetUrl(
  url: string | null | undefined,
  preset: ClientMediaPreset,
): string {
  return withCloudinaryTransform(url, preset)
}

/** srcSet for retina avatars / responsive banners. */
export function cloudinarySrcSet(
  url: string | null | undefined,
  presets: ClientMediaPreset[],
): string {
  return presets
    .map((p) => {
      const transformed = cloudinaryPresetUrl(url, p)
      const w = PRESET_TX[p].match(/w_(\d+)/)?.[1]
      return w ? `${transformed} ${w}w` : transformed
    })
    .filter(Boolean)
    .join(', ')
}
