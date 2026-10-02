---
name: troubleshooting
description: Use when diagnosing a broken page, missing data, failed interaction, or unexpected browser behavior in this static app.
---

# Troubleshoot the app

1. Reproduce the affected page and inspect browser console errors and Network requests when browser access is available.
2. Check that HTML IDs and classes match the selectors used by JavaScript and CSS.
3. Verify relative URLs from the page that makes the request: the hub is at the repository root, while the admin page is under `pages/`.
4. Trace the complete flow from the page element to its event handler, data source, and rendered output before changing code.
5. If stale browser data may override a JSON file, inspect only the relevant localStorage key (`buhlo_events_data`, `buhlo_birthdays_data`, or `buhlo_holidays_data`). Do not clear all localStorage.
6. Fix the underlying mismatch or failed request and report any browser-only behavior that could not be verified from the repository.
