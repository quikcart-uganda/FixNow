/**
 * FixNow local + Cloudinary asset catalog.
 *
 * Every image in the product is referenced by a stable key. Keys resolve to
 * Cloudinary delivery URLs when `cloudinary-catalog.json` has been seeded;
 * otherwise they fall back to files under `assets/images/...` (Vite `public/`).
 *
 * Paths are resolved against `import.meta.env.BASE_URL` so Capacitor
 * (`base: './'`) and web both load correctly.
 *
 * IMPORTANT: `/uploads/...` paths are served by the API origin (not the Vite app).
 * They must never be resolved against APP_BASE — that breaks photos on LAN/mobile.
 */

import { resolveConfiguredSocketUrl } from '@fixnow/api/resolveBaseUrl'
import { cloudinaryCatalogAlt, cloudinaryCatalogUrl, loadCloudinaryCatalog } from './cloudinaryCatalog'

export type AssetKind =
  | 'categories'
  | 'heroes'
  | 'promotions'
  | 'advertisements'
  | 'campaigns'
  | 'technicians'
  | 'testimonials'
  | 'knowledge'
  | 'academy'
  | 'equipment'
  | 'tools'
  | 'safety'
  | 'emergency'
  | 'marketing'

const MEDIA_BASE =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_MEDIA_BASE_URL as string | undefined)) ||
  ''

const APP_BASE =
  (typeof import.meta !== 'undefined' && (import.meta.env?.BASE_URL as string | undefined)) || '/'

/** Local SVG fallbacks — kept for offline/dev until Cloudinary catalog is seeded. */
const LOCAL_FALLBACK: Record<string, string> = {
  'categories.electrical': 'assets/images/categories/electrical.svg',
  'categories.plumbing': 'assets/images/categories/plumbing.svg',
  'categories.carpentry': 'assets/images/categories/carpentry.svg',
  'categories.painting': 'assets/images/categories/painting.svg',
  'categories.roofing': 'assets/images/categories/roofing.svg',
  'categories.cleaning': 'assets/images/categories/cleaning.svg',
  'categories.pest-control': 'assets/images/categories/pest-control.svg',
  'categories.appliance-repair': 'assets/images/categories/appliance-repair.svg',
  'categories.hvac': 'assets/images/categories/hvac.svg',
  'categories.solar': 'assets/images/categories/solar.svg',
  'categories.internet-cctv': 'assets/images/categories/internet-cctv.svg',
  'categories.locksmith': 'assets/images/categories/locksmith.svg',

  'heroes.customer': 'assets/images/heroes/customer.svg',
  'heroes.technician': 'assets/images/heroes/technician.svg',

  'promotions.first-booking': 'assets/images/promotions/first-booking.svg',
  'promotions.weekend': 'assets/images/promotions/weekend.svg',
  'promotions.emergency': 'assets/images/promotions/emergency.svg',
  'promotions.rainy-season': 'assets/images/promotions/rainy-season.svg',
  'promotions.safety-month': 'assets/images/promotions/safety-month.svg',
  'promotions.referral': 'assets/images/promotions/referral.svg',

  'advertisements.bank': 'assets/images/advertisements/bank.svg',
  'advertisements.insurance': 'assets/images/advertisements/insurance.svg',
  'advertisements.building-materials': 'assets/images/advertisements/building-materials.svg',
  'advertisements.solar': 'assets/images/advertisements/solar.svg',
  'advertisements.tools': 'assets/images/advertisements/tools.svg',
  'advertisements.vehicle': 'assets/images/advertisements/vehicle.svg',
  'advertisements.training': 'assets/images/advertisements/training.svg',
  'advertisements.telecom': 'assets/images/advertisements/telecom.svg',

  'campaigns.safety': 'assets/images/campaigns/safety.svg',
  'campaigns.choose-tech': 'assets/images/campaigns/choose-tech.svg',
  'campaigns.seasonal': 'assets/images/campaigns/seasonal.svg',
  'campaigns.earnings': 'assets/images/campaigns/earnings.svg',
  'campaigns.verification': 'assets/images/campaigns/verification.svg',

  'technicians.placeholder': 'assets/images/technicians/placeholder.svg',
  'testimonials.placeholder': 'assets/images/testimonials/placeholder.svg',

  'avatars.technician': 'assets/images/avatars/technician.svg',
  'avatars.customer': 'assets/images/avatars/customer.svg',
  'avatars.admin': 'assets/images/avatars/admin.svg',
  'avatars.support': 'assets/images/avatars/support.svg',
  'avatars.ai': 'assets/images/avatars/ai.svg',
  'avatars.vendor': 'assets/images/avatars/vendor.svg',
  'avatars.shopper': 'assets/images/avatars/shopper.svg',
}

