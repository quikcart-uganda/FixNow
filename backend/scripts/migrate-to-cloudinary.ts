/**
 * Idempotent Cloudinary media migration.
 *
 * Usage (from backend/):
 *   npx tsx scripts/migrate-to-cloudinary.ts
 *   npm run migrate:cloudinary
 *   npm run migrate:cloudinary -- --dry-run
 *   npm run migrate:cloudinary -- --delete-local   (only after verification)
 *
 * Safe to re-run: skips already-migrated URLs, uses deterministic public_ids,
 * and persists resume state under uploads/.cloudinary-migration-state.json.
 *
 * Does NOT delete local files unless --delete-local is passed AND verification succeeds.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UPLOAD_ROOT = path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads');
const STATE_PATH = path.join(UPLOAD_ROOT, '.cloudinary-migration-state.json');
const REPORT_PATH = path.join(ROOT, '..', 'CLOUDINARY_MIGRATION_REPORT.json');

const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_LOCAL = process.argv.includes('--delete-local');

type StateEntry = {
  key: string;
  publicId: string;
  url: string;
  contentHash?: string;
  at: string;
  verified: boolean;
};

type MigrationState = {
  version: 1;
  entries: Record<string, StateEntry>;
  lastRunAt?: string;
};

type FieldSpec = {
  collection: string;
  fields: Array<{ name: string; array?: boolean }>;
  purpose?: string;
};

const FIELD_SPECS: FieldSpec[] = [
  { collection: 'uploads', fields: [{ name: 'url' }, { name: 'path' }], purpose: 'migrated' },
  { collection: 'technicianprofiles', fields: [{ name: 'photoUrl' }, { name: 'coverUrl' }], purpose: 'profile' },
  { collection: 'customerprofiles', fields: [{ name: 'photoUrl' }], purpose: 'profile' },
  { collection: 'jobs', fields: [{ name: 'photoUrls', array: true }, { name: 'videoUrls', array: true }], purpose: 'job' },
  { collection: 'jobattachments', fields: [{ name: 'url' }, { name: 'thumbnailUrl' }], purpose: 'job' },
  { collection: 'messageattachments', fields: [{ name: 'url' }], purpose: 'chat' },
  {
    collection: 'portfoliomedias',
    fields: [
      { name: 'url' },
      { name: 'thumbnailUrl' },
      { name: 'galleryUrls', array: true },
      { name: 'videoUrl' },
    ],
    purpose: 'portfolio',
  },
  { collection: 'casestudies', fields: [{ name: 'coverImageUrl' }], purpose: 'portfolio' },
  { collection: 'certificates', fields: [{ name: 'documentUrl' }, { name: 'thumbnailUrl' }], purpose: 'certificate' },
  {
    collection: 'identityverifications',
    fields: [{ name: 'documentUrls', array: true }, { name: 'selfieUrl' }],
    purpose: 'verification',
  },
  { collection: 'skillverifications', fields: [{ name: 'evidenceUrls', array: true }], purpose: 'verification' },
  { collection: 'certifications', fields: [{ name: 'documentUrl' }], purpose: 'certificate' },
  {
    collection: 'discussions',
    fields: [
      { name: 'imageUrls', array: true },
      { name: 'videoUrls', array: true },
      { name: 'attachmentUrls', array: true },
    ],
    purpose: 'community',
  },
  {
    collection: 'communityreplies',
    fields: [{ name: 'imageUrls', array: true }, { name: 'attachmentUrls', array: true }],
    purpose: 'community',
  },
  { collection: 'platformpromotions', fields: [{ name: 'bannerImageUrl' }], purpose: 'promotion' },
  {
    collection: 'sponsoredcontents',
    fields: [
      { name: 'bannerImageUrl' },
      { name: 'desktopImageUrl' },
      { name: 'mobileImageUrl' },
      { name: 'sponsorLogoUrl' },
    ],
    purpose: 'sponsored',
  },
  { collection: 'technicianoffers', fields: [{ name: 'bannerImageUrl' }], purpose: 'banner' },
  { collection: 'contentblocks', fields: [{ name: 'imageUrl' }], purpose: 'cms' },
  { collection: 'contentpages', fields: [{ name: 'heroImageUrl' }], purpose: 'cms' },
  { collection: 'categories', fields: [{ name: 'bannerImageUrl' }], purpose: 'category' },
  { collection: 'visitverifications', fields: [{ name: 'photoUrls', array: true }], purpose: 'verification' },
  { collection: 'marketplacelistings', fields: [{ name: 'mediaUrls', array: true }], purpose: 'marketplace' },
];

const CATEGORY_ASSET_FALLBACK: Record<string, string> = {
  'refrigerator-repair': 'asset:categories.appliance-repair',
  'washing-machine-repair': 'asset:categories.appliance-repair',
  'tv-electronics-repair': 'asset:categories.appliance-repair',
  'cctv-security': 'asset:categories.internet-cctv',
  'internet-networking': 'asset:categories.internet-cctv',
  'generator-repair': 'asset:categories.electrical',
  'welding-metal': 'asset:categories.carpentry',
  masonry: 'asset:categories.carpentry',
  tiling: 'asset:categories.carpentry',
  'ceiling-installation': 'asset:categories.carpentry',
  flooring: 'asset:categories.carpentry',
  'borehole-water': 'asset:categories.plumbing',
  'furniture-assembly': 'asset:categories.carpentry',
  'glass-aluminium': 'asset:categories.carpentry',
  'interior-design': 'asset:categories.painting',
  'emergency-repairs': 'asset:categories.electrical',
};

const report = {
  startedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  scanned: 0,
  migrated: 0,
  skippedAlreadyCloudinary: 0,
  skippedAssetOrExternal: 0,
  skippedMissingFile: 0,
  remappedToAsset: 0,
  failed: [] as Array<{ key: string; error: string }>,
  verified: 0,
  localFilesFound: 0,
  deletedLocal: 0,
};

function loadState(): MigrationState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as MigrationState;
    }
  } catch {
    /* ignore */
  }
  return { version: 1, entries: {} };
}

