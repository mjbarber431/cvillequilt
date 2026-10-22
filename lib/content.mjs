// Reads the editable content files: YAML front matter between "---" lines,
// followed by the HTML body. The online editor (static/editor/) writes the
// same format.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export function parseFile(path) {
  const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  let meta;
  try {
    meta = YAML.parse(m[1]) || {};
  } catch (err) {
    throw new Error(`${path}: the lines between the --- markers aren't valid (${err.message.split("\n")[0]})`);
  }
  return { meta, body: m[2].trim() };
}

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const yes = (v) => v === true || ["yes", "true", "y"].includes(str(v).toLowerCase());
// Dates may arrive as "2026-10-21 13:00", "2026-10-21T13:00" or "2026-10-21T13:00:00"
const dt = (v) => str(v).replace(" ", "T").replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(\.\d+)?$/, "$1");

export function loadEvents(dir) {
  return readdirSync(dir)
    .filter((f) => /\.(md|html)$/.test(f) && !f.startsWith("_"))
    .map((f) => {
      const { meta, body } = parseFile(join(dir, f));
      const slug = f.replace(/\.(md|html)$/, "");
      for (const key of ["title", "start"]) {
        if (!str(meta[key])) throw new Error(`content/events/${f}: missing "${key}:" line`);
      }
      const start = dt(meta.start);
      if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(start)) {
        throw new Error(`content/events/${f}: start must look like 2026-10-21 13:00 (got "${meta.start}")`);
      }
      const skip = Array.isArray(meta.skip) ? meta.skip : str(meta.skip).split(",");
      return {
        slug,
        title: str(meta.title),
        start,
        end: dt(meta.end) || start,
        allDay: yes(meta.allDay),
        hideTime: yes(meta.hideTime),
        repeat: str(meta.repeat),
        until: str(meta.until).slice(0, 10),
        skip: skip.map((s) => str(s).slice(0, 10)).filter(Boolean),
        category: str(meta.category),
        location: str(meta.location),
        address: str(meta.address),
        organizer: str(meta.organizer),
        organizerEmail: str(meta.organizerEmail),
        cost: str(meta.cost),
        image: str(meta.image),
        moreInfo: str(meta.moreInfo),
        registration: str(meta.registration).toLowerCase(),
        capacity: Number(meta.capacity) || 0,
        price: Number(meta.price) || 0,
        body,
      };
    });
}
