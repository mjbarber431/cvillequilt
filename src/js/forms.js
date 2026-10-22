// Contact form, membership application and event registration.
// Each form posts JSON to the site's /api/ endpoints (see worker/index.js).
import { membershipTotal, dollars } from "./fees.js";
import { BASE } from "./format.js";

// `backend: false` when the site is a static preview with no server behind it.
const config = fetch(`${BASE}/api/config`)
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((c) => ({ ...c, backend: true }))
  .catch(() => ({ backend: false }));

const NO_BACKEND = "Online forms aren’t switched on in this preview yet. Please email president@cvillequilt.org instead.";

// ---------- spam protection (Cloudflare Turnstile, when configured) ----------
let turnstileReady;
function loadTurnstile() {
  turnstileReady ||= new Promise((resolve) => {
    window.onTurnstileLoad = () => resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
    s.async = true;
    document.head.append(s);
  });
  return turnstileReady;
}

config.then(async ({ turnstileSiteKey }) => {
  if (!turnstileSiteKey) return;
  const ts = await loadTurnstile();
  for (const el of document.querySelectorAll(".cf-turnstile")) ts.render(el, { sitekey: turnstileSiteKey, theme: "light" });
});

// ---------- shared helpers ----------
function setStatus(form, kind, message) {
  const box = form.querySelector(".form-status");
  box.className = `form-status ${kind}`;
  box.textContent = message;
  if (message) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clearErrors(form) {
  form.querySelectorAll(".field-error").forEach((e) => e.remove());
  form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
}

function fieldError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const p = document.createElement("p");
  p.className = "field-error";
  p.id = `${input.id || input.name}-err`;
  p.textContent = message;
  const anchor = input.closest("fieldset") || input.closest(".field") || input;
  anchor.append(p);
  input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), p.id].filter(Boolean).join(" "));
}

function validate(form) {
  clearErrors(form);
  const problems = [];
  for (const input of form.querySelectorAll("input[required], textarea[required], select[required]")) {
    if (input.closest("[hidden]")) continue;
    if (input.type === "radio") {
      if (!form.querySelector(`input[name="${input.name}"]:checked`) && !problems.some((p) => p.name === input.name)) {
        problems.push(input);
        fieldError(input, "Choose one option.");
      }
      continue;
    }
    if (!input.value.trim()) { problems.push(input); fieldError(input, "This field is required."); continue; }
    if (input.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value.trim())) {
      problems.push(input); fieldError(input, "Enter an email address like name@example.com.");
    }
  }
  if (problems.length) {
    setStatus(form, "err", problems.length === 1 ? "Please fix the highlighted field." : `Please fix the ${problems.length} highlighted fields.`);
    problems[0].focus();
  }
  return problems.length === 0;
}

function payload(form) {
  const data = {};
  for (const [k, v] of new FormData(form)) {
    if (k in data) data[k] = [].concat(data[k], v);
    else data[k] = v;
  }
  data.turnstile = data["cf-turnstile-response"] || "";
  delete data["cf-turnstile-response"];
  return data;
}

async function send(form, url, data) {
  if (!(await config).backend) throw new Error(NO_BACKEND);
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    const res = await fetch(BASE + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong on our end. Please try again, or email president@cvillequilt.org.");
    return body;
  } finally {
    button.disabled = false;
    button.textContent = label;
    window.turnstile?.reset?.();
  }
}

// ---------- contact ----------
const contact = document.querySelector('[data-form="contact"]');
contact?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate(contact)) return;
  try {
    await send(contact, "/api/contact", payload(contact));
    contact.reset();
    setStatus(contact, "ok", "Thanks, your message was sent. We’ll reply by email.");
  } catch (err) {
    setStatus(contact, "err", err.message);
  }
});

// ---------- membership application ----------
for (const form of document.querySelectorAll('[data-form="membership"]')) {
  const sections = [...form.querySelectorAll("[data-when]")];
  const chapterBoxes = [...form.querySelectorAll('input[name="chapters"]')];
  const none = form.querySelector("[data-none]");

  const showFor = () => {
    const type = form.querySelector('input[name="submission"]:checked')?.value;
    for (const s of sections) s.hidden = s.dataset.when !== type;
    setStatus(form, "", "");
  };

  const recalc = () => {
    const membership = form.querySelector('input[name="membership"]:checked')?.value;
    const chapters = chapterBoxes.filter((c) => c.checked).map((c) => c.value);
    const t = membershipTotal(membership, chapters);
    form.querySelector("[data-subtotal]").textContent = dollars(t.base);
    form.querySelector("[data-fee]").textContent = dollars(t.fee);
    form.querySelector("[data-total]").textContent = dollars(t.total);
  };

  form.addEventListener("change", (e) => {
    if (e.target.name === "submission") showFor();
    if (e.target.name === "chapters") {
      // "No Chapter Membership" and chapter choices are mutually exclusive
      if (e.target === none && none.checked) chapterBoxes.forEach((c) => { if (c !== none) c.checked = false; });
      if (e.target !== none && e.target.checked) none.checked = false;
    }
    recalc();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate(form)) return;
    if (!chapterBoxes.some((c) => c.checked)) {
      fieldError(chapterBoxes[0], "Choose at least one chapter, or No Chapter Membership.");
      setStatus(form, "err", "Please fix the highlighted field.");
      chapterBoxes[0].focus();
      return;
    }
    try {
      const data = payload(form);
      data.chapters = [].concat(data.chapters || []);
      const res = await send(form, "/api/membership", data);
      if (res.checkoutUrl) {
        setStatus(form, "ok", "Taking you to Square to pay…");
        location.href = res.checkoutUrl;
      } else {
        form.reset();
        showFor();
        setStatus(form, "ok", res.message || "Thank you! Your application was received.");
      }
    } catch (err) {
      setStatus(form, "err", err.message);
    }
  });

  showFor();
  recalc();
  if (new URLSearchParams(location.search).get("paid") === "1") {
    setStatus(form, "ok", "Thank you! Your payment went through and your membership application was received. A confirmation email is on its way.");
  }
}

// ---------- event registration ----------
const panel = document.querySelector("[data-register]");
if (panel) {
  const form = panel.querySelector("form");
  const spots = panel.querySelector("[data-spots]");
  const slug = panel.dataset.register;

  fetch(`${BASE}/api/availability?event=${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((a) => {
      if (!a || !a.capacity) return;
      if (a.remaining <= 0) {
        form.remove();
        spots.innerHTML = `<span class="status status-soldout">Sold out!</span> Email the organizer to join the wait list.`;
      } else {
        spots.textContent = `${a.remaining} of ${a.capacity} spots left.` + (Number(panel.dataset.price) ? ` Registration is $${Number(panel.dataset.price).toFixed(2)}, paid online with Square.` : "");
      }
    })
    .catch(() => {});

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate(form)) return;
    try {
      const res = await send(form, "/api/register", payload(form));
      location.href = res.checkoutUrl || `${BASE}/elementor-3305/`;
    } catch (err) {
      setStatus(form, "err", err.message);
    }
  });
}
