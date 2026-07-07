---
title: Verification & visual testing
description: How each platform is exercised — unit tests, Playwright across web and WebKit, Electron via CDP, and live production checks.
---

The project's rule is to **verify in the running app**, not just in tests. Each
platform has a path that actually exercises it.

## Quality gates

Four gates must pass on every change:

```bash
bun run typecheck   # tsc --noEmit
bun run lint        # eslint
bun run test        # vitest run (unit; excludes e2e/)
bun run test:e2e    # playwright
```

:::caution[Use `bun run test`, not `bun test`]
`bun test` invokes Bun's built-in runner, which has no jsdom environment and
wrongly picks up the Playwright specs in `e2e/` — producing spurious
`document is not defined` failures. The real suite runs through Vitest.
:::

## Per-platform verification

- **Web** is verified continuously in-browser and against real Safari.
- **Electron** is driven via the Chrome DevTools Protocol — the shell, theming,
  settings, and real `.md` files in `~/Documents/Mac Markdown` are checked end to
  end. (A StrictMode double-seed race in `loadLibrary` was found and fixed this
  way, with a regression test.)
- **iOS** builds are kept green and exercised in the Simulator; device-only
  concerns (keyboard geometry, share-sheet export, on-device sync) are checked on
  real hardware.

## Cloud sync, verified live

The sync feature was validated against **production**, not mocks: a 20-check curl
contract suite (201/409/401/403/404/412/CORS), a full client-stack round-trip with
real scrypt/AES against the live S3 bucket, and two-device browser round-trips (one
device enables sync, another links by code and pulls the note). A wrong-passphrase
attempt surfaces a friendly "that passphrase doesn't match this vault" rather than a
raw crypto error. Test vaults are purged from the bucket afterward.
