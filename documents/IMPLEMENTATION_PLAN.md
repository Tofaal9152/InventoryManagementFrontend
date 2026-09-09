# Components Inventory Management System - Implementation Plan

## 1. Goal

Build a clean, responsive, Raspberry Pi-friendly inventory frontend using only **HTML, CSS and vanilla JavaScript**. It will use realistic demo data now, while keeping a clear service/API boundary so a Django REST API can replace the demo store later without rebuilding the UI.

The app has two connected areas:

1. **Library** - the master catalog for component definitions.
2. **Inventory** - components from the Library are assigned to cabinet drawers, quantities are managed, and Take operations can optionally be linked to a Project.

The visual direction is inspired by the supplied examples, but will be an original and simpler 2D interface. No 3D cabinet, canvas, WebGL, heavy animation, frontend framework, or Tailwind CDN will be used.

## 2. Key Decisions

| Topic | Decision |
| --- | --- |
| Frontend stack | HTML, custom CSS, and ES-module JavaScript only |
| Styling | Reusable custom CSS components and CSS variables; no Tailwind CDN |
| Navigation | Clean client-side routes, for example `/inventory`; the development/static server must fall back to `index.html` for direct page loads |
| Demo mode | Seeded realistic data in `localStorage`, with a Reset Demo Data action |
| API readiness | Page -> service -> API adapter pattern. Pages will never read demo data directly |
| Cabinet view | 2D CSS grid; clicking a drawer selects it and shows details on the right |
| Drawer interaction | A tiny CSS selected/open state only; no costly 3D animation |
| Accessibility | Keyboard-operable controls, labels, focus states, meaningful empty/loading/error states |

## 3. Scope and Rules

- A component must exist in the **Library** before it can be assigned to Inventory.
- A drawer/chamber may contain only one component type, but the same component may exist in multiple locations.
- A Take operation cannot exceed available quantity and may be tagged with an active Project.
- Project tagging is optional, as stated in the SRS.
- Drawer codes shown in the cabinet grid use the simple format requested by the user: `A1`, `B1`, `C1` etc.
- The data model keeps a separate chamber/section field so it can support SRS-style subdivisions later without redesigning the UI.
- The SRS specifies one cabinet for v1, but the requested sidebar includes creating cabinets. The demo frontend will keep cabinets as a reusable collection so multi-cabinet support is ready. Backend scope should confirm whether creation is enabled immediately or limited to one cabinet in v1.

## 4. Application Routes

| Route | Page | Main purpose |
| --- | --- | --- |
| `/dashboard` | Dashboard | Stock summary, low-stock count, pending requisitions, recent movements and quick actions |
| `/library` | Component Library | Search, filter, create, edit, archive, and inspect master component records |
| `/library/:id` | Component Details | Component information, total stock, locations, project usage and movement history |
| `/inventory` | Cabinet Inventory | Select/create cabinet, browse 2D drawers, assign components, and perform stock actions |
| `/projects` | Projects | Create/edit/close projects and see component consumption |
| `/projects/:id` | Project Details | Consumed components, estimated cost and linked requisitions |
| `/requisitions` | Requisitions | Create and manage requisitions with statuses and history |
| `/reports` | Reports | Current stock, low stock, movements, project consumption and drawer utilisation |
| `/settings/cabinets` | Cabinet Settings | Admin cabinet dimensions, drawer/section configuration and labels |
| `/settings/categories` | Categories | Component category management |
| `/settings/units` | Units | Unit configuration and fractional-quantity settings |
| `/settings/users` | Users & Roles | Demo user/role management view |
| `/audit-log` | Audit Log | Demo view of immutable changes and movements |

Routes not permitted for the currently selected role will be hidden from navigation and show an access-denied state if opened directly.

## 5. UI Direction

### Shared shell

