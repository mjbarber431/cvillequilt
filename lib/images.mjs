// Responsive images without an image pipeline: WordPress already saved
// resized copies of most uploads ("photo-768x512.jpg"), so we index them
// and give every <img> a srcset plus width/height to stop layout shift.
import { openSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

function readHead(path, bytes = 65536) {
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(bytes);
  const n = readSync(fd, buf, 0, bytes, 0);
  closeSync(fd);
  return buf.subarray(0, n);
}

export function imageSize(path) {
  const b = readHead(path);
  if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function buildImageIndex(staticDir) {
  const groups = new Map(); // "/wp-content/uploads/2024/11/Vase.jpg" -> [{url, w, h}]
  for (const file of walk(staticDir)) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue;
    const url = "/" + relative(staticDir, file).split(sep).join("/");
    const m = url.match(/^(.*)-(\d+)x(\d+)(\.\w+)$/);
    const base = m ? m[1] + m[4] : url;
    const size = m ? { w: +m[2], h: +m[3] } : imageSize(file);
    if (!size) continue;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ url, ...size });
  }
  for (const list of groups.values()) list.sort((a, b) => a.w - b.w);

  // map every file (original or variant) to its group
  const byUrl = new Map();
  for (const [base, list] of groups) {
    for (const v of list) byUrl.set(v.url, list);
    byUrl.set(base, list);
  }
  return byUrl;
}

// Rewrites <img src="/wp-content/..."> tags in an HTML string.
// `maxWidth` caps the default src so phones and slow links get small files.
export function responsiveImages(html, index, maxWidth = 1600) {
  return html.replace(/<img\b([^>]*?)\bsrc="([^"]+)"([^>]*)>/g, (tag, before, src, after) => {
    if (/\bsrcset=/.test(tag) || !index.has(src)) return tag;
    const list = index.get(src);
    const full = list[list.length - 1];
    // keep cropped variants with the same aspect ratio as the full image
    const ratio = full.w / full.h;
    const same = list.filter((v) => Math.abs(v.w / v.h - ratio) < 0.03);
    const usable = same.filter((v) => v.w <= maxWidth);
    const pick = usable[usable.length - 1] || same[0] || full;
    const srcset = same.length > 1 ? ` srcset="${same.map((v) => `${v.url} ${v.w}w`).join(", ")}"` : "";
    const sizes = srcset && !/\bsizes=/.test(tag) ? ` sizes="(min-width: 900px) 50vw, 100vw"` : "";
    const dims = /\bwidth=/.test(tag) ? "" : ` width="${pick.w}" height="${pick.h}"`;
    const lazy = /\bloading=/.test(tag) ? "" : ` loading="lazy" decoding="async"`;
    return `<img${before}src="${pick.url}"${srcset}${sizes}${dims}${lazy}${after}>`;
  });
}
