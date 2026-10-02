---
name: data-management
description: Use when editing events, birthdays, holidays, or browser-persisted app data, including JSON imports and exports.
---

# Manage app data

1. Read `.PROJECT_NOTES.md` and inspect the relevant loader, renderer, and admin import/export code before changing data formats.
2. Events in `data/events.json` may be an array or an object containing an `events` array. Preserve event fields: `id`, `title`, `date`, `time`, `location`, `description`, `participants`, and `maxParticipants`.
3. Birthdays use `{ "birthdays": [{ "date": "YYYY-MM-DD", "name": "..." }] }`. Admin edits may first live in the `buhlo_birthdays_admin_draft` localStorage draft; export the draft when a deployable JSON file is needed.
4. Holidays use an object containing a `holidays` array, with dates in `MM-DD` format.
5. When changing a schema or loader, check the matching render path, import/export path, and localStorage cache. Existing browser data can take precedence over JSON files.
6. Preserve unrelated localStorage values. Clear or migrate only the specific keys affected by the change; never reset all browser storage.
7. Validate edited JSON with an available existing command or parser.
