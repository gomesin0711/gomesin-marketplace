// Remove white/near-white background from an image and make it transparent.
// Uses sharp for pixel-level manipulation.
import sharp from "sharp";
import { readFileSync } from "fs";

const inputFile = process.argv[2] || "/home/z/my-project/public/cat-icons/jasa-new.png";
const outputFile = process.argv[3] || inputFile; // overwrite by default

async function removeWhiteBackground(input, output) {
  const image = sharp(input);
  const metadata = await image.metadata();
  console.log(`Input: ${input} (${metadata.width}x${metadata.height}, ${metadata.channels} channels)`);

  // Get raw pixel data (RGBA)
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // White threshold — pixels brighter than this become transparent.
  // Using a threshold of 240 means near-white (240-255) also becomes transparent,
  // which handles anti-aliasing edges nicely.
  const WHITE_THRESHOLD = 240;

  let transparentCount = 0;
  let opaqueCount = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Check if pixel is "white-ish" (all channels above threshold)
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      // Make fully transparent
      data[i + 3] = 0;
      transparentCount++;
    } else {
      opaqueCount++;
      // For edge pixels (close to white but not quite), we could do alpha
      // feathering, but keeping it simple here. Just ensure full opacity.
      if (data[i + 3] < 255) data[i + 3] = 255;
    }
  }

  console.log(`Pixels: ${transparentCount} transparent, ${opaqueCount} opaque (out of ${width * height} total)`);

  // Save as PNG (preserves alpha channel)
  await sharp(data, {
    raw: { width, height, channels },
  })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(output);

  console.log(`Output: ${output}`);
  const outMeta = await sharp(output).metadata();
  console.log(`Output metadata: ${outMeta.width}x${outMeta.height}, ${outMeta.channels} channels, ${outMeta.format}`);
}

removeWhiteBackground(inputFile, outputFile).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