- **Left sidebar:** app navigation; on Inventory it also contains cabinet groups and cabinet selection.
- **Top bar:** current page title, search where relevant, current user/role, and compact actions.
- **Main workspace:** responsive content area. At tablet widths panels stack instead of shrinking until unreadable.
- **Feedback:** reusable toast messages, loading skeletons, empty states, confirmation dialog and inline form errors.

### Inventory / Cabinet screen

The inventory screen is the central working view.

1. **Left cabinet panel**
   - Cabinet groups and individual cabinets.
   - Create Cabinet and Create Group buttons for permitted users.
   - Selected cabinet is clearly highlighted.

2. **Centre cabinet workspace**
   - CSS Grid renders a lightweight 2D cabinet.
   - Columns use letters (`A`, `B`, `C` ...) and rows use numbers (`1`, `2`, `3` ...).
   - Each drawer displays its code, brief component text when occupied, and a clear state colour.
   - State colours: grey = empty, green = stocked, amber = low stock, red = assigned but zero quantity.
   - Filter chips: All, Empty, Low stock, Out of stock.
   - Clicking a drawer gives it a simple selected/open-left visual state and updates the detail panel.

3. **Right detail panel**
   - Selected cabinet and drawer code.
   - Empty drawer: short explanation and **Assign from Library** button.
   - Occupied drawer: component thumbnail/name/part number, unit, available quantity, minimum-stock state, notes, and location.
   - Actions: Add, Take, Return and Transfer. Buttons appear only when the selected role is allowed to use them.
   - Recent movement activity for that drawer.

### Library screen

- Server-ready table layout with thumbnail, name, MPN, category, unit, total quantity, location count, price and updated time.
- Search and filters for category, unit, stock status, price range and project usage.
- Create/edit modal with image, name, MPN, category, unit, description, price, delivery charge, minimum quantity, manufacturer and datasheet URL.
- Component details show stock by drawer and full movement history.

### Projects and requisitions

- Projects show status, description, consumption and estimated cost.
- Take modal lets the user select an active Project optionally.
- Requisitions support component selection or free-text part name, quantity, optional Project, needed-by date and note.
- Status transitions and history are represented clearly in the demo; real permissions are later enforced by the backend too.

## 6. Reusable Frontend Building Blocks

These will be JavaScript/CSS components or render helpers, not copied page markup.

- App shell, sidebar and page header
- Buttons, icon buttons and action menus
- Modal, confirm dialog and toast notification
- Form field, select, textarea, image input and validation message
- Status badge and stock-state badge
- Search bar, filter chips and pagination
- Empty, loading and error states
- Reusable data table
- Cabinet grid, drawer cell and drawer detail card
- Movement timeline
- Stat card and report table

## 7. Folder Structure

```text
inventory-management/
├── index.html
├── IMPLEMENTATION_PLAN.md
├── assets/
│   ├── icons/
│   └── images/
├── css/
│   ├── base.css             # reset, typography, design tokens
│   ├── layout.css           # app shell, sidebar, responsive layout
│   ├── components.css       # reusable UI components
│   └── pages/
│       ├── dashboard.css
│       ├── library.css
│       └── inventory.css
└── js/
    ├── app.js               # app bootstrap and route mount
    ├── router.js             # hash routing
    ├── config.js             # demo/API mode and API base URL
    ├── data/
    │   ├── demo-data.js      # initial seeded records
    │   └── demo-store.js     # localStorage persistence/reset
    ├── api/
    │   ├── client.js         # fetch, errors, auth/CSRF-ready hooks
    │   ├── component-api.js
    │   ├── inventory-api.js
    │   ├── project-api.js
    │   └── requisition-api.js
    ├── services/
    │   ├── component-service.js
    │   ├── inventory-service.js
    │   ├── project-service.js
    │   └── requisition-service.js
    ├── pages/
    │   ├── dashboard-page.js
    │   ├── library-page.js
    │   ├── inventory-page.js
    │   ├── projects-page.js
    │   └── requisitions-page.js
    ├── ui/
    │   ├── modal.js
    │   ├── toast.js
    │   ├── table.js
    │   ├── form-fields.js
    │   ├── cabinet-grid.js
    │   └── movement-timeline.js
    └── utils/
        ├── validation.js
        ├── formatters.js
        ├── dom.js
        └── constants.js
```

