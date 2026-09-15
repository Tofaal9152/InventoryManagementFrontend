import assert from 'node:assert/strict';
import { ApiRequestError, apiList, apiRequest, buildUrl } from '../js/api/client.js';
import { clearSession, getAccessToken, getRole, setSession } from '../js/api/tokens.js';
import { SignInError, signIn, signOut } from '../js/services/auth-service.js';
import { columnLetters, mapDrawer, mapDrawerMap } from '../js/api/mappers/inventory.js';
import { mapProject, mapProjectDetails, mapProjectSummary } from '../js/api/mappers/projects.js';
import { mapRequisition, statusCode, statusLabel } from '../js/api/mappers/requisitions.js';
import { getAllowedRequisitionStatuses } from '../js/services/requisition-service.js';
import { mapCurrentStockRow, mapDashboard, mapDrawerUtilisation, mapLowStockRow, mapProjectConsumption } from '../js/api/mappers/reports.js';
import { mapAuditEvent, mapUser, roleCode, roleLabel } from '../js/api/mappers/administration.js';
import { FileTransferError, extractUploadUrl, labelSheetUrl, previewImport, uploadFile } from '../js/services/file-service.js';
import { adjustStock } from '../js/services/inventory-service.js';
import {
  mapComponent,
  mapComponentFieldErrors,
  mapMovement,
  mapUnit,
  toComponentPayload
} from '../js/api/mappers/library.js';
import {
  canAdministerUsers,
  canAdjustStock,
  canConfigureCabinet,
  canDecideRequisitions,
  canManageLibrary,
  canManageStock,
  canMoveStock,
  canRaiseRequisitions,
  getEffectiveRole
} from '../js/services/permission-service.js';
import { getSession, isSignedIn } from '../js/api/tokens.js';
import { resetDemoState } from '../js/data/demo-store.js';
import { ComponentValidationError, getComponent, saveComponent } from '../js/services/component-service.js';
import { CabinetConfigurationError, getAdministrationData, getAuditLog, updateCabinetDimensions } from '../js/services/administration-service.js';
import {
  CabinetValidationError,
  DrawerAssignmentValidationError,
  StockOperationValidationError,
  addStock,
  assignComponentToDrawer,
  createCabinet,
  getCabinet,
  getInventoryWorkspace,
  returnStock,
  takeStock,
  transferStock
} from '../js/services/inventory-service.js';
import { ProjectValidationError, createProject, getProjectDetails } from '../js/services/project-service.js';
import { getDashboardData, getReportsData } from '../js/services/report-service.js';
import {
  RequisitionValidationError,
  createRequisition,
  getRequisition,
  updateRequisitionStatus
} from '../js/services/requisition-service.js';

async function expectReject(action, ErrorType) {
  await assert.rejects(action, (error) => error instanceof ErrorType);
}

