import { supabase } from '../../lib/supabase';

const BUCKET = 'product-images';

/**
 * Upload a (already compressed) product image and return its public URL.
 * The URL is stored in products.image and rendered on the menu/ordering screens.
 * Returns null on failure so the caller can surface an error and abort the save.
 */
export async function uploadProductImage(
  blob: Blob,
  branchId: string,
): Promise<string | null> {
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${branchId || 'branch-1'}/${Date.now()}-${rand}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '31536000', // 1 year — images are immutable (new path per upload)
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) {
    console.error('[ProductImageService] upload failed:', error);
    return null;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
