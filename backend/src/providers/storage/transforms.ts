/**
 * Cloudinary delivery transforms — responsive sizes, auto format/quality,
 * blur placeholders, and named presets for avatars / banners / heroes / gallery.
 */

import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';

export type MediaTransformPreset =
  | 'avatar'
  | 'avatar@2x'
  | 'thumbnail'
  | 'thumbnailSquare'
  | 'gallery'
  | 'hero'
  | 'banner'
  | 'bannerMobile'
  | 'bannerTablet'
  | 'cover'
  | 'blur'
  | 'poster';

const PRESETS: Record<
  MediaTransformPreset,
  { width?: number; height?: number; crop?: string; quality?: string | number; effect?: string }
> = {
  avatar: { width: 96, height: 96, crop: 'fill' },
  'avatar@2x': { width: 192, height: 192, crop: 'fill' },
  thumbnail: { width: 320, height: 240, crop: 'fill' },
  thumbnailSquare: { width: 400, height: 400, crop: 'fill' },
  gallery: { width: 960, crop: 'limit' },
  hero: { width: 1920, crop: 'limit' },
  banner: { width: 1440, height: 480, crop: 'fill' },
  bannerMobile: { width: 750, height: 420, crop: 'fill' },
  bannerTablet: { width: 1024, height: 420, crop: 'fill' },
  cover: { width: 1200, height: 630, crop: 'fill' },
  blur: { width: 40, crop: 'limit', quality: 30, effect: 'blur:800' },
  poster: { width: 640, height: 360, crop: 'fill' },
};

function ensureCloudinaryConfig(): boolean {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return false;
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return true;
}

/** Extract Cloudinary public_id from a delivery URL or cloudinary:// ref. */
export function extractCloudinaryPublicId(raw?: string | null): string | undefined {
  const value = String(raw || '').trim();
  if (!value) return undefined;
  if (value.startsWith('cloudinary://')) return value.slice('cloudinary://'.length).replace(/^\/+/, '');

  const upload = value.match(/\/(?:image|video|raw)\/upload\/(.+?)(?:\?|$)/i);
  if (!upload?.[1]) return undefined;

  const parts = upload[1].split('/').filter(Boolean);
  const isTx = (seg: string) =>
    /^v\d+$/i.test(seg) ||
    /^[a-z]+_/i.test(seg) ||
    (seg.includes(',') && /^[a-z0-9_,.:-]+$/i.test(seg));

  let i = 0;
  while (i < parts.length && isTx(parts[i]!)) i += 1;
  const publicId = parts.slice(i).join('/').replace(/\.[a-z0-9]+$/i, '');
  return publicId || undefined;
}

export function isCloudinaryUrl(raw?: string | null): boolean {
  const value = String(raw || '').trim();
  return /res\.cloudinary\.com/i.test(value) || value.startsWith('cloudinary://');
}

/**
 * Build an optimised Cloudinary delivery URL.
 * Non-Cloudinary URLs pass through unchanged.
 */
export function cloudinaryDeliveryUrl(
  ref: { url?: string; publicId?: string } | string,
  opts?: {
    preset?: MediaTransformPreset;
    width?: number;
    height?: number;
    crop?: string;
    resourceType?: 'image' | 'video' | 'raw';
  },
): string {
  const url = typeof ref === 'string' ? ref : ref.url || '';
  const publicId =
    (typeof ref === 'string' ? extractCloudinaryPublicId(ref) : ref.publicId || extractCloudinaryPublicId(ref.url)) ||
    undefined;

  if (!publicId || !ensureCloudinaryConfig()) return url;

  const preset = opts?.preset ? PRESETS[opts.preset] : undefined;
  const width = opts?.width ?? preset?.width;
  const height = opts?.height ?? preset?.height;
  const crop = opts?.crop ?? preset?.crop ?? 'limit';
  const quality = preset?.quality ?? 'auto';
  const effect = preset?.effect;

  return cloudinary.url(publicId, {
    secure: true,
    resource_type: opts?.resourceType || 'image',
    transformation: [
      {
        fetch_format: 'auto',
        quality,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(width || height ? { crop } : {}),
        ...(effect ? { effect } : {}),
      },
    ],
  });
}

/** Video streaming / poster helpers. */
export function cloudinaryVideoUrls(publicId: string): {
  streamingUrl: string;
  posterUrl: string;
} {
  if (!ensureCloudinaryConfig()) {
    return { streamingUrl: '', posterUrl: '' };
  }
  return {
    streamingUrl: cloudinary.url(publicId, {
      secure: true,
      resource_type: 'video',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    }),
    posterUrl: cloudinary.url(publicId, {
      secure: true,
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ width: 640, height: 360, crop: 'fill', start_offset: '0' }],
    }),
  };
}

export const MEDIA_TRANSFORM_PRESETS = PRESETS;
