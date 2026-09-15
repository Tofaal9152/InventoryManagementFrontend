# API Integration Plan — frontend ⇄ MaterialsInventoryBackend

Status: **All 14 steps done (2026-09-15).** The app runs against the backend; `?mode=demo` still switches to the seeded store. Work one step at a time, in order, only when the user says `next`.

This file is the single source of truth for integration progress. Any agent (Claude Code or
Codex) can resume from it without re-reading the whole conversation — see **Resume protocol**.

---

## 1. Context

**Frontend** — vanilla ES modules, no build step, no packages. Served by `server.js` on
`http://localhost:4173`. Architecture is already `page → service → adapter`:

- `js/pages/*.js` — render UI, call services only. **Never edit these for data plumbing.**
- `js/services/*.js` — domain operations. Each already has an `APP_CONFIG.mode === 'demo'`
  branch and an unfinished non-demo branch. **This is where the work happens.**
- `js/api/client.js` — `apiRequest()` + `ApiRequestError` (status + field errors). Written for
  cookie/CSRF auth; needs a JWT layer.
- `js/data/demo-store.js` — seeded localStorage demo data. Stays as the fallback for `mode: 'demo'`.
- `js/config.js` — `APP_CONFIG.apiBaseUrl` (`/api`) and `APP_CONFIG.mode` (`demo`).

**Backend** — Django REST Framework on `http://localhost:8000`, JWT auth, `CORS_ALLOW_ALL_ORIGINS`
is on, so no proxy is needed in dev. Every endpoint requires login except login/refresh/verify/
registration.

**Specs** — `docs/bruno/` (113 `.bru` files, mirrored from the backend repo; each carries a real
example response) and `backend/docs/API.md`. Read only the files for the step in hand.

**Roles** — `ADMIN`, `MANAGER`, `STAFF`, returned by `POST rest-auth/login/` as `role`.

| Capability | Admin | Manager | Staff |
|---|---|---|---|
| Users, audit log | ✅ | ❌ | ❌ |
| Cabinet/drawer configuration | ✅ | ❌ | ❌ |
| Categories, units, components, import/export | ✅ | ✅ | read only |
| Add / transfer stock, edit + delete stock entries | ✅ | ✅ | ❌ |
| Take / return stock | ✅ | ✅ | ✅ |
| Adjust stock | ✅ | ❌ | ❌ |
| Projects | ✅ | ✅ | read only |
| Requisitions: raise | ✅ | ✅ | ✅ |
| Requisitions: transition / receive | ✅ | ❌ | cancel own pending only |
| Reports | all | all | dashboard + movements + user-activity, own records only |

---

## 2. Ground rules

1. **Vanilla only.** No npm package, no CDN, no framework — see `AGENTS.md`. `fetch` is enough.
2. **Pages stay untouched.** If a page needs editing to make data flow, the mapper is wrong.
3. **Mappers are the boundary.** DRF speaks `snake_case` + `{count, next, previous, results}`.
   The UI speaks `camelCase` + computed fields (`stockState`, `stockLabel`, `partNumber`).
   Convert once, in `js/api/mappers/`. **No raw DRF object may escape a service.**
4. **Keep demo mode working.** Every service keeps its `mode === 'demo'` branch. `mode: 'live'`
   selects the API. This is the rollback path when a step goes wrong.
5. **Server is the authority.** Client-side role checks only hide UI; a 403 must still be handled.
6. **Trailing slashes are mandatory** on every Django path.
7. **One step per session.** Finish it, verify it, log it, stop. Do not start the next step.
8. **Never ship bare API wiring.** Section 2b is part of every step's definition of done.

---

## 2b. UX requirements — acceptance criteria for every step

A step is not finished when the request succeeds. It is finished when the screen behaves like a
finished product. These apply to **every** step; do not defer them to a polish pass.

