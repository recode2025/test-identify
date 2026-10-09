/**
 * Minimal decoder for uncompressed BMP (BI_RGB / BI_BITFIELDS, 24 or 32 bit),
 * because libvips/sharp cannot read BMP. Returns raw RGBA for sharp's `raw` input.
 */
export function decodeBmp(buf: Buffer): { data: Buffer; width: number; height: number; channels: 4 } | null {
  if (buf.length < 54 || buf.toString('ascii', 0, 2) !== 'BM') return null;
  const offset = buf.readUInt32LE(10);
  const headerSize = buf.readUInt32LE(14);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (width <= 0 || rawHeight === 0 || (bpp !== 24 && bpp !== 32) || (compression !== 0 && compression !== 3)) return null;

  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const rowSize = Math.ceil((bpp * width) / 32) * 4;
  if (offset + rowSize * height > buf.length) return null;

  // 32-bit BI_BITFIELDS stores channel masks after the 40-byte info header.
  let masks = { r: 0x00ff0000, g: 0x0000ff00, b: 0x000000ff, a: 0xff000000 };
  if (compression === 3 && headerSize >= 40) {
    const m = (i: number) => buf.readUInt32LE(14 + 40 + i * 4);
    masks = { r: m(0), g: m(1), b: m(2), a: headerSize >= 56 ? m(3) : 0 };
  }
  const shift = (mask: number) => (mask ? Math.log2(mask & -mask) : 0);
  const sh = { r: shift(masks.r), g: shift(masks.g), b: shift(masks.b), a: shift(masks.a) };

  const out = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const src = offset + (bottomUp ? height - 1 - y : y) * rowSize;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp === 24) {
        const p = src + x * 3;
        out[o] = buf[p + 2];
        out[o + 1] = buf[p + 1];
        out[o + 2] = buf[p];
        out[o + 3] = 255;
      } else {
        const px = buf.readUInt32LE(src + x * 4);
        out[o] = ((px & masks.r) >>> sh.r) & 0xff;
        out[o + 1] = ((px & masks.g) >>> sh.g) & 0xff;
        out[o + 2] = ((px & masks.b) >>> sh.b) & 0xff;
        out[o + 3] = masks.a ? ((px & masks.a) >>> sh.a) & 0xff : 255;
        if (out[o + 3] !== 0) anyAlpha = true;
      }
    }
  }
  // Many 32-bit BMPs leave the alpha byte at 0 everywhere; treat that as opaque.
  if (bpp === 32 && !anyAlpha) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { data: out, width, height, channels: 4 };
}
