/**
 * widgets/QrCode.tsx — dependency-free QR code as SVG.
 *
 * @version 1.0.0
 * @since 2026-11-03 (Meet-the-Member prototype; in the scaffold since S-7, 03.11.2026)
 *
 * ISO/IEC 18004 subset that LA links need: byte mode (UTF-8), error correction
 * level M (~15 % of the symbol may be damaged — a scuffed poster, a beamer
 * keystone), versions 1–10 (up to 213 bytes; a dashboard link with
 * `?veranstaltung=<24-hex>` is ~110). Mask choice follows the standard's
 * penalty rules, so the output is byte-identical to Nayuki's reference
 * `qrcodegen` (scripts/qr-selftest.mjs proves three vectors against it).
 *
 *   <QrCode value={link} size={320} title="QR-Code zur Frage" />   // scales, crisp
 *   const svg = qrSvgString(link, { margin: 4 });                  // download / print
 *   <PublicPageQr entity="veranstaltungen" recordId={v.record_id} />  // widgets/PublicPageQr — the join link
 *
 * The link to a PUBLIC PAGE is never data: a link field of a record (often a
 * seeded placeholder address) is not where visitors go. PublicPageQr and
 * usePublicPageLink (widgets/PublicPageQr.tsx) build it from the published page whose `link_param` names
 * the entity — `{origin}{path}#/public/<slug>?<param>=<record id>`, the same
 * link the page admin's QR dialog hands out (Abnahme 5, 04.11.2026: the beamer
 * QR encoded the seed value of a link field).
 *
 * Contract:
 * - Dark on white, quiet zone 4 modules by default (the standard's minimum —
 *   scanners at 5 m need it; never pass 0 on a beamer).
 * - The SVG fills its box; `size` is a CSS length (number = px). For a beamer
 *   give it a height share (`size="34vh"`), not pixels.
 * - A value longer than version 10 holds renders the plain link instead of a
 *   broken symbol (`onTooLong` lets the caller react). Never truncate a link.
 */
import { useMemo } from 'react';

// ── Tables (EC level M, versions 1–10) ──────────────────────────────────────
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;
const FORMAT_BITS_M = 0; // L=1, M=0, Q=3, H=2

function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    r -= (25 * na - 10) * na - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

// ── Reed–Solomon over GF(256), polynomial 0x11D ─────────────────────────────
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const d = new Array<number>(degree).fill(0);
  d[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      d[j] = gfMul(d[j], root);
      if (j + 1 < degree) d[j] ^= d[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return d;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const out = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (out.shift() as number);
    out.push(0);
    divisor.forEach((coef, i) => { out[i] ^= gfMul(coef, factor); });
  }
  return out;
}

// ── Encoder ─────────────────────────────────────────────────────────────────
export type QrMatrix = boolean[][]; // [y][x], true = dark

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Encodes `text` (UTF-8, byte mode, EC level M). Throws RangeError above version 10. */
export function encodeQr(text: string): QrMatrix {
  const bytes = utf8(text);
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > MAX_VERSION) throw new RangeError(`QR: ${bytes.length} bytes exceed version ${MAX_VERSION}-M`);

  // Bit stream: mode 0100, count, data, terminator, byte pad, pad codewords.
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach(b => put(b, 8));
  const capBits = dataCodewords(ver) * 8;
  put(0, Math.min(4, capBits - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Split into blocks, add ECC, interleave.
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= numShort) codewords.push(blk[i]); });
  }

  // Function patterns.
  const size = ver * 4 + 17;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFn = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
    }
  }
  const align: number[] = [];
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    align.push(6);
    for (let pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos);
  }
  align.forEach((ax, i) => align.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask: number) => {
    const d = (FORMAT_BITS_M << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fb = ((d << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((fb >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // reserve
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vb = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((vb >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFn(a, b, dark); setFn(b, a, dark);
    }
  }

  // Codewords in the zigzag.
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (!fn[y][x] && bi < codewords.length * 8) { mod[y][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
    }
  }

  // Masks: pick the lowest penalty.
  const MASKS: Array<(x: number, y: number) => boolean> = [
    (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
  };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const s = penalty(mod);
    if (s < bestScore) { best = m; bestScore = s; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return mod;
}

function penalty(m: QrMatrix): number {
  const size = m.length;
  let score = 0;
  const addHistory = (len: number, h: number[]) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
  const countPatterns = (h: number[]) => {
    const n = h[1];
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const line = (get: (i: number) => boolean) => {
    let color = false, run = 0;
    const h = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < size; i++) {
      if (get(i) === color) {
        run++;
        if (run === 5) score += 3; else if (run > 5) score++;
      } else {
        addHistory(run, h);
        if (!color) score += countPatterns(h) * 40;
        color = get(i); run = 1;
      }
    }
    if (color) { addHistory(run, h); run = 0; }
    addHistory(run + size, h);
    score += countPatterns(h) * 40;
  };
  for (let y = 0; y < size; y++) line(x => m[y][x]);
  for (let x = 0; x < size; x++) line(y => m[y][x]);
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

// ── SVG ─────────────────────────────────────────────────────────────────────
/** One path, one unit square per dark module (runs merged per row). */
export function qrPath(m: QrMatrix, margin = 4): string {
  const parts: string[] = [];
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      parts.push(`M${x + margin} ${y + margin}h${w}v1h-${w}z`);
      x += w - 1;
    }
  });
  return parts.join('');
}

/** Standalone SVG markup (download, print sheet). */
export function qrSvgString(value: string, opts: { margin?: number; dark?: string; light?: string; pixelSize?: number } = {}): string {
  const { margin = 4, dark = '#000000', light = '#ffffff', pixelSize = 8 } = opts;
  const m = encodeQr(value);
  const dim = m.length + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim * pixelSize}" height="${dim * pixelSize}" shape-rendering="crispEdges">`
    + `<rect width="${dim}" height="${dim}" fill="${light}"/><path d="${qrPath(m, margin)}" fill="${dark}"/></svg>`;
}

export interface QrCodeProps {
  /** The text to encode — normally an absolute link. */
  value: string;
  /** CSS length of the square; number = px. Default fills the parent width. */
  size?: number | string;
  /** Quiet zone in modules (default 4 = the standard's minimum). */
  margin?: number;
  /** Accessible name, e.g. „QR-Code zur Frage“. */
  title?: string;
  dark?: string;
  light?: string;
  className?: string;
  onTooLong?: (value: string) => void;
}

export function QrCode({ value, size, margin = 4, title, dark = '#000000', light = '#ffffff', className, onTooLong }: QrCodeProps) {
  const matrix = useMemo(() => {
    try { return encodeQr(value); } catch { return null; }
  }, [value]);
  if (!matrix) {
    onTooLong?.(value);
    return <span className={`break-all text-sm ${className ?? ''}`}>{value}</span>;
  }
  const dim = matrix.length + margin * 2;
  const css = typeof size === 'number' ? `${size}px` : size;
  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={title ?? value}
      shapeRendering="crispEdges"
      className={className}
      style={{ width: css ?? '100%', height: css ?? 'auto', display: 'block', aspectRatio: '1 / 1' }}
    >
      {title ? <title>{title}</title> : null}
      <rect width={dim} height={dim} fill={light} />
      <path d={qrPath(matrix, margin)} fill={dark} />
    </svg>
  );
}

export default QrCode;
