/** the size a logo is drawn at: its own size, or smaller so that its largest side is `max` (never larger) */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** a picked logo as a data URL no larger than `max` px (PNG keeps transparency; a photo stays JPEG) */
export async function scaledLogo(file: Blob, max: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const size = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no canvas');
    g.drawImage(bitmap, 0, 0, size.width, size.height);
    return file.type === 'image/jpeg'
      ? canvas.toDataURL('image/jpeg', 0.9)
      : canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}
