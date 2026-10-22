// Local preview with working forms, no Cloudflare account needed.
//   node build.mjs && node dev.mjs      ->  http://localhost:8788
//
// Uses Node's built-in SQLite in place of D1 (saved to .dev/dev.db), prints
// emails to the terminal instead of sending them, and with FAKE_SQUARE=1
// pretends to create Square checkout links so the payment flow can be tried.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import worker from "./worker/index.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 8788;

mkdirSync(join(ROOT, ".dev"), { recursive: true });
const sqlite = new DatabaseSync(process.env.DEV_DB || join(ROOT, ".dev/dev.db"));
sqlite.exec(readFileSync(join(ROOT, "worker/migrations/0001_initial.sql"), "utf8"));

// Minimal D1 look-alike: prepare().bind().run() / .all() / .first()
const DB = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    const bound = (args = []) => ({
      run: async () => { stmt.run(...args); return { success: true }; },
      all: async () => ({ results: stmt.all(...args) }),
      first: async () => stmt.get(...args) ?? null,
    });
    return { bind: (...args) => bound(args), ...bound() };
  },
};

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".ics": "text/calendar; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf", ".xml": "application/xml", ".txt": "text/plain", ".svg": "image/svg+xml" };

const redirects = existsSync(join(DIST, "_redirects"))
  ? readFileSync(join(DIST, "_redirects"), "utf8").trim().split("\n").map((l) => l.split(/\s+/))
  : [];

// Behaves like Workers static assets: index.html for folders, _redirects, 404.html
const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    for (const [from, to, status] of redirects) {
      const re = new RegExp("^" + from.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$");
      const m = url.pathname.match(re);
      if (m) {
        const target = to.replace(/:(\w+)/g, (_, k) => m.groups?.[k] ?? "");
        return new Response(null, { status: Number(status) || 301, headers: { location: target } });
      }
    }
    let file = join(DIST, decodeURIComponent(url.pathname));
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!url.pathname.endsWith("/")) return new Response(null, { status: 307, headers: { location: url.pathname + "/" + url.search } });
      file = join(file, "index.html");
    }
    if (!file.startsWith(DIST) || !existsSync(file)) {
      return new Response(readFileSync(join(DIST, "404.html")), { status: 404, headers: { "content-type": TYPES[".html"] } });
    }
    return new Response(readFileSync(file), { headers: { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream" } });
  },
};

const EMAIL = {
  async send(msg) {
    const to = [].concat(msg.to).map((t) => t.email || t).join(", ");
    console.log(`\n--- email (not sent) ---\nTo: ${to}\nSubject: ${msg.subject}\n\n${msg.text}\n------------------------`);
    return { messageId: "dev" };
  },
};

if (process.env.FAKE_SQUARE) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input.url || input);
    if (url.includes("squareup")) {
      const body = JSON.parse(init.body);
      const id = "dev-order-" + Math.random().toString(36).slice(2, 8);
      console.log(`[fake Square] ${body.quick_pay.name}: $${(body.quick_pay.price_money.amount / 100).toFixed(2)} -> order ${id}`);
      return new Response(JSON.stringify({ payment_link: { url: `${body.checkout_options.redirect_url}${body.checkout_options.redirect_url.includes("?") ? "&" : "?"}fake_order=${id}`, order_id: id } }), { status: 200 });
    }
    return realFetch(input, init);
  };
}

const env = {
  ASSETS,
  DB,
  EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "dev",
  ...(process.env.FAKE_SQUARE ? { SQUARE_ACCESS_TOKEN: "fake", SQUARE_LOCATION_ID: "fake", SQUARE_ENV: "sandbox" } : {}),
};
// any other worker setting can be passed in from the shell, e.g. SQUARE_WEBHOOK_SIGNATURE_KEY=...
for (const k of ["MAIL_FROM", "CONTACT_TO", "MEMBERSHIP_TO", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID", "SQUARE_ENV", "SQUARE_WEBHOOK_SIGNATURE_KEY"]) {
  if (process.env[k]) env[k] = process.env[k];
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const waits = [];
  try {
    const response = await worker.fetch(request, env, { waitUntil: (p) => waits.push(p) });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("Server error");
  }
  await Promise.allSettled(waits);
}).listen(PORT, () => console.log(`Preview at http://localhost:${PORT}  (admin: /admin/, password "${env.ADMIN_PASSWORD}")`));
