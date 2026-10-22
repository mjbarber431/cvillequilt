// Cloudflare Worker for cvillequilt.org
//
// Serves the static site (from ./dist) and handles the few things a
// static site can't: the contact form, membership applications, event
// registration, Square payments, and a small admin page.
//
// Bindings (see README):
//   ASSETS   static files                      (required)
//   DB       D1 database, schema in migrations/ (required for forms)
//   EMAIL    send_email binding                (optional; without it, submissions are only saved)
// Settings (plain vars):  MAIL_FROM, CONTACT_TO, MEMBERSHIP_TO, TURNSTILE_SITE_KEY, SQUARE_LOCATION_ID, SQUARE_ENV
// Secrets:                ADMIN_PASSWORD, TURNSTILE_SECRET_KEY, SQUARE_ACCESS_TOKEN, SQUARE_WEBHOOK_SIGNATURE_KEY
import { membershipTotal, dollars, MEMBERSHIP, CHAPTERS } from "../src/js/fees.js";
import legacyIds from "./legacy-event-ids.json" with { type: "json" };

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (message, status = 400) => json({ error: message }, status);
const clean = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(request, env, ctx, url);
      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return await admin(request, env, url);

      // Old WordPress per-event calendar export: /?method=ical&id=2656
      if (url.searchParams.get("method") === "ical" && legacyIds[url.searchParams.get("id")]) {
        return Response.redirect(`${url.origin}/events/${legacyIds[url.searchParams.get("id")]}.ics`, 301);
      }
      // Old event-occurrence links: /events/crozet/?occurrence=2026-10-12 just open the event page
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      if (url.pathname.startsWith("/api/")) return fail("Something went wrong on our end. Please try again, or email president@cvillequilt.org.", 500);
      throw err;
    }
  },
};

// ---------- API ----------

async function api(request, env, ctx, url) {
  const route = `${request.method} ${url.pathname.replace(/\/$/, "")}`;
  switch (route) {
    case "GET /api/config":
      return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || "", payments: Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID) });
    case "POST /api/contact":
      return contact(request, env, ctx);
    case "POST /api/membership":
      return membership(request, env, url);
    case "GET /api/availability":
      return availability(env, url);
    case "POST /api/register":
      return register(request, env, ctx, url);
    case "POST /api/square/webhook":
      return squareWebhook(request, env, ctx, url);
    default:
      return fail("Not found", 404);
  }
}

async function readForm(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    throw new UserError("The form could not be read. Please reload the page and try again.");
  }
  if (clean(data.website)) throw new SpamError(); // honeypot field real people never see
  if (env.TURNSTILE_SECRET_KEY) {
    const body = new FormData();
    body.append("secret", env.TURNSTILE_SECRET_KEY);
    body.append("response", clean(data.turnstile, 4096));
    body.append("remoteip", request.headers.get("cf-connecting-ip") || "");
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const out = await res.json();
    if (!out.success) throw new UserError("Please complete the “I am human” check and try again.");
  }
  return data;
}

class UserError extends Error {}
class SpamError extends Error {}

function handleFormError(err) {
  if (err instanceof SpamError) return json({ ok: true });
  if (err instanceof UserError) return fail(err.message);
  throw err;
}

async function contact(request, env, ctx) {
  let d;
  try { d = await readForm(request, env); } catch (e) { return handleFormError(e); }
  const name = clean(d.name, 200), email = clean(d.email, 200), phone = clean(d.phone, 50), message = clean(d.message, 5000);
  if (!name) return fail("Please enter your name.");
  if (!isEmail(email)) return fail("Please enter a valid email address.");

  await env.DB.prepare("INSERT INTO contact_messages (name, email, phone, message) VALUES (?, ?, ?, ?)").bind(name, email, phone, message).run();
  ctx.waitUntil(mail(env, {
    to: env.CONTACT_TO || "president@cvillequilt.org",
    replyTo: { email, name },
    subject: `Website message from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "-"}\n\n${message || "(no message)"}\n`,
  }));
  return json({ ok: true });
}

