---
name: deployment-preflight
description: Use when preparing changes for publishing this static site through its GitHub Pages workflow.
---

# Prepare a deployment

1. Inspect `.github/workflows/static.yml` and `.PROJECT_NOTES.md` for the current publishing setup. The site has no separate build step and is published from the repository.
2. Validate changed JSON files and check that referenced paths and URLs work from their actual page locations.
3. Review changes across HTML, JavaScript, CSS, and data files for matching IDs, selectors, data shapes, and relative paths.
4. Inspect the final diff for accidental IDE files, local-only data, credentials, tokens, or other secrets. Do not modify or remove unrelated user files.
5. Run only checks already available in the repository that target the changed behavior; do not add build or test tooling solely for preflight.
6. Summarize any remaining manual browser checks or blockers without claiming they were completed.