**Confirm before anything destructive or state-changing.** Use the existing
`js/ui/confirm-dialog.js`, state what will happen in the dialog, and only send the request on
confirm. Applies to: delete (component, category, unit, stock entry, project), archive/restore,
user deactivate/reactivate, project close/reopen, requisition cancel/reject/receive, stock
adjust, cabinet resize (say how many drawers are affected), and reset demo data. Destructive
confirms use the danger tone.

**Loading states.** Every fetch shows one: skeleton or `state-panel` for a page load, disabled
button with in-flight wording for a submit, inline spinner-free text for a row action. Never
leave a dead screen, and never let a double-click fire two requests — disable the control while
in flight.

**Error states.** Network or 5xx → a toast that says what failed and stays dismissible. DRF
field errors (`{field: [msg]}`) → inline under that field via `setFieldError`, never a toast.
403 → explain it is a permission limit for the signed-in role, not a bug. 401 → clean redirect
to login, no error spam. Every error state offers the next move (retry, go back, sign in).

**Empty states.** Zero rows is not an empty table: heading, one-line explanation, and the action
that fixes it when the role is allowed to take it — the icons and `state-panel` markup already
exist for this.

**Responsive.** Everything works down to ~400px, following the mobile work already done: tables
scroll inside `library-table-wrap`, grids stack, dialogs and their action rows stay reachable,
touch targets stay ~44px.

**Keep the existing conventions.** Icons via `js/ui/icons.js`, feedback via `js/ui/toast.js`,
modals via `js/ui/modal.js`, focus management and labels as `AGENTS.md` requires. Anything new
and reusable goes in `js/ui/`, its styling in `css/components.css`.

---

## 3. Model reconciliation — **decided in Step 6 (2026-09-15)**

The demo model and the backend model disagree. These are the known gaps:

| Frontend (demo) | Backend | Resolution |
|---|---|---|
| Many cabinets, cabinet groups | **One** cabinet (`GET/PUT inventory/cabinet/`) | Treat as a single cabinet; keep the list shape with one entry so pages don't change. |
| `drawer.sectionCount` | `drawer.chamber_count` (1–9), chambers are addressable | Map `chamber_count → sectionCount`; chamber-level stock is the real unit. |
| `assignComponentToDrawer()` | No assign endpoint | Assignment = `POST inventory/stock/add/` with `component` + `location`. |
| `createCabinet({name, groupId, rows, columnCount})` | `PUT inventory/cabinet/` creates or resizes | Rename in the service, not in the page. |
| Drawer codes `A1`, `B2` | Chamber `location` codes (QR targets) | Confirm the exact code format from `docs/bruno/inventory/` before writing the mapper. |

**The decision:** the grid stays a grid of **drawers**, because that is the cabinet's physical
shape. A single-chamber drawer renders exactly as before. A drawer with several chambers shows
the most urgent chamber's state plus "2/3 chambers", and clicking it lists the chambers in the
side panel; choosing one opens the normal stock panel for that chamber, with a link back to the
list. Chamber codes (`A11`) are what the stock endpoints address, so Step 7 sends the chamber's
code, never the drawer's.

If a mismatch found later cannot be absorbed by a mapper, **stop and ask** rather than editing pages.

---

## 4. Steps

Each step: do the work → verify → tick the box → append to the Progress Log → stop.

### Step 1 — API foundation
- `js/config.js`: `apiBaseUrl: 'http://localhost:8000/'`, add `mode: 'live'` switch (keep `demo`).
- `js/api/client.js`: `Authorization: Bearer`, 401 → refresh once → retry, `FormData` passthrough
  (no `Content-Type`, no `JSON.stringify`), unwrap `{count, results}` → `{items, total}`, map DRF
  `{field: [msg]}` into `ApiRequestError.fields`, drop the CSRF path.
- New `js/api/tokens.js`: get/set/clear access + refresh + role in `localStorage`.
- **Done when:** `apiRequest('reports/dashboard/')` returns 401 without a token and data with one.

### Step 2 — Login, logout, session guard
- New `js/pages/login-page.js` + route `/login`; `POST rest-auth/login/`; store tokens + role.
- Logout in the sidebar footer: `POST rest-auth/logout/` with `refresh`, clear storage.
- Guard: any 401 that survives refresh → clear session, redirect to `/login`.
- **Done when:** all three demo users (admin / manager / staff) can log in and out, reload keeps session.