## 8. Demo Data and Future API Integration

### Demo mode

- Seed categories, units, components, projects, a cabinet layout, stock entries and movement history.
- Store changes in `localStorage`, so forms, stock actions and refreshes behave like a real app.
- Provide a visible Reset Demo Data action.
- Include empty, occupied, low-stock and out-of-stock drawers to demonstrate every state.

### API mode later

Each page calls a service, for example:

```js
const components = await componentService.list(filters);
await inventoryService.takeStock(payload);
```

During demo mode the service uses `demo-store.js`. During backend mode it uses endpoint-specific adapters, for example:

```text
GET    /api/components/
POST   /api/components/
GET    /api/inventory/drawers/
POST   /api/inventory/add/
POST   /api/inventory/take/
POST   /api/inventory/return/
POST   /api/inventory/transfer/
GET    /api/projects/
POST   /api/requisitions/
```

The API client will centralise JSON parsing, request errors, loading state, base URL, authorization headers and Django CSRF handling. Any API response transformation (for example `snake_case` to frontend naming) belongs in the adapter, not in page code.

## 9. Validation and Data Integrity in the Frontend

Every submit button stays disabled while a request is processing. Errors appear next to the relevant field and as a clear summary where necessary.

| Area | Frontend validation |
| --- | --- |
| Component | Name, category and unit required; MPN unique when supplied; valid image type/size; non-negative price/minimum quantity; valid URL |
| Cabinet | Cabinet name required; rows 1-9; columns A-Z; warn/block reduction when affected drawers have stock |
| Assign stock | Existing Library component required; location must be empty or contain the same component; quantity greater than zero |
| Take | Existing location; quantity greater than zero and no more than available; Project must be active when selected |
| Return | Existing location; quantity greater than zero; note required |
| Transfer | Source and destination required and different; sufficient source quantity; destination empty or same component |
| Project | Unique required name; only active projects selectable for new Take/requisition actions |
| Requisition | Component or free-text part name required; positive quantity; valid date when supplied |

Frontend validation improves the experience only. The Django backend must repeat every integrity and permission check in database transactions.

## 10. Step-by-Step Execution Plan

Work is intentionally paused between steps. The user will explicitly request the next step. At the end of every completed step, this document must be updated in **Section 11: Progress Log** with the completion date, files changed, verification performed and the next recommended step.

### Step 1 - Foundation and app shell

1. Create the planned folders and base HTML entry point.
2. Add CSS design tokens, reset, responsive app shell, sidebar and top bar.
3. Add a clean-path router with a development-server fallback requirement.
4. Add the initial demo configuration and a small route-not-found page.
5. Verify direct navigation and browser refresh on `/dashboard` and `/inventory` through a local server.

### Step 2 - Reusable UI and demo foundation

1. Add reusable modal, toast, confirmation dialog, form-field, status badge, empty/loading/error state and button helpers.
2. Add formatter and validation utilities.
3. Create the demo-data seed and localStorage-backed demo store with Reset Demo Data.
4. Define service interfaces so pages never access demo data directly.
5. Verify that resetting and reloading demo data works predictably.

### Step 3 - Inventory cabinet view

1. Build the left cabinet/group panel and selected-cabinet state.
2. Build the lightweight 2D CSS cabinet grid with drawer codes such as `A1` and `B1`.
3. Add stock-state colours and All/Empty/Low stock/Out of stock filters.
4. Add the simple drawer selected/open-left state and accessible keyboard selection.
5. Build the empty/occupied drawer detail panel on the right.
6. Verify the page at desktop and tablet sizes without any 3D/canvas/WebGL dependency.

### Step 4 - Library and drawer assignment