async function run() {
  resetDemoState();
  try {
    const workspace = await getInventoryWorkspace();
    const initialCabinet = workspace.cabinets[0];
    assert.equal(initialCabinet.drawers.length, 16);
    assert.equal(initialCabinet.drawers.find((drawer) => drawer.code === 'A1').stockState, 'stocked');
    assert.equal(initialCabinet.drawers.find((drawer) => drawer.code === 'B1').stockState, 'low');
    assert.equal(initialCabinet.drawers.find((drawer) => drawer.code === 'C1').stockState, 'out');
    assert.equal(initialCabinet.drawers.find((drawer) => drawer.code === 'D1').stockState, 'empty');

    const createdCabinet = await createCabinet({ name: 'Assembly Cabinet', groupId: 'group-lab', rows: 2, columnCount: 3 });
    assert.equal(createdCabinet.drawers.length, 6);
    assert.equal(createdCabinet.drawers[0].code, 'A1');
    assert.equal(createdCabinet.drawers.at(-1).code, 'C2');
    assert.equal((await getInventoryWorkspace()).groups[0].cabinets.length, 2);
    await expectReject(
      () => createCabinet({ name: 'Assembly Cabinet', groupId: 'group-lab', rows: 2, columnCount: 3 }),
      CabinetValidationError
    );

    await expectReject(
      () => saveComponent({ name: 'Duplicate part', partNumber: 'LM358N', categoryId: 'category-ic', unitId: 'unit-pcs', minimumQuantity: 0, lastBuyingPrice: 0 }),
      ComponentValidationError
    );
    const createdComponent = await saveComponent({
      name: 'Test jumper wire',
      partNumber: 'TEST-JUMPER-01',
      categoryId: 'category-passive',
      unitId: 'unit-m',
      minimumQuantity: 2,
      lastBuyingPrice: 3.5,
      deliveryCharge: 12,
      image: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: 'jumper.png', type: 'image/png', size: 8 }
    });
    assert.equal(createdComponent.name, 'Test jumper wire');
    assert.equal(createdComponent.deliveryCharge, 12);
    assert.equal(createdComponent.image.name, 'jumper.png');
    assert.ok(createdComponent.createdOn);
    assert.ok(createdComponent.updatedOn);
    await expectReject(
      () => saveComponent({ name: 'Invalid delivery component', categoryId: 'category-passive', unitId: 'unit-pcs', minimumQuantity: 0, lastBuyingPrice: 0, deliveryCharge: -1 }),
      ComponentValidationError
    );

    const createdProject = await createProject({ name: 'Quality Project', description: 'Created during demo workflow checks.', status: 'Active' });
    assert.equal(createdProject.name, 'Quality Project');
    assert.equal(createdProject.status, 'Active');
    await expectReject(() => createProject({ name: 'Quality Project' }), ProjectValidationError);

    await assignComponentToDrawer({ cabinetId: 'cabinet-1', drawerId: 'drawer-d1', componentId: 'component-lm358', quantity: 2, note: 'Quality check' });
    await expectReject(
      () => assignComponentToDrawer({ cabinetId: 'cabinet-1', drawerId: 'drawer-d1', componentId: 'component-led-red', quantity: 1 }),
      DrawerAssignmentValidationError
    );
    await addStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', quantity: 2, note: 'Quality add' });
    await takeStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', quantity: 4, projectId: 'project-steelguard', note: 'Quality take' });
    await returnStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', quantity: 1, note: 'Quality return' });
    await transferStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', destinationDrawerId: 'drawer-d1', quantity: 3, note: 'Quality transfer' });
    await expectReject(
      () => takeStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', quantity: 999, note: 'Over-take' }),
      StockOperationValidationError
    );
    await expectReject(
      () => addStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', quantity: 0.5 }),
      StockOperationValidationError
    );
    await expectReject(
      () => returnStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', quantity: 1, note: '' }),
      StockOperationValidationError
    );
    await expectReject(
      () => takeStock({ cabinetId: 'cabinet-1', drawerId: 'drawer-a1', quantity: 1, projectId: 'project-legacy-fixture' }),
      StockOperationValidationError
    );
    const cabinetAfterStock = await getCabinet('cabinet-1');
    assert.equal(cabinetAfterStock.drawers.find((drawer) => drawer.id === 'drawer-a1').quantity, 20);
    assert.equal(cabinetAfterStock.drawers.find((drawer) => drawer.id === 'drawer-d1').quantity, 5);

    await expectReject(
      () => createRequisition({ componentId: 'component-lm358', quantity: 1, unitId: 'unit-m' }),
      RequisitionValidationError
    );
    const requisition = await createRequisition({ freeTextPartName: 'USB Type-C socket', quantity: 10, unitId: 'unit-pcs', projectId: 'project-steelguard', note: 'Quality requisition' });
    await updateRequisitionStatus({ requisitionId: requisition.id, status: 'Approved', note: 'Approved' });
    await updateRequisitionStatus({ requisitionId: requisition.id, status: 'Ordered', note: 'Ordered' });
    await updateRequisitionStatus({ requisitionId: requisition.id, status: 'Received', note: 'Received' });
    const receivedRequisition = await getRequisition(requisition.id);
    assert.equal(receivedRequisition.status, 'Received');
    assert.equal(receivedRequisition.statusHistory.length, 4);
    await expectReject(
      () => updateRequisitionStatus({ requisitionId: requisition.id, status: 'Approved' }),
      RequisitionValidationError
    );

    await updateCabinetDimensions({ cabinetId: 'cabinet-1', rows: 4, columnCount: 5 });
    await updateCabinetDimensions({ cabinetId: 'cabinet-1', rows: 4, columnCount: 4 });
    await expectReject(
      () => updateCabinetDimensions({ cabinetId: 'cabinet-1', rows: 4, columnCount: 3 }),
      CabinetConfigurationError
    );
    const administration = await getAdministrationData();
    assert.equal(administration.categories.length, 3);
    assert.equal(administration.units.length, 3);

    const project = await getProjectDetails('project-steelguard');
    const dashboard = await getDashboardData();
    const reports = await getReportsData();
    const auditLog = await getAuditLog();
    assert.ok(project.consumption.some((item) => item.component.id === 'component-lm358'));
    assert.ok(dashboard.recentMovements.length >= 5);
    assert.ok(reports.movements.length >= 7);
    assert.ok(auditLog.length >= 4);

    const payload = await apiRequest('/quality-check/', { method: 'POST', body: { ready: true }, fetcher: async (_url, options) => new Response(JSON.stringify({ received: options.body }), { headers: { 'content-type': 'application/json' } }) });
    assert.equal(payload.received, '{"ready":true}');
    await assert.rejects(
      () => apiRequest('/quality-error/', { fetcher: async () => new Response(JSON.stringify({ detail: 'Validation failed.' }), { status: 400, headers: { 'content-type': 'application/json' } }) }),
      (error) => error instanceof ApiRequestError && error.status === 400
    );

    await runApiClientChecks();
    await runAuthServiceChecks();
    runPermissionChecks();
    runLibraryMapperChecks();
    runInventoryMapperChecks();
    await runStockOperationChecks();
    runProjectMapperChecks();
    runRequisitionMapperChecks();
    runReportMapperChecks();
    runAdministrationMapperChecks();
    await runFileTransferChecks();
  } finally {
    resetDemoState();
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function runApiClientChecks() {
  try {
    assert.equal(buildUrl('library/components/'), 'http://localhost:8000/library/components/');
    assert.equal(buildUrl('/library/components/'), 'http://localhost:8000/library/components/');
    assert.equal(
      buildUrl('library/components/', { search: 'led', category: '', page: 2 }),
      'http://localhost:8000/library/components/?search=led&page=2'
    );

    // The bearer token is attached, and an unauthenticated call omits it.
    setSession({ access: 'access-1', refresh: 'refresh-1', role: 'MANAGER', user: { pk: 1 } });
    assert.equal(getRole(), 'MANAGER');
    let seenAuth = 'missing';
    await apiRequest('reports/dashboard/', {
      fetcher: async (_url, options) => {
        seenAuth = options.headers.get('Authorization');
        return jsonResponse({ ok: true });
      }
    });
    assert.equal(seenAuth, 'Bearer access-1');
    await apiRequest('rest-auth/login/', {
      method: 'POST',
      auth: false,
      body: { email: 'a@b.c' },
      fetcher: async (_url, options) => {
        seenAuth = options.headers.get('Authorization');
        return jsonResponse({ ok: true });
      }
    });
    assert.equal(seenAuth, null);

    // FormData keeps its own content type so the multipart boundary survives.
    const upload = new FormData();
    upload.append('file', 'contents');
    let uploadContentType = 'unset';
    let uploadBody = null;
    await apiRequest('upload/', {
      method: 'POST',
      body: upload,
      fetcher: async (_url, options) => {
        uploadContentType = options.headers.get('Content-Type');
        uploadBody = options.body;
        return jsonResponse({ ok: true });
      }
    });
    assert.equal(uploadContentType, null);
    assert.ok(uploadBody instanceof FormData);

    // A 401 refreshes once and replays the original request.
    const calls = [];
    const refreshed = await apiRequest('library/components/', {
      fetcher: async (url, options) => {
        calls.push(`${options.method} ${url}`);
        if (url.endsWith('get-access-token/')) return jsonResponse({ access: 'access-2' });
        if (calls.length === 1) return jsonResponse({ detail: 'Token expired.' }, 401);
        return jsonResponse({ results: [{ id: 1 }], count: 9 });
      }
    });
    assert.equal(calls.length, 3);
    assert.ok(calls[1].includes('get-access-token/'));
    assert.equal(getAccessToken(), 'access-2');
    assert.equal(refreshed.count, 9);

    // A refresh that fails ends the session instead of looping.
    await assert.rejects(
      () => apiRequest('library/components/', {
        fetcher: async (url) => (url.endsWith('get-access-token/')
          ? jsonResponse({ detail: 'Invalid token.' }, 401)
          : jsonResponse({ detail: 'Token expired.' }, 401))
      }),
      (error) => error instanceof ApiRequestError && error.sessionExpired && error.status === 401
    );
    assert.equal(getAccessToken(), '');

    // DRF field errors land on ApiRequestError.fields for inline display.
    await assert.rejects(
      () => apiRequest('library/components/', {
        method: 'POST',
        auth: false,
        body: {},
        fetcher: async () => jsonResponse({ part_number: ['This field is required.'] }, 400)
      }),
      (error) => error.fields.part_number === 'This field is required.'
        && error.message === 'This field is required.'
        && error.isValidationError
    );

    // A 403 explains the role limit rather than reading like a bug.
    await assert.rejects(
      () => apiRequest('inventory/stock/adjust/', {
        method: 'POST',
        auth: false,
        body: {},
        fetcher: async () => jsonResponse({ detail: 'Only Admins can perform this action.' }, 403)
      }),
      (error) => error.isPermissionError && error.message === 'Only Admins can perform this action.'
    );

    // Paginated and plain list payloads both flatten to {items, total}.
    const page = await apiList('projects/', {
      auth: false,
      fetcher: async () => jsonResponse({ count: 42, next: 'http://x/?page=2', previous: null, results: [{ id: 1 }, { id: 2 }] })
    });
    assert.equal(page.total, 42);
    assert.equal(page.items.length, 2);
    assert.equal(page.next, 'http://x/?page=2');
    const plain = await apiList('library/units/', { auth: false, fetcher: async () => jsonResponse([{ id: 1 }]) });
    assert.equal(plain.total, 1);

    // A dead server reads as a network error, not a crash.
    await assert.rejects(
      () => apiRequest('reports/dashboard/', { auth: false, fetcher: async () => { throw new TypeError('fetch failed'); } }),
      (error) => error instanceof ApiRequestError && error.isNetworkError
    );
  } finally {
    clearSession();
  }
}

async function runAuthServiceChecks() {
  try {
    // Empty fields never reach the network; both errors land inline.
    await assert.rejects(
      () => signIn({ email: '  ', password: '' }),
      (error) => error instanceof SignInError && Boolean(error.fields.email) && Boolean(error.fields.password)
    );

    // A successful sign-in stores tokens, role and a camelCase user.
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('rest-auth/login/'));
      assert.equal(options.headers.get('Authorization'), null);
      return new Response(JSON.stringify({
        success: true,
        access: 'access-token',
        refresh: 'refresh-token',
        role: 'ADMIN',
        user: { pk: 3, username: 'asha', email: 'admin@example.com', first_name: 'Asha', last_name: 'Rahman' }
      }), { headers: { 'content-type': 'application/json' } });
    };
    const session = await signIn({ email: ' admin@example.com ', password: 'secret' });
    assert.equal(session.role, 'ADMIN');
    assert.equal(session.user.fullName, 'Asha Rahman');
    assert.equal(getSession().access, 'access-token');
    assert.ok(isSignedIn());

    // Wrong credentials surface the server's message, and nothing is stored.
    clearSession();
    globalThis.fetch = async () => new Response(
      JSON.stringify({ success: false, message: 'Invalid email or password' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
    await assert.rejects(
      () => signIn({ email: 'admin@example.com', password: 'wrong' }),
      (error) => error instanceof SignInError && error.message === 'Invalid email or password'
    );
    assert.equal(isSignedIn(), false);

    // Sign-out blacklists the refresh token and clears the session even if the call fails.
    setSession({ access: 'a', refresh: 'r', role: 'STAFF', user: { pk: 1 } });
    let logoutBody = null;
    globalThis.fetch = async (_url, options) => {
      logoutBody = options.body;
      return new Response(JSON.stringify({ detail: 'Successfully logged out.' }), { headers: { 'content-type': 'application/json' } });
    };
    await signOut();
    assert.equal(logoutBody, '{"refresh":"r"}');
    assert.equal(isSignedIn(), false);

    setSession({ access: 'a', refresh: 'r', role: 'STAFF', user: { pk: 1 } });
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await signOut();
    assert.equal(isSignedIn(), false, 'a failed logout must still clear the local session');
  } finally {
    delete globalThis.fetch;
    clearSession();
  }
}

function runPermissionChecks() {
  const capabilities = () => ({
    library: canManageLibrary(),
    stock: canManageStock(),
    move: canMoveStock(),
    adjust: canAdjustStock(),
    cabinet: canConfigureCabinet(),
    users: canAdministerUsers(),
    decide: canDecideRequisitions(),
    raise: canRaiseRequisitions()
  });

  try {
    // Signed out in demo mode the seeded data stays fully browsable.
    clearSession();
    assert.equal(getEffectiveRole(), 'ADMIN');

    setSession({ access: 'a', refresh: 'r', role: 'ADMIN', user: { pk: 1 } });
    assert.deepEqual(capabilities(), {
      library: true, stock: true, move: true, adjust: true, cabinet: true, users: true, decide: true, raise: true
    });

    setSession({ access: 'a', refresh: 'r', role: 'MANAGER', user: { pk: 2 } });
    assert.deepEqual(capabilities(), {
      library: true, stock: true, move: true, adjust: false, cabinet: false, users: false, decide: false, raise: true
    });

    setSession({ access: 'a', refresh: 'r', role: 'STAFF', user: { pk: 3 } });
    assert.deepEqual(capabilities(), {
      library: false, stock: false, move: true, adjust: false, cabinet: false, users: false, decide: false, raise: true
    });

    // An unknown role from a future backend grants nothing.
    setSession({ access: 'a', refresh: 'r', role: 'AUDITOR', user: { pk: 4 } });
    assert.equal(getEffectiveRole(), '');
    assert.equal(canMoveStock(), false);
  } finally {
    clearSession();
  }
}

function runLibraryMapperChecks() {
  // A list row: decimal strings become numbers, codes become locations.
  const row = mapComponent({
    id: 1,
    image_url: 'https://example.com/motor.jpg',
    name: 'DC Gear Motor 12V',
    part_number: 'JGB37-520',
    category: { id: 1, name: 'Motors' },
    unit: { id: 1, name: 'Pieces', symbol: 'pcs', allows_fraction: false },
    total_quantity: '36.000',
    minimum_quantity: '15.000',
    stock_status: 'IN_STOCK',
    is_low_stock: false,
    last_buying_price: '450.00',
    delivery_charge: '150.00',
    locations: ['A11', 'B22'],
    is_archived: false,
    updated_at: '2026-09-14T22:17:36.593405+06:00'
  });
  assert.equal(row.id, '1');
  assert.equal(row.partNumber, 'JGB37-520');
  assert.equal(row.totalQuantity, 36);
  assert.equal(row.lastBuyingPrice, 450);
  assert.equal(row.stockState, 'stocked');
  assert.equal(row.stockLabel, 'In stock');
  assert.equal(row.locationCount, 2);
  assert.equal(row.unit.symbol, 'pcs');
  assert.equal(row.category.name, 'Motors');
  assert.equal(row.image.dataUrl, 'https://example.com/motor.jpg');

  // Nulls must not leak into the table as "null".
  const sparse = mapComponent({
    id: 6, name: '5V Relay Module', part_number: null, image_url: '',
    category: { id: 4, name: 'Miscellaneous' },
    unit: { id: 1, symbol: 'pcs' },
    total_quantity: '0.000', minimum_quantity: '0.000',
    stock_status: 'OUT_OF_STOCK', is_low_stock: true,
    last_buying_price: null, delivery_charge: null, locations: []
  });
  assert.equal(sparse.partNumber, '');
  assert.equal(sparse.lastBuyingPrice, 0);
  assert.equal(sparse.stockState, 'out');
  assert.equal(sparse.image, null);
  assert.equal(sparse.locationCount, 0);

  // Detail rows carry the stock entry so Step 7 can edit or delete it.
  const detail = mapComponent({
    id: 1, name: 'DC Gear Motor 12V', stock_status: 'LOW_STOCK', is_low_stock: true,
    total_quantity: '4.000', minimum_quantity: '15.000',
    unit: { id: 1, symbol: 'pcs' }, category: { id: 1, name: 'Motors' },
    stock_by_location: [
      { stock_entry_id: 1, location: 'A11', quantity: '26.000', note: 'Top shelf', updated_at: '2026-09-14T22:17:36Z' }
    ]
  });
  assert.equal(detail.stockState, 'low');
  assert.equal(detail.locations[0].drawerCode, 'A11');
  assert.equal(detail.locations[0].quantity, 26);
  assert.equal(detail.locations[0].stockEntryId, '1');

  // Units keep the fraction rule the forms validate against.
  assert.equal(mapUnit({ id: 2, name: 'Metre', symbol: 'm', allows_fraction: true }).allowsFraction, true);

  // A movement shows where it happened, whichever end of the move that is.
  const movement = mapMovement({
    id: 9, movement_type: 'TRANSFER', movement_type_display: 'Transfer',
    component: { id: 1, name: 'DC Gear Motor 12V', unit_symbol: 'pcs' },
    source_location: 'A11', destination_location: 'B22', quantity: '10.000',
    performed_by: { username: 'karim.hossain' }, project: null,
    note: 'Split across drawers', created_at: '2026-09-14T22:17:36Z'
  });
  assert.equal(movement.type, 'Transfer');
  assert.equal(movement.quantity, 10);
  assert.equal(movement.locationLabel, 'B22');
  assert.equal(mapMovement({ id: 2, movement_type: 'TAKE', source_location: 'A11', quantity: '1' }).locationLabel, 'A11');
  assert.equal(mapMovement({ id: 3, movement_type: 'ADD', quantity: '1' }).locationLabel, 'No drawer');

  // Writes: the form's camelCase becomes the body the backend documents.
  const payload = toComponentPayload({
    name: 'DC Gear Motor 12V',
    partNumber: 'JGB37-520',
    categoryId: '1',
    unitId: '2',
    description: 'desc',
    manufacturer: 'Chihai',
    datasheetUrl: 'https://example.com/d.pdf',
    lastBuyingPrice: 450,
    deliveryCharge: 120,
    minimumQuantity: 10
  });
  assert.deepEqual(payload, {
    name: 'DC Gear Motor 12V',
    part_number: 'JGB37-520',
    category: '1',
    unit: '2',
    description: 'desc',
    manufacturer: 'Chihai',
    datasheet_url: 'https://example.com/d.pdf',
    last_buying_price: '450',
    delivery_charge: '120',
    minimum_quantity: '10'
  });
  // An empty part number must be null, not "", or the unique check rejects the second blank.
  assert.equal(toComponentPayload({ name: 'x', partNumber: '' }).part_number, null);

  // Server-side errors land on the controls the form actually has.
  assert.deepEqual(
    mapComponentFieldErrors({
      part_number: 'component with this part number already exists.',
      minimum_quantity: 'Ensure this value is greater than or equal to 0.'
    }),
    {
      partNumber: 'component with this part number already exists.',
      minimumQuantity: 'Ensure this value is greater than or equal to 0.'
    }
  );
  // An error on a field the form does not show still has to be seen somewhere.
  assert.deepEqual(mapComponentFieldErrors({ detail: 'Nope' }, 'Could not save.'), { name: 'Could not save.' });
}

function runInventoryMapperChecks() {
  assert.deepEqual(columnLetters(4), ['A', 'B', 'C', 'D']);

  // A single-chamber drawer reads exactly like the demo model: one component, one state.
  const single = mapDrawer({
    id: 1, code: 'A1', row: 1, column: 1, chamber_count: 1,
    chambers: [{
      id: 1, code: 'A11', number: 1, state: 'OCCUPIED', highlighted: true,
      stock_entry: {
        id: 1, quantity: '26.000',
        component: { id: 1, name: 'DC Gear Motor 12V', part_number: 'JGB37-520', unit_symbol: 'pcs', minimum_quantity: '15.000', total_quantity: '36.000' }
      }
    }]
  });
  assert.equal(single.isMultiChamber, false);
  assert.equal(single.component.name, 'DC Gear Motor 12V');
  assert.equal(single.quantity, 26);
  assert.equal(single.unit.symbol, 'pcs');
  assert.equal(single.stockState, 'stocked');
  assert.equal(single.stockEntryId, '1');
  assert.equal(single.chamberId, '1');
  assert.equal(single.highlighted, true);

  // A multi-chamber drawer takes the most urgent chamber's state and totals the stock.
  const multi = mapDrawer({
    id: 2, code: 'B1', row: 1, column: 2, chamber_count: 3,
    chambers: [
      { id: 2, code: 'B11', number: 1, state: 'OCCUPIED', stock_entry: { id: 2, quantity: '120.000', component: { id: 2, name: '1k Resistor', unit_symbol: 'pcs' } } },
      { id: 3, code: 'B12', number: 2, state: 'LOW_STOCK', stock_entry: { id: 3, quantity: '4.000', component: { id: 3, name: '100nF Cap', unit_symbol: 'pcs' } } },
      { id: 4, code: 'B13', number: 3, state: 'EMPTY', stock_entry: null }
    ]
  });
  assert.equal(multi.isMultiChamber, true);
  assert.equal(multi.chamberCount, 3);
  assert.equal(multi.occupiedChamberCount, 2);
  assert.equal(multi.stockState, 'low', 'the worst chamber state wins');
  assert.equal(multi.quantity, 124);
  assert.equal(multi.component, null, 'a multi-chamber drawer has no single component');
  assert.equal(multi.chambers[2].stockLabel, 'Empty');

  // An out-of-stock chamber outranks a low one.
  const worst = mapDrawer({
    id: 3, code: 'C1', chamber_count: 2,
    chambers: [
      { id: 5, code: 'C11', state: 'LOW_STOCK', stock_entry: { id: 5, quantity: '1', component: { id: 2, name: 'x' } } },
      { id: 6, code: 'C12', state: 'OUT_OF_STOCK', stock_entry: { id: 6, quantity: '0', component: { id: 3, name: 'y' } } }
    ]
  });
  assert.equal(worst.stockState, 'out');

  // The drawer map becomes a one-cabinet workspace, keeping the list shape the pages iterate.
  const workspace = mapDrawerMap({
    cabinet: { id: 1, name: 'Main Cabinet', rows: 2, columns: 3 },
    summary: { total_chambers: 14, in_use: 4, empty: 10, utilisation_percent: 28.6 },
    rows: [
      { row: 1, drawers: [{ id: 1, code: 'A1', row: 1, column: 1, chamber_count: 1, chambers: [{ id: 1, code: 'A11', state: 'EMPTY' }] }] },
      { row: 2, drawers: [{ id: 2, code: 'A2', row: 2, column: 1, chamber_count: 1, chambers: [{ id: 2, code: 'A21', state: 'EMPTY' }] }] }
    ]
  });
  assert.equal(workspace.cabinets.length, 1);
  const [cabinet] = workspace.cabinets;
  assert.equal(cabinet.name, 'Main Cabinet');
  assert.deepEqual(cabinet.columns, ['A', 'B', 'C'], 'the grid class is driven by columns.length');
  assert.equal(cabinet.drawerCount, 2);
  assert.equal(cabinet.drawers[1].code, 'A2');
  assert.equal(cabinet.summary.utilisationPercent, 28.6);
  assert.equal(workspace.groups[0].cabinets[0], cabinet);
}

async function runStockOperationChecks() {
  // Demo mode keeps working off drawer ids; these guards are about the live path.
  await assert.rejects(
    () => adjustStock({ locationCode: 'A11', newQuantity: 5, reason: 'count' }),
    (error) => error.message.includes('only available against the backend')
  );

  // A reason is required before anything is sent.
  await assert.rejects(
    () => adjustStock({ locationCode: 'A11', newQuantity: 5, reason: '   ' }),
    (error) => error instanceof Error
  );
}

function runProjectMapperChecks() {
  const active = mapProject({
    id: 1, name: 'Line Follower Robot', description: 'Competition line follower',
    status: 'ACTIVE', status_display: 'Active',
    created_by: { username: 'karim.hossain' }, created_at: '2026-09-14T22:17:36Z'
  });
  assert.equal(active.id, '1');
  assert.equal(active.status, 'Active', 'the card badge reads the display value');
  assert.equal(active.isClosed, false);
  assert.equal(active.createdBy, 'karim.hossain');

  const closed = mapProject({ id: 2, name: 'Legacy Fixture', status: 'CLOSED', status_display: 'Closed' });
  assert.equal(closed.isClosed, true, 'a closed project must not accept new takes');
  assert.equal(closed.description, '');

  const detailDto = {
    id: 1, name: 'Line Follower Robot', status: 'ACTIVE', status_display: 'Active',
    total_estimated_value: '1906.25',
    consumption: [
      { component: { id: 1, name: 'DC Gear Motor 12V', part_number: 'JGB37-520', unit_symbol: 'pcs' }, quantity_taken: '6.000', quantity_returned: '2.000', quantity: '4.000', last_buying_price: '450.00', estimated_value: '1800.00' },
      { component: { id: 3, name: 'Hookup Wire', unit_symbol: 'm' }, quantity_taken: '12.500', quantity_returned: '0.000', quantity: '12.500', last_buying_price: '8.50', estimated_value: '106.25' }
    ],
    requisitions: [{ id: 4, reference: 'REQ-0004', status_display: 'Pending', quantity: '2.000' }]
  };

  const summary = mapProjectSummary(detailDto);
  assert.equal(summary.takeCount, 2);
  assert.equal(summary.estimatedValue, 1906.25);

  const details = mapProjectDetails(detailDto);
  assert.equal(details.consumption[0].component.unit.symbol, 'pcs', 'the table formats quantities with the unit');
  assert.equal(details.consumption[0].quantity, 4, 'net of returns');
  assert.equal(details.consumption[1].estimatedValue, 106.25);
  assert.equal(details.requisitions[0].reference, 'REQ-0004');
  assert.deepEqual(details.movements, [], 'movements are fetched separately');
}

function runRequisitionMapperChecks() {
  assert.equal(statusLabel('OUT_FOR_NOTHING'), 'OUT_FOR_NOTHING', 'an unknown code passes through rather than blanking');
  assert.equal(statusCode('Pending'), 'PENDING');
  assert.equal(statusCode('Cancelled'), 'CANCELLED');

  // A library-component request, still pending, that an Admin may act on.
  const pending = mapRequisition({
    id: 1, reference: 'REQ-000001',
    component: { id: 2, name: '100 nF Capacitor', part_number: 'C0805', unit_symbol: 'pcs' },
    requested_part_name: '', part_name: '100 nF Capacitor',
    quantity: '100.000',
    unit: { id: 1, name: 'Pieces', symbol: 'pcs', allows_fraction: false },
    project: { id: 2, name: 'Solar Charge Controller', status: 'ACTIVE' },
    needed_by: '2026-10-15', reason: 'Running low',
    status: 'PENDING', status_display: 'Pending', days_in_current_status: 2,
    requested_by: { id: 3, username: 'nadia.islam', role: 'STAFF' },
    allowed_transitions: ['APPROVED', 'REJECTED', 'CANCELLED'],
    status_history: [{ id: 1, from_status: '', to_status: 'PENDING', changed_by: { username: 'nadia.islam' }, note: '', created_at: '2026-09-14T22:17:36Z' }]
  });
  assert.equal(pending.reference, 'REQ-000001');
  assert.equal(pending.quantity, 100);
  assert.equal(pending.status, 'Pending');
  assert.equal(pending.requester.name, 'nadia.islam');
  assert.deepEqual(pending.allowedTransitions, ['Approved', 'Rejected', 'Cancelled'],
    'the page offers exactly what the server permits for this user');
  assert.equal(pending.statusHistory[0].toStatus, 'Pending');
  assert.equal(pending.statusHistory[0].fromStatus, '', 'the first entry has no previous status');

  // The server's list is status-based, not reader-based: it offers every move
  // the status allows, and the transition endpoint enforces who may make it.
  const ownPending = mapRequisition({
    id: 4, reference: 'REQ-000004', quantity: '2', status: 'PENDING', status_display: 'Pending',
    allowed_transitions: ['APPROVED', 'REJECTED', 'CANCELLED'],
    requested_by: { id: 3, username: 'nadia.islam', role: 'STAFF' }
  });
  assert.deepEqual(ownPending.allowedTransitions, ['Approved', 'Rejected', 'Cancelled']);

  // So the service narrows it: an Admin keeps all three...
  setSession({ access: 'a', refresh: 'r', role: 'ADMIN', user: { id: 1 } });
  assert.deepEqual(getAllowedRequisitionStatuses(ownPending), ['Approved', 'Rejected', 'Cancelled']);

  // ...the requester may only cancel their own pending one...
  setSession({ access: 'a', refresh: 'r', role: 'STAFF', user: { id: 3 } });
  assert.deepEqual(getAllowedRequisitionStatuses(ownPending), ['Cancelled']);

  // ...and everyone else gets nothing, rather than a button that earns a 403.
  setSession({ access: 'a', refresh: 'r', role: 'STAFF', user: { id: 9 } });
  assert.deepEqual(getAllowedRequisitionStatuses(ownPending), []);
  setSession({ access: 'a', refresh: 'r', role: 'MANAGER', user: { id: 2 } });
  assert.deepEqual(getAllowedRequisitionStatuses(ownPending), []);
  clearSession();

  // A received request is finished: no transitions, so no buttons.
  const received = mapRequisition({
    id: 2, reference: 'REQ-000002', requested_part_name: 'ESP32-DevKitC V4', part_name: 'ESP32-DevKitC V4',
    component: null, quantity: '5.000', status: 'RECEIVED', status_display: 'Received', allowed_transitions: []
  });
  assert.equal(received.component, null);
  assert.equal(received.partName, 'ESP32-DevKitC V4', 'a free-text request still shows a name');
  assert.equal(received.freeTextPartName, 'ESP32-DevKitC V4');
  assert.deepEqual(received.allowedTransitions, []);
}

function runReportMapperChecks() {
  // Report rows are flat; the tables read nested objects.
  const row = mapCurrentStockRow({
    component_id: 1, component: 'DC Gear Motor 12V', part_number: 'JGB37-520', category: 'Motors',
    unit_symbol: 'pcs', total_quantity: '36.000', stock_status: 'IN_STOCK', chambers_held: 2,
    locations: ['A11', 'B22'], last_buying_price: '450.00', estimated_stock_value: '16200.00'
  });
  assert.equal(row.category.name, 'Motors');
  assert.equal(row.unit.symbol, 'pcs');
  assert.equal(row.locationCount, 2);
  assert.equal(row.estimatedValue, 16200);

  // A null price must not print as NaN; the value falls back to quantity x price.
  const sparse = mapCurrentStockRow({ component_id: 6, component: '5V Relay', category: null, total_quantity: '0.000', stock_status: 'OUT_OF_STOCK', locations: [], last_buying_price: null, estimated_stock_value: null });
  assert.equal(sparse.category.name, '—');
  assert.equal(sparse.estimatedValue, 0);
  assert.equal(sparse.stockState, 'out');

  const low = mapLowStockRow({ component_id: 8, component: 'Heat Shrink', unit_symbol: 'm', total_quantity: '2.500', minimum_quantity: '5.000', shortfall: '2.500', locations: ['C31'] });
  assert.equal(low.shortfall, 2.5);
  assert.equal(low.stockState, 'low');
  assert.equal(mapLowStockRow({ total_quantity: '0.000', minimum_quantity: '5' }).stockState, 'out');

  // One row per component becomes one row per project.
  const projects = mapProjectConsumption([
    { project_id: 1, project: 'Line Follower', component_id: 1, component: 'Motor', unit_symbol: 'pcs', quantity: '4.000', estimated_value: '1800.00' },
    { project_id: 1, project: 'Line Follower', component_id: 3, component: 'Wire', unit_symbol: 'm', quantity: '12.500', estimated_value: '106.25' },
    { project_id: 2, project: 'Solar', component_id: 2, component: 'Cap', unit_symbol: 'pcs', quantity: '10.000', estimated_value: '50.00' }
  ]);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].takeCount, 2);
  assert.equal(projects[0].estimatedValue, 1906.25);
  assert.equal(projects[1].name, 'Solar');

  const utilisation = mapDrawerUtilisation([
    { drawer: 'A1', total_chambers: 1, in_use: 1, empty: 0, free_locations: [] },
    { drawer: 'B1', total_chambers: 3, in_use: 1, empty: 2, free_locations: ['B12', 'B13'] }
  ]);
  assert.equal(utilisation.total, 4);
  assert.equal(utilisation.occupied, 2);
  assert.equal(utilisation.empty, 2);
  assert.equal(utilisation.drawers[1].freeLocations.length, 2);

  const dashboard = mapDashboard({
    total_components: 8, total_stock_value: '22048.00', low_stock_count: 3, out_of_stock_count: 2,
    pending_requisitions: 0, drawer_utilisation: { total_chambers: 14, in_use: 7, empty: 7, utilisation_percent: 50.0 }
  });
  assert.equal(dashboard.componentCount, 8);
  assert.equal(dashboard.totalValue, 22048);
  assert.equal(dashboard.drawerUtilisation, 50);
  assert.equal(dashboard.chamberSummary.inUse, 7);
}

