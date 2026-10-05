# BUHLOCHAT

BUHLOCHAT is a static HTML/CSS/JavaScript hub for group events, registrations, birthdays, holidays, and trip information. It uses Supabase for shared data and keeps checked-in JSON files as fallback and import/export sources.

## Supabase tables

The configured Supabase project currently exposes these application tables:

| Table | Access and purpose |
| --- | --- |
| `public.events` | Publicly readable events: `id` (own autoincrement key), `event_id` (key used by the app and registrations), `title`, `date`, `time`, `location`, `description`, `recurrence`, `"maxParticipants"`. |
| `public.birthdays` | Publicly readable birthdays; the app's expected `id`, `date`, and `name` columns are available. |
| `public.holidays` | Publicly readable holidays; the app's expected `id`, `date`, `name`, and `event_type` columns are available. |
| `public.event_registrations` | Registration records. Public access is denied; the local schema grants reads to admins, while public registration and participant names use RPC functions. |

**Events compatibility:** `public.events` keeps `id` as its own autoincrement primary key with no foreign links. `supabase/schema.sql` adds a separate unique `event_id` column (autoincrement, filled from `id` for existing rows) plus `time` and `"maxParticipants"`. The client reads, saves, imports, and deletes events by `event_id`, and `event_registrations.event_id` references `events.event_id`. Run the updated SQL in Supabase before using the app's event synchronization.

**Existing registrations:** in the configured database `events.id` had a foreign key to `event_registrations.id` (`events_id_fkey`), which blocked saving events without a matching registration row. The migration drops that link (and any link from registrations to events), copies matching old registration `id` values into a new `event_id` column (foreign key to `events.event_id`), and keeps `id` as the registration's own autoincrement key. Legacy registrations that match no event keep `event_id = NULL`. It also makes `events.recurrence` nullable, since the live table required a value.

These are the tables used by the app and checked against the configured project's public API. Tables hidden from the public role may not be discoverable with the browser key.

## Setup

1. Apply `supabase/schema.sql` in the Supabase SQL Editor. It adds missing event and registration columns, updates RLS policies, and installs database functions. Existing registrations are preserved and linked to their events.
2. Set the Supabase project URL and public anon/publishable key in `js/supabase-config.js`. Never put a `service_role` key in this static site.
3. Create an administrator in Supabase Auth and assign `app_metadata.role = "admin"` in the Dashboard. Sign in again after changing the role so the new claim is in the JWT.
4. Set the Auth Site URL and allowed redirect URLs to the deployed site address.
5. Use the admin page to import `data/events.json`, `data/birthdays.json`, and `data/holidays.json` if you need to populate the database. Event imports remove omitted events and their linked registrations; birthday and holiday imports replace their full lists.

## Data and access

The public page reads shared data from Supabase and falls back to checked-in JSON when available. Public event registration goes through a database function that checks capacity atomically. Visitors can see participant names only; contact details and registration notes are restricted to admins by RLS. Auth tokens are held in page memory and cleared on logout or page exit.

The anon/publishable key is public by design. RLS is the access boundary: only admins should be able to modify shared data or read registration contact details. The public registration endpoint can still be abused to fill available places; stronger anti-spam protection would require a CAPTCHA or visitor authentication.

## Project layout

```text
index.html              Main hub
admin.html              Admin entry point
pages/admin.html        Admin dashboard
js/main.js              Main page behavior
js/admin.js             Admin CRUD and Supabase Auth
js/supabase.js          Supabase REST/Auth client
js/supabase-config.js   Project URL and public key
supabase/schema.sql     Database tables, functions, and RLS policies
data/                   JSON fallback and import/export data
css/                    Application styles
gallery/                Trip gallery assets
```

There is no separate build step. GitHub Actions publishes the repository to GitHub Pages when changes are pushed to `main`.
