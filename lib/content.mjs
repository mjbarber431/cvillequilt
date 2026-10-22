// Reads the editable content files: a "---" header of `key: value` lines,
// followed by the HTML body.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function parseFile(path) {
  const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 1 || line.trim().startsWith("#")) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

const YES = new Set(["yes", "true", "y"]);

export function loadEvents(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
    .map((f) => {
      const { meta, body } = parseFile(join(dir, f));
      const slug = f.replace(/\.html$/, "");
      for (const key of ["title", "start"]) {
        if (!meta[key]) throw new Error(`content/events/${f}: missing "${key}:" line`);
      }
      if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(meta.start)) {
        throw new Error(`content/events/${f}: start must look like 2026-10-21 13:00 (got "${meta.start}")`);
      }
      return {
        slug,
        title: meta.title,
        start: meta.start.replace(" ", "T"),
        end: (meta.end || meta.start).replace(" ", "T"),
        allDay: YES.has((meta.allDay || "").toLowerCase()),
        hideTime: YES.has((meta.hideTime || "").toLowerCase()),
        repeat: meta.repeat || "",
        until: meta.until || "",
        skip: (meta.skip || "").split(",").map((s) => s.trim()).filter(Boolean),
        category: meta.category || "",
        location: meta.location || "",
        address: meta.address || "",
        organizer: meta.organizer || "",
        organizerEmail: meta.organizerEmail || "",
        cost: meta.cost || "",
        image: meta.image || "",
        moreInfo: meta.moreInfo || "",
        registration: (meta.registration || "").toLowerCase(),
        capacity: Number(meta.capacity) || 0,
        price: Number(meta.price) || 0,
        body,
      };
    });
}
