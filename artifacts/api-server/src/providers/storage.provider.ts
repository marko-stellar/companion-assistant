/**
 * StorageProvider — interface for persistent object storage.
 * The concrete implementation uses Replit Object Storage.
 * Files (photos, audio) must NEVER be stored on the deployment filesystem.
 */

export interface UploadParams {
  /** Fully-qualified object key, e.g. "photos/<userId>/<uuid>.jpg" */
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** Optional metadata key/value pairs */
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url?: string;
}

export interface GetSignedUrlParams {
  key: string;
  /** Seconds until the URL expires; default 3600 */
  expiresInSeconds?: number;
}

export interface GetSignedUrlResult {
  url: string;
  expiresAt: Date;
}

export interface DeleteParams {
  key: string;
}

export interface DeleteResult {
  success: boolean;
}

export interface StorageProvider {
  upload(params: UploadParams): Promise<UploadResult>;
  getSignedUrl(params: GetSignedUrlParams): Promise<GetSignedUrlResult>;
  delete(params: DeleteParams): Promise<DeleteResult>;
}
