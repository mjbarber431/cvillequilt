// Expands guild events into dated occurrences. Shared by the browser
// calendar and the Node build/tests, so it has no dependencies.
//
// Dates are handled as plain calendar dates ("2026-10-26") using UTC
// arithmetic, so daylight-saving changes can never shift a meeting.

const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseDate(s) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// "2MO" -> the 2nd Monday of the month, "-1WE" -> the last Wednesday.
function nthWeekday(year, month, n, weekday) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    const d = new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
    return d.getUTCMonth() === month ? d : null;
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  const d = new Date(Date.UTC(year, month + 1, -offset + (n + 1) * 7));
  return d.getUTCMonth() === month ? d : null;
}

function parseRule(rule) {
  const out = {};
  for (const part of rule.split(";")) {
    const [k, v] = part.split("=");
    if (k) out[k.trim().toUpperCase()] = (v || "").trim().toUpperCase();
  }
  return out;
}

// Start dates of every occurrence of `ev` that overlaps [from, to].
function startDates(ev, from, to) {
  const first = parseDate(ev.start);
  const span = daysBetween(first, parseDate(ev.end || ev.start));
  const until = ev.until ? parseDate(ev.until) : null;
  const skip = new Set(ev.skip || []);
  const lo = addDays(from, -span);
  const hi = until && until < to ? until : to;
  const keep = (d) => d >= first && d >= lo && d <= hi && !skip.has(isoDate(d));

  if (!ev.repeat) return first <= to && addDays(first, span) >= from ? [first] : [];

  const rule = parseRule(ev.repeat);
  const interval = Number(rule.INTERVAL || 1);
  const dates = [];

  if (rule.FREQ === "DAILY" || (rule.FREQ === "WEEKLY" && !rule.BYDAY)) {
    const step = (rule.FREQ === "DAILY" ? 1 : 7) * interval;
    let n = Math.max(0, Math.floor(daysBetween(first, lo) / step));
    for (let d = addDays(first, n * step); d <= hi; d = addDays(d, step)) if (keep(d)) dates.push(d);
  } else if (rule.FREQ === "WEEKLY") {
    const wanted = rule.BYDAY.split(",").map((t) => DAYS[t.slice(-2)]);
    for (let d = lo > first ? lo : first; d <= hi; d = addDays(d, 1)) {
      const weeks = Math.floor(daysBetween(addDays(first, -first.getUTCDay()), d) / 7);
      if (weeks % interval === 0 && wanted.includes(d.getUTCDay()) && keep(d)) dates.push(d);
    }
  } else if (rule.FREQ === "MONTHLY") {
    const tokens = (rule.BYDAY || "").split(",").filter(Boolean);
    const startMonth = (lo > first ? lo : first);
    let y = startMonth.getUTCFullYear(), m = startMonth.getUTCMonth();
    while (Date.UTC(y, m, 1) <= hi.getTime()) {
      const monthsFromStart = (y - first.getUTCFullYear()) * 12 + (m - first.getUTCMonth());
      if (monthsFromStart % interval === 0) {
        const seen = new Set();
        const candidates = tokens.length
          ? tokens.map((t) => nthWeekday(y, m, Number(t.slice(0, -2)) || 1, DAYS[t.slice(-2)]))
          : [new Date(Date.UTC(y, m, Number(rule.BYMONTHDAY) || first.getUTCDate()))];
        for (const d of candidates) {
          if (d && !seen.has(d.getTime()) && keep(d)) { seen.add(d.getTime()); dates.push(d); }
        }
      }
      if (++m > 11) { m = 0; y++; }
    }
    dates.sort((a, b) => a - b);
  } else if (rule.FREQ === "YEARLY") {
    for (let y = first.getUTCFullYear(); y <= hi.getUTCFullYear(); y += interval) {
      const d = new Date(Date.UTC(y, first.getUTCMonth(), first.getUTCDate()));
      if (keep(d)) dates.push(d);
    }
  }
  return dates;
}

// Every occurrence overlapping the inclusive date range, sorted by start.
// Each occurrence carries its own start/end strings and a `date` key.
export function occurrences(events, fromIso, toIso) {
  const from = parseDate(fromIso), to = parseDate(toIso);
  const out = [];
  for (const ev of events) {
    const first = parseDate(ev.start);
    const span = daysBetween(first, parseDate(ev.end || ev.start));
    for (const d of startDates(ev, from, to)) {
      const date = isoDate(d);
      out.push({
        event: ev,
        date,
        endDate: isoDate(addDays(d, span)),
        start: date + ev.start.slice(10),
        end: isoDate(addDays(d, span)) + (ev.end || ev.start).slice(10),
      });
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.event.title.localeCompare(b.event.title)));
}

// Next occurrence on or after `fromIso`, searching up to ~2 years ahead.
export function nextOccurrence(ev, fromIso) {
  const to = isoDate(addDays(parseDate(fromIso), 800));
  return occurrences([ev], fromIso, to).find((o) => o.endDate >= fromIso) || null;
}

// Plain-language description of a repeat rule, e.g. "2nd and 4th Monday of each month".
export function describeRepeat(ev) {
  if (!ev.repeat) return "";
  const rule = parseRule(ev.repeat);
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ord = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", "-1": "last" };
  if (rule.FREQ === "WEEKLY" && !rule.BYDAY) return "Every " + names[parseDate(ev.start).getUTCDay()];
  if (rule.FREQ === "MONTHLY" && rule.BYDAY) {
    const groups = new Map();
    for (const t of rule.BYDAY.split(",")) {
      const day = names[DAYS[t.slice(-2)]];
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(ord[t.slice(0, -2)] || "every");
    }
    const parts = [...groups].map(([day, ns]) => {
      const list = ns.filter((n) => !(n === "last" && ns.includes("4th")));
      const extra = ns.includes("last") && ns.includes("4th") ? " (and 5th when there is one)" : "";
      return list.join(" and ").replace(/, ([^,]*)$/, " and $1") + " " + day + extra;
    });
    return parts.join("; ") + " of each month";
  }
  return "";
}

// Groups occurrences by every calendar day they cover (multi-day events
// such as the retreat appear on each of their days).
export function byDay(events, fromIso, toIso) {
  const days = {};
  for (const o of occurrences(events, fromIso, toIso)) {
    for (let d = parseDate(o.date); isoDate(d) <= o.endDate; d = addDays(d, 1)) {
      const k = isoDate(d);
      if (k >= fromIso && k <= toIso) (days[k] ||= []).push(o);
    }
  }
  return days;
}
