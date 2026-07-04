import { supabase } from '../../lib/supabase';
import { randomHex } from '../../lib/upload';

const BUCKET = 'product-images';

/**
 * Upload a (already compressed) product image and return its public URL.
 * The URL is stored in products.image and rendered on the menu/ordering screens.
 * Returns null on failure so the caller can surface an error and abort the save.
 *
 * The key is cryptographically random and the upload is create-only (upsert
 * disabled): a fresh object every time, never overwriting an existing one. The
 * bucket rejects non-image / oversized uploads server-side (migration 0012).
 */
export async function uploadProductImage(
  blob: Blob,
  branchId: string,
): Promise<string | null> {
  const path = `${branchId || 'branch-1'}/${randomHex(16)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '31536000', // 1 year — images are immutable (new path per upload)
    upsert: false,
    contentType: 'image/jpeg',
  });
  if (error) {
    console.error('[ProductImageService] upload failed:', error);
    return null;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
