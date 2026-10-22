// The Event Calendar page: month grid or list, filterable by category.
import { byDay, occurrences } from "./recur.js";
import { loadEvents, todayIso, parts, MONTHS, MON, DOW, timeRange, longDate, esc } from "./format.js";

const root = document.querySelector("[data-calendar]");
const CATEGORIES = [
  ["chapter-meeting", "Chapter Meeting"], ["workshop", "Workshop"], ["mini-workshop", "Mini-Workshop"],
  ["fest", "Fest"], ["quilt-show", "Quilt Show"], ["sew-in", "Sew-In"], ["trunk-show", "Trunk Show"], ["retreat", "Retreat"],
];
const arrow = (d) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${d === "l" ? "M12.5 5l-5 5 5 5" : "M7.5 5l5 5-5 5"}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const today = todayIso();
const params = new URLSearchParams(location.search);
const state = {
  month: /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : today.slice(0, 7),
  view: params.get("view") || (window.matchMedia("(max-width: 760px)").matches ? "list" : "month"),
  category: params.get("category") || "",
  showPast: false,
};

function monthBounds(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const gridStart = new Date(first.getTime() - first.getUTCDay() * 86400000);
  const gridEnd = new Date(last.getTime() + (6 - last.getUTCDay()) * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { first: iso(first), last: iso(last), gridStart: iso(gridStart), gridEnd: iso(gridEnd), y, m: m - 1 };
}

function shiftMonth(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function syncUrl() {
  const q = new URLSearchParams();
  if (state.month !== today.slice(0, 7)) q.set("month", state.month);
  if (state.category) q.set("category", state.category);
  q.set("view", state.view);
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

function render(events) {
  const list = state.category ? events.filter((e) => e.cat === state.category) : events;
  const b = monthBounds(state.month);
  root.innerHTML = `
    <div class="cal-toolbar">
      <div class="cal-nav">
        <button type="button" data-go="-1" aria-label="Previous month">${arrow("l")}<span class="visually-hidden">Previous month</span></button>
        <h2 aria-live="polite">${MONTHS[b.m]} ${b.y}</h2>
        <button type="button" data-go="1" aria-label="Next month">${arrow("r")}<span class="visually-hidden">Next month</span></button>
        <button type="button" data-today>Today</button>
      </div>
      <div class="cal-filters">
        <label class="visually-hidden" for="cal-cat">Category</label>
        <select id="cal-cat">
          <option value="">All categories</option>
          ${CATEGORIES.map(([v, l]) => `<option value="${v}"${v === state.category ? " selected" : ""}>${l}</option>`).join("")}
        </select>
        <div class="view-switch" role="group" aria-label="Calendar view">
          <button type="button" data-view="month" aria-pressed="${state.view === "month"}">Month</button>
          <button type="button" data-view="list" aria-pressed="${state.view === "list"}">List</button>
        </div>
      </div>
    </div>
    <ul class="legend" aria-label="Category colors">${CATEGORIES.map(([v, l]) => `<li data-cat="${v}"><i></i>${l}</li>`).join("")}</ul>
    ${state.view === "month" ? monthView(list, b) : listView(list, b)}`;

  root.querySelectorAll("[data-go]").forEach((btn) => btn.addEventListener("click", () => { state.month = shiftMonth(state.month, Number(btn.dataset.go)); update(events); }));
  root.querySelector("[data-today]").addEventListener("click", () => { state.month = today.slice(0, 7); update(events); });
  root.querySelector("#cal-cat").addEventListener("change", (e) => { state.category = e.target.value; update(events, "#cal-cat"); });
  root.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => { state.view = btn.dataset.view; update(events, `[data-view="${state.view}"]`); }));
  root.querySelector("[data-show-past]")?.addEventListener("click", () => { state.showPast = true; render(events); root.querySelector(".agenda a")?.focus(); });
  root.querySelector("[data-jump]")?.addEventListener("click", (e) => { state.month = e.currentTarget.dataset.jump; update(events); });
}

function update(events, focusSelector) {
  state.showPast = false;
  syncUrl();
  render(events);
  if (focusSelector) root.querySelector(focusSelector)?.focus();
}

function monthView(events, b) {
  const days = byDay(events, b.gridStart, b.gridEnd);
  const cells = [];
  for (let t = Date.parse(b.gridStart); t <= Date.parse(b.gridEnd); t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const p = parts(iso);
    const out = p.m !== b.m;
    const items = (days[iso] || []).map((o) => {
      const time = timeRange(o.event);
      const past = o.endDate < today ? " past" : "";
      return `<a class="ev${past}" href="${o.event.url}" data-cat="${o.event.cat}"><b>${esc(o.event.title)}</b>${time && o.date === iso ? `<span>${esc(time.split(" - ")[0])}</span>` : ""}</a>`;
    });
    cells.push(`<div class="day${out ? " out" : ""}${iso === today ? " today" : ""}"><span class="num" aria-hidden="true">${p.day}</span><span class="visually-hidden">${DOW[p.dow]} ${MONTHS[p.m]} ${p.day}${iso === today ? " (today)" : ""}</span>${items.join("")}</div>`);
  }
  return `<div class="month">
    <div class="month-head" aria-hidden="true">${["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((d) => `<div>${d}</div>`).join("")}</div>
    <div class="month-grid">${cells.join("")}</div>
  </div>`;
}

function listView(events, b) {
  const all = occurrences(events, b.first, b.last).filter((o) => o.date >= b.first);
  const isCurrent = state.month === today.slice(0, 7);
  const occ = isCurrent && !state.showPast ? all.filter((o) => o.endDate >= today) : all;
  const earlier = all.length - occ.length;
  const pastButton = earlier ? `<p><button class="btn btn-quiet" type="button" data-show-past>Show ${earlier} earlier event${earlier > 1 ? "s" : ""} this month</button></p>` : "";
  if (!occ.length && !earlier) {
    const next = occurrences(events, b.last, shiftMonth(b.last.slice(0, 7), 24) + "-28").find((o) => o.date > b.last);
    return `<div class="agenda-empty"><p>No events in ${MONTHS[b.m]} ${b.y}${state.category ? " for this category" : ""}.</p>${next ? `<button class="btn btn-quiet" type="button" data-jump="${next.date.slice(0, 7)}">Go to ${MONTHS[parts(next.date).m]} ${parts(next.date).y}</button>` : ""}</div>`;
  }
  const groups = new Map();
  for (const o of occ) {
    if (!groups.has(o.date)) groups.set(o.date, []);
    groups.get(o.date).push(o);
  }
  return `${pastButton}<ol class="agenda">${[...groups].map(([date, items]) => {
    const p = parts(date);
    return `<li${date === today ? ' aria-current="date"' : ""}>
      <div class="datebox"><span class="mon">${MON[p.m]}</span><span class="day">${p.day}</span><span class="dow">${DOW[p.dow]}</span></div>
      <div class="items">${items.map((o) => {
        const ev = o.event;
        const bits = [o.date !== o.endDate ? `${longDate(o.date)} - ${longDate(o.endDate)}` : "", timeRange(ev), ev.location].filter(Boolean);
        const status = o.endDate < today ? " (Expired!)" : ev.registration === "sold out" ? " (Sold out!)" : "";
        return `<a class="agenda-item" href="${ev.url}" data-cat="${ev.cat}"><b>${esc(ev.title)}</b><span>${esc(bits.join(" | "))}${status}</span></a>`;
      }).join("")}</div>
    </li>`;
  }).join("")}</ol>`;
}

if (root) {
  loadEvents().then((events) => { syncUrl(); render(events); });
}
