/**
 * The copy of the game bundle we have is missing 20 spine PNGs, and PixiJS
 * aborts the whole bundle load on the first 404. That stops the game before it
 * ever reaches first interactive frame, which is the thing we want to measure.
 *
 * This generates correctly-sized transparent PNGs for exactly the missing
 * files, into a SEPARATE overlay directory. The real bundle is never modified.
 * The measurement script serves the real bundle first and only falls back to
 * the overlay, so every byte we attribute to a real asset is a real byte.
 *
 * Placeholder bytes are tiny (an all-zero image compresses to nothing), so the
 * working-set total is understated by whatever those 20 files really weigh.
 * The measurement reports how many substituted files it served, so the caveat
 * travels with the number.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SRC = 'empireofgold/assets/spines';
const OUT = 'recon/placeholders/assets/spines';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Minimal RGBA PNG, fully transparent, at exact dimensions. */
function transparentPng(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  const raw = Buffer.alloc(h * (1 + w * 4)); // filter byte 0 + zeroed pixels
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let made = 0;
for (const dir of fs.readdirSync(SRC)) {
  const d = path.join(SRC, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith('.atlas'))) {
    const text = fs.readFileSync(path.join(d, f), 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const name = lines[i].trim();
      if (!name.toLowerCase().endsWith('.png')) continue;
      if (fs.existsSync(path.join(d, name))) continue;

      // The atlas declares "size: W,H" (or "size:W, H") a line or two below.
      let w = 1024, h = 1024;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const m = lines[j].match(/size:\s*(\d+)\s*,\s*(\d+)/i);
        if (m) { w = Number(m[1]); h = Number(m[2]); break; }
      }
      const outDir = path.join(OUT, dir);
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, name);
      fs.writeFileSync(outFile, transparentPng(w, h));
      console.log(`  placeholder ${dir}/${name}  ${w}x${h}`);
      made += 1;
    }
  }
}
console.log(`\n${made} placeholders written to ${OUT} (real bundle untouched)`);
