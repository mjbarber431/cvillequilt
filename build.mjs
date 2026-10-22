// Builds the static site into ./dist
//   node build.mjs
//
// content/pages/*.html   one file per page (header lines + HTML body)
// content/events/*.html  one file per calendar event
// content/posts/*.html   news posts
// static/                copied as-is (photos, PDFs, logo)
// src/                   stylesheet and browser scripts
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile, loadEvents } from "./lib/content.mjs";
import { buildImageIndex, responsiveImages } from "./lib/images.mjs";
import { occurrences, nextOccurrence, describeRepeat } from "./src/js/recur.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const site = JSON.parse(readFileSync(join(ROOT, "content/site.json"), "utf8"));
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const VERSION = Date.now().toString(36);
// For a preview hosted in a sub-folder (e.g. GitHub Pages at /cvillequilt/), set BASE_PATH=/cvillequilt.
// NOINDEX=1 keeps search engines from indexing a preview copy of the real site.
const BASE = (process.env.BASE_PATH || "").replace(/\/+$/, "");
const NOINDEX = Boolean(process.env.NOINDEX);

// Prefix site-absolute URLs ("/about/") with BASE in finished HTML.
function withBase(html) {
  if (!BASE) return html;
  return html
    .replace(/(\s(?:href|src|action|poster)=")\/(?!\/)/g, `$1${BASE}/`)
    .replace(/\ssrcset="[^"]*"/g, (attr) => attr.replace(/(="|,\s*)\/(?!\/)/g, `$1${BASE}/`));
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(ROOT, "static"), DIST, { recursive: true });
cpSync(join(ROOT, "src"), join(DIST, "assets"), { recursive: true });
if (BASE) {
  const css = join(DIST, "assets/css/site.css");
  writeFileSync(css, readFileSync(css, "utf8").replace(/url\("\/(?!\/)/g, `url("${BASE}/`));
}

const images = buildImageIndex(join(ROOT, "static"));

// ---------- helpers ----------

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (html = "") => html.replace(/<[^>]+>/g, " ").replace(/&#8217;/g, "’").replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
const catSlug = (name) => site.categories[name] || (name ? "other" : "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateParts = (iso) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  return { mon: MONTHS[d.getUTCMonth()], day: d.getUTCDate(), dow: DOW[d.getUTCDay()], year: d.getUTCFullYear() };
};
const fmtTime = (t) => {
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
};
const timeRange = (ev) => (ev.allDay ? "All Day" : ev.hideTime ? "" : `${fmtTime(ev.start.slice(11, 16))} - ${fmtTime(ev.end.slice(11, 16))}`);
const longDate = (iso) => {
  const p = dateParts(iso);
  return `${p.mon} ${String(p.day).padStart(2, "0")} ${p.year}`;
};
const dateRange = (ev, occ) => {
  const s = occ ? occ.date : ev.start.slice(0, 10);
  const e = occ ? occ.endDate : ev.end.slice(0, 10);
  if (s === e) return longDate(s);
  const a = dateParts(s), b = dateParts(e);
  if (a.year === b.year && a.mon === b.mon) return `${a.mon} ${String(a.day).padStart(2, "0")} - ${String(b.day).padStart(2, "0")} ${a.year}`;
  return `${longDate(s)} - ${longDate(e)}`;
};

const icon = {
  chevron: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 3v5h5M9 13h6M9 17h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
};

// ---------- layout ----------

function navHtml(path) {
  const isCurrent = (href) => href === path;
  const items = site.nav.map((item, i) => {
    if (item.join) {
      return `<li class="nav-join"><a href="${item.href}"${isCurrent(item.href) || path === "/membership-application/" ? ' aria-current="page"' : ""}>${esc(item.label)}</a></li>`;
    }
    if (item.children) {
      const current = item.children.some((c) => isCurrent(c.href)) || isCurrent(item.href);
      return `<li${current ? ' class="is-current"' : ""}><button class="sub-toggle" type="button" aria-expanded="false" aria-controls="sub-${i}">${esc(item.label)}${icon.chevron}</button>
        <ul class="submenu" id="sub-${i}">${item.children.map((c) => `<li><a href="${c.href}"${isCurrent(c.href) ? ' aria-current="page"' : ""}>${esc(c.label)}</a></li>`).join("")}</ul></li>`;
    }
    return `<li><a href="${item.href}"${isCurrent(item.href) ? ' aria-current="page"' : ""}>${esc(item.label)}</a></li>`;
  });
  return `<nav class="main-nav" id="main-nav" aria-label="Main"><ul>${items.join("")}</ul></nav>`;
}

function banner(title, crumb, byline = "") {
  const c = crumb ? `<p class="crumbs"><a href="${crumb.href}">${esc(crumb.label)}</a></p>` : "";
  const b = byline ? `<p class="post-meta">${esc(byline)}</p>` : "";
  return `<header class="page-head">
  <picture><source media="(min-width: 900px)" srcset="/img/hero-quilt-1800.jpg"><img src="/img/hero-quilt-900.jpg" alt="" width="900" height="600"></picture>
  <div class="wrap">${c}<h1>${title}</h1>${b}</div>
</header>
<div class="binding" aria-hidden="true"></div>`;
}

const joinBand = () => `<section class="join-band" aria-labelledby="join-h">
  <div class="wrap">
    <h2 id="join-h">Join</h2>
    <p>Contact us to join or come to any chapter meeting to meet our Guild members.</p>
    <a class="btn" href="/join-us/">Join our guild</a>
  </div>
</section>`;

function footer() {
  const col = (label, links) => `<div><h2>${label}</h2><ul>${links.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join("")}</ul></div>`;
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <h2>${esc(site.name)}</h2>
      <address class="address">${site.address.join("<br>")}</address>
      <p><a href="mailto:${site.email}">${site.email}</a></p>
    </div>
    ${col("Guild", [["About", "/about/"], ["Chapters", "/services/"], ["Calendar", "/calendar/"], ["Quilt Show", "/quilt-show/"], ["Members Only", "/members-only/"]])}
    ${col("Join", [["Join Us", "/join-us/"], ["Membership Application", "/membership-application/"], ["FAQ", "/faq/"], ["Contact", "/contact/"]])}
    ${col("Service", [["Community Service", "/service/"], ["Bright Stars", "/bright-stars/"], ["Meals on Wheels", "/meals-on-wheels/"], ["NICU Quilts", "/pillowcase-challenge-duplicate-2362/"]])}
  </div>
  <div class="wrap footer-base">
    <a class="social" href="${site.facebook}" target="_blank" rel="noopener">${icon.facebook}<span>Facebook</span></a>
    <p style="margin:0">Copyright © ${new Date().getFullYear()} Charlottesville Area Quilters Guild | All rights reserved.</p>
  </div>
</footer>`;
}

function layout({ title, description = "", path, body, scripts = [], join = true, head = "" }) {
  const fullTitle = path === "/" ? site.name : `${strip(title)} – ${site.name}`;
  const desc = description || "Charlottesville Area Quilters Guild is a recreational, charitable, and educational membership organization serving the greater Charlottesville, Virginia area.";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${site.url}${path}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${site.url}/img/hero-quilt-1800.jpg">
<meta property="og:type" content="website">
<meta name="theme-color" content="#1e2f4f">
<meta name="base-path" content="${BASE}">${NOINDEX ? '\n<meta name="robots" content="noindex, nofollow">' : ""}
<link rel="icon" href="/wp-content/uploads/2024/11/cropped-Quilt-Square-e1731893743557-32x32.jpg" sizes="32x32">
<link rel="icon" href="/wp-content/uploads/2024/11/cropped-Quilt-Square-e1731893743557-192x192.jpg" sizes="192x192">
<link rel="apple-touch-icon" href="/wp-content/uploads/2024/11/cropped-Quilt-Square-e1731893743557-180x180.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Zilla+Slab:ital,wght@0,500;0,600;0,700;1,500&display=swap">
<link rel="stylesheet" href="/assets/css/site.css?v=${VERSION}">
<link rel="alternate" type="text/calendar" title="Guild calendar" href="/calendar.ics">
${head}
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header" id="top">
  <div class="wrap header-bar">
    <a class="brand" href="/"><img src="/img/logo-192.jpg" alt="" width="46" height="46"><span>${esc(site.name)}</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav">${icon.menu}Menu</button>
    ${navHtml(path)}
  </div>
</header>
<main id="content">
${body}
</main>
${join ? joinBand() : ""}
${footer()}
<script type="module" src="/assets/js/site.js?v=${VERSION}"></script>
${scripts.map((s) => `<script type="module" src="${s}?v=${VERSION}"></script>`).join("\n")}
</body>
</html>`;
  return withBase(responsiveImages(html, images));
}

function write(path, html) {
  const file = path.endsWith("/") ? join(DIST, path, "index.html") : join(DIST, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// ---------- events ----------

const events = loadEvents(join(ROOT, "content/events"));
const publicEvent = (ev) => {
  const { body, ...rest } = ev;
  return { ...rest, url: `${BASE}/events/${ev.slug}/`, image: ev.image ? BASE + ev.image : "", cat: catSlug(ev.category), excerpt: strip(body).slice(0, 220) };
};
writeFileSync(join(DIST, "events.json"), JSON.stringify(events.map(publicEvent)));

function chip(o) {
  const ev = o.event, p = dateParts(o.date);
  const when = [o.date !== o.endDate ? dateRange(ev, o) : "", timeRange(ev)].filter(Boolean).join(", ");
  return `<li><a class="event-chip" href="/events/${ev.slug}/" data-cat="${catSlug(ev.category)}">
    <span class="datebox"><span class="mon">${p.mon}</span><span class="day">${p.day}</span><span class="dow">${p.dow}</span></span>
    <span class="title">${esc(ev.title)}</span>
    <span class="when">${esc(when)}${ev.location ? `<br>${esc(ev.location)}` : ""}</span></a></li>`;
}

function upcomingList(n = 4) {
  const end = new Date(Date.parse(TODAY) + 120 * 86400000).toISOString().slice(0, 10);
  const list = occurrences(events, TODAY, end).filter((o) => o.endDate >= TODAY).slice(0, n);
  return `<ul class="upcoming" data-upcoming="${n}">${list.map(chip).join("")}</ul>`;
}

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function icsEvent(ev) {
  const dt = (s) => s.replace(/[-:]/g, "") + (s.length === 10 ? "" : "00");
  const allDayEnd = (s) => {
    const d = new Date(s.slice(0, 10) + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const lines = [
    "BEGIN:VEVENT",
    `UID:${ev.slug}@cvillequilt.org`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    ev.allDay ? `DTSTART;VALUE=DATE:${dt(ev.start.slice(0, 10))}` : `DTSTART;TZID=America/New_York:${dt(ev.start)}`,
    ev.allDay ? `DTEND;VALUE=DATE:${allDayEnd(ev.end)}` : `DTEND;TZID=America/New_York:${dt(ev.end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `DESCRIPTION:${icsEscape(strip(ev.body))}`,
    `URL:${site.url}/events/${ev.slug}/`,
  ];
  if (ev.location || ev.address) lines.push(`LOCATION:${icsEscape([ev.location, ev.address].filter(Boolean).join(", "))}`);
  if (ev.category) lines.push(`CATEGORIES:${icsEscape(ev.category)}`);
  if (ev.repeat) lines.push(`RRULE:${ev.repeat}${ev.until ? `;UNTIL=${ev.until.replace(/-/g, "")}T235959Z` : ""}`);
  if (ev.skip.length && !ev.allDay) lines.push(`EXDATE;TZID=America/New_York:${ev.skip.map((d) => dt(d + ev.start.slice(10))).join(",")}`);
  lines.push("END:VEVENT");
  // RFC 5545: lines longer than 75 octets are folded onto continuation lines
  const fold = (line) => {
    const out = [];
    let rest = line;
    while (Buffer.byteLength(rest) > 75) {
      let cut = 74;
      while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
      out.push(rest.slice(0, cut));
      rest = " " + rest.slice(cut);
    }
    out.push(rest);
    return out.join("\r\n");
  };
  return lines.map(fold).join("\r\n");
}
const TZ = ["BEGIN:VTIMEZONE", "TZID:America/New_York", "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT", "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD", "END:VTIMEZONE"].join("\r\n");
const icsFile = (list) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Charlottesville Area Quilters Guild//Calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Charlottesville Area Quilters Guild", "X-WR-TIMEZONE:America/New_York", TZ, ...list.map(icsEvent), "END:VCALENDAR", ""].join("\r\n");

writeFileSync(join(DIST, "calendar.ics"), icsFile(events));

function googleLink(ev, occ) {
  const toUtc = (local) => {
    // America/New_York: EDT (UTC-4) between 2nd Sunday of March and 1st Sunday of November
    const [d, t = "00:00"] = local.split("T");
    const y = +d.slice(0, 4);
    const nth = (m, n) => { const f = new Date(Date.UTC(y, m, 1)); return 1 + ((7 - f.getUTCDay()) % 7) + (n - 1) * 7; };
    const dst = d >= `${y}-03-${String(nth(2, 2)).padStart(2, "0")}` && d < `${y}-11-${String(nth(10, 1)).padStart(2, "0")}`;
    const ms = Date.parse(`${d}T${t}:00Z`) + (dst ? 4 : 5) * 3600000;
    return new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  };
  const s = occ ? occ.start : ev.start, e = occ ? occ.end : ev.end;
  const dates = ev.allDay ? `${s.slice(0, 10).replace(/-/g, "")}/${e.slice(0, 10).replace(/-/g, "")}` : `${toUtc(s)}/${toUtc(e)}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates, details: strip(ev.body).slice(0, 900), location: ev.address || ev.location });
  if (ev.repeat) q.set("recur", `RRULE:${ev.repeat}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}

mkdirSync(join(DIST, "events"), { recursive: true });

for (const ev of events) {
  writeFileSync(join(DIST, "events", `${ev.slug}.ics`), icsFile([ev]));
  const next = ev.repeat ? nextOccurrence(ev, TODAY) : null;
  const shown = next || { date: ev.start.slice(0, 10), endDate: ev.end.slice(0, 10), start: ev.start, end: ev.end };
  const lastDay = ev.repeat ? (ev.until || "9999-12-31") : ev.end.slice(0, 10);
  const cs = catSlug(ev.category);
  const mapUrl = ev.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ev.location, ev.address].join(", "))}` : "";

  // Images from the description are shown together as a small gallery
  let body = ev.body;
  const imgs = [];
  // a line or paragraph holding only images (optionally linked) becomes part of the gallery
  body = body.replace(/^(?:<p>)?\s*((?:\s*(?:<a [^>]*>)?\s*<img [^>]+>\s*(?:<\/a>)?)+)\s*(?:<\/p>)?\s*$/gm, (_, group) => {
    for (const m of group.matchAll(/<img [^>]+>/g)) imgs.push(m[0]);
    return "";
  });
  const hero = ev.image ? `<img src="${ev.image}" alt="">` : "";
  const gallery = [hero, ...imgs].filter(Boolean);

  const facts = [
    ["Date", ev.repeat ? `<span data-next-date="${ev.slug}">${esc(dateRange(ev, shown))}</span>` : esc(dateRange(ev))],
    ev.repeat ? ["Repeats", esc(describeRepeat(ev))] : null,
    timeRange(ev) ? ["Time", esc(timeRange(ev))] : null,
    ev.cost ? ["Cost", esc(ev.cost)] : null,
    ev.location || ev.address ? ["Location", `${esc(ev.location)}${ev.address ? `<br><span class="muted">${esc(ev.address)}</span>${mapUrl ? `<br><a href="${mapUrl}" target="_blank" rel="noopener">Map and directions</a>` : ""}` : ""}`] : null,
    ev.category ? ["Category", `<a class="cat-pill" data-cat="${cs}" href="/calendar/?category=${cs}">${esc(ev.category)}</a>`] : null,
    ev.organizer || ev.organizerEmail ? ["Organizer", `${esc(ev.organizer)}${ev.organizerEmail ? `<br><a href="mailto:${ev.organizerEmail}">${esc(ev.organizerEmail)}</a>` : ""}`] : null,
    ev.moreInfo ? ["More Info", `<a href="${esc(ev.moreInfo)}" target="_blank" rel="noopener">Read More</a>`] : null,
  ].filter(Boolean);

  const registration = ev.registration === "open" ? `
  <section class="register-panel panel" id="register" aria-labelledby="reg-h" data-register="${ev.slug}" data-capacity="${ev.capacity}" data-price="${ev.price}">
    <h2 id="reg-h">Register</h2>
    <p class="muted" data-spots>${ev.capacity ? `Limited to ${ev.capacity} participants.` : ""}${ev.price ? ` Registration is $${ev.price.toFixed(2)}, paid online with Square.` : ""}</p>
    <form class="form" data-form="register" novalidate>
      <input type="hidden" name="event" value="${ev.slug}">
      <div class="field-row field-row-2">
        <div class="field"><label for="r-first">First name<span class="req">*</span></label><input id="r-first" name="first" type="text" autocomplete="given-name" required></div>
        <div class="field"><label for="r-last">Last name<span class="req">*</span></label><input id="r-last" name="last" type="text" autocomplete="family-name" required></div>
      </div>
      <div class="field"><label for="r-email">Email<span class="req">*</span></label><input id="r-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="r-phone">Phone</label><input id="r-phone" name="phone" type="tel" autocomplete="tel"></div>
      <div class="field"><label for="r-notes">Notes for the organizer <span class="hint">(optional)</span></label><textarea id="r-notes" name="notes" rows="3"></textarea></div>
      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="cf-turnstile" data-sitekey=""></div>
      <div class="form-status" role="status" aria-live="polite"></div>
      <div><button class="btn btn-primary" type="submit">${ev.price ? "Register and pay" : "Register"}</button></div>
    </form>
  </section>` : "";

  const status = ev.registration === "sold out" ? `<span class="status status-soldout" data-soldout>Sold out!</span>` : "";
  const html = `${banner(esc(ev.title), { label: "Event Calendar", href: "/calendar/" })}
<div class="section"><div class="wrap content-grid">
  <article class="event-body prose" data-event="${ev.slug}" data-last-day="${lastDay}">
    <p class="event-status"><span class="status status-past" data-expired hidden>Expired!</span>${status}</p>
    ${gallery.length ? `<div class="event-images">${gallery.join("")}</div>` : ""}
    ${body}
    ${registration}
  </article>
  <aside class="facts" aria-label="Event details">
    <dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    <div class="event-actions">
      <a class="btn btn-quiet" href="${googleLink(ev, next)}" target="_blank" rel="noopener">+ Add to Google Calendar</a>
      <a class="btn btn-quiet" href="/events/${ev.slug}.ics">+ iCal / Outlook export</a>
    </div>
  </aside>
</div></div>`;

  write(`/events/${ev.slug}/`, layout({
    title: ev.title,
    description: strip(ev.body).slice(0, 155),
    path: `/events/${ev.slug}/`,
    body: html,
    join: false,
    scripts: ev.registration === "open" ? ["/assets/js/forms.js"] : [],
  }));
}

// ---------- pages & posts ----------

function renderDirectives(body) {
  return body
    .replace(/\{\{include:([\w-]+)\}\}/g, (_, name) => readFileSync(join(ROOT, "content/partials", `${name}.html`), "utf8"))
    .replace(/\{\{upcoming(?::(\d+))?\}\}/g, (_, n) => upcomingList(Number(n) || 4))
    .replace(/\{\{icon:(\w+)\}\}/g, (_, n) => icon[n] || "")
    .replace(/\{\{next:([\w-]+)\}\}/g, (_, slug) => {
      const ev = events.find((e) => e.slug === slug);
      if (!ev) throw new Error(`{{next:${slug}}}: no event with that file name`);
      const o = nextOccurrence(ev, TODAY);
      const text = o ? `Next meeting: ${dateParts(o.date).dow}, ${dateParts(o.date).mon} ${dateParts(o.date).day}` : "";
      return `<p class="next" data-next="${slug}">${icon.calendar}<span>${esc(text)}</span></p>`;
    });
}

function renderDir(dir, urlFor, wrap = (body) => body) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(md|html)$/.test(f) && !f.startsWith("_")).map((f) => {
    const { meta, body } = parseFile(join(dir, f));
    const path = meta.path || urlFor(f.replace(/\.(md|html)$/, ""));
    const crumb = meta.crumb ? { label: meta.crumb.split("|")[0].trim(), href: meta.crumb.split("|")[1].trim() } : null;
    const top = meta.banner === "none" ? "" : banner(esc(meta.heading || meta.title), crumb, meta.date);
    const scripts = (meta.scripts || "").split(",").map((s) => s.trim()).filter(Boolean);
    write(path, layout({
      title: meta.title,
      description: meta.description,
      path,
      body: top + wrap(renderDirectives(body)),
      join: !["false", "no"].includes(String(meta.join).toLowerCase()),
      scripts,
    }));
    return path;
  });
}

const pagePaths = renderDir(join(ROOT, "content/pages"), (slug) => (slug === "home" ? "/" : `/${slug}/`));
// News posts hold only their text; the page layout is added here.
const postPaths = renderDir(join(ROOT, "content/posts"), (slug) => `/${slug}/`, (body) => `<section class="section"><div class="wrap prose">${body}</div></section>`);

// 404 page
writeFileSync(join(DIST, "404.html"), layout({
  title: "Page not found",
  path: "/404.html",
  body: `${banner("Page not found")}<div class="section"><div class="wrap prose"><p class="lede">That page isn’t here. It may have moved when the site was updated.</p><p><a class="btn" href="/">Go to the home page</a> <a class="btn btn-quiet" href="/calendar/">See the calendar</a></p></div></div>`,
}));

// Old WordPress addresses that should keep working
const redirects = [
  "/events/ /calendar/ 301",
  "/events /calendar/ 301",
  "/mec-category/:cat/ /calendar/?category=:cat 301",
  "/mec-category/:cat /calendar/?category=:cat 301",
  "/home-duplicate-1873/ / 301",
  "/community-service-bright_stars_quilts/ /wp-content/uploads/2025/04/Community-Service-bright_stars_quilts.pdf 302",
  "/feed/ /calendar.ics 302",
];
writeFileSync(join(DIST, "_redirects"), redirects.join("\n") + "\n");

// sitemap
const allPaths = [...pagePaths, ...postPaths, ...events.map((e) => `/events/${e.slug}/`)].filter((p) => !p.includes("elementor-3305"));
writeFileSync(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allPaths.map((p) => `<url><loc>${site.url}${p}</loc></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nDisallow: /admin/\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${pagePaths.length} pages, ${postPaths.length} posts, ${events.length} events into dist/`);
