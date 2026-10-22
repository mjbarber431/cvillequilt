// Checks the calendar against what the old WordPress calendar showed for
// late September through October 2026. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadEvents } from "../lib/content.mjs";
import { occurrences, describeRepeat, byDay } from "../src/js/recur.js";

const events = loadEvents(fileURLToPath(new URL("../content/events", import.meta.url)));
const titlesOn = (from, to) => {
  const byDate = {};
  for (const o of occurrences(events, from, to)) (byDate[o.date] ||= []).push(o.event.title);
  return byDate;
};

test("October 2026 matches the WordPress calendar", () => {
  const got = titlesOn("2026-09-27", "2026-10-31");
  const expected = {
    "2026-09-28": ["Crozet", "Grateful Threads"],
    "2026-09-30": ["Moonlighters"],
    "2026-10-05": ["Grateful Threads", "Nelson"],
    "2026-10-12": ["Crozet", "Grateful Threads"],
    "2026-10-14": ["Moonlighters"],
    "2026-10-19": ["Grateful Threads", "Nelson"],
    "2026-10-20": ["Modern Chapter"],
    "2026-10-21": ["Textile Art Greeting Card Mini-workshop"],
    "2026-10-26": ["Crozet", "Grateful Threads"],
    "2026-10-28": ["Moonlighters"],
  };
  for (const k of Object.keys(got)) got[k].sort();
  for (const k of Object.keys(expected)) expected[k].sort();
  assert.deepEqual(got, expected);
});

test("skipped dates and end dates are honoured", () => {
  const winter = titlesOn("2025-11-01", "2026-03-31");
  // Moonlighters' evening meeting is replaced by the 5pm winter schedule
  assert.ok(!winter["2025-11-12"]?.includes("Moonlighters"));
  assert.ok(winter["2025-11-12"]?.includes("Moonlighters Fall/Winter Meetings"));
  // Nelson skipped Jan 19 2026 (holiday) while Grateful Threads still met
  assert.ok(!winter["2026-01-19"]?.includes("Nelson"));
  assert.ok(winter["2026-01-19"]?.includes("Grateful Threads"));
  // the old evening Nelson series ended Sep 2025
  const nelsonOld = occurrences(events.filter((e) => e.slug === "nelson"), "2025-09-02", "2026-12-31");
  assert.equal(nelsonOld.length, 0);
});

test("multi-day events appear on every day they span", () => {
  const got = byDay(events, "2027-01-01", "2027-01-31");
  for (const d of ["2027-01-13", "2027-01-15", "2027-01-17"]) {
    assert.ok(got[d]?.some((o) => o.event.title === "CAQG 2027 Retreat"), d);
  }
  assert.ok(!got["2027-01-18"]?.some((o) => o.event.title === "CAQG 2027 Retreat"));
});

test("repeat rules read naturally", () => {
  const by = Object.fromEntries(events.map((e) => [e.slug, describeRepeat(e)]));
  assert.equal(by.crozet, "2nd and 4th Monday of each month");
  assert.equal(by["grateful-threads"], "Every Monday");
  assert.equal(by.moonlighters, "2nd and 4th Wednesday (and 5th when there is one) of each month");
  assert.equal(by["modern-chapter-meeting"], "3rd Tuesday of each month");
});
