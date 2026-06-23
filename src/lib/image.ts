// Client-side image helpers: resize + compress a picked image to a small JPEG
// before uploading, so product photos stay light (fast menu loads, cheap storage).

/** Read a Blob/File as a data URL. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

/**
 * Resize an image so its longest edge is at most `maxDim`px and re-encode it as
 * a JPEG at the given quality. Falls back to the original blob if the canvas
 * isn't available. A typical phone photo drops from several MB to ~40–100 KB.
 */
export async function compressImage(
  file: Blob,
  maxDim = 800,
  quality = 0.8,
): Promise<Blob> {
  const dataUrl = await blobToDataUrl(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      'image/jpeg',
      quality,
    );
  });
}