async function membership(request, env, url) {
  let d;
  try { d = await readForm(request, env); } catch (e) { return handleFormError(e); }
  if (d.submission !== "Electronic Submission") return fail("Please choose Electronic Submission to apply online.");

  const f = {
    email: clean(d.email, 200), first: clean(d.first, 100), last: clean(d.last, 100),
    address: clean(d.address, 200), city: clean(d.city, 100), state: clean(d.state, 50), zip: clean(d.zip, 20), phone: clean(d.phone, 50),
  };
  for (const [k, label] of [["first", "first name"], ["last", "last name"], ["address", "address"], ["city", "city"], ["state", "state"], ["zip", "ZIP"]]) {
    if (!f[k]) return fail(`Please enter your ${label}.`);
  }
  if (!isEmail(f.email)) return fail("Please enter a valid email address.");
  if (!(d.membership in MEMBERSHIP)) return fail("Please choose New Membership or Membership Renewal.");
  const chapters = [].concat(d.chapters || []).filter((c) => c in CHAPTERS);
  if (!chapters.length) return fail("Please choose at least one chapter, or No Chapter Membership.");
  const picked = chapters.includes("None") ? ["None"] : chapters;

  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return fail("Online payment isn’t available right now. Please use the Mailed Submission option, or try again later.", 503);
  }

  // Price is always computed here, never trusted from the browser.
  const t = membershipTotal(d.membership, picked);
  const row = await env.DB.prepare(
    `INSERT INTO membership_applications (email, first_name, last_name, address, city, state, zip, phone, membership, chapters, base_cents, fee_cents, total_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(f.email, f.first, f.last, f.address, f.city, f.state, f.zip, f.phone, d.membership, picked.join(", "), t.base, t.fee, t.total).first();

  const chapterText = picked[0] === "None" ? "no chapter" : picked.join(", ");
  const link = await squareCheckout(env, {
    name: `CAQG ${d.membership} (${chapterText})`,
    cents: t.total,
    email: f.email,
    note: `Membership application #${row.id}: ${f.first} ${f.last}. Includes ${dollars(t.fee)} processing fee.`,
    redirect: `${url.origin}/membership-application/?paid=1`,
    key: `membership-${row.id}`,
  });
  await env.DB.prepare("UPDATE membership_applications SET square_order_id = ? WHERE id = ?").bind(link.orderId, row.id).run();
  return json({ ok: true, checkoutUrl: link.url });
}

async function loadEvent(env, url, slug) {
  const res = await env.ASSETS.fetch(new Request(`${url.origin}/events.json`));
  const events = await res.json();
  return events.find((e) => e.slug === slug);
}

const takenSql = `SELECT COUNT(*) AS n FROM registrations WHERE event_slug = ?
  AND (status IN ('registered', 'paid') OR (status = 'awaiting payment' AND created_at > datetime('now', '-30 minutes')))`;

async function availability(env, url) {
  const ev = await loadEvent(env, url, url.searchParams.get("event"));
  if (!ev) return fail("Not found", 404);
  if (!ev.capacity) return json({ capacity: 0 });
  const { n } = await env.DB.prepare(takenSql).bind(ev.slug).first();
  return json({ capacity: ev.capacity, remaining: Math.max(0, ev.capacity - n) });
}

async function register(request, env, ctx, url) {
  let d;
  try { d = await readForm(request, env); } catch (e) { return handleFormError(e); }
  const ev = await loadEvent(env, url, clean(d.event, 200));
  if (!ev || ev.registration !== "open") return fail("Registration for this event is closed.");
  const lastDay = ev.repeat ? ev.until || "9999-12-31" : ev.end.slice(0, 10);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (lastDay < today) return fail("This event has already happened.");

  const r = { first: clean(d.first, 100), last: clean(d.last, 100), email: clean(d.email, 200), phone: clean(d.phone, 50), notes: clean(d.notes, 2000) };
  if (!r.first || !r.last) return fail("Please enter your first and last name.");
  if (!isEmail(r.email)) return fail("Please enter a valid email address.");

  const dupe = await env.DB.prepare("SELECT id FROM registrations WHERE event_slug = ? AND lower(email) = lower(?) AND status IN ('registered', 'paid')").bind(ev.slug, r.email).first();
  if (dupe) return fail(`${r.email} is already registered for this event.`);

  if (ev.capacity) {
    const { n } = await env.DB.prepare(takenSql).bind(ev.slug).first();
    if (n >= ev.capacity) return fail("Sorry, this event is now full. Email the organizer to join the wait list.");
  }

  const cents = Math.round((ev.price || 0) * 100);
  if (cents > 0 && (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID)) {
    return fail(`Online payment isn’t available right now. Please email ${ev.organizerEmail || "programs@cvillequilt.org"} to register.`, 503);
  }
  const row = await env.DB.prepare(
    `INSERT INTO registrations (event_slug, event_title, first_name, last_name, email, phone, notes, amount_cents, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(ev.slug, ev.title, r.first, r.last, r.email, r.phone, r.notes, cents, cents ? "awaiting payment" : "registered").first();

  if (cents > 0) {
    const link = await squareCheckout(env, {
      name: ev.title,
      cents,
      email: r.email,
      note: `Registration #${row.id}: ${r.first} ${r.last}`,
      redirect: `${url.origin}/elementor-3305/`,
      key: `registration-${row.id}`,
    });
    await env.DB.prepare("UPDATE registrations SET square_order_id = ? WHERE id = ?").bind(link.orderId, row.id).run();
    return json({ ok: true, checkoutUrl: link.url });
  }

  ctx.waitUntil(registrationEmails(env, url, ev, { ...r, id: row.id, cents: 0 }));
  return json({ ok: true });
}

