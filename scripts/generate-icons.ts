import sharp from "sharp";
import path from "path";

const ICON_SIZES = [192, 512];
const INPUT_SVG = path.join(process.cwd(), "public/icons/icon.svg");
const OUTPUT_DIR = path.join(process.cwd(), "public/icons");

async function generateIcons() {
  console.log("Generating PWA icons...");

  for (const size of ICON_SIZES) {
    // Regular icon
    await sharp(INPUT_SVG)
      .resize(size, size)
      .png()
      .toFile(path.join(OUTPUT_DIR, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);

    // Maskable icon (with padding for safe area)
    const padding = Math.round(size * 0.1);
    const innerSize = size - padding * 2;

    await sharp(INPUT_SVG)
      .resize(innerSize, innerSize)
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 249, g: 115, b: 22, alpha: 1 },
      })
      .png()
      .toFile(path.join(OUTPUT_DIR, `icon-maskable-${size}.png`));
    console.log(`Generated icon-maskable-${size}.png`);
  }

  console.log("Done!");
}

generateIcons().catch(console.error);
