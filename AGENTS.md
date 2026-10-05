# Gym tests

Published plans stay in `docs/strictdoc/verification/tests.sdoc`. Executable work lives in `tests/`. `Requirements/Requirements.md` is not source of truth.

## Where files go

- `tests/patterns/` — reusable steps. Names are listed in `tests/patterns/registry.js`. Add a module when the first case needs that name, and import it from the case. Do not copy the helper into the case.
- `tests/cases/unit/` — `level: unit`. File name is the plan id: `TST-ROO-001.test.js`.
- `tests/cases/integration/` — `level: integration`.
- `tests/cases/system/` — `level: system`. Call `createApp()` from `backend/src/createApp.js` and `listen()` / `getText()` from `tests/support/listen.js`. Use `getText` for loopback HTTP. Do not import `backend/src/index.js`. That file runs the env gate, migrate, and the Discord bot.
- `tests/cases/acceptance/` — `level: acceptance`. Playwright specs that drive local Chromium.
- `tests/smoke/` — runner checks only. They are not plans and they are not evidence.
- `tests/results/latest.json` — run log (commit, time, pass / fail / skip per file). It is not an EVD node. Do not edit `execution_status` or `evidence_status` in the `.sdoc` files from a test run.
- `tests/results/raw/` — HTML, traces, and videos. Git ignores this directory. GitHub Actions uploads it as an artifact.

## Commands

Local unit, integration, and system (no browser):

```bash
npm test
```

Local Chromium acceptance. Install the browser once on this machine, then run the same command GitHub Actions runs:

```bash
npx playwright install chromium
npm run test:e2e
```

`npm test` and `npm run test:e2e` write `tests/results/raw/` and refresh `tests/results/latest.json`. Actions repeats those commands. It does not deploy them, and Render does not run them.

## Honesty

Pinned runners do not prove a plan. A passing smoke file is not evidence. Open musts stay open: `REQ-ROO-008`, `REQ-ROO-015`, `REQ-ROO-017`, and live Discord `REQ-ROO-026`, `REQ-ROO-029`, `REQ-ROO-030`.