1. Build the Library table, search, filters and pagination UI.
2. Build component create/edit validation and the component details route.
3. Add Assign from Library flow for an empty drawer.
4. Reflect drawer assignment, component quantity and locations in both Library and Inventory views.
5. Verify that a different component cannot be assigned to an occupied drawer.

### Step 5 - Stock operations and movement ledger

1. Implement Add, Take, Return and Transfer modals using demo services.
2. Enforce quantity, unit, location, destination and project validation rules.
3. Write immutable demo movement records and show drawer/component movement history.
4. Update stock state and quantities immediately after each valid operation.
5. Verify the required rules: no negative stock, no over-take, and no different component in an occupied destination.

### Step 6 - Projects, dashboard and reports

1. Build Projects list and detail views.
2. Add optional active-Project tagging to Take operations and consumption totals.
3. Build dashboard counts, recent movements and stock alerts.
4. Build core report tables: current stock, low stock, movements, project consumption and drawer utilisation.

### Step 7 - Requisitions, administration and audit UI

1. Build requisition create/list/detail views and demo status history.
2. Build categories, units, cabinet settings, users/roles and audit log views.
3. Add cabinet-dimension safety checks and management UI.
4. Add import/export, label/QR and print UI placeholders that are ready for backend endpoints.

### Step 8 - Quality, documentation and API handoff

1. Test every stock rule, validation state, role state, empty state and responsive layout.
2. Check operation on a lower-powered browser/device profile.
3. Document the REST API contracts and replace demo service adapters one area at a time.
4. Keep demo mode available behind one configuration flag for visual testing.

## 11. Progress Log

| Step | Status | Completed on | Files changed | Verification | Next step |
| --- | --- | --- | --- | --- | --- |
| 1. Foundation and app shell | Not started | - | - | - | Start only after the user says `next step` |
| 2. Reusable UI and demo foundation | Not started | - | - | - | - |
| 3. Inventory cabinet view | Not started | - | - | - | - |
| 4. Library and drawer assignment | Not started | - | - | - | - |
| 5. Stock operations and movement ledger | Not started | - | - | - | - |
| 6. Projects, dashboard and reports | Not started | - | - | - | - |
| 7. Requisitions, administration and audit UI | Not started | - | - | - | - |
| 8. Quality, documentation and API handoff | Not started | - | - | - | - |

### Required update format after a completed step

```text
Date: YYYY-MM-DD
Completed: Step N - [step name]
Changed: [exact files]
Verified: [commands/checks and result]
Notes: [important design or API decisions]
Recommended next: Step N+1 - [step name]
```

## 12. Performance Rules

- Use CSS Grid/Flexbox, native browser controls and small SVG icons.
- Avoid 3D, canvas/WebGL, large animation libraries, global re-renders and continuously running timers.
- Update only the cabinet drawer/detail panel affected by an action.
- Use CSS transitions only for small `opacity`/`transform` changes and honour `prefers-reduced-motion`.
- Keep image thumbnails compressed and lazy-load non-critical images.
- Use pagination and debounced search for tables.
- Do not add Tailwind CDN or a JavaScript UI framework.

## 13. Definition of a Good First Demo

The first visible demo is complete when a user can:

1. Open the dashboard and see meaningful seeded inventory statistics.
2. Open Inventory, choose a cabinet and click a 2D drawer.
3. Assign a Library component to an empty drawer.
4. Add stock, Take stock with an optional Project, Return stock and Transfer stock.
5. See quantity, state colour, component location and movement history update immediately.
6. Open the Library and see the same component and its total quantity/locations.
7. Refresh the browser without losing demo changes, then reset to the original demo data when needed.

## 14. Before Coding

The current instructions are enough to start Step 1 when the user says **next step**. Before finalising cabinet configuration, confirm one product decision: should the first version enforce the SRS limit of **one cabinet**, or should the requested **Create Cabinet / grouped cabinets** flow be available from day one?
