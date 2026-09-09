# SRS Coverage Audit

Last checked: 09 September 2026

This is a frontend/demo-mode coverage check against `content/SRS-Components-Inventory-Management-System (1) (1).pdf`. It separates features that are usable now from backend responsibilities that must be completed during Django/API integration.

## Component Library

| Requirement | Current status | Notes |
| --- | --- | --- |
| FR-1.1 component fields | Complete | Image, name, MPN, category, unit, description, last buying price, delivery charge, minimum quantity, manufacturer, datasheet URL, and automatic created/updated timestamps are present. Image accepts JPG/PNG/WEBP up to 2 MB and is shown as a CSS thumbnail. |
| FR-1.2 archive and protected hard delete | Pending | Create, read and update work. Archive/delete policy needs backend API support and a UI action. |
| FR-1.3 list columns and pagination | Partial | Required columns are shown. Pagination is demo/client-side; backend must provide server pagination. |
| FR-1.4 sorting | Pending | Add sort controls and API query parameters. |
| FR-1.5 filters | Partial | Category, unit and stock state work. Price range and project usage filters are pending. |
| FR-1.6 search | Complete in demo | Searches name, MPN, description and location code. |
| FR-1.7 to FR-1.10 import/export | Pending | Requires CSV/XLSX templates, mapping, preview, atomic validation and backend export endpoints. |
| FR-1.11 detail history | Partial | Stock by location and movement history work. Requisition history and project-consumption list are pending. |

## Categories and Units

| Requirement | Current status | Notes |
| --- | --- | --- |
| FR-2 category data and table | Partial | Seeded records and required table fields exist. Category create/edit/delete/reassign flow and filter-on-selection are pending. |
| FR-3 unit data and quantity validation | Partial | Fraction validation and unit display work. Add remaining seeded units (cm, kg, rolls, sets) plus unit management CRUD. |

## Requisitions, Roles and Inventory

| Requirement | Current status | Notes |
| --- | --- | --- |
| FR-4 requisition creation and status history | Partial | Create, core status flow, timestamps and visible history work in demo. Requester/project/date filters, receipt flow, notifications and server role enforcement are pending. |
| FR-5 users, permissions and authentication | Pending backend | Demo shows fixed roles, but authentication and server-side permissions are not implemented in this static frontend. |
| FR-6 core stock operations | Partial | Assign, Add, Take, Return and Transfer validate quantities and component/location integrity. Adjust, retention release, concurrency locking and backend ledger guarantees are pending. |
| FR-7 drawer interface | Partial by product decision | Lightweight 2D drawer grid, state colours, selection and cabinet dimensions work. The requested UI uses simple `A1` labels and one chamber per drawer; SRS chamber subdivisions, component highlighting, printable QR labels and one-cabinet-only scope need a later product decision. |

## Projects, Reports and Cross-cutting Requirements

| Requirement | Current status | Notes |
| --- | --- | --- |
| FR-8 projects | Partial | Project list/detail, validated project creation and optional Take tagging work. Project edit, close/delete rules and linked requisitions display are pending. |
| FR-9 reports and dashboard | Partial | Dashboard, current stock, low stock, movements, project consumption and drawer utilisation are shown. Date ranges, exports, requisition-status and user-activity reports are pending. |
| FR-10 audit, notifications, date/currency | Partial | Demo audit events, Asia/Dhaka date formatting and BDT formatting work. Complete before/after audit values and notification workflows are pending. |

## Backend Handoff Notes

- Demo component images are stored as image data in browser storage only. The Django API should accept multipart uploads, validate file content/type/size server-side, generate thumbnails, and return a stable media URL.
- Transaction locking, permissions, archival policy, imports/exports, notifications, authentication and backups must be implemented on the backend; they cannot be guaranteed by browser-only demo code.
- Use this file as the next implementation checklist rather than treating demo-only behaviour as complete production functionality.