function runAdministrationMapperChecks() {
  assert.equal(roleLabel('MANAGER'), 'Manager');
  assert.equal(roleCode('Staff'), 'STAFF');

  const user = mapUser({
    id: 2, username: 'karim.hossain', email: 'karim.hossain@example.com',
    first_name: 'Karim', last_name: 'Hossain', role: 'MANAGER', role_display: 'Manager',
    is_active: true, date_joined: '2026-09-14T22:17:35Z', last_login: null
  });
  assert.equal(user.name, 'Karim Hossain');
  assert.equal(user.role, 'Manager');
  assert.equal(user.isActive, true);
  assert.equal(user.status, 'Active');

  // A user with no name still has to be identifiable in the table.
  const nameless = mapUser({ id: 5, username: 'ops', email: 'ops@example.com', role: 'STAFF', is_active: false });
  assert.equal(nameless.name, 'ops');
  assert.equal(nameless.isActive, false);
  assert.equal(nameless.status, 'Deactivated');

  // Audit changes are flattened into one readable line.
  const event = mapAuditEvent({
    id: 52, actor: { id: 1, username: 'admin', role: 'ADMIN' },
    action: 'REQUISITION_STATUS_CHANGED', action_display: 'Requisition status changed',
    entity_type: 'REQUISITION', entity_type_display: 'Requisition',
    object_id: '2', object_repr: 'REQ-000002: ESP32-DevKitC V4',
    changes: { before: { status: 'ORDERED' }, after: { status: 'RECEIVED', note: 'Invoice TS-10492' } },
    created_at: '2026-09-14T22:17:36Z'
  });
  assert.equal(event.entity, 'Requisition');
  assert.equal(event.action, 'Requisition status changed');
  assert.equal(event.actor.name, 'admin');
  assert.ok(event.summary.includes('REQ-000002'));
  assert.ok(event.summary.includes('ORDERED → RECEIVED'), 'a before/after pair reads as a transition');

  // An event with no recorded change still names its object.
  const plain = mapAuditEvent({ id: 9, action: 'USER_CREATED', entity_type: 'USER', object_repr: 'nadia.islam', changes: {}, created_at: '2026-09-14T00:00:00Z' });
  assert.equal(plain.summary, 'nadia.islam');
  assert.equal(plain.actor, null, 'a system event has no actor');
}