async function registrationEmails(env, url, ev, r) {
  const when = ev.repeat ? "" : `${ev.start.slice(0, 10)}${ev.allDay ? "" : " " + ev.start.slice(11, 16)}`;
  const details = `${ev.title}\n${when}\n${[ev.location, ev.address].filter(Boolean).join(", ")}\n${url.origin}${ev.url}`;
  await mail(env, {
    to: r.email,
    replyTo: ev.organizerEmail || undefined,
    subject: `You're registered: ${ev.title}`,
    text: `Hi ${r.first},\n\nThank you for signing up for a Charlottesville Area Quilters Guild event.\n\n${details}\n${r.cents ? `\nPaid: ${dollars(r.cents)}\n` : ""}\nIf you have any questions, reply to this email${ev.organizerEmail ? ` or write to ${ev.organizerEmail}` : ""}.\n`,
  });
  if (ev.organizerEmail) {
    await mail(env, {
      to: ev.organizerEmail,
      replyTo: { email: r.email, name: `${r.first} ${r.last}` },
      subject: `New registration: ${ev.title}`,
      text: `${r.first} ${r.last} <${r.email}> registered${r.cents ? ` and paid ${dollars(r.cents)}` : ""}.\nPhone: ${r.phone || "-"}\nNotes: ${r.notes || "-"}\n\nSee everyone registered at ${url.origin}/admin/\n`,
    });
  }
}

// ---------- Square ----------

async function squareCheckout(env, { name, cents, email, note, redirect, key }) {
  const host = env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const res = await fetch(`${host}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "content-type": "application/json", "square-version": "2025-01-23" },
    body: JSON.stringify({
      idempotency_key: `${key}-${crypto.randomUUID()}`,
      quick_pay: { name: name.slice(0, 255), price_money: { amount: cents, currency: "USD" }, location_id: env.SQUARE_LOCATION_ID },
      checkout_options: { redirect_url: redirect, ask_for_shipping_address: false },
      pre_populated_data: { buyer_email: email },
      payment_note: note.slice(0, 500),
    }),
  });
  const out = await res.json();
  if (!res.ok || !out.payment_link) {
    console.error("Square payment link failed", res.status, JSON.stringify(out.errors || out));
    throw new Error("Square checkout failed");
  }
  return { url: out.payment_link.url, orderId: out.payment_link.order_id };
}

// Square calls this when a payment completes. Configure the webhook in the
// Square Developer dashboard for "payment.updated" pointing at /api/square/webhook.
async function squareWebhook(request, env, ctx, url) {
  const body = await request.text();
  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) return fail("Webhook not configured", 503);
  const signature = request.headers.get("x-square-hmacsha256-signature") || "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SQUARE_WEBHOOK_SIGNATURE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${url.origin}${url.pathname}` + body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (!timingSafeEqual(expected, signature)) return fail("Bad signature", 401);

  const event = JSON.parse(body);
  const payment = event?.data?.object?.payment;
  if (!payment || payment.status !== "COMPLETED" || !payment.order_id) return json({ ok: true });

  const app = await env.DB.prepare("UPDATE membership_applications SET status = 'paid', paid_at = datetime('now') WHERE square_order_id = ? AND status != 'paid' RETURNING *").bind(payment.order_id).first();
  if (app) {
    ctx.waitUntil(Promise.all([
      mail(env, {
        to: env.MEMBERSHIP_TO || "president@cvillequilt.org",
        replyTo: { email: app.email, name: `${app.first_name} ${app.last_name}` },
        subject: `Membership paid: ${app.first_name} ${app.last_name} (${app.membership})`,
        text: membershipSummary(app),
      }),
      mail(env, {
        to: app.email,
        subject: "Your Charlottesville Area Quilters Guild membership",
        text: `Hi ${app.first_name},\n\nThank you! We received your ${app.membership.toLowerCase()} and payment of ${dollars(app.total_cents)}.\n\nChapters: ${app.chapters === "None" ? "No Chapter Membership" : app.chapters}\n\nWe look forward to seeing you at a meeting: ${url.origin}/services/\n`,
      }),
    ]));
    return json({ ok: true });
  }

  const reg = await env.DB.prepare("UPDATE registrations SET status = 'paid', paid_at = datetime('now') WHERE square_order_id = ? AND status != 'paid' RETURNING *").bind(payment.order_id).first();
  if (reg) {
    const ev = await loadEvent(env, url, reg.event_slug);
    if (ev) ctx.waitUntil(registrationEmails(env, url, ev, { first: reg.first_name, last: reg.last_name, email: reg.email, phone: reg.phone, notes: reg.notes, cents: reg.amount_cents }));
  }
  return json({ ok: true });
}

function membershipSummary(a) {
  return [
    `${a.first_name} ${a.last_name}`, a.address, `${a.city}, ${a.state} ${a.zip}`, `Email: ${a.email}`, `Phone: ${a.phone || "-"}`, "",
    `Membership: ${a.membership}`, `Chapters: ${a.chapters === "None" ? "No Chapter Membership" : a.chapters}`,
    `Membership and chapters: ${dollars(a.base_cents)}`, `Processing fee: ${dollars(a.fee_cents)}`, `Total paid: ${dollars(a.total_cents)}`,
    "", `Application #${a.id}, submitted ${a.created_at} UTC`,
  ].join("\n");
}

// ---------- email ----------

async function mail(env, { to, subject, text, replyTo }) {
  if (!env.EMAIL) {
    console.log(`[email not configured] To: ${to} | ${subject}\n${text}`);
    return;
  }
  try {
    await env.EMAIL.send({
      from: { email: env.MAIL_FROM || "website@cvillequilt.org", name: "Charlottesville Area Quilters Guild" },
      to,
      replyTo,
      subject,
      text,
    });
  } catch (err) {
    // The submission is already saved in the database, so a failed email is logged, not fatal.
    console.error("Email failed", err.code, err.message);
  }
}

// ---------- admin ----------

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  const [, password = ""] = atob(header.slice(6)).split(":");
  return timingSafeEqual(password, env.ADMIN_PASSWORD);
}

