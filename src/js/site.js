// Navigation, galleries, table filters, and live dates on every page.
import { occurrences, nextOccurrence } from "./recur.js";
import { loadEvents, todayIso, parts, MON, DOW, shortDate, longDate, timeRange, esc } from "./format.js";

// ---------- navigation ----------
const header = document.querySelector(".site-header");
const toggle = document.querySelector(".nav-toggle");
const subToggles = [...document.querySelectorAll(".sub-toggle")];

function closeSubmenus(except) {
  for (const b of subToggles) if (b !== except) b.setAttribute("aria-expanded", "false");
}

toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  header.classList.toggle("nav-open", open);
});

for (const b of subToggles) {
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = b.getAttribute("aria-expanded") !== "true";
    closeSubmenus(b);
    b.setAttribute("aria-expanded", String(open));
  });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".main-nav")) closeSubmenus();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = subToggles.find((b) => b.getAttribute("aria-expanded") === "true");
  closeSubmenus();
  open?.focus();
  if (header.classList.contains("nav-open")) {
    header.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }
});
// close a desktop submenu when focus leaves it
document.querySelector(".main-nav")?.addEventListener("focusout", (e) => {
  if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) closeSubmenus();
});

const onScroll = () => header.classList.toggle("is-stuck", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------- photo galleries ----------
for (const gallery of document.querySelectorAll("[data-gallery]")) {
  const buttons = [...gallery.querySelectorAll("button")];
  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.innerHTML = `<img alt=""><div class="lightbox-bar"><button type="button" data-prev>Previous</button><button type="button" data-close>Close</button><button type="button" data-next>Next</button></div>`;
  document.body.append(dialog);
  const big = dialog.querySelector("img");
  let index = 0;
  const show = (i) => {
    index = (i + buttons.length) % buttons.length;
    const img = buttons[index].querySelector("img");
    const srcset = img.getAttribute("srcset");
    big.src = srcset ? srcset.split(",").pop().trim().split(" ")[0] : img.currentSrc || img.src;
    big.alt = img.alt;
  };
  buttons.forEach((b, i) => b.addEventListener("click", () => { show(i); dialog.showModal(); }));
  dialog.querySelector("[data-prev]").addEventListener("click", () => show(index - 1));
  dialog.querySelector("[data-next]").addEventListener("click", () => show(index + 1));
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });
}

// ---------- table filter ----------
const filter = document.querySelector("[data-filter]");
if (filter) {
  const rows = [...document.querySelectorAll("[data-filterable] tbody tr")];
  const count = document.querySelector("[data-filter-count]");
  const empty = document.querySelector("[data-filter-empty]");
  const apply = () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const hit = !q || r.textContent.toLowerCase().includes(q);
      r.hidden = !hit;
      if (hit) shown++;
    }
    if (count) count.textContent = q ? `Showing ${shown} of ${rows.length}` : "";
    if (empty) empty.hidden = shown > 0;
  };
  filter.addEventListener("input", apply);
}

// ---------- live dates (pages are built ahead of time, so refresh here) ----------
const today = todayIso();
const needsEvents = document.querySelector("[data-upcoming], [data-next], [data-next-date], [data-last-day]");

if (needsEvents) {
  loadEvents().then((events) => {
    const bySlug = Object.fromEntries(events.map((e) => [e.slug, e]));

    for (const list of document.querySelectorAll("[data-upcoming]")) {
      if (list.closest("[data-calendar]")) continue; // the calendar replaces its own fallback
      const n = Number(list.dataset.upcoming) || 4;
      const end = new Date(Date.parse(today) + 120 * 86400000).toISOString().slice(0, 10);
      const items = occurrences(events, today, end).filter((o) => o.endDate >= today).slice(0, n);
      list.innerHTML = items.map(chip).join("");
    }

    for (const el of document.querySelectorAll("[data-next]")) {
      const ev = bySlug[el.dataset.next];
      const o = ev && nextOccurrence(ev, today);
      const span = el.querySelector("span");
      if (span) span.textContent = o ? `Next meeting: ${o.date === today ? "today" : shortDate(o.date)}` : "";
    }

    for (const el of document.querySelectorAll("[data-next-date]")) {
      const ev = bySlug[el.dataset.nextDate];
      const o = ev && nextOccurrence(ev, today);
      if (o) el.textContent = longDate(o.date);
    }

    const article = document.querySelector("[data-last-day]");
    if (article && article.dataset.lastDay < today) {
      article.querySelector("[data-expired]")?.removeAttribute("hidden");
      article.querySelector("#register")?.remove();
    }
  });
}

function chip(o) {
  const ev = o.event, p = parts(o.date);
  const when = [o.date !== o.endDate ? `${longDate(o.date)} - ${longDate(o.endDate)}` : "", timeRange(ev)].filter(Boolean).join(", ");
  return `<li><a class="event-chip" href="${ev.url}" data-cat="${ev.cat}">
    <span class="datebox"><span class="mon">${MON[p.m]}</span><span class="day">${p.day}</span><span class="dow">${DOW[p.dow]}</span></span>
    <span class="title">${esc(ev.title)}</span>
    <span class="when">${esc(when)}${ev.location ? `<br>${esc(ev.location)}` : ""}</span></a></li>`;
}

export { chip };
