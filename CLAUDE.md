# CLAUDE.md

**Read `AGENTS.md` in this folder first — it holds the project rules and is the canonical
instruction file.** This file only adds what is specific to working here with Claude Code.

Do not duplicate rules from `AGENTS.md` here; edit them there instead, so the two never drift.

## The short version

- Vanilla HTML + CSS + ES modules. **No npm package, no CDN, no framework.** `fetch` is enough.
- `page → service → adapter`. Pages never touch `fetch`, `localStorage` or demo data.
- Current backlog: `docs/API_INTEGRATION_PLAN.md`. One step per turn, when the user says `next`.
- `../backend/` is read-only. Report problems there; never edit them.

## Every feature must ship finished, not just wired

Section 2b of the integration plan is the acceptance criteria, and it applies to all frontend
work, not only API steps:

- Confirm dialog before anything destructive or state-changing (delete, archive, deactivate,
  close, cancel, receive, adjust, resize) — `js/ui/confirm-dialog.js`, danger tone.
- Loading state on every async call; disable the control in flight so it cannot double-submit.
- Errors: network/5xx → toast; DRF field errors → inline via `setFieldError`; 403 → explain the
  role limit; 401 → redirect to login. Always offer the next move.
- Empty states with a heading, an explanation and the allowed action.
- Responsive to ~400px: tables scroll in their wrapper, grids stack, dialogs stay reachable.

Reuse what exists rather than inventing: `js/ui/icons.js`, `toast.js`, `modal.js`,
`confirm-dialog.js`, `form-fields.js`, and the styles in `css/components.css`.

## Local run

```bash
npm run dev    # http://localhost:4173
npm test       # node tests/demo-workflow.mjs
```

The backend runs separately on `:8000` — see `AGENTS.md`.

## Deploying

This repo has two remotes. The `inventory-deploy` skill owns both commands; do not push by hand.

- `ong:deploy` → `git push origin main` (Ongshak-Tech)
- `2devs:deploy` → `git push tofaal main` (Tofaal9152, triggers the Netlify build)
