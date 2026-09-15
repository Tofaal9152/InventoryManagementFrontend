# Agent Instructions - Components Inventory Management System

## Start Here

The frontend UI is built and deployed. The work in progress is wiring it to the Django backend.

Read before changing code:

1. `docs/API_INTEGRATION_PLAN.md` - **the current backlog**: 14 ordered steps, the UX acceptance
   criteria every step must meet, the progress log, and the resume protocol for a cold session.
2. `docs/bruno/` - the backend API spec, one file per endpoint with a real example response.
   Read only the files for the step in hand; the collection is large.
3. `docs/api-changes/` - dated changelogs of what the backend added, changed or removed.

Refresh the spec with the `api-sync` skill (`node .claude/skills/api-sync/sync.mjs`); it mirrors
the collection and writes a changelog. It never edits frontend code.

## The Backend Is Read-Only

`../backend/` belongs to another repo and another owner. Read its source, `docs/API.md` and
Bruno collection; run its server. **Never edit, fix or commit anything inside it.** If something
there is wrong, report it and let the user decide. Absorb API shape differences on this side with
mappers, never by asking for a backend change.

Run it locally with:

```bash
cd ../backend && source venv/bin/activate && cd server && python manage.py runserver   # :8000
npm run dev                                                                            # :4173
```

## User Workflow

- Do **not** start a new step until the user says `next` (or names the step).
- Work on exactly one step at a time unless the user explicitly expands the scope.
- At the end of a step, tick its box in `docs/API_INTEGRATION_PLAN.md` and append to the progress
  log: date, step, files changed, verification performed, decisions taken.
- If a decision conflicts with the SRS or earlier instructions, state the conflict before making
  a product-changing assumption.

## Non-Negotiable Technical Rules

- Use only **HTML, custom CSS and vanilla JavaScript ES modules** for the frontend.
- Do not use React, Vue, Angular, jQuery, Tailwind CDN, Bootstrap, a JavaScript UI framework, canvas, WebGL or 3D rendering.
- The interface must be lightweight for a Raspberry Pi and work without external CDN dependencies.
- Use clean routes such as `/inventory` and `/audit-log`, not hash routes. Configure the local/static/Django server to return the frontend entry point for direct route loads.
- Keep source files small and purpose-specific. Do not place all CSS or JavaScript in one file.
- Do not use inline JavaScript event handlers or inline CSS styles.

## Required Architecture

Use this direction unless a user-approved change requires otherwise:

```text
Page -> service -> API adapter or demo store
```

- Pages render UI and handle user interaction.
- Services expose domain operations such as `listComponents`, `assignDrawer`, `takeStock` and `createProject`.
- The demo store owns seeded `localStorage` data during frontend-only work.
- API adapters own `fetch`, URL construction, error mapping, headers and Django CSRF handling for backend mode.
- Pages must never access `localStorage`, demo data or `fetch` directly.
- Reusable UI must live in `js/ui/` and reusable styling in `css/components.css` or a focused component stylesheet.

## Product Behaviour to Preserve

- **Library** is the master component catalog.
- **Inventory** assigns Library components to cabinet drawers and manages stock.
- Drawer labels shown in the grid use `A1`, `B1`, `A2`, etc. Keep separate drawer and section/chamber fields internally for later subdivision support.
- A drawer/chamber can hold only one component type. A component may exist in more than one drawer.
- Drawer click selects it, gives a minimal 2D open-left/selected state, and loads the right-side detail panel.
- Empty drawer: show Assign from Library.
- Occupied drawer: show component, quantity, state and permitted Add/Take/Return/Transfer actions.
- Project tagging for Take is optional. Only active projects are selectable.
- Stock state colours: empty grey, stocked green, low stock amber, zero-quantity assigned red.
- All stock mutations create an immutable movement record.
- Enforce frontend validation, but treat the backend as the final authority for permissions and data integrity.

## UI and Performance Standards

- Create an original, clean 2D UI; demo images are interaction references only.
- Prefer CSS Grid and Flexbox, native controls, system fonts, local/compressed images and small SVG icons.
- Use only subtle CSS transitions on `opacity` and `transform`; respect `prefers-reduced-motion`.
- Avoid unnecessary DOM rebuilding. Update only the affected drawer/detail area after an action.
- Provide keyboard focus, labels, empty states, loading states, error states, modal focus management and visible form errors.
- Test desktop and tablet layouts after each visual step.

## Demo Data and Validation

- Demo data must be realistic and persist in `localStorage`.
- Provide Reset Demo Data.
- Include empty, stocked, low-stock and zero-quantity drawers.
- Validate required fields, positive quantities, stock availability, compatible units, active projects, unique MPN when supplied and drawer occupancy.
- Never allow a different component into an occupied drawer or a Take/Transfer that exceeds source quantity.

## Handoff Requirements

After each step, report:

1. What was completed.
2. Files added/changed.
3. Verification performed and outcome.
4. Any unresolved decision.
5. The next numbered plan step, without starting it.
