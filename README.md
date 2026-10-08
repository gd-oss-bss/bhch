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
| `public.user_profiles` | Private profile linked to `auth.users`; users may read only their own username and role. The signup trigger assigns `user` by default, and clients cannot change roles. |

**Events compatibility:** `public.events` keeps `id` as its own autoincrement primary key with no foreign links. `supabase/schema.sql` adds a separate unique `event_id` column (autoincrement, filled from `id` for existing rows) plus `time` and `"maxParticipants"`. The client reads, saves, imports, and deletes events by `event_id`, and `event_registrations.event_id` references `events.event_id`. Run the updated SQL in Supabase before using the app's event synchronization.

**Existing registrations:** in the configured database `events.id` had a foreign key to `event_registrations.id` (`events_id_fkey`), which blocked saving events without a matching registration row. The migration drops that link (and any link from registrations to events), copies matching old registration `id` values into a new `event_id` column (foreign key to `events.event_id`), and keeps `id` as the registration's own autoincrement key. Legacy registrations that match no event keep `event_id = NULL`. It also makes `events.recurrence` nullable, since the live table required a value.

These are the tables used by the app and checked against the configured project's public API. Tables hidden from the public role may not be discoverable with the browser key.

## Setup

1. Apply `supabase/schema.sql` in the Supabase SQL Editor. It adds missing event and registration columns, provisions profiles for Auth users, updates RLS/Storage policies, and installs database functions. Existing registrations are preserved and linked to their events.
2. Set the Supabase project URL and public anon/publishable key in `js/supabase-config.js`. Never put a `service_role` key in this static site.
3. Create an administrator in Supabase Auth and assign `app_metadata.role = "admin"` in the Dashboard. Sign in again after changing the role so the new claim is in the JWT.
4. In Supabase Auth turn off Confirm email (members register without e-mail verification; the hub question is the registration gate), and set the Auth Site URL to the deployed site address.
5. Use the admin page to import `data/events.json`, `data/birthdays.json`, and `data/holidays.json` if you need to populate the database. Event imports remove omitted events and their linked registrations; birthday and holiday imports replace their full lists.

## Data and access

The public page reads shared data from Supabase and falls back to checked-in JSON when available. Visitors can still enter through the hub question. A separate member account (page pages/member.html; email/password plus the registration question) is required to add events, holidays, gallery categories, and photos; new entries are immediately public. Members can only insert these records, while administrators retain edit/delete access. Public event registration goes through a database function that checks capacity atomically. Visitors can see participant names only; contact details and registration notes are restricted to admins by RLS. Auth tokens are held in page memory and cleared on logout or page exit.

The anon/publishable key is public by design. RLS is the access boundary: authenticated members can insert events, holidays, gallery categories, and gallery photos, but only administrators can edit or delete shared records or read registration contact details. The member profile role is protected from client updates; administrator access continues to use the trusted `app_metadata.role` claim. The public registration endpoint can still be abused to fill available places; stronger anti-spam protection would require a CAPTCHA or visitor authentication.

## Project layout

```text
index.html              Main hub
admin.html              Admin entry point
pages/admin.html        Admin dashboard
js/main.js              Main page behavior
js/admin.js             Admin CRUD and Supabase Auth
js/supabase.js          Supabase REST/Auth client
js/gallery-utils.js     Shared photo thumbnail generation
js/supabase-config.js   Project URL and public key
supabase/schema.sql     Database tables, functions, and RLS policies
data/                   JSON fallback and import/export data
css/                    Application styles
gallery/                Trip gallery assets
```

There is no separate build step. GitHub Actions publishes the repository to GitHub Pages when changes are pushed to `main`.

## JSON backups

Admin backups live in the private Supabase Storage bucket `BHCH_DATA` (folder `data/`: `events.json`, `birthdays.json`, `holidays.json`). Use the **Backup to Storage** and **Restore from backup** buttons in the admin page; the live data stays in the database. Run `supabase/schema.sql` to create the admin-only Storage policies.

## Deployment and gallery

Supabase is the source of truth. The Pages workflow does not publish `data/` or `gallery/`. Gallery photos are read from the Storage bucket `BHCH_DATA` (folder `gallery/`); run `supabase/schema.sql` to allow public read of that folder only.
Member photo uploads are limited by Storage RLS to existing gallery categories; the 10 MB limit is set on the bucket, and image types (JPEG/PNG/WebP/GIF) are checked by the client only, because the bucket also holds JSON backups. The signup profile trigger reads the requested username from Auth user metadata; `user_profiles.role` is assigned by the database and is not writable from the browser.

## Hub entry questions

The hub question lives in `public.hub_questions` (question, hashed answer, description, available from/to). Manage them in the admin page; answers are stored only as bcrypt hashes and verified server-side. With no active question the hub entry is closed. Run `supabase/schema.sql` and add at least one question after the first deploy.


## Галерея

- Таблицы gallery_categories и gallery_photos (чтение публичное; участники могут только добавлять, администраторы также редактируют и удаляют).
- Файлы в приватном бакете BHCH_DATA: gallery/<category_id>/<имя> и превью gallery/<category_id>/thumbs/<имя>.jpg; превью создаётся в браузере админа.
- Зарегистрированные участники и администраторы могут создавать категории и загружать фото (JPG/PNG/WebP/GIF, до 10 МБ); изменение и удаление записей остаётся только у администраторов. Старые файлы в корне gallery/ нужно перезалить через админку.
- На главной - горизонтальная фотоплёнка по категориям, по клику оригинал грузится из Storage.
- Для работы запустить supabase/schema.sql (таблицы, RLS, политика удаления в Storage).


## Статистика

- Раздел «Статистика» внутри pages/admin.html (кнопка в шапке, повторный вход не нужен: токен админа живёт только в памяти страницы): визиты и уникальные за сегодня/7/30 дней, график по дням, объём и число файлов Storage по папкам.
- Визиты пишет главная после входа на хаб через RPC log_site_visit (таблица site_visits без прямого доступа, не чаще 1 записи на посетителя за 30 минут, хранится 400 дней). Анонимный id - случайный UUID в localStorage (uhlo_visitor_id), поэтому счёт приблизительный.
- Чтение статистики только админу: RPC get_visit_stats, get_storage_stats.
- Для работы запустить supabase/schema.sql.

Бэкап событий включает участников (имя, контакт, комментарий); при восстановлении недостающие участники добавляются без дублей. Старые бэкапы с пустым `participants` участников не вернут - нужен новый бэкап.

Счётчик «До выезда на Нёман» по умолчанию берёт дату и время события event_id = 1790676565667 из таблицы events (для ежегодного - ближайшую дату); если события нет или оно прошло - ближайшее 17 июля. Ручная дата в блоке хранится только в памяти страницы и не сохраняется (сбрасывается при обновлении).
