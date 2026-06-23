import { useState, useEffect } from 'react';

interface ProductImageProps {
  /** Public image URL (products.image). Empty/undefined renders the fallback. */
  src?: string;
  /** Product name — its first letter is used as the fallback glyph. */
  name: string;
  /** Sizing + shape classes applied to both the image and the fallback box. */
  className?: string;
}

/**
 * Renders a product photo with a graceful first-letter fallback used when there
 * is no image, or when the URL fails to load (e.g. removed from storage).
 * Mirrors the thumbnail pattern already used in InventoryView.
 */
export function ProductImage({ src, name, className = '' }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  // Reset the error state when the source changes (e.g. picking a new image).
  useEffect(() => { setFailed(false); }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-cover bg-gray-100 ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gray-100 text-gray-400 font-black ${className}`}
      aria-label={name}
    >
      {(name?.trim()?.[0] || '?').toUpperCase()}
    </div>
  );
}
