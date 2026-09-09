# Agent Instructions - Components Inventory Management System

## Start Here

Read these files before changing code:

1. `documents/IMPLEMENTATION_PLAN.md` - the product plan, route map, technical structure and progress log.
2. `documents/content/SRS-Components-Inventory-Management-System (1) (1).pdf` - formal requirements.
3. `documents/demoimages/` - UI interaction reference only. Do not reproduce the supplied design.

The project has not started implementation. Always continue from the first unfinished step in the Progress Log of `documents/IMPLEMENTATION_PLAN.md`.

## User Workflow

- Do **not** start a new implementation step until the user explicitly says `next step` or clearly asks for that named step.
- Work on exactly one plan step at a time unless the user explicitly expands the scope.
- At the end of a completed step, update `documents/IMPLEMENTATION_PLAN.md` Section 11 with completion date, exact changed files, verification, decisions and the recommended next step.
- If a decision conflicts with the SRS or earlier instructions, state the conflict before making a product-changing assumption.

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
