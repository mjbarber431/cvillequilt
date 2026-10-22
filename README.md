# cvillequilt.org

The Charlottesville Area Quilters Guild website, rebuilt from the old WordPress
site as a small static site with a Cloudflare Worker for the forms. All the
original copy, photos, PDFs and page addresses are kept.

- **Everyday editing** (events, pages, tables) is plain text files in `content/`.
- **Preview** on your own computer with one command.
- **Publish** with one command.

---

## Everyday editing

You need [Node.js](https://nodejs.org) 22.18 or newer installed once. Open a
terminal in this folder for the commands below.

### See your changes before publishing

```sh
npm run dev
```

Then open <http://localhost:8788>. The forms work in the preview too: messages
are printed in the terminal instead of being emailed. Press `Ctrl+C` to stop.

### Add or change a calendar event

Each event is one file in `content/events/`. To add one, copy a similar event
file, give it a new name (the name becomes the web address, so use lowercase
words joined with hyphens, such as `spring-workshop-2027.html`) and edit it:

```
---
title: Shimmering Triangles Workshop with Julia Graves
start: 2026-07-23 09:00
end: 2026-07-23 15:00
category: Workshop
location: Ivy Creek United Methodist Church
address: 674 Woodlands Rd, Charlottesville, VA 22901
organizer: Grateful Threads President
organizerEmail: gt@cvillequilt.org
image: /wp-content/uploads/2026/05/Shimmering-Triangles.png
---
<p>Pattern download required at <a href="https://www.etsy.com/shop/Juliasoquilts">Etsy</a>.</p>
<p>Cost is $30 and is limited to 20 participants.</p>
```

Everything between the two `---` lines is event details, one per line; below
that is the description. Lines you don't need can be left out.

| Line | What it does |
| --- | --- |
| `title` | Event name |
| `start`, `end` | `YEAR-MONTH-DAY HOUR:MINUTE`, 24-hour clock (`13:00` is 1 pm). A multi-day event like the retreat just has a later `end` date. |
| `allDay: yes` | No times shown |
| `hideTime: yes` | Hide the time (out-of-town shows) |
| `category` | One of: Chapter Meeting, Workshop, Mini-Workshop, Fest, Quilt Show, Sew-In, Trunk Show, Retreat |
| `location`, `address` | Place name and street address (adds a map link) |
| `organizer`, `organizerEmail` | Who to contact |
| `cost` | Shown in the event details, e.g. `10.00` |
| `image` | A photo shown at the top of the event |
| `moreInfo` | A "Read More" link to another website |
| `registration: open` | Shows a sign-up form on the event page (see below) |
| `capacity: 20` | Sign-ups close automatically when full |
| `price: 30` | Registrants pay online with Square before they're signed up |
| `registration: sold out` | Shows "Sold out!" |

**Repeating events** (chapter meetings) use three more lines:

| Line | Example | Meaning |
| --- | --- | --- |
| `repeat` | `FREQ=MONTHLY;BYDAY=2MO,4MO` | 2nd and 4th Monday of each month |
| | `FREQ=MONTHLY;BYDAY=3TU` | 3rd Tuesday |
| | `FREQ=MONTHLY;BYDAY=2WE,4WE,-1WE` | 2nd, 4th and last Wednesday |
| | `FREQ=WEEKLY` | every week on the start day |
| `until` | `2026-02-25` | last date the series runs |
| `skip` | `2026-01-19, 2026-11-25` | dates with no meeting (holidays) |

Day codes: `SU MO TU WE TH FR SA`. A number in front picks which one in the
month, and `-1` means the last.

**Photos and PDFs:** put new files in `static/uploads/` (for example
`static/uploads/2027/spring-flyer.pdf`) and link to them as
`/uploads/2027/spring-flyer.pdf`. Older files stay where they are in
`static/wp-content/uploads/` so links in old emails and flyers keep working.

### Change a page

Pages are in `content/pages/`. The file name matches the web address
(`quilt-show.html` is `/quilt-show/`; `services.html` is the Chapters page and
`pillowcase-challenge-duplicate-2362.html` is NICU Quilts, both named after
their original addresses). Edit the text between the HTML tags; keep the tags
themselves as they are. A few shortcuts are filled in automatically:

- `{{upcoming:4}}`: the next 4 events
- `{{next:crozet}}`: "Next meeting: …" for an event file
- `{{include:membership-form}}`: the membership form (in `content/partials/`)

Menu items and the guild's address and email are in `content/site.json`.

### Update a table (quilt shops, long-arm quilters, other guilds)

Open the page in `content/pages/`, find the row (`<tr>…</tr>`) and edit the
text inside the `<td>` cells. To add a row, copy an existing `<tr>…</tr>` line
and change it. Each cell keeps its `data-label="…"`, which is how the table
turns into tidy cards on phones.

### Publish

```sh
npm run deploy
```

This rebuilds the site, runs the checks (every link, image and PDF must exist,
and the calendar must calculate correctly), then publishes. If a check fails,
nothing is published and the message says what to fix.

### See sign-ups, applications and messages

Go to `https://cvillequilt.org/admin/` and sign in with any user name and the
admin password. Each list can be downloaded as a spreadsheet (CSV). Payments
also appear in the Square dashboard as usual.

---

## How it works

```
content/        pages, events, posts: the things you edit
static/         photos, PDFs, logo; copied as-is
src/            stylesheet and browser scripts (calendar, forms, menus)
build.mjs       turns content/ into the finished site in dist/
worker/         the small server: forms, Square, admin page, old-address redirects
dev.mjs         local preview with working forms
test/           checks run before every publish
```

- **Calendar**: events are expanded into dates in the browser (`src/js/recur.js`),
  so "next meeting" dates are always current without rebuilding. Every event also
  has an iCal file (`/events/<name>.ics`) and the whole calendar can be subscribed
  to at `/calendar.ics`.
- **Contact form**: saved to the database and emailed to `CONTACT_TO`.
- **Membership application**: the price and Square's processing fee
  (2.9% + 30¢, same formula as the old form) are calculated on the server. The
  member pays on Square's own checkout page, so the site never handles card
  numbers. When Square confirms payment, the application is marked paid and
  emailed to `MEMBERSHIP_TO`, and the member gets a confirmation. Mailed
  applications work exactly as before (print the PDF and mail a check).
- **Event registration**: for events with `registration: open`. Capacity is
  enforced, paid events go through Square, and the registrant and organizer
  both get an email.
- **Old addresses**: every WordPress page address still works, and old links
  such as `/mec-category/workshop/` and `/?method=ical&id=…` redirect to the
  new equivalents.

## One-time setup (Cloudflare)

This uses Cloudflare's `cf` command (installed by `npm install`). Sign in with
`npx cf auth login`.

1. **Database.** Create it, put the ID it prints in `cloudflare.config.ts` in place
   of `REPLACE_WITH_DATABASE_ID`, then create the tables:
   ```sh
   npx cf d1 create --name cvillequilt --primary-location-hint enam
   npx cf d1 migrations apply <DATABASE_ID> --dir worker/migrations
   ```
2. **Email.** In the Cloudflare dashboard, turn on Email Sending for
   `cvillequilt.org` (Email Service). Messages are sent from `MAIL_FROM`
   (`website@cvillequilt.org`). Until this is on, submissions are still saved
   and visible on the admin page; only the emails are skipped.
3. **Square.** In the Square Developer dashboard create an application. Put the
   **production access token** in the secrets file (below) and the **location ID**
   in `cloudflare.config.ts` (`SQUARE_LOCATION_ID`). Add a webhook subscription
   for `payment.updated` pointing at `https://cvillequilt.org/api/square/webhook`,
   and put its **signature key** in the secrets file. To test first with fake
   cards, use the sandbox token and set `SQUARE_ENV` to `sandbox`.
4. **Spam protection (optional but recommended).** Create a Turnstile widget for
   `cvillequilt.org`. The site key goes in `TURNSTILE_SITE_KEY`; the secret key
   goes in the secrets file.
5. **Secrets.** Create `secrets.json` (it is git-ignored and must never be shared):
   ```json
   {
     "ADMIN_PASSWORD": "choose a long password",
     "SQUARE_ACCESS_TOKEN": "…",
     "SQUARE_WEBHOOK_SIGNATURE_KEY": "…",
     "TURNSTILE_SECRET_KEY": "…"
   }
   ```
   and publish once with it: `npm run build && npx cf deploy --secrets-file secrets.json`.
   Later deploys keep the secrets.
6. **Domain.** In the Worker's settings add `cvillequilt.org` and
   `www.cvillequilt.org` as custom domains (only after the checklist below).

For extra protection on `/admin/` you can also put it behind Cloudflare Access.

### Before switching the domain over from WordPress

**Protect the guild's email first.** Email for every `@cvillequilt.org` address
(president, the chapters, programs, miniworkshops, service) is Google Workspace,
but the domain's DNS is currently at HostGator (as of October 2026). Moving DNS
to Cloudflare must carry these records over exactly, or that email stops:

| Type | Name | Value |
| --- | --- | --- |
| MX | `cvillequilt.org` | `1 smtp.google.com` |
| TXT | `cvillequilt.org` | `v=spf1 include:_spf.google.com ~all` |
| TXT | `cvillequilt.org` | `google-site-verification=v3OF86xbKJK42OrZqdcfPZM-6HuxA6xTwK0W0l-FMIM` |
| TXT | `google._domainkey` | the DKIM key (copy the whole value from HostGator's DNS editor) |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:cn25pavn@ag.us.dmarcian.com; ruf=mailto:cn25pavn@fr.us.dmarcian.com;` |

Cloudflare's import usually copies these automatically; compare them anyway.
When Cloudflare Email Sending is enabled it adds its own records. If it asks for
an SPF change, **add** its `include:` to the existing SPF line (one SPF record
total) rather than replacing it.

- [ ] Take a full WordPress backup (All-in-One WP Migration is already installed)
      and keep it before cancelling HostGator.
- [ ] Deploy and test everything on the `*.workers.dev` address first: the pages,
      `/mec-category/workshop/`, `/?method=ical&id=2656`, `/events/crozet` (no
      trailing slash), a missing page (should show the 404 page), `/admin/`, the
      contact form, and the $1 Square test below. Attach the domain only after that.
- [ ] Export existing workshop bookings from WordPress (Modern Events Calendar >
      Bookings) for any upcoming event; they are stored in the WordPress database
      and are not part of this site.
- [ ] Export WPForms entries (membership applications and contact messages) you want to keep.
- [ ] Do a real $1 test: temporarily set a test event's `price: 1`, register,
      pay, and confirm both emails arrive and `/admin/` shows it as paid.
- [ ] Confirm email works from the contact form.
- [ ] Review the content notes below.

### Content notes for review

The copy was kept word for word, including a few things that may be worth
fixing in `content/`:

- Home: "a **varity** of local charitable initiatives" and "501**(3)(c)**"
  (usually written 501(c)(3)); "Our Guild has **four** chapters" (five are listed).
- Long Arm Resources: "Feel **fee** to contact them".
- Merry May workshops: "You **will prompted** to pay online".
- Quilt Show page still describes the May 2026 show; Pillowcase Challenge says
  "Now collecting for 2025"; Fidget Blankets' table had a broken link plus a
  stray "12/15/2024", now shown as one working link.
- Crozet, Nelson and the Moonlighters winter schedule had no category on the old
  calendar; they're now "Chapter Meeting" so the category filter finds them.

## Checks

```sh
npm test
```

Runs the calendar tests (dates match what the old WordPress calendar showed),
the membership fee tests (matching the old form's formula for every chapter
combination), and a link check across the whole built site.
