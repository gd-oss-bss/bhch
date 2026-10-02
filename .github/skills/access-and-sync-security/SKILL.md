---
name: access-and-sync-security
description: Use when changing hub or admin access, password handling, browser storage, or API synchronization.
---

# Handle access and synchronization safely

1. Treat all client-side HTML and JavaScript as public. Client-side checks and XOR obfuscation are not security boundaries.
2. Never add passwords, tokens, answers to control questions, or other secrets to source code, documentation, logs, or commits.
3. The hub's optional remembered-access setting stores only a local browser flag. Do not describe it as secure authentication or store the answer/password in localStorage.
4. Admin authentication currently exists only in page memory. Do not persist admin passwords or authenticated state in localStorage or cookies.
5. For real authorization or secret protection, use a server-side service; do not attempt to secure secrets by encoding or obfuscating them in frontend code.
6. When synchronizing with a backend, use the configured `window.BUHLO_API_URL` proxy. Never put a GitHub token or other privileged credential in browser code.
7. Preserve existing behavior unless the requested change explicitly changes it, and explain any security limitation relevant to the implementation.
