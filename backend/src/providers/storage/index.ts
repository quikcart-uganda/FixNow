import { env } from '../../config/env.js';
import { cloudinaryMediaStorage, isCloudinaryConfigured } from './cloudinary.provider.js';
import { localMediaStorage } from './local.provider.js';
import type { MediaStorageProvider, MediaStorageProviderId } from './types.js';

export type { MediaStorageProvider, MediaStorageProviderId, PersistedMedia, PersistMediaInput } from './types.js';
export { isCloudinaryConfigured, uploadLocalFileToCloudinary, folderForPurpose } from './cloudinary.provider.js';
export {
  cloudinaryDeliveryUrl,
  cloudinaryVideoUrls,
  extractCloudinaryPublicId,
  isCloudinaryUrl,
  MEDIA_TRANSFORM_PRESETS,
} from './transforms.js';

let cachedStorage: MediaStorageProvider | null = null;
let cachedStorageId: string | null = null;

/**
 * Resolve active media storage via Provider Manager when possible.
 * - MEDIA_STORAGE_PROVIDER=cloudinary → Cloudinary (requires credentials)
 * - MEDIA_STORAGE_PROVIDER=local → local disk (dev/emergency only)
 * - MEDIA_STORAGE_PROVIDER=auto (default) → Cloudinary when configured, else local
 */
export function getMediaStorage(): MediaStorageProvider {
  if (cachedStorage) return cachedStorage;

  void import('../../services/providers/provider.manager.js')
    .then((m) => m.providerManager.resolveRuntimeId('storage'))
    .then((id) => {
      if (id !== cachedStorageId) {
        clearMediaStorageCache();
      }
    })
    .catch(() => undefined);

  const mode = env.MEDIA_STORAGE_PROVIDER;
  if (mode === 'local') {
    cachedStorage = localMediaStorage;
    cachedStorageId = 'local';
    return cachedStorage;
  }
  if (mode === 'cloudinary') {
    if (!isCloudinaryConfigured()) {
      throw new Error('MEDIA_STORAGE_PROVIDER=cloudinary but Cloudinary credentials are missing');
    }
    cachedStorage = cloudinaryMediaStorage;
    cachedStorageId = 'cloudinary';
    return cachedStorage;
  }
  cachedStorage = isCloudinaryConfigured() ? cloudinaryMediaStorage : localMediaStorage;
  cachedStorageId = cachedStorage.id;
  return cachedStorage;
}

export function clearMediaStorageCache(): void {
  cachedStorage = null;
  cachedStorageId = null;
}

export function activeMediaStorageId(): MediaStorageProviderId {
  try {
    return getMediaStorage().id;
  } catch {
    return 'local';
  }
}
