import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { MediaStorageProvider, PersistMediaInput, PersistedMedia } from './types.js';
import { cloudinaryDeliveryUrl } from './transforms.js';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary credentials are incomplete');
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export function folderForPurpose(purpose?: string): string {
  const root = (env.CLOUDINARY_FOLDER || 'fixnow').replace(/\/+$/, '');
  const map: Record<string, string> = {
    profile: 'profiles',
    avatar: 'profiles',
    logo: 'logos',
    business_logo: 'logos',
    service: 'services',
    banner: 'marketing/banners',
    promotion: 'offers',
    advertisement: 'ads',
    sponsored: 'marketing/sponsored',
    category: 'categories',
    portfolio: 'portfolio',
    gallery: 'portfolio',
    chat: 'chat',
    attachment: 'chat',
    verification: 'verification',
    document: 'documents',
    community: 'community',
    'ai-voice': 'ai/voice',
    certificate: 'certificates',
    kyc: 'verification',
    job: 'jobs',
    receipt: 'receipts',
    article: 'articles',
    knowledge: 'knowledge',
    academy: 'academy',
    hero: 'hero',
    partner: 'partners',
    equipment: 'equipment',
    tools: 'tools',
    safety: 'safety',
    emergency: 'emergency',
    marketing: 'marketing',
    technician: 'technicians',
    cms: 'cms',
    placeholder: 'placeholders',
    migrated: 'migrated',
  };
  const raw = (purpose || 'uploads').toLowerCase().replace(/\s+/g, '_');
  // cms-banners → cms/banners, cms-articles → cms/articles
  if (raw.startsWith('cms-')) {
    return `${root}/cms/${raw.slice(4) || 'uploads'}`;
  }
  if (raw.startsWith('cms_')) {
    return `${root}/cms/${raw.slice(4) || 'uploads'}`;
  }
  const leaf = map[raw] || 'uploads';
  return `${root}/${leaf}`;
}

function resourceType(mime: string): 'image' | 'video' | 'raw' | 'auto' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf' || mime.startsWith('application/')) return 'raw';
  if (mime.startsWith('audio/')) return 'video'; // Cloudinary stores audio under video resource type
  return 'auto';
}

async function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function uploadWithRetry(
  filePath: string,
  options: Record<string, unknown>,
  attempts = 3,
): Promise<{
  public_id: string;
  secure_url: string;
  bytes?: number;
  format?: string;
  width?: number;
  height?: number;
  resource_type?: string;
}> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return (await cloudinary.uploader.upload(filePath, options)) as {
        public_id: string;
        secure_url: string;
        bytes?: number;
        format?: string;
        width?: number;
        height?: number;
        resource_type?: string;
      };
    } catch (err) {
      lastErr = err;
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'error' in err
            ? JSON.stringify((err as { error: unknown }).error)
            : String(err);
      logger.warn(`[cloudinary] upload attempt ${i + 1} failed`, { error: message });
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Cloudinary upload failed');
}

async function cleanupLocal(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore */
  }
}

export const cloudinaryMediaStorage: MediaStorageProvider = {
  id: 'cloudinary',

  async persist(input: PersistMediaInput): Promise<PersistedMedia> {
    ensureConfigured();
    const { file, purpose } = input;
    const folder = folderForPurpose(purpose);
    const type = resourceType(file.mimetype);
    const contentHash = await fileSha256(file.path).catch(() => undefined);

    const result = await uploadWithRetry(file.path, {
      folder,
      resource_type: type,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      ...(env.CLOUDINARY_UPLOAD_PRESET ? { upload_preset: env.CLOUDINARY_UPLOAD_PRESET } : {}),
      context: purpose ? `purpose=${purpose}` : undefined,
      tags: ['fixnow', purpose || 'upload'].filter(Boolean),
    });

    if (!input.keepLocal) {
      await cleanupLocal(file.path);
    }

    const filename = `${result.public_id.replace(/\//g, '__')}${result.format ? `.${result.format}` : ''}`;
    const delivery =
      type === 'image'
        ? cloudinaryDeliveryUrl(
            { publicId: result.public_id, url: result.secure_url },
            { resourceType: 'image' },
          )
        : result.secure_url;

    return {
      provider: 'cloudinary',
      filename,
      path: result.public_id,
      publicId: result.public_id,
      url: delivery,
      mimeType: file.mimetype,
      originalName: file.originalname,
      bytes: result.bytes ?? file.size,
      format: result.format,
      width: result.width,
      height: result.height,
      resourceType: (result.resource_type as PersistedMedia['resourceType']) || type,
      contentHash,
    };
  },

  async destroy(ref): Promise<void> {
    ensureConfigured();
    const publicId = ref.publicId || (ref.path.startsWith('cloudinary://') ? ref.path.slice(12) : ref.path);
    if (!publicId) return;
    const types = [ref.resourceType, 'image', 'video', 'raw'].filter(Boolean) as string[];
    const tried = new Set<string>();
    for (const rt of types) {
      if (tried.has(rt)) continue;
      tried.add(rt);
      try {
        await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: rt });
        return;
      } catch (err) {
        logger.warn('[cloudinary] destroy attempt failed', {
          publicId,
          resourceType: rt,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },

  deliveryUrl(ref, opts): string {
    if (!ref.publicId && !ref.url) return ref.url;
    try {
      ensureConfigured();
      return cloudinaryDeliveryUrl(
        { publicId: ref.publicId, url: ref.url },
        {
          width: opts?.width,
          height: opts?.height,
          crop: opts?.crop,
          preset: opts?.preset as import('./transforms.js').MediaTransformPreset | undefined,
        },
      );
    } catch {
      return ref.url;
    }
  },
};

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

/** Upload an arbitrary local file path (used by migration). Idempotent when publicId is fixed. */
export async function uploadLocalFileToCloudinary(input: {
  filePath: string;
  mimeType: string;
  originalName: string;
  purpose?: string;
  publicId?: string;
  overwrite?: boolean;
}): Promise<PersistedMedia> {
  ensureConfigured();
  const type = resourceType(input.mimeType);
  const folder = folderForPurpose(input.purpose || 'migrated');
  const contentHash = await fileSha256(input.filePath).catch(() => undefined);

  const result = await uploadWithRetry(input.filePath, {
    folder: input.publicId ? undefined : folder,
    public_id: input.publicId,
    resource_type: type,
    use_filename: !input.publicId,
    unique_filename: !input.publicId,
    overwrite: Boolean(input.overwrite),
    tags: ['fixnow', 'migrated', input.purpose || 'migrated'].filter(Boolean),
  });

  const filename = `${result.public_id.replace(/\//g, '__')}${result.format ? `.${result.format}` : ''}`;
  const delivery =
    type === 'image'
      ? cloudinaryDeliveryUrl({ publicId: result.public_id, url: result.secure_url })
      : result.secure_url;

  return {
    provider: 'cloudinary',
    filename,
    path: result.public_id,
    publicId: result.public_id,
    url: delivery,
    mimeType: input.mimeType,
    originalName: input.originalName,
    bytes: result.bytes,
    format: result.format,
    width: result.width,
    height: result.height,
    resourceType: (result.resource_type as PersistedMedia['resourceType']) || type,
    contentHash,
  };
}
