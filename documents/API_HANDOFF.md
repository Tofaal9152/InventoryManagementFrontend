# API Handoff Guide

## Purpose

The frontend is currently in `demo` mode. Pages call services only; they never read browser storage or call `fetch` directly. This lets the Django REST API replace each demo branch without changing page markup or modal behaviour.

## Switch-over order

1. Add the endpoint and serializer contract below in Django, including permission and transaction checks.
2. Add the matching adapter function under `js/api/` using `apiRequest()`.
3. Replace only the `APP_CONFIG.mode === 'demo'` branch in that service with the adapter call.
4. Keep payload mapping in the adapter. Return the current service shape to pages.
5. Set `APP_CONFIG.mode` to `api` only after that area passes against the backend. Keep demo mode for visual testing.

`js/api/client.js` centralises the `/api` base path, JSON body handling, `credentials: 'same-origin'`, Django `csrftoken` forwarding for unsafe requests, and field/error responses through `ApiRequestError`.

## API conventions

- All timestamps: UTC ISO-8601; display in Asia/Dhaka in the frontend.
- All money: BDT decimal values, returned as JSON numbers or decimal strings that adapters convert to numbers.
- Quantities: decimal values to three places. Backend repeats fractional-unit, stock-availability and drawer-occupancy checks inside transactions.
- List endpoints: use `?page=1&page_size=25` and return `{ results, count }`.
- Validation failures: HTTP 400 with `{ "field_name": ["message"] }`; permission failures 403; missing records 404; stock/concurrency conflicts 409.
- Backend is the authority for roles, permissions, integrity, immutable movements and audit records.

## Endpoint contract

| Area | Endpoint | Method | Request / response responsibility |
| --- | --- | --- | --- |
| Components | `/components/` | GET, POST | List filters/search or create component |
| Components | `/components/:id/` | GET, PATCH | Detail or edit component; response includes total stock and locations |
| Components | `/components/:id/archive/` | POST | Archive only when backend rules allow |
| References | `/categories/`, `/units/` | GET, POST, PATCH, DELETE | Reference management and usage/deletion checks |
| Cabinet | `/inventory/workspace/` | GET | Cabinet, drawers, component/unit summaries and recent drawer movements |
| Cabinet | `/inventory/cabinets/:id/configuration/` | PATCH | Rows, columns, chamber configuration; return 409 when a removed chamber has stock |
| Assignment | `/inventory/assignments/` | POST | `{ drawer_id, component_id, quantity, note }` |
| Stock | `/inventory/add/`, `/take/`, `/return/`, `/transfer/` | POST | Existing modal payloads; backend appends the movement record atomically |
| Projects | `/projects/`, `/projects/:id/` | GET, POST, PATCH | List/detail, close projects, consumption and linked requisitions |
| Requisitions | `/requisitions/`, `/requisitions/:id/` | GET, POST | List filters, create and detail with status history |
| Requisition status | `/requisitions/:id/status/` | POST | `{ status, note }`; Admin-only lifecycle transition |
| Reports | `/reports/current-stock/`, `/low-stock/`, `/movements/`, `/project-consumption/`, `/drawer-utilisation/` | GET | Filtered, paginated report tables/export sources |
| Audit | `/audit-log/` | GET | Admin-only immutable events |

## Payload mapping notes

Use adapter functions to map Django's common `snake_case` fields to the camelCase service shapes already consumed by pages. For example:

```js
function toComponent(record) {
  return {
    id: record.id,
    partNumber: record.part_number,
    categoryId: record.category_id,
    unitId: record.unit_id,
    lastBuyingPrice: Number(record.last_buying_price),
    minimumQuantity: Number(record.minimum_quantity)
  };
}
```

The UI uses requested simple grid labels such as `A1`; keep `sectionCount`/chamber data separately so later SRS chamber support does not change what users currently see.

## Django requirements before enabling API mode

- Authenticate each request and enforce the Admin/Manager/Staff permission matrix server-side.
- Wrap Add, Take, Return, Transfer and receipt operations in database transactions; lock the source location for Take/Transfer.
- Append movements, requisition histories and audit log records; never update or delete them.
- Validate every referenced ID, active Project, unit rule, drawer/chamber occupancy and quantity on the server.
- Configure CSRF cookie/session support for same-origin browser requests, CORS only if the frontend is hosted elsewhere, and pagination indexes for large lists.

## Verification handoff

Run `npm test` in demo mode before and after every adapter replacement. Then repeat each affected test against the Django test database/API client, including 400, 403 and 409 responses. Keep the demo-mode reset button available for visual regression checks.
