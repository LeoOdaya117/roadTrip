# Shared conventions

- `src/shared/components` — presentational, reusable UI components.
- `src/shared/hooks` — shared React hooks. Export from `src/shared/hooks/index.ts`.
- `src/shared/services` — API and platform wrappers (Capacitor helpers, fetch clients).
- `src/shared/utils` — pure helper functions.
- `src/shared/types` — shared TypeScript types and aliases.
- `src/shared/styles` — global/shared CSS and variables.
- `src/shared/constants` — app constants.

Use `@shared/*` and `@features/*` path aliases for imports.