### Step 3 — Role-aware shell
- Expose the stored role; hide Settings / Users / Audit log nav for non-Admin; hide Add/Transfer/
  Adjust for Staff; render Library and Projects read-only for Staff.
- **Done when:** each role sees only its own actions, and a forced 403 still shows a clean toast.

### Step 4 — Library read
- `component-service.js`: `listComponents` (filters `category`, `unit`, `stock_status`, `search`,
  pagination), `getComponent`, `getComponentDetails`, `getComponentReferenceData`
  (`library/categories/`, `library/units/`).
- New `js/api/mappers/library.js`.
- **Done when:** `/library` lists live components with working search, filters and pagination.

### Step 5 — Library write
- `saveComponent` (POST + PATCH), archive/restore, category and unit CRUD, category reassign.
- Field errors from DRF surface through the existing `setFieldError`.
- **Done when:** create/edit/archive round-trip and a duplicate part number shows a field error.

### Step 6 — Inventory read (model reconciliation)
- `inventory-service.js`: `getInventoryWorkspace`, `listCabinets`, `getCabinet` from
  `inventory/cabinet/`, `inventory/drawer-map/`, `inventory/drawers/`, `inventory/chambers/`.
- Apply Section 3 decisions; record the chosen mapping in the Progress Log.
- **Done when:** the 2D grid, filter chips and drawer panel render live data unchanged.

### Step 7 — Inventory write
- `addStock`, `takeStock` (optional `project`), `returnStock`, `transferStock`, adjust (Admin),
  `assignComponentToDrawer` → `stock/add/`, stock-entry note edit and delete.
- **Done when:** each operation updates the grid and appears in `inventory/movements/`.

### Step 8 — Administration: cabinet, categories, units
- `administration-service.js`: `getAdministrationData`, `updateCabinetDimensions` → `PUT
  inventory/cabinet/`, drawer `chamber_count` → `PATCH inventory/drawers/<id>/`.
- **Moved here from Step 5:** category and unit CRUD (`library/categories/`, `library/units/`,
  `categories/<id>/reassign/`). The Settings tables are read-only today, so this needs new UI —
  create/edit modals and delete with a confirm dialog — which belongs with the other admin screens.
- **Done when:** resize succeeds, and a blocked shrink shows the server's reason.

### Step 9 — Projects
- `project-service.js`: list (filters `status`, `search`), create, detail, close/reopen.
- **Done when:** `/projects` and project detail run live; closed projects are unselectable for Take.

### Step 10 — Requisitions
- `requisition-service.js`: list, create (library component **or** free-text part), detail,
  `transition/`, `receive/`. Replace the local `getAllowedRequisitionStatuses` with the server's
  `allowed_transitions`.
- **Done when:** the full lifecycle works and Staff can only cancel their own pending requisition.

### Step 11 — Dashboard and reports
- `report-service.js`: `reports/dashboard/`, `current-stock/`, `low-stock/`, `movements/`,
  `project-consumption/`, `requisition-status/`, `drawer-utilisation/`, `user-activity/`.
- **Done when:** `/dashboard` and `/reports` are live and a Staff login sees only its own movements.

### Step 12 — Users and audit log (Admin)
- `administrator/users/` CRUD, deactivate/reactivate, send-password-reset, `administrator/audit-logs/`.
- **Done when:** `/settings/users` and `/audit-log` are live with working filters.

### Step 13 — Uploads and exports
- Component image via `POST upload/` (multipart). Export/import buttons currently marked
  "placeholder" → `library/components/export/`, `library/import/template|preview|commit/`,
  `inventory/stock-entries/export/`, `inventory/import/*`, `inventory/labels/`.
- **Done when:** an uploaded image renders, and an export downloads a real file.

