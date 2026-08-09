import sharp from 'sharp';
import { mkdirSync } from 'fs';

const SRC = '/home/z/my-project/upload/gomesin logo.jpeg';
const OUT_DIR = '/home/z/my-project/public';

const SIZES = [120, 152, 180, 192, 512];

async function main() {
  // Check source
  const meta = await sharp(SRC).metadata();
  console.log(`Source: ${meta.width}x${meta.height} ${meta.format}`);

  for (const size of SIZES) {
    const outPath = `${OUT_DIR}/pwa-icon-${size}.png`;
    await sharp(SRC)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`✅ Generated ${size}x${size} -> ${outPath}`);
  }

  // Also generate a favicon.ico-sized version (32x32)
  await sharp(SRC)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`${OUT_DIR}/favicon-32.png`);
  console.log(`✅ Generated favicon-32.png`);

  console.log('Done!');
}

main().catch(console.error);
