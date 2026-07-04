/**
 * Shared helpers for Storage uploads: cryptographically-unguessable object keys
 * and client-side file validation.
 *
 * The AUTHORITATIVE type/size limits are enforced server-side by the Storage
 * bucket (see migration 0012_storage_hardening.sql). These client checks only
 * surface a friendlier error before the request is sent — never rely on them as
 * a security boundary.
 */

export const MB = 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
export const RECEIPT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

/** Cryptographically-random lowercase hex string (default 16 bytes = 32 chars). */
export function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** File extension to use for an uploaded object, derived from its MIME type
 *  (never from the client-supplied filename). */
export function extForType(type: string): string {
  switch (type) {
    case 'application/pdf': return 'pdf';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    default: return 'jpg';
  }
}

/** Returns an error message if the file is the wrong type or too large, else null. */
export function validateUpload(
  file: { size: number; type: string },
  allowedTypes: string[],
  maxBytes: number,
): string | null {
  if (!allowedTypes.includes(file.type)) {
    return allowedTypes.includes('application/pdf')
      ? 'Unsupported file. Please upload an image or PDF.'
      : 'Unsupported file. Please upload an image (PNG, JPG or WebP).';
  }
  if (file.size > maxBytes) {
    return `File is too large (max ${Math.round(maxBytes / MB)} MB).`;
  }
  return null;
}