### Step 14 — Cleanup
- Default `mode` to `live`, keep `demo` switchable; loading/empty/error states on every page;
  remove dead demo-only code paths that no longer compile; full manual pass over all routes.
- **Done when:** every route works end-to-end against a fresh database.

---

## 5. Verification per step

Backend must be running:

```bash
cd backend && source venv/bin/activate && cd server && python manage.py runserver
cd frontend && npm run dev          # http://localhost:4173
```

Every step: exercise it in the browser as **each affected role**, watch the Network tab for
4xx/5xx, confirm no page file was edited for data reasons, and confirm `mode: 'demo'` still runs.

Then walk the Section 2b checklist for the screens the step touched:

- [ ] Every destructive / state-changing action asks for confirmation first
- [ ] Loading state on every fetch; controls disabled in flight; no double submit
- [ ] Errors handled: network, 4xx field errors inline, 403 explained, 401 → login
- [ ] Empty state with a heading, an explanation and the allowed next action
- [ ] Works at ~400px — no horizontal page scroll, dialogs and buttons reachable
- [ ] Keyboard focus, labels and focus return after a dialog closes

A step with an unticked box is not done.

---

## 6. Resume protocol (read this first if you are picking up cold)

1. Read this file top to bottom. The first step whose box is unticked is the next step.
2. Read `AGENTS.md` for the project's non-negotiable rules.
3. Read only the `docs/bruno/` files for that step — the collection is large and reading it whole
   wastes context for no gain.
4. Do that one step, verify it, tick it, append to the Progress Log, stop.
5. Do not re-run `api-sync` to find out what is outstanding; this plan is the backlog.

Progress checklist:

- [x] Step 1 — API foundation
- [x] Step 2 — Login, logout, session guard
- [x] Step 3 — Role-aware shell
- [x] Step 4 — Library read
- [x] Step 5 — Library write (components; category/unit CRUD moved into Step 8)
- [x] Step 6 — Inventory read
- [x] Step 7 — Inventory write
- [x] Step 8 — Administration: cabinet, categories, units
- [x] Step 9 — Projects
- [x] Step 10 — Requisitions
- [x] Step 11 — Dashboard and reports
- [x] Step 12 — Users and audit log
- [x] Step 13 — Uploads and exports
- [x] Step 14 — Cleanup

---

## 7. Progress log

**Correction (2026-09-15, found while seeding demo data):** the server's
`allowed_transitions` is **status-based, not reader-based** — it lists every move the
current status permits, for any signed-in user. Step 10's note claimed it was scoped to
the reader; it is not. `getAllowedRequisitionStatuses()` now narrows the server's list to
what the transition endpoint will actually accept: Admins keep all of it, the requester
keeps only `Cancelled` on their own pending requisition, everyone else gets nothing. The
server remains the authority, and a 403 is still handled.



Append one entry per completed step: date, step, files changed, verification performed,
decisions taken, next step.

