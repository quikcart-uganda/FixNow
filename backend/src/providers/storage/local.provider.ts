import fs from 'node:fs/promises';
import { env } from '../../config/env.js';
import { buildSignedUploadPath } from '../../security/downloadTokens.js';
import type { MediaStorageProvider, PersistMediaInput, PersistedMedia } from './types.js';

/** Local disk fallback — Multer already wrote the file to UPLOAD_DIR. */
export const localMediaStorage: MediaStorageProvider = {
  id: 'local',

  async persist(input: PersistMediaInput): Promise<PersistedMedia> {
    const { file } = input;
    return {
      provider: 'local',
      filename: file.filename,
      path: file.path,
      url: buildSignedUploadPath(file.filename),
      mimeType: file.mimetype,
      originalName: file.originalname,
      bytes: file.size,
    };
  },

  async destroy(ref): Promise<void> {
    try {
      await fs.unlink(ref.path);
    } catch {
      /* already gone */
    }
  },

  deliveryUrl(ref): string {
    return ref.url;
  },
};

export function localUploadRoot(): string {
  return env.UPLOAD_DIR;
}