/** Prefer Cloudinary catalog URLs; fall back to local SVG paths for legacy keys. */
const CATALOG: Record<string, string> = { ...LOCAL_FALLBACK }

function withAppBase(relativePath: string): string {
  const clean = relativePath.replace(/^\//, '')
  if (MEDIA_BASE) return `${MEDIA_BASE.replace(/\/$/, '')}/${clean}`

  // Capacitor + SPA nested routes: `base: './'` makes `./assets/...` resolve
  // relative to `/customer/...` → 404. Always use origin-root absolute paths.
  const baseNorm = APP_BASE.replace(/\/$/, '') || ''
  if (!baseNorm || baseNorm === '.' || baseNorm === './') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/${clean}`
    }
    return `/${clean}`
  }
  const base = baseNorm.endsWith('/') ? baseNorm : `${baseNorm}/`
  return `${base}${clean}`
}

/** Force local SVG/public asset (never Cloudinary) — used as LazyImage fallback. */
export function localAssetUrl(key: string): string {
  const path = LOCAL_FALLBACK[key]
  if (!path) {
    // Category keys without a local SVG must not silently become the technician silhouette.
    if (key.startsWith('categories.')) return ''
    const placeholder = LOCAL_FALLBACK['technicians.placeholder'] || 'assets/images/technicians/placeholder.svg'
    return withAppBase(placeholder)
  }
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return withAppBase(path)
}

/**
 * Resolve category card artwork. Returns empty src when there is genuinely no
 * catalog/local/HTTPS banner — callers should render the Material icon instead
 * of inventing a placeholder photo.
 */
export function resolveCategoryBannerSrc(
  rawBanner?: string | null,
  slug?: string | null,
): { src: string; mediaKey: string; hasArtwork: boolean } {
  const exactKey = categoryDedicatedMediaKey(slug)
  const mediaKey = exactKey || categoryMediaKey(slug)
  const raw = String(rawBanner || '').trim()
  if (!raw) {
    if (!exactKey) return { src: '', mediaKey, hasArtwork: false }
    return { src: assetUrl(exactKey), mediaKey: exactKey, hasArtwork: true }
  }
  const resolved = resolveMediaUrl(raw, exactKey || mediaKey)
  if (!resolved) {
    if (exactKey) return { src: assetUrl(exactKey), mediaKey: exactKey, hasArtwork: true }
    return { src: '', mediaKey, hasArtwork: false }
  }
  return { src: resolved, mediaKey: exactKey || mediaKey, hasArtwork: true }
}

/** Resolve a catalog key to a usable URL (Cloudinary first, then local fallback). */
export function assetUrl(key: string): string {
  const cloud = cloudinaryCatalogUrl(key)
  if (cloud) return cloud
  return localAssetUrl(key)
}

/** API origin (no /api/v1) — used for /uploads absolute URLs. */
function apiOrigin(): string {
  try {
    return resolveConfiguredSocketUrl().replace(/\/+$/, '')
  } catch {
    return 'http://localhost:4000'
  }
}

function absolutizeUploadPath(pathWithQuery: string): string {
  const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`
  return `${apiOrigin()}${path}`
}

/** Meaningful alt text for a catalog key when available. */
export function assetAlt(key: string, fallback = ''): string {
  return cloudinaryCatalogAlt(key) || fallback
}

/**
 * True when the raw value is a real uploaded / remote profile photo reference
 * (not empty, not seeded marketing artwork).
 */
export function hasProfilePhoto(raw?: string | null): boolean {
  const value = String(raw || '').trim()
  if (!value) return false
  if (/uploads\/placeholders\//i.test(value)) return false
  if (/(?:^|[/:.])(promotions?|campaigns?|advertisements?|marketing|offers?)(?:[/:.\-_]|$)/i.test(value)) {
    return false
  }
  if (value.startsWith('asset:') && !value.includes('technicians.')) return false
  return true
}

/**
 * Normalize any stored media reference (catalog key, local path, Cloudinary URL,
 * or legacy `/uploads/placeholders/...`) into a browser-loadable URL.
 */
export function resolveMediaUrl(raw?: string | null, fallbackKey?: string): string {
  const value = String(raw || '').trim()
  if (!value) return fallbackKey ? assetUrl(fallbackKey) : assetUrl('technicians.placeholder')
  const expectsTechnician = fallbackKey?.startsWith('technicians.')
  const isMarketingArtwork =
    /(?:^|[/:.])(promotions?|campaigns?|advertisements?|marketing|offers?)(?:[/:.\-_]|$)/i.test(value)
  if (expectsTechnician && isMarketingArtwork) return assetUrl(fallbackKey!)
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    try {
      const parsed = new URL(value)
      if (/\/uploads\//i.test(parsed.pathname)) {
        const origin = apiOrigin()
        return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      /* keep original */
    }
    return value
  }
  if (value.startsWith('cloudinary://')) {
    const publicId = value.slice('cloudinary://'.length).replace(/^\/+/, '')
    const cloudName =
      (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_CLOUDINARY_CLOUD_NAME as string | undefined)) ||
      loadCloudinaryCatalog().cloudName ||
      ''
    if (cloudName && publicId) {
      return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/${publicId}`
    }
    return fallbackKey ? assetUrl(fallbackKey) : assetUrl('technicians.placeholder')
  }
  if (value.startsWith('asset:')) {
    const key = value.slice('asset:'.length)
    if (fallbackKey?.startsWith('technicians.') && !key.startsWith('technicians.')) {
      return assetUrl(fallbackKey)
    }
    // Category asset keys often use full seed slugs (e.g. furniture-assembly)
    // while the Cloudinary catalog uses aliased leaves (furniture). Resolve via
    // categoryMediaKey so banners actually load.
    if (key.startsWith('categories.')) {
      const slug = key.slice('categories.'.length)
      const resolvedKey = categoryDedicatedMediaKey(slug)
      if (resolvedKey) return assetUrl(resolvedKey)
      // Genuine miss — do not invent technician placeholder artwork for categories.
      if (fallbackKey) {
        const fb = categoryDedicatedMediaKey(fallbackKey.replace(/^categories\./, '')) || fallbackKey
        if (cloudinaryCatalogUrl(fb) || LOCAL_FALLBACK[fb]) return assetUrl(fb)
      }
      return ''
    }
    return assetUrl(key)
  }
  if (value.includes('/uploads/placeholders/')) {
    if (value.includes('marketing')) return assetUrl('promotions.first-booking')
    if (value.includes('sponsored')) return assetUrl('advertisements.bank')
    if (value.includes('offer')) return assetUrl('promotions.weekend')
    if (value.includes('category-')) {
      const slug = value.match(/category-([a-z0-9-]+)/i)?.[1]
      if (slug) {
        const key = `categories.${slug}`
        if (cloudinaryCatalogUrl(key) || CATALOG[key]) return assetUrl(key)
      }
      return assetUrl(fallbackKey || 'categories.electrical')
    }
    return fallbackKey ? assetUrl(fallbackKey) : assetUrl('promotions.first-booking')
  }
  if (/\/uploads\//i.test(value) || value.startsWith('uploads/')) {
    const path = value.startsWith('/') ? value : `/${value}`
    return absolutizeUploadPath(path)
  }
  if (value.startsWith('assets/') || value.startsWith('/assets/')) return withAppBase(value)
  if (CATALOG[value] || cloudinaryCatalogUrl(value)) return assetUrl(value)
  if (value.startsWith('/')) return withAppBase(value.slice(1))
  return assetUrl(value)
}

/**
 * Canonical profile image resolver.
 * Returns '' when no real photo exists (caller should show initials / placeholder avatar).
 * Never returns marketing artwork as a face photo.
 */
export function resolveProfileImageUrl(raw?: string | null): string {
  if (!hasProfilePhoto(raw)) return ''
  return resolveMediaUrl(raw)
}

export function listAssetKeys(kind?: AssetKind): string[] {
  const cloudKeys = Object.keys(loadCloudinaryCatalog().assets || {})
  const keys = Array.from(new Set([...Object.keys(CATALOG), ...cloudKeys]))
  return kind ? keys.filter((k) => k.startsWith(`${kind}.`)) : keys
}

/** Slug aliases → catalog leaf under `categories.*`. */
const CATEGORY_MEDIA_ALIASES: Record<string, string> = {
  'furniture-assembly': 'furniture',
  'general-handyman': 'handyman',
  'welding-metal': 'welding',
  'glass-aluminium': 'glass',
  'ceiling-installation': 'ceiling',
  'borehole-water': 'borehole',
  'emergency-repairs': 'emergency',
  'generator-repair': 'generator',
  'internet-networking': 'internet-cctv',
  'cctv-security': 'internet-cctv',
  'refrigerator-repair': 'appliance-repair',
  'washing-machine-repair': 'appliance-repair',
  'tv-electronics-repair': 'appliance-repair',
  flooring: 'tiling',
  tiling: 'tiling',
  'interior-design': 'interior-design',
  landscaping: 'landscaping',
  moving: 'moving',
  masonry: 'masonry',
  handyman: 'handyman',
  furniture: 'furniture',
  welding: 'welding',
  glass: 'glass',
  ceiling: 'ceiling',
  borehole: 'borehole',
  emergency: 'emergency',
  generator: 'generator',
  // Seeded niches without dedicated photos → nearest catalog artwork
  lighting: 'electrical',
  'power-backup': 'generator',
  'drainage-sewer': 'plumbing',
  'water-tanks-pumps': 'borehole',
  'swimming-pools': 'cleaning',
  'cabinet-making': 'furniture',
  'wood-polishing': 'carpentry',
  wallpaper: 'painting',
  'house-painting': 'painting',
  'interior-painting': 'painting',
  'exterior-painting': 'painting',
  'deep-cleaning': 'cleaning',
  'sofa-cleaning': 'cleaning',
  'carpet-cleaning': 'cleaning',
  laundry: 'cleaning',
  'air-conditioning': 'hvac',
  'ac-repair': 'hvac',
  refrigeration: 'appliance-repair',
  'gas-cooking': 'appliance-repair',
  'door-locks': 'locksmith',
  'gate-automation': 'locksmith',
  'garden-maintenance': 'landscaping',
  'tree-cutting': 'landscaping',
  'house-moving': 'moving',
  packing: 'moving',
  'brick-laying': 'masonry',
  plastering: 'masonry',
  'tile-installation': 'tiling',
  'floor-tiling': 'tiling',
  'aluminium-windows': 'glass',
  'gypsum-ceiling': 'ceiling',
  'false-ceiling': 'ceiling',
  'solar-installation': 'solar',
  'inverter-installation': 'solar',
  'cctv-installation': 'internet-cctv',
  networking: 'internet-cctv',
  'wifi-setup': 'internet-cctv',
  'pest-fumigation': 'pest-control',
  termites: 'pest-control',
  'roof-repair': 'roofing',
  'gutter-cleaning': 'roofing',
  'pipe-welding': 'welding',
  'metal-fabrication': 'welding',
  'interior-decoration': 'interior-design',
  'home-staging': 'interior-design',
  'water-drilling': 'borehole',
  'pump-installation': 'borehole',
  'generator-installation': 'generator',
  'ups-installation': 'generator',
  'emergency-plumber': 'emergency',
  'emergency-electrician': 'emergency',
  'handyman-services': 'handyman',
  'odd-jobs': 'handyman',
}

/**
 * Dedicated artwork key for a slug, or null when no photo exists in catalog/local.
 * Does NOT fall back to handyman/electrical — use for honest "missing image" UI.
 */
export function categoryDedicatedMediaKey(slug?: string | null): string | null {
  const raw = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
  if (!raw) return null
  const leaf = CATEGORY_MEDIA_ALIASES[raw] || raw
  const key = `categories.${leaf}`
  if (cloudinaryCatalogUrl(key) || LOCAL_FALLBACK[key]) return key
  return null
}

/**
 * Resolve a category slug to a catalog media key (`categories.electrical`, …).
 * Falls back to handyman → electrical when the slug has no dedicated photo.
 */
export function categoryMediaKey(slug?: string | null): string {
  const dedicated = categoryDedicatedMediaKey(slug)
  if (dedicated) return dedicated
  if (cloudinaryCatalogUrl('categories.handyman') || LOCAL_FALLBACK['categories.handyman']) {
    return 'categories.handyman'
  }
  return 'categories.electrical'
}

/**
 * Infer a service-specific catalog key from free text (offer title, services, campaign copy).
 * Used when banners are missing or still point at a shared generic promo photo.
 */
export function inferServiceMediaKey(text: string): string {
  const t = String(text || '').toLowerCase()
  if (!t.trim()) return 'categories.handyman'
  if (/lock|locksmith|deadbolt|key\b/.test(t)) return categoryMediaKey('locksmith')
  if (/plumb|leak|pipe|drain|sink|water conservation|tap\b/.test(t)) return categoryMediaKey('plumbing')
  if (/\bac\b|hvac|air.?cond|coolair|ventilat/.test(t)) return categoryMediaKey('hvac')
  if (/electr|wiring|breaker|panel|generator/.test(t)) return categoryMediaKey('electrical')
  if (/furniture|assembl|carpent|woodwork|cabinet/.test(t)) return categoryMediaKey('carpentry')
  if (/paint|roller|brush/.test(t)) return categoryMediaKey('painting')
  if (/roof|gutter/.test(t)) return categoryMediaKey('roofing')
  if (/clean|laundry/.test(t)) return categoryMediaKey('cleaning')
  if (/pest|fumigat|termite/.test(t)) return categoryMediaKey('pest-control')
  if (/appliance|fridge|washer|refrigerat/.test(t)) return categoryMediaKey('appliance-repair')
  if (/solar|panel install/.test(t)) return categoryMediaKey('solar')
  if (/cctv|camera|network|internet/.test(t)) return categoryMediaKey('internet-cctv')
  if (/garden|lawn|landscap|hedge/.test(t)) return categoryMediaKey('landscaping')
  if (/mov(e|ing)|reloc/.test(t)) return categoryMediaKey('moving')
  if (/weld|metal/.test(t)) return categoryMediaKey('welding-metal')
  if (/mason|brick/.test(t)) return categoryMediaKey('masonry')
  if (/til(e|ing)|floor/.test(t)) return categoryMediaKey('tiling')
  if (/glass|aluminium|aluminum/.test(t)) return categoryMediaKey('glass-aluminium')
  if (/fire safety|extinguish|smoke alarm/.test(t)) return categoryMediaKey('emergency-repairs')
  if (/home safety|safety month|safety check/.test(t)) return 'campaigns.safety'
  if (/energy sav/.test(t)) return categoryMediaKey('hvac')
  if (/weekend/.test(t)) return 'promotions.weekend'
  if (/first booking|welcome/.test(t)) return 'promotions.first-booking'
  if (/refer/.test(t)) return 'promotions.referral'
  return 'categories.handyman'
}

/** True when a stored banner URL is a known shared generic promo (duplicate source). */
export function isGenericPromoBanner(raw?: string | null): boolean {
  const value = String(raw || '').toLowerCase()
  if (!value) return true
  return (
    /promotions\.(weekend|first-booking)/.test(value) ||
    /\/offers\/(weekend|first-booking)/.test(value) ||
    /uploads\/placeholders\/(offer|marketing)/.test(value)
  )
}

/**
 * Prefer a real unique banner; otherwise resolve a service-specific catalog key.
 */
export function resolveOfferBannerUrl(
  bannerImageUrl: string | null | undefined,
  context: { title?: string; subtitle?: string; serviceNames?: string[]; categorySlug?: string },
): string {
  const inferred = context.categorySlug
    ? categoryMediaKey(context.categorySlug)
    : inferServiceMediaKey(
        [context.title, context.subtitle, ...(context.serviceNames || [])].filter(Boolean).join(' '),
      )
  if (!bannerImageUrl || isGenericPromoBanner(bannerImageUrl)) {
    return resolveMediaUrl(`asset:${inferred}`, inferred)
  }
  return resolveMediaUrl(bannerImageUrl, inferred)
}

export const ASSET_CATALOG = CATALOG

export {
  CATEGORY_ICON_OPTIONS,
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_COUNT,
  categoryIconLabel,
  categoryIconByValue,
  filterCategoryIcons,
  groupCategoryIcons,
  type CategoryIconOption,
  type CategoryIconGroup,
} from './categoryIcons'

export {
  isCloudinaryDeliveryUrl,
  withCloudinaryTransform,
  cloudinaryPresetUrl,
  cloudinarySrcSet,
  type ClientMediaPreset,
} from './cloudinary'

export {
  cloudinaryCatalogUrl,
  cloudinaryCatalogAlt,
  cloudinaryCatalogAsset,
  loadCloudinaryCatalog,
} from './cloudinaryCatalog'

export {
  logImageDiag,
  getImageDiagEvents,
  clearImageDiagEvents,
  subscribeImageDiag,
  type ImageDiagEvent,
} from './imageDiagnostics'
