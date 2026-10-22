// Small helpers shared by the browser scripts.

// Set when the site is served from a sub-folder (a preview copy); "" on cvillequilt.org.
export const BASE = document.querySelector('meta[name="base-path"]')?.content || "";
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MON = MONTHS.map((m) => m.slice(0, 3));
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Today's date in Charlottesville, as "YYYY-MM-DD".
export function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function parts(iso) {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), dow: d.getUTCDay() };
}

export function fmtTime(t) {
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

export function timeRange(ev) {
  if (ev.allDay) return "All Day";
  if (ev.hideTime) return "";
  return `${fmtTime(ev.start.slice(11, 16))} - ${fmtTime(ev.end.slice(11, 16))}`;
}

export function shortDate(iso) {
  const p = parts(iso);
  return `${DOW[p.dow]}, ${MON[p.m]} ${p.day}`;
}

export function longDate(iso) {
  const p = parts(iso);
  return `${MON[p.m]} ${String(p.day).padStart(2, "0")} ${p.y}`;
}

export function esc(s = "") {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

let eventsPromise;
export function loadEvents() {
  eventsPromise ||= fetch(`${BASE}/events.json`).then((r) => (r.ok ? r.json() : []));
  return eventsPromise;
}