const TABLES = {
  registrations: { title: "Event registrations", sql: "SELECT id, created_at, event_title, first_name, last_name, email, phone, notes, amount_cents, status, paid_at FROM registrations ORDER BY event_slug, created_at" },
  membership: { title: "Membership applications", sql: "SELECT id, created_at, first_name, last_name, email, phone, address, city, state, zip, membership, chapters, total_cents, status, paid_at FROM membership_applications ORDER BY created_at DESC" },
  contact: { title: "Contact messages", sql: "SELECT id, created_at, name, email, phone, message FROM contact_messages ORDER BY created_at DESC" },
};

async function admin(request, env, url) {
  if (!env.ADMIN_PASSWORD) return new Response("Not found", { status: 404 });
  if (!authorized(request, env)) {
    return new Response("Sign in with any user name and the admin password.", { status: 401, headers: { "www-authenticate": 'Basic realm="CAQG admin", charset="UTF-8"' } });
  }
  const csv = url.pathname.match(/^\/admin\/(\w+)\.csv$/);
  if (csv && TABLES[csv[1]]) {
    const { results } = await env.DB.prepare(TABLES[csv[1]].sql).all();
    const cols = results.length ? Object.keys(results[0]) : [];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = [cols.map(cell).join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
    return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${csv[1]}.csv"`, "cache-control": "no-store" } });
  }

  const sections = [];
  for (const [key, t] of Object.entries(TABLES)) {
    const { results } = await env.DB.prepare(t.sql + " LIMIT 500").all();
    const cols = results.length ? Object.keys(results[0]) : [];
    const fmt = (c, v) => (c.endsWith("_cents") ? dollars(v || 0) : esc(v ?? ""));
    sections.push(`<section><h2>${t.title} <small>(${results.length})</small> <a href="/admin/${key}.csv">Download spreadsheet (CSV)</a></h2>
      ${results.length ? `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, " ").replace(" cents", ""))}</th>`).join("")}</tr></thead>
      <tbody>${results.map((r) => `<tr>${cols.map((c) => `<td>${fmt(c, r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "<p>None yet.</p>"}</section>`);
  }
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Admin – CAQG</title><style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:1.5rem;color:#1f2633;background:#f6f7f9}h1{color:#1e2f4f;margin-top:0}
h2{font-size:1.2rem;color:#1e2f4f;margin-top:2rem}h2 small{color:#666;font-weight:400}h2 a{font-size:.9rem;font-weight:400;margin-left:1rem}
.scroll{overflow-x:auto;background:#fff;border:1px solid #d5dbe5;border-radius:6px}table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid #e5e9f0;vertical-align:top;white-space:nowrap}td:last-child{white-space:normal}th{background:#eef2f7}
</style></head><body><h1>Charlottesville Area Quilters Guild: submissions</h1><p>Times are UTC. <a href="/">Back to the website</a></p>${sections.join("")}</body></html>`;
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