function saveState(state: MigrationState) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  state.lastRunAt = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function isLocalMediaRef(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('asset:')) return false;
  if (/^https?:\/\//i.test(value) && !/\/uploads\//i.test(value)) return false;
  if (/res\.cloudinary\.com/i.test(value) || value.startsWith('cloudinary://')) return false;
  return (
    /\/uploads\//i.test(value) ||
    value.startsWith('uploads/') ||
    /^[A-Za-z]:\\/.test(value) ||
    value.includes(`${path.sep}uploads${path.sep}`)
  );
}

function isAlreadyCloudinary(value: string): boolean {
  return /res\.cloudinary\.com/i.test(value) || value.startsWith('cloudinary://');
}

function extractUploadRelative(value: string): string | null {
  const cleaned = value.split('?')[0].replace(/\\/g, '/');
  const idx = cleaned.toLowerCase().lastIndexOf('/uploads/');
  if (idx >= 0) return cleaned.slice(idx + '/uploads/'.length);
  if (cleaned.startsWith('uploads/')) return cleaned.slice('uploads/'.length);
  if (path.isAbsolute(value) && value.replace(/\\/g, '/').includes('/uploads/')) {
    return path.relative(UPLOAD_ROOT, value).replace(/\\/g, '/');
  }
  return null;
}

function resolveLocalFile(value: string): string | null {
  const rel = extractUploadRelative(value);
  if (!rel) {
    if (path.isAbsolute(value) && fs.existsSync(value)) return value;
    return null;
  }
  const full = path.resolve(UPLOAD_ROOT, rel);
  if (!full.startsWith(UPLOAD_ROOT)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  return null;
}

function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
  };
  return map[ext] || 'application/octet-stream';
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function deterministicPublicId(relOrKey: string, hash: string): string {
  const root = (process.env.CLOUDINARY_FOLDER || 'fixnow').replace(/\/+$/, '');
  const safe = relOrKey
    .replace(/\\/g, '/')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
    .slice(0, 120);
  return `${root}/migrated/${safe || 'file'}-${hash.slice(0, 12)}`;
}

function categorySvg(name: string): string {
  const safe = name.replace(/[<>&]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0F766E"/><stop offset="1" stop-color="#14B8A6"/></linearGradient></defs><rect width="1200" height="480" fill="url(#g)"/><text x="60" y="250" fill="#fff" font-family="Arial" font-size="48" font-weight="700">${safe}</text></svg>`;
}

async function verifyCloudinaryUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    const get = await fetch(url, { method: 'GET' });
    return get.ok;
  } catch {
    return false;
  }
}

