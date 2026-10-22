// Every internal link, image and download in the built site must exist.
// Run after building: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const redirects = readFileSync(join(DIST, "_redirects"), "utf8").split("\n").map((l) => l.split(/\s+/)[0]).filter(Boolean);

function resolves(url) {
  const path = decodeURIComponent(url.split(/[?#]/)[0]);
  if (path === "" || path === "/") return existsSync(join(DIST, "index.html"));
  if (redirects.some((r) => new RegExp("^" + r.replace(/:\w+/g, "[^/]+") + "$").test(path))) return true;
  const file = join(DIST, path);
  if (path.endsWith("/")) return existsSync(join(file, "index.html"));
  return existsSync(file) && statSync(file).isFile();
}

test("built site exists", () => assert.ok(existsSync(join(DIST, "index.html")), "run `npm run build` first"));

test("all internal links, images and files resolve", () => {
  const broken = [];
  for (const file of htmlFiles(DIST)) {
    const html = readFileSync(file, "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
    const page = "/" + relative(DIST, file).split(sep).join("/");
    const urls = [
      ...[...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(" ")[0])),
    ];
    for (const u of urls) {
      if (!u.startsWith("/") || u.startsWith("//")) continue;
      if (u.startsWith("/api/") || u.startsWith("/admin")) continue;
      if (!resolves(u)) broken.push(`${page} -> ${u}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("no links point back at the old WordPress host or have broken mailto", () => {
  const bad = [];
  for (const file of htmlFiles(DIST)) {
    const html = readFileSync(file, "utf8");
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      const u = m[1];
      if (/^https?:\/\/(www\.)?cvillequilt\.org\/(wp-|\?)/.test(u) || /^mailto:\s/.test(u) || /^http:\/\/(<|mail-to)/.test(u)) bad.push(`${relative(DIST, file)} -> ${u}`);
    }
  }
  assert.deepEqual(bad, []);
});
