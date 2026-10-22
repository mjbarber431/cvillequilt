-- Database for form submissions (Cloudflare D1).
-- Apply with: cf d1 migrations apply cvillequilt --dir worker/migrations  (see README)

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT
);

CREATE TABLE IF NOT EXISTS membership_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  phone TEXT,
  membership TEXT NOT NULL,
  chapters TEXT NOT NULL,
  base_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting payment',
  square_order_id TEXT,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  event_slug TEXT NOT NULL,
  event_title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  square_order_id TEXT,
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS registrations_event ON registrations (event_slug, status);
CREATE INDEX IF NOT EXISTS membership_order ON membership_applications (square_order_id);
CREATE INDEX IF NOT EXISTS registrations_order ON registrations (square_order_id);
