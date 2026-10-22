// The processing fee must match the old WordPress form exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { processingFee, membershipTotal } from "../src/js/fees.js";

// formula copied from the old site's WPForms calculation
const wordpress = (base) => Math.ceil(((base + 0.3) / (1 - 0.029) - base) * 100) / 100;

test("fee matches the WordPress formula for every combination", () => {
  const chapters = { Crozet: 5, "Grateful Threads": 10, Modern: 10, Moonlighters: 5, Nelson: 10 };
  const names = Object.keys(chapters);
  for (let mask = 0; mask < 1 << names.length; mask++) {
    const picked = names.filter((_, i) => mask & (1 << i));
    const base = 20 + picked.reduce((s, n) => s + chapters[n], 0);
    const t = membershipTotal("New Membership", picked.length ? picked : ["None"]);
    assert.equal(t.base, base * 100);
    assert.equal(t.fee / 100, wordpress(base), `chapters: ${picked.join(", ") || "none"}`);
  }
});

test("examples", () => {
  assert.equal(processingFee(2000), 91);
  assert.deepEqual(membershipTotal("Membership Renewal", ["Grateful Threads"]), { base: 3000, fee: 121, total: 3121 });
  assert.equal(membershipTotal("Not a real option", []).total, 0);
});
