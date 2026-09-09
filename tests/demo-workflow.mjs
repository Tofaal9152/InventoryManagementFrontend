import assert from 'node:assert/strict';
import { ApiRequestError, apiRequest } from '../js/api/client.js';
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
import { getProjectDetails } from '../js/services/project-service.js';
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
    const createdComponent = await saveComponent({ name: 'Test jumper wire', partNumber: 'TEST-JUMPER-01', categoryId: 'category-passive', unitId: 'unit-m', minimumQuantity: 2, lastBuyingPrice: 3.5 });
    assert.equal(createdComponent.name, 'Test jumper wire');

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
  } finally {
    resetDemoState();
  }
}

await run();
console.log('Demo workflow checks passed.');
