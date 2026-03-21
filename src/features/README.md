# Feature conventions

- Place feature code in `src/features/<feature>`.
- Recommended subfolders: `components/`, `pages/`, `hooks/`, `api/`, `styles/`, `__tests__/`.
- Keep features independent and import shared UI from `src/shared`.
- Use `@features/*` and `@shared/*` path aliases (configured in `tsconfig.json`).
