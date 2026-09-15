# Quality Checklist

## Automated checks

Run from the project root:

```sh
npm test
```

The test resets demo data before and after execution. It verifies:

- all four seeded drawer states: stocked, low, out of stock and empty;
- duplicate component part-number rejection and valid component creation;
- Library-only drawer assignment and rejection of mixed components;
- Add, Take, Return and Transfer mutations, immutable movement creation, over-take rejection, non-integer `pcs` rejection, missing Return note rejection and closed-Project rejection;
- requisition unit validation, full status lifecycle and immutable history;
- cabinet expansion/reduction safety; assigned drawers cannot be removed;
- dashboard, reports, project consumption and audit derivation from demo state;
- API client JSON body, error mapping and non-2xx error handling.

## Browser/device check before release

No browser visual test was run in this coding pass. Before release, test the actual target browser at desktop and tablet widths, then on the Raspberry Pi:

1. Open every direct route and refresh it: Dashboard, Library, Inventory, Projects, Requisitions, Reports, Administration and Audit Log.
2. Operate the Inventory drawer grid with mouse, keyboard Tab/Enter and touch; confirm the selected/open-left state and right panel remain usable.
3. Submit each modal with invalid and valid inputs. Confirm field errors are readable and focus returns correctly after closing a modal.
4. Run Add, Take, Return and Transfer. Refresh the page and confirm persisted demo state. Use Reset Demo Data after the check.
5. Use a narrow/tablet viewport: sidebar and panels should stack without horizontal clipping; tables should remain scrollable in their wrappers.
6. On the Raspberry Pi, verify first load, drawer selection, filtering and a stock operation feel responsive. If not, record the browser version, route, data size and observed delay before optimisation.

## Performance guardrails retained

- No framework, CDN, canvas, WebGL, image dependency or polling loop.
- Native HTML controls, CSS Grid/Flexbox and ES modules only.
- Drawer UI has simple CSS state changes; no 3D drawing or continuous animation.
- Tables are paginated where implemented and Library search is debounced.
- Demo data is local; API mode will fetch only through service adapters.