async function migrateValue(input: {
  value: string;
  purpose: string;
  state: MigrationState;
  uploadLocalFileToCloudinary: typeof import('../src/providers/storage/cloudinary.provider.js').uploadLocalFileToCloudinary;
  context?: { collection: string; slug?: string; name?: string };
}): Promise<{ next?: string; action: string }> {
  const { value, purpose, state } = input;
  if (!value?.trim()) return { action: 'empty' };
  if (value.startsWith('asset:')) {
    report.skippedAssetOrExternal += 1;
    return { action: 'asset' };
  }
  if (isAlreadyCloudinary(value)) {
    report.skippedAlreadyCloudinary += 1;
    return { action: 'cloudinary' };
  }
  if (/^https?:\/\//i.test(value) && !/\/uploads\//i.test(value)) {
    report.skippedAssetOrExternal += 1;
    return { action: 'external' };
  }
  if (!isLocalMediaRef(value)) {
    report.skippedAssetOrExternal += 1;
    return { action: 'skip' };
  }

  const stateKey = value.split('?')[0];
  const prior = state.entries[stateKey];
  if (prior?.verified && prior.url) {
    report.migrated += 1;
    return { next: prior.url, action: 'resumed' };
  }

  // Prefer remapping seed placeholders to catalog assets (no Cloudinary round-trip needed).
  const rel = extractUploadRelative(value) || '';
  if (rel.startsWith('placeholders/')) {
    if (rel.includes('offer-banner')) {
      report.remappedToAsset += 1;
      return { next: 'asset:promotions.weekend', action: 'asset-remap' };
    }
    if (rel.includes('marketing-banner')) {
      report.remappedToAsset += 1;
      return { next: 'asset:promotions.first-booking', action: 'asset-remap' };
    }
    if (rel.includes('sponsored-banner')) {
      report.remappedToAsset += 1;
      return { next: 'asset:advertisements.bank', action: 'asset-remap' };
    }
    if (rel.startsWith('placeholders/category-') && input.context?.collection === 'categories') {
      const slug = input.context.slug || rel.replace(/^placeholders\/category-/, '').replace(/\.[^.]+$/, '');
      const asset = CATEGORY_ASSET_FALLBACK[slug];
      if (asset) {
        report.remappedToAsset += 1;
        return { next: asset, action: 'asset-remap' };
      }
    }
  }

  let localPath = resolveLocalFile(value);
  let tempGenerated: string | null = null;

  // Generate missing placeholder SVGs so we can still migrate.
  if (!localPath && rel.startsWith('placeholders/')) {
    const genDir = path.join(UPLOAD_ROOT, 'placeholders');
    fs.mkdirSync(genDir, { recursive: true });
    const base = path.basename(rel).replace(/\.[^.]+$/, '') + '.svg';
    tempGenerated = path.join(genDir, base);
    if (!fs.existsSync(tempGenerated)) {
      const label =
        input.context?.name ||
        base.replace(/^category-/, '').replace(/-/g, ' ').replace(/\.svg$/, '');
      fs.writeFileSync(tempGenerated, categorySvg(label), 'utf8');
    }
    localPath = tempGenerated;
  }

  if (!localPath) {
    report.skippedMissingFile += 1;
    return { action: 'missing' };
  }

  report.localFilesFound += 1;
  const hash = sha256File(localPath);
  const publicId = deterministicPublicId(rel || path.basename(localPath), hash);

  if (DRY_RUN) {
    report.migrated += 1;
    return { next: `https://res.cloudinary.com/dry-run/${publicId}`, action: 'dry-run' };
  }

  const persisted = await input.uploadLocalFileToCloudinary({
    filePath: localPath,
    mimeType: mimeFromExt(localPath),
    originalName: path.basename(localPath),
    purpose,
    publicId,
    overwrite: true,
  });

  const ok = await verifyCloudinaryUrl(persisted.url);
  if (!ok) {
    throw new Error(`Verification failed for ${persisted.url}`);
  }

  state.entries[stateKey] = {
    key: stateKey,
    publicId: persisted.publicId || publicId,
    url: persisted.url,
    contentHash: hash,
    at: new Date().toISOString(),
    verified: true,
  };
  saveState(state);

  report.migrated += 1;
  report.verified += 1;

  if (DELETE_LOCAL && localPath.startsWith(UPLOAD_ROOT) && !rel.startsWith('placeholders/')) {
    try {
      fs.unlinkSync(localPath);
      report.deletedLocal += 1;
    } catch {
      /* keep local on failure */
    }
  }

  return { next: persisted.url, action: 'migrated' };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary credentials are required (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)');
  }

  console.log(`[migrate-cloudinary] dryRun=${DRY_RUN} deleteLocal=${DELETE_LOCAL}`);
  console.log(`[migrate-cloudinary] uploadRoot=${UPLOAD_ROOT}`);

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const names = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const state = loadState();

  // Load Cloudinary uploader after env is ready.
  const { uploadLocalFileToCloudinary } = await import('../src/providers/storage/cloudinary.provider.js');

  for (const spec of FIELD_SPECS) {
    if (!names.has(spec.collection)) {
      console.log(`  skip missing collection: ${spec.collection}`);
      continue;
    }
    const coll = db.collection(spec.collection);
    const cursor = coll.find({});
    for await (const doc of cursor) {
      const updates: Record<string, unknown> = {};
      let changed = false;

      for (const field of spec.fields) {
        const current = doc[field.name];
        if (field.array) {
          if (!Array.isArray(current) || !current.length) continue;
          const nextArr: string[] = [];
          let arrChanged = false;
          for (const item of current) {
            report.scanned += 1;
            if (typeof item !== 'string') {
              nextArr.push(item);
              continue;
            }
            try {
              const result = await migrateValue({
                value: item,
                purpose: spec.purpose || 'migrated',
                state,
                uploadLocalFileToCloudinary,
                context: {
                  collection: spec.collection,
                  slug: doc.slug,
                  name: doc.name || doc.title,
                },
              });
              if (result.next && result.next !== item) {
                nextArr.push(result.next);
                arrChanged = true;
              } else {
                nextArr.push(item);
              }
            } catch (err) {
              report.failed.push({
                key: `${spec.collection}.${doc._id}.${field.name}:${item}`,
                error: err instanceof Error ? err.message : String(err),
              });
              nextArr.push(item);
            }
          }
          if (arrChanged) {
            updates[field.name] = nextArr;
            changed = true;
          }
        } else {
          if (typeof current !== 'string' || !current.trim()) continue;
          report.scanned += 1;
          try {
            const result = await migrateValue({
              value: current,
              purpose: spec.purpose || 'migrated',
              state,
              uploadLocalFileToCloudinary,
              context: {
                collection: spec.collection,
                slug: doc.slug,
                name: doc.name || doc.title,
              },
            });
            if (result.next && result.next !== current) {
              updates[field.name] = result.next;
              changed = true;
              // Keep Upload.path in sync when migrating Upload.url
              if (spec.collection === 'uploads' && field.name === 'url' && result.next.includes('cloudinary')) {
                const publicId = state.entries[current.split('?')[0]]?.publicId;
                if (publicId) {
                  updates.path = `cloudinary://${publicId}`;
                  updates.provider = 'cloudinary';
                  updates.publicId = publicId;
                  updates.migratedAt = new Date();
                }
              }
            }
          } catch (err) {
            report.failed.push({
              key: `${spec.collection}.${doc._id}.${field.name}`,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      if (changed && !DRY_RUN) {
        await coll.updateOne({ _id: doc._id }, { $set: updates });
      }
    }
  }

  // Also migrate leftover UUID files on disk that have no DB pointer yet.
  if (fs.existsSync(UPLOAD_ROOT)) {
    const files: string[] = [];
    const collect = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'placeholders') continue;
          collect(full);
        } else if (!entry.name.startsWith('.') && /^[a-f0-9-]{36}/i.test(entry.name)) {
          files.push(full);
        }
      }
    };
    collect(UPLOAD_ROOT);
    for (const full of files) {
      const rel = path.relative(UPLOAD_ROOT, full).replace(/\\/g, '/');
      report.scanned += 1;
      try {
        await migrateValue({
          value: `/uploads/${rel}`,
          purpose: 'migrated',
          state,
          uploadLocalFileToCloudinary,
        });
      } catch (err) {
        report.failed.push({
          key: `disk:${rel}`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  saveState(state);
  const finished = { ...report, finishedAt: new Date().toISOString() };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(finished, null, 2), 'utf8');
  console.log(JSON.stringify(finished, null, 2));
  console.log(`[migrate-cloudinary] report → ${REPORT_PATH}`);

  await mongoose.disconnect();
  if (report.failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[migrate-cloudinary] fatal', err);
  process.exit(1);
});
