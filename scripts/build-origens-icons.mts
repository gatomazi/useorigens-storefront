/** Rebuild the generic brand icons: npx tsx scripts/build-origens-icons.mts [path/to/logo.png]. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const brandDir = path.join(publicDir, "brand");
const logoPath = path.join(brandDir, "logo-origens.png");
const source = await readFile(process.argv[2] ? path.resolve(process.argv[2]) : logoPath);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
await mkdir(brandDir, { recursive: true });

// Retain the supplied artwork and its transparency. Re-encoding strips export metadata.
const logo = await sharp(source).rotate().resize(192, 192, { fit: "contain", background: transparent }).png().toBuffer();
await writeFile(logoPath, logo);
await writeFile(path.join(brandDir, "icon-origens-32.png"), await sharp(logo).resize(32, 32).png().toBuffer());
await writeFile(path.join(brandDir, "apple-touch-origens.png"), await sharp(logo).resize(160, 160).extend({ top: 10, right: 10, bottom: 10, left: 10, background: "#f4f2e9" }).flatten({ background: "#f4f2e9" }).png().toBuffer());

// Small ICO entries use native BGRA bitmaps with transparency masks for compatibility; the large entry is PNG.
async function bitmap(size: number): Promise<Buffer> {
  const rgba = await sharp(logo).resize(size, size).ensureAlpha().raw().toBuffer();
  const maskStride = Math.ceil(size / 32) * 4;
  const pixels = Buffer.alloc(size * size * 4);
  const mask = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sourceOffset = (y * size + x) * 4;
    const row = size - 1 - y;
    const targetOffset = (row * size + x) * 4;
    pixels[targetOffset] = rgba[sourceOffset + 2];
    pixels[targetOffset + 1] = rgba[sourceOffset + 1];
    pixels[targetOffset + 2] = rgba[sourceOffset];
    pixels[targetOffset + 3] = rgba[sourceOffset + 3];
    if (rgba[sourceOffset + 3] < 128) mask[row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(pixels.length + mask.length, 20);
  return Buffer.concat([header, pixels, mask]);
}

const sizes = [16, 32, 48, 192];
const images = await Promise.all(sizes.map((size) => size === 192 ? Promise.resolve(logo) : bitmap(size)));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(path.join(publicDir, "favicon.ico"), Buffer.concat([directory, ...images]));
console.log("Use Origens icons rebuilt: favicon.ico (16/32/48/192), PNG (32/192), Apple touch (180).");
