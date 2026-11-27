import * as fs from 'fs';
import sharp from 'sharp';

export interface ImageResizePreset {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
}

export const IMAGE_RESIZE_PRESETS = {
  banner: { maxWidth: 1600, maxHeight: 900, quality: 85 },
  logo: { maxWidth: 512, maxHeight: 512, quality: 90 },
  qris: { maxWidth: 1000, maxHeight: 1000, quality: 92 },
  avatar: { maxWidth: 512, maxHeight: 512, quality: 82 },
  proof: { maxWidth: 1400, maxHeight: 1400, quality: 82 },
  default: { maxWidth: 1400, maxHeight: 1400, quality: 82 },
} as const;

const SKIPPED_MIME_TYPES = new Set(['image/svg+xml', 'image/gif']);

/**
 * Auto-resize an uploaded image file on disk using sharp (preserving aspect ratio,
 * respecting EXIF orientation, and never upscaling smaller images).
 */
export async function resizeUploadedImage(
  file: Express.Multer.File | undefined,
  preset: ImageResizePreset = IMAGE_RESIZE_PRESETS.default,
): Promise<void> {
  if (!file?.path || !file.mimetype?.startsWith('image/')) {
    return;
  }
  if (SKIPPED_MIME_TYPES.has(file.mimetype)) {
    return;
  }

  try {
    const quality = preset.quality ?? 82;
    const inputBuffer = await fs.promises.readFile(file.path);
    let pipeline = sharp(inputBuffer)
      .rotate()
      .resize({
        width: preset.maxWidth,
        height: preset.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (file.mimetype === 'image/png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    } else if (file.mimetype === 'image/webp') {
      pipeline = pipeline.webp({ quality });
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    }

    const buffer = await pipeline.toBuffer();
    await fs.promises.writeFile(file.path, buffer);
    file.size = buffer.length;
  } catch (err) {
    console.warn(
      `[image-resize] Gagal auto-resize ${file.filename || file.path}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