async function runFileTransferChecks() {
  // Demo mode has no storage proxy; the guard has to be explicit, not a network error.
  await assert.rejects(() => uploadFile(new Blob(['x'])), (error) => error instanceof FileTransferError);
  await assert.rejects(() => previewImport('library', null), (error) => error instanceof FileTransferError);

  // The label sheet is a plain URL the page opens in a new tab.
  assert.equal(labelSheetUrl(), 'http://localhost:8000/inventory/labels/');
  assert.equal(labelSheetUrl({ drawer: 'A1' }), 'http://localhost:8000/inventory/labels/?drawer=A1');

  // The upload proxy returns the storage service's own body when it has no `url`
  // key, so the real shape is an object. Only a string may reach `image_url`.
  assert.equal(
    extractUploadUrl({ filename: 'tiny.gif', stored_path: 'https://transfer2.ongshak.com/uploads/x_tiny.gif', compression_started: false }),
    'https://transfer2.ongshak.com/uploads/x_tiny.gif'
  );
  assert.equal(extractUploadUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(extractUploadUrl({ url: 'https://example.com/b.jpg' }), 'https://example.com/b.jpg');
  assert.equal(extractUploadUrl({ filename: 'x.jpg' }), '', 'no usable URL must fail loudly, not send an object');
  assert.equal(extractUploadUrl(null), '');
}

await run();
console.log('Demo workflow checks passed.');
