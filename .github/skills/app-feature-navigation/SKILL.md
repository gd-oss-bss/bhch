---
name: app-feature-navigation
description: Use when changing a feature in the main hub or admin page, to trace its HTML, JavaScript, and CSS together and follow existing app patterns.
---

# Navigate and change app features

1. Read `.PROJECT_NOTES.md` and identify the relevant page and existing functions before editing.
2. For the main hub, trace the element in `index.html`, its behavior and rendering in `js/main.js`, then the related styles in `css/styles.css` or `css/upcoming.css`.
3. For admin features, trace `pages/admin.html`, the corresponding handler in `js/admin.js`, and styles in `css/admin.css`.
4. Search for existing functions and shared state before adding new behavior. Extend the established flow rather than creating parallel state or handlers.
5. Keep selectors, element IDs, event handlers, and data shapes consistent across all affected files.
6. Make a focused change, then inspect the diff and run an existing targeted check if one applies. This project has no separate build step.
