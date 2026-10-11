# Testing and Validation

Verified from `package.json`, `vite.config.ts`, `cypress.config.mjs`, and
`docs/TESTING.md` on 2026-10-10. Commands below are the repository's documented
quality gates; this initialization did not run them.

- `npm.cmd run lint`
- `npm.cmd run test.unit -- --run` (Vitest, jsdom, `src/setupTests.ts`)
- `npm.cmd run build` (TypeScript check followed by Vite production build)
- Start `npm.cmd run dev`, then run `npm.cmd run test.e2e` (headless Cypress)
- For native changes, `npm.cmd run build:android` and
  `npm.cmd run build:android:debug`; physical-device checks are required for
  background location, app lifecycle, and native sharing behavior.

The Cypress config uses `http://127.0.0.1:5173`; `docs/TESTING.md` currently
describes `http://localhost:5173`. The documented validated baseline is dated
2026-08-09 and is not a fresh run from this initialization.