| Date | Step | Files changed | Verified | Decisions |
|---|---|---|---|---|
| 2026-09-15 | 14 — Cleanup | `js/config.js`, `package.json`, `js/services/inventory-service.js`, `js/pages/reports-page.js`, `tests/demo-workflow.mjs` | `npm test` green; all 37 modules import cleanly; every CSS file balanced; all 14 routes serve 200 from the dev server; no stray debug output | **`mode` now defaults to `live`.** There is no `.env` in the frontend and cannot be — no build step means nothing can inject a variable — so both settings resolve at load instead: `?mode=demo` or `localStorage['inventory.mode']` switches back to the seeded store, and `INVENTORY_MODE=demo` pins demo mode for the Node test run (`npm test` sets it). `apiBaseUrl` resolves the same way: a `localStorage['inventory.apiBaseUrl']` override, else `localhost:8000` when served locally, else same-origin `/api/` so a deployment can proxy without editing this file. Last live dead end closed: `createCabinet` now PUTs the cabinet instead of throwing. Added the missing empty row to the current-stock report. |
| 2026-09-15 | 13 — Uploads and exports | `js/services/file-service.js`, `js/ui/import-modal.js` (new); `js/services/component-service.js`, `js/ui/component-modal.js`, `js/pages/library-page.js`, `js/pages/administration-page.js`, `css/pages/administration.css`, `tests/demo-workflow.mjs` | `npm test` green; modules import cleanly; `upload/`, both exports, the import template, import preview and the label sheet all called live and answered 401 without a token; import modal rendered and reviewed | **The Step 5 debt is paid:** picking an image now uploads the raw file to `POST upload/` and stores the returned URL on `image_url`, so no data URL is ever sent. Exports go through `?export=` (DRF reserves `?format=`) and carry the filters on screen, so you download what you are looking at; the filename comes from `content-disposition`. The three admin placeholders are real now: a two-step import (check file → summary of create/update/rejected with reasons → commit behind a confirm), two exports, and the label sheet opened in a new tab. Demo mode keeps the old placeholders, since none of these exist without a backend. **Note:** the upload endpoint needs `TRANSFER_ONGSHAK_API_KEY` in the backend `.env`, which is currently blank — uploads will fail server-side until it is set. |
| 2026-09-15 | 12 — Users and audit log | `js/api/mappers/administration.js`, `js/services/user-service.js`, `js/ui/user-modal.js` (new); `js/services/administration-service.js`, `js/pages/administration-page.js`, `css/components.css`, `tests/demo-workflow.mjs` | `npm test` green with 17 assertions (role codes both ways, nameless user fallback, audit change flattening, system event with no actor); modules import cleanly; users list, create, deactivate, send-password-reset and audit-logs called live and answered 401 without a token; users table rendered and reviewed | The Settings users table gained the UI it never had: New user, per-row Edit, Reset password and Deactivate/Reactivate, each behind a confirm that says what actually happens — deactivating keeps movements and audit trail, a reset email leaves the old password working until used. Users are never deleted, because the backend has no such endpoint by design. Audit `changes` are flattened into one readable line (`status: ORDERED → RECEIVED`), capped at three fields with a '+N more' tail. A non-Admin's 403 on the user list leaves the rest of Settings working. |
| 2026-09-15 | 11 — Dashboard and reports | `js/api/mappers/reports.js` (new); `js/services/report-service.js`, `js/pages/dashboard-page.js`, `js/pages/reports-page.js`, `css/pages/overview.css`, `tests/demo-workflow.mjs` | `npm test` green with 22 report assertions (flat rows to nested, null prices, per-project rollup, utilisation totals, dashboard tiles); report modules import cleanly; all eight report endpoints called live and answered 401 without a token | Report endpoints return **flat** rows (`component`, `category` as plain strings), so each row is rebuilt into the nested shape the existing tables read. Project consumption arrives one row per component and is rolled up per project. A 403 on a manager-only report is not a failure: that section renders 'Your role cannot see this report' while the rest of the page loads, which is exactly what a Staff login gets. The dashboard's 'Total stock' tile shows chambers in use, since the backend reports no global quantity total. |
| 2026-09-15 | 10 — Requisitions | `js/api/mappers/requisitions.js`, `js/ui/receive-requisition-modal.js` (new); `js/services/requisition-service.js`, `js/pages/requisitions-page.js`, `tests/demo-workflow.mjs` | `npm test` green with 18 requisition assertions incl. the staff own-cancel case; requisition modules import cleanly; list, create, `transition/` and `receive/` all called live and answered 401 without a token | **The Step 3 debt is paid:** the local status table is no longer consulted in live mode — `allowed_transitions` from the server drives the UI, so a Staff member sees Cancel on their own pending requisition while an Admin sees Approve/Reject, with no client-side role guessing. Receiving is split out of the status form because it adds stock: a new modal picks the chamber, the delivered quantity and price, and for a free-text request the category the new Library component is created under. Every status change confirms first, with cancel and reject in danger tone. |
| 2026-09-15 | 9 — Projects | `js/api/mappers/projects.js` (new); `js/services/project-service.js`, `js/pages/projects-page.js`, `tests/demo-workflow.mjs` | `npm test` green with 15 project mapper assertions; project modules import cleanly; `projects/` list and create plus `close/` and `reopen/` called live and answered 401 without a token | The list endpoint carries no consumption, so the Projects cards read each project's detail for its take count and estimated spend; a detail that fails degrades to zeroes rather than dropping the card. Consumption quantities are net of returns, straight from the server. Close/reopen is a new detail-page action behind a confirm that explains takes stop but history stays. Project activity comes from `inventory/movements/?project=`, and a failure there leaves the rest of the page intact. |
| 2026-09-15 | 8 — Administration: cabinet, categories, units | `js/services/reference-service.js`, `js/ui/reference-modal.js` (new); `js/services/administration-service.js`, `js/pages/administration-page.js`, `css/components.css`, `tests/demo-workflow.mjs` | `npm test` green; administration modules import cleanly; `PUT inventory/cabinet/`, category/unit create and category reassign all called live and answered 401 without a token; settings table with row actions and the unit modal rendered and reviewed | Categories and units got the create/edit/delete UI they never had: a toolbar button, per-row Edit and Delete, and modals sharing one submit helper. Deleting a category that still holds components opens the **reassign** dialog instead of failing — that is the flow the backend documents. Deleting a unit in use still confirms, but says plainly that the server will refuse. Cabinet resize confirms first and names how many drawers would go. `PUT inventory/cabinet/` both creates and resizes, so the 'Set up cabinet' empty state from Step 6 and this form are the same call. Users stay empty here — they arrive in Step 12. |
| 2026-09-15 | 7 — Inventory write | `js/ui/adjust-stock-modal.js` (new); `js/services/inventory-service.js`, `js/api/mappers/inventory.js`, `js/pages/inventory-page.js`, `js/ui/stock-operation-modal.js`, `js/ui/assign-component-modal.js`, `tests/demo-workflow.mjs` | `npm test` green; every inventory module imports cleanly; all five stock endpoints plus the stock-entry delete were called live and answered 401 without a token; action row and adjust dialog rendered and reviewed | Stock endpoints address a **chamber code** (`A11`), never a drawer id, so `locationCode` now flows page → modal → service; a multi-chamber drawer with no chamber chosen is refused client-side with 'Choose a chamber in this drawer first' instead of guessing. Transfer destinations are chambers, carried on each option's `data-location`. Assign is `stock/add/` with a component. New Adjust action (Admin, live only): requires a reason, refuses a no-op, and confirms the exact difference before sending. New 'Free chamber' action deletes an emptied stock entry behind a confirm; it only appears at zero quantity because the server refuses otherwise. Demo mode still uses drawer ids throughout. |
| 2026-09-15 | 6 — Inventory read | `js/api/mappers/inventory.js` (new); `js/services/inventory-service.js`, `js/pages/inventory-page.js`, `css/pages/inventory.css`, `tests/demo-workflow.mjs` | `npm test` green with 22 inventory mapper assertions (single vs multi chamber, worst-state wins, totals, one-cabinet workspace); live calls to `inventory/drawer-map/` and `inventory/cabinet/` return 401 without a token; multi-chamber cell and chamber panel rendered and reviewed | **Model decided with the user:** grid cell = drawer; multi-chamber drawers show `2/3 chambers` and open a chamber list in the panel, and picking a chamber reuses the existing single-drawer panel. Drawer state is the worst of its chambers (out > low > stocked > empty). The one-cabinet workspace is still returned as a one-entry list so every page that iterates `workspace.cabinets` is untouched. A 404 from the cabinet endpoint is an empty workspace, not an error: the page shows 'No cabinet configured yet', with the setup action only for Admins. `getCabinetConfiguration()` added for Step 8. |
| 2026-09-15 | 5 — Library write | `js/services/component-service.js`, `js/api/mappers/library.js`, `js/pages/library-page.js`, `tests/demo-workflow.mjs` | `npm test` green with payload and field-error mapping asserted; live POST and archive calls hit the backend and return 401 without a token; confirm dialog copy checked for both archive and restore | Create is POST, edit is PATCH; the modal's existing error handling was reused by mapping DRF field names onto the form's control names, so no modal code changed. `part_number` is sent as `null` when blank, or the uniqueness check rejects a second empty one. Client-side validation still runs for instant feedback, minus the uniqueness rule, which only the server can answer. Archive/restore is a new detail-page action behind a confirm dialog that names the stock it will hide; it is hidden in demo mode, which has no such endpoint. **Deferred:** picking an image in live mode is blocked with an inline message until `POST upload/` lands in Step 13; category and unit CRUD moved to Step 8 because the Settings tables have no create/edit UI yet — that is new UI, not plumbing. |
| 2026-09-15 | 4 — Library read | `js/api/mappers/library.js`, `js/ui/async-state.js` (new); `js/services/component-service.js`, `js/pages/library-page.js`, `css/components.css`, `tests/demo-workflow.mjs` | `npm test` green with 20 mapper assertions (decimal strings, nulls, stock states, detail entries, movement direction); built URLs checked against the spec's query names; live call to the running backend returns 401 as expected without a token; loading / error / permission panels rendered and reviewed | The library table paginates client-side, so a live read walks the pages (100 per request, capped at 20) and hands the page one array — no page file had to change. `stock_by_location` carries `stock_entry_id`, which Step 7 needs for note edits and deletes. `image_url` is mapped onto `image.dataUrl` so the existing `<img>` keeps working. Component detail also pulls the last 10 movements from `inventory/movements/`; if that call fails the component still renders. Location rows show 'Cabinet' as the cabinet name until Step 6 reads the real one. |
| 2026-09-15 | 3 — Role-aware shell | `js/services/permission-service.js` (new); `js/config.js`, `js/app.js`, `js/pages/inventory-page.js`, `js/pages/library-page.js`, `js/pages/projects-page.js`, `js/pages/requisitions-page.js`, `css/pages/inventory.css`, `tests/demo-workflow.mjs` | `npm test` green with a full capability matrix asserted for Admin / Manager / Staff / unknown role; all three shells rendered and compared side by side | Capabilities are named after the action (`canManageStock`), not the role, so a backend rule change touches one file. Signed out in demo mode resolves to Admin so the seeded data stays browsable; an unrecognised role grants nothing. Admin-only routes typed directly into the URL render a 'not available for your role' panel rather than a blank page. A 403 that slips through a hidden control is caught globally and shown as one toast. Requisition 'cancel own pending' stays hidden until Step 10, where the server's `allowed_transitions` says who may do it. |
| 2026-09-15 | 2 — Login, logout, session guard | `js/pages/login-page.js`, `js/services/auth-service.js`, `js/api/mappers/auth.js` (new); `js/app.js`, `js/router.js`, `index.html`, `css/pages/login.css` (new), `tests/demo-workflow.mjs` | `npm test` green with 8 new auth assertions (validation, success, wrong password, logout blacklist, logout while offline); dev server serves `/login`; login screen rendered and checked at 760px and 400px incl. error and busy states | Auth always calls the real backend — `mode` only governs domain data. The guard is active when `mode === 'live'`; in demo mode `/login` stays reachable from the sidebar so sign-in can be exercised before the services are switched. A failed refresh clears the session and the shell reacts through `subscribeToSession`, so no page needed a change. Sign-out clears locally even if the request fails. |
| 2026-09-15 | 1 — API foundation | `js/config.js`, `js/api/client.js` (rewritten), `js/api/tokens.js` (new), `tests/demo-workflow.mjs` | `npm test` green, including 12 new client assertions; live check against the running backend: no token → 401 `sessionExpired`, bad login → "Invalid email or password" | `mode` stays `'demo'` until services are switched over — flipping it now would break every page, since the non-demo branches are still empty. `credentials: 'omit'` because the backend sends `Access-Control-Allow-Origin: *`, which browsers reject alongside credentials. Refresh is attempted **once** per request, then the session is cleared. |
