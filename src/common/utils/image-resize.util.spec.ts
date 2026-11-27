import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import {
  IMAGE_RESIZE_PRESETS,
  resizeUploadedImage,
} from './image-resize.util';

describe('resizeUploadedImage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebeng-resize-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resizes oversized JPEG images down to fit preset bounds', async () => {
    const filePath = path.join(tmpDir, 'large.jpg');
    await sharp({
      create: {
        width: 2400,
        height: 1800,
        channels: 3,
        background: { r: 255, g: 120, b: 0 },
      },
    })
      .jpeg()
      .toFile(filePath);

    const mockFile = {
      path: filePath,
      filename: 'large.jpg',
      mimetype: 'image/jpeg',
      size: fs.statSync(filePath).size,
    } as Express.Multer.File;

    await resizeUploadedImage(mockFile, IMAGE_RESIZE_PRESETS.proof);

    const meta = await sharp(filePath).metadata();
    expect(meta.width).toBe(1400);
    expect(meta.height).toBe(1050);
  });

  it('preserves PNG transparency and does not upscale small logos', async () => {
    const filePath = path.join(tmpDir, 'small-logo.png');
    await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 0.5 },
      },
    })
      .png()
      .toFile(filePath);

    const mockFile = {
      path: filePath,
      filename: 'small-logo.png',
      mimetype: 'image/png',
      size: fs.statSync(filePath).size,
    } as Express.Multer.File;

    await resizeUploadedImage(mockFile, IMAGE_RESIZE_PRESETS.logo);

    const meta = await sharp(filePath).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
    expect(meta.hasAlpha).toBe(true);
  });

  it('skips non-image and SVG files safely', async () => {
    const svgPath = path.join(tmpDir, 'icon.svg');
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    fs.writeFileSync(svgPath, svgContent);

    const mockFile = {
      path: svgPath,
      filename: 'icon.svg',
      mimetype: 'image/svg+xml',
      size: Buffer.byteLength(svgContent),
    } as Express.Multer.File;

    await resizeUploadedImage(mockFile, IMAGE_RESIZE_PRESETS.logo);

    expect(fs.readFileSync(svgPath, 'utf8')).toBe(svgContent);
  });
});
