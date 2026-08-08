export type MediaStorageProviderId = 'local' | 'cloudinary';

export interface PersistMediaInput {
  file: {
    filename: string;
    mimetype: string;
    size: number;
    path: string;
    originalname: string;
  };
  purpose?: string;
  uploadedBy?: string;
  /** When true, leave the staging file on disk after persist (caller must unlink). */
  keepLocal?: boolean;
}

export interface PersistedMedia {
  provider: MediaStorageProviderId;
  /** Stable id used in Download paths / DB filename */
  filename: string;
  /** Local absolute path or cloudinary public_id */
  path: string;
  /** Client-facing URL (signed local path or Cloudinary HTTPS) */
  url: string;
  /** Cloudinary public_id when provider=cloudinary */
  publicId?: string;
  bytes?: number;
  mimeType: string;
  originalName: string;
  format?: string;
  width?: number;
  height?: number;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  contentHash?: string;
}

export interface MediaStorageProvider {
  readonly id: MediaStorageProviderId;
  persist(input: PersistMediaInput): Promise<PersistedMedia>;
  destroy(ref: {
    path: string;
    filename: string;
    publicId?: string;
    resourceType?: string;
  }): Promise<void>;
  /** Optimised delivery URL (images). Falls back to stored url. */
  deliveryUrl(
    ref: { url: string; publicId?: string },
    opts?: { width?: number; height?: number; crop?: string; preset?: string },
  ): string;
}
