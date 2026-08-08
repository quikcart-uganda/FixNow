/**
 * Download curated royalty-free photos, upload to Cloudinary, update the
 * client asset catalog, and remount DB media references.
 *
 * Usage (from backend/):
 *   npx tsx scripts/seed-visual-assets.ts
 *   npx tsx scripts/seed-visual-assets.ts --dry-run
 *   npm run seed:visual-assets
 *
 * Requires CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET in backend/.env
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'
import { KNOWLEDGE_ARTICLES, VISUAL_MEDIA_SOURCES, type VisualMediaSource } from './visual-media-sources.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..')
const TMP_DIR = path.join(BACKEND_ROOT, 'uploads', '.visual-seed')
const CATALOG_OUT = path.join(REPO_ROOT, 'packages', 'assets', 'cloudinary-catalog.json')
const REPORT_OUT = path.join(REPO_ROOT, 'VISUAL_ASSET_SEED_REPORT.json')

const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_DB = process.argv.includes('--skip-db')

type CatalogEntry = {
  key: string
  publicId: string
  url: string
  folder: string
  alt: string
  tags: string[]
  width?: number
  height?: number
  bytes?: number
  format?: string
  attribution: string
  kind: string
}

type SeedReport = {
  startedAt: string
  finishedAt?: string
  dryRun: boolean
  cloudName: string
  uploaded: number
  reused: number
  failed: Array<{ key: string; error: string }>
  catalogKeys: number
  db: {
    categoriesUpdated: number
    promotionsUpdated: number
    sponsoredUpdated: number
    offersUpdated: number
    contentUpdated: number
    knowledgeCreated: number
  }
}

function requireCloudinary() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME
  const api_key = process.env.CLOUDINARY_API_KEY
  const api_secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error('CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET are required')
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true })
  return cloud_name
}

function rootFolder() {
  return (process.env.CLOUDINARY_FOLDER || 'fixnow').replace(/\/+$/, '')
}

function publicIdFor(source: VisualMediaSource) {
  return `${rootFolder()}/${source.folder}/${source.publicIdLeaf}`
}

function deliveryUrl(publicId: string) {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ fetch_format: 'auto', quality: 'auto' }],
  }).split('?')[0]
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FixNowVisualSeed/1.0 (+https://fixnow.app)',
      Accept: 'image/*,*/*',
    },
    redirect: 'follow',
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} for ${url}`)
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  const nodeStream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
  await pipeline(nodeStream, createWriteStream(dest))
  const stat = await fsp.stat(dest)
  if (stat.size < 8_000) {
    throw new Error(`Downloaded file too small (${stat.size} bytes) — likely not an image`)
  }
}

async function existingResource(publicId: string): Promise<{
  public_id: string
  secure_url: string
  width?: number
  height?: number
  bytes?: number
  format?: string
} | null> {
  try {
    const res = await cloudinary.api.resource(publicId, { resource_type: 'image' })
    return res as {
      public_id: string
      secure_url: string
      width?: number
      height?: number
      bytes?: number
      format?: string
    }
  } catch {
    return null
  }
}

async function uploadSource(source: VisualMediaSource): Promise<CatalogEntry> {
  const publicId = publicIdFor(source)
  const existing = await existingResource(publicId)
  if (existing) {
    return {
      key: source.key,
      publicId: existing.public_id,
      url: deliveryUrl(existing.public_id),
      folder: `${rootFolder()}/${source.folder}`,
      alt: source.alt,
      tags: source.tags,
      width: existing.width,
      height: existing.height,
      bytes: existing.bytes,
      format: existing.format,
      attribution: source.attribution,
      kind: source.kind,
    }
  }

  if (DRY_RUN) {
    return {
      key: source.key,
      publicId,
      url: `https://res.cloudinary.com/dry-run/image/upload/f_auto,q_auto/${publicId}`,
      folder: `${rootFolder()}/${source.folder}`,
      alt: source.alt,
      tags: source.tags,
      attribution: source.attribution,
      kind: source.kind,
    }
  }

  const dest = path.join(TMP_DIR, `${source.publicIdLeaf}.jpg`)
  await downloadToFile(source.sourceUrl, dest)

  const result = await cloudinary.uploader.upload(dest, {
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    resource_type: 'image',
    tags: ['fixnow', 'visual-seed', source.kind, ...source.tags],
    context: {
      alt: source.alt,
      caption: source.alt,
      attribution: source.attribution,
      catalog_key: source.key,
    },
  })

  try {
    await fsp.unlink(dest)
  } catch {
    /* ignore */
  }

  return {
    key: source.key,
    publicId: result.public_id,
    url: deliveryUrl(result.public_id),
    folder: `${rootFolder()}/${source.folder}`,
    alt: source.alt,
    tags: source.tags,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
    attribution: source.attribution,
    kind: source.kind,
  }
}

async function writeCatalog(entries: CatalogEntry[]) {
  const byKey: Record<string, CatalogEntry> = {}
  for (const e of entries) byKey[e.key] = e
  const payload = {
    generatedAt: new Date().toISOString(),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folderRoot: rootFolder(),
    count: entries.length,
    assets: byKey,
  }
  await fsp.mkdir(path.dirname(CATALOG_OUT), { recursive: true })
  await fsp.writeFile(CATALOG_OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function updateDatabase(entries: CatalogEntry[], report: SeedReport) {
  if (SKIP_DB || DRY_RUN) return

  await import('../src/models/index.js')
  const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js')
  const {
    Category,
    PlatformPromotion,
    SponsoredContent,
    TechnicianOffer,
    ContentPage,
    User,
  } = await import('../src/models/index.js')

  await connectDatabase()

  const byKey = new Map(entries.map((e) => [e.key, e]))

  // Categories — prefer dedicated slug images; fall back to applyTo maps
  const slugToUrl = new Map<string, string>()
  for (const source of VISUAL_MEDIA_SOURCES) {
    const entry = byKey.get(source.key)
    if (!entry) continue
    for (const slug of source.applyTo?.categorySlugs || []) {
      if (!slugToUrl.has(slug)) slugToUrl.set(slug, entry.url)
    }
  }
  // Dedicated leaf matches slug when present
  for (const source of VISUAL_MEDIA_SOURCES.filter((s) => s.kind === 'categories')) {
    const entry = byKey.get(source.key)
    if (!entry) continue
    slugToUrl.set(source.publicIdLeaf, entry.url)
  }

  const categories = await Category.find({})
  for (const cat of categories) {
    const url = slugToUrl.get(cat.slug)
    if (!url) continue
    if (cat.bannerImageUrl === url) continue
    cat.bannerImageUrl = url
    await cat.save()
    report.db.categoriesUpdated += 1
  }

  // Promotions
  const promos = await PlatformPromotion.find({})
  for (const promo of promos) {
    let next: string | undefined
    for (const source of VISUAL_MEDIA_SOURCES) {
      const re = source.applyTo?.promoTitleMatch
      if (!re) continue
      if (re.test(promo.title)) {
        next = byKey.get(source.key)?.url
        break
      }
    }
    if (!next) next = byKey.get('promotions.first-booking')?.url
    if (!next || promo.bannerImageUrl === next) continue
    promo.bannerImageUrl = next
    await promo.save()
    report.db.promotionsUpdated += 1
  }

  // Sponsored / partner / campaign
  const sponsored = await SponsoredContent.find({})
  for (const row of sponsored) {
    let next: string | undefined
    for (const source of VISUAL_MEDIA_SOURCES) {
      const re = source.applyTo?.sponsoredTitleMatch
      if (!re) continue
      if (re.test(`${row.title} ${row.sponsorName || ''}`)) {
        next = byKey.get(source.key)?.url
        break
      }
    }
    if (!next) {
      next =
        row.type === 'partner_ad'
          ? byKey.get('advertisements.bank')?.url
          : byKey.get('campaigns.choose-tech')?.url
    }
    if (!next || row.bannerImageUrl === next) continue
    row.bannerImageUrl = next
    if ('desktopImageUrl' in row) (row as { desktopImageUrl?: string }).desktopImageUrl = next
    if ('mobileImageUrl' in row) (row as { mobileImageUrl?: string }).mobileImageUrl = next
    await row.save()
    report.db.sponsoredUpdated += 1
  }

  // Offers — always map to the service category photo (never blanket weekend promo art).
  const categoriesById = new Map(categories.map((c) => [String(c._id), c]))
  const offers = await TechnicianOffer.find({})
  for (const offer of offers) {
    const catId = Array.isArray(offer.categoryIds) ? String(offer.categoryIds[0] || '') : ''
    const cat = catId ? categoriesById.get(catId) : undefined
    let key: string | undefined
    if (cat?.slug) {
      const mapped = slugToUrl.get(cat.slug)
      if (mapped) {
        if (offer.bannerImageUrl !== mapped) {
          offer.bannerImageUrl = mapped
          await offer.save()
          report.db.offersUpdated += 1
        }
        continue
      }
      key = `categories.${cat.slug}`
    }
    // Title / service heuristic when category slug is missing from catalog map
    const haystack = `${offer.title || ''} ${offer.subtitle || ''} ${(offer.serviceNames || []).join(' ')}`
    const guessed = (() => {
      const t = haystack.toLowerCase()
      if (/lock/.test(t)) return slugToUrl.get('locksmith')
      if (/plumb|leak/.test(t)) return slugToUrl.get('plumbing')
      if (/\bac\b|hvac|coolair/.test(t)) return slugToUrl.get('hvac')
      if (/electr/.test(t)) return slugToUrl.get('electrical')
      if (/furniture|carpent|assembl/.test(t)) return slugToUrl.get('carpentry') || slugToUrl.get('furniture-assembly')
      if (/garden|lawn|landscap/.test(t)) return slugToUrl.get('landscaping')
      return undefined
    })()
    const next = guessed || (key ? byKey.get(key)?.url : undefined) || byKey.get('categories.handyman')?.url
    if (!next || offer.bannerImageUrl === next) continue
    offer.bannerImageUrl = next
    await offer.save()
    report.db.offersUpdated += 1
  }

  // Content pages — hero images via applyTo + knowledge articles
  const admin =
    (await User.findOne({ role: 'admin' })) ||
    (await User.findOne({ email: /admin/i }))

  for (const source of VISUAL_MEDIA_SOURCES) {
    const entry = byKey.get(source.key)
    if (!entry?.url || !source.applyTo?.contentSlugs?.length) continue
    for (const slug of source.applyTo.contentSlugs) {
      const page = await ContentPage.findOne({ slug })
      if (!page) continue
      if (page.heroImageUrl === entry.url) continue
      page.heroImageUrl = entry.url
      await page.save()
      report.db.contentUpdated += 1
    }
  }

  for (const article of KNOWLEDGE_ARTICLES) {
    const hero = byKey.get(article.heroKey)?.url
    const existing = await ContentPage.findOne({ slug: article.slug })
    if (existing) {
      let dirty = false
      if (hero && existing.heroImageUrl !== hero) {
        existing.heroImageUrl = hero
        dirty = true
      }
      if (existing.title !== article.title) {
        existing.title = article.title
        dirty = true
      }
      if (dirty) {
        await existing.save()
        report.db.contentUpdated += 1
      }
      continue
    }
    await ContentPage.create({
      title: article.title,
      slug: article.slug,
      category: 'support',
      audience: 'all',
      excerpt: article.excerpt,
      keywords: article.keywords,
      bodyMarkdown: article.bodyMarkdown,
      bodyHtml: article.bodyMarkdown
        .replace(/^# (.*)$/gm, '<h1>$1</h1>')
        .replace(/^## (.*)$/gm, '<h2>$1</h2>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<h)/, '<p>')
        .concat('</p>'),
      heroImageUrl: hero,
      status: 'published',
      publishedAt: new Date(),
      createdBy: admin?._id,
      updatedBy: admin?._id,
      publishedBy: admin?._id,
    })
    report.db.knowledgeCreated += 1
  }

  await disconnectDatabase()
}

async function main() {
  const cloudName = requireCloudinary()
  const report: SeedReport = {
    startedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    cloudName,
    uploaded: 0,
    reused: 0,
    failed: [],
    catalogKeys: 0,
    db: {
      categoriesUpdated: 0,
      promotionsUpdated: 0,
      sponsoredUpdated: 0,
      offersUpdated: 0,
      contentUpdated: 0,
      knowledgeCreated: 0,
    },
  }

  console.log(`[visual-assets] cloud=${cloudName} folder=${rootFolder()} dryRun=${DRY_RUN}`)
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const entries: CatalogEntry[] = []
  for (const source of VISUAL_MEDIA_SOURCES) {
    process.stdout.write(`[visual-assets] ${source.key} … `)
    try {
      const before = await existingResource(publicIdFor(source))
      const entry = await uploadSource(source)
      entries.push(entry)
      if (before) {
        report.reused += 1
        console.log('reused')
      } else if (DRY_RUN) {
        console.log('dry-run')
      } else {
        report.uploaded += 1
        console.log('uploaded')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      report.failed.push({ key: source.key, error: message })
      console.log(`FAILED: ${message}`)
    }
  }

  await writeCatalog(entries)
  report.catalogKeys = entries.length
  console.log(`[visual-assets] catalog → ${CATALOG_OUT} (${entries.length} keys)`)

  try {
    await updateDatabase(entries, report)
    console.log('[visual-assets] database remount complete', report.db)
  } catch (err) {
    console.error('[visual-assets] database update failed', err)
    report.failed.push({
      key: '_database',
      error: err instanceof Error ? err.message : String(err),
    })
  }

  report.finishedAt = new Date().toISOString()
  await fsp.writeFile(REPORT_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`[visual-assets] report → ${REPORT_OUT}`)

  if (report.failed.length) {
    console.error(`[visual-assets] completed with ${report.failed.length} failures`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[visual-assets] fatal', err)
  process.exit(1)
})
