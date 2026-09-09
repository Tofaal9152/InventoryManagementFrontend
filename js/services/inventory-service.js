import { APP_CONFIG } from '../config.js';
import { getDemoState, subscribeToDemoStore, updateDemoState } from '../data/demo-store.js';
import { hasValidationErrors, validateDrawerAssignment, validateQuantity } from '../utils/validation.js';

export class DrawerAssignmentValidationError extends Error {
  constructor(errors) {
    super('Drawer assignment validation failed.');
    this.name = 'DrawerAssignmentValidationError';
    this.errors = errors;
  }
}

export class StockOperationValidationError extends Error {
  constructor(errors) {
    super('Stock operation validation failed.');
    this.name = 'StockOperationValidationError';
    this.errors = errors;
  }
}

export class CabinetValidationError extends Error {
  constructor(errors) {
    super('Cabinet validation failed.');
    this.name = 'CabinetValidationError';
    this.errors = errors;
  }
}

function createMovementId() {
  return `movement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createCabinetId() {
  return `cabinet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDrawerId(cabinetId, column, row) {
  return `drawer-${cabinetId}-${column.toLowerCase()}${row}`;
}

function getColumnLabels(columnCount) {
  return Array.from({ length: columnCount }, (_, index) => String.fromCharCode(65 + index));
}

function findDrawerContext(state, cabinetId, drawerId) {
  const cabinet = state.cabinets.find((item) => item.id === cabinetId);
  const drawer = cabinet?.drawers.find((item) => item.id === drawerId);
  const component = drawer?.componentId ? state.components.find((item) => item.id === drawer.componentId) : null;
  const unit = component ? state.units.find((item) => item.id === component.unitId) : null;

  return { cabinet, drawer, component, unit };
}

function addMovement(state, movement) {
  state.movements.push({
    id: createMovementId(),
    userId: 'user-admin',
    projectId: null,
    sourceDrawerId: null,
    destinationDrawerId: null,
    unitPrice: null,
    note: '',
    timestamp: new Date().toISOString(),
    ...movement
  });
}

function validateAssignedSource(context, errors) {
  if (!context.cabinet) {
    errors.cabinet = 'Cabinet was not found.';
  }
  if (!context.drawer) {
    errors.drawer = 'Drawer was not found.';
  }
  if (context.drawer && !context.component) {
    errors.drawer = 'Assign a Library component before changing stock.';
  }
}

function validatePositiveQuantity(value, unit, availableQuantity = null) {
  return validateQuantity(value, {
    allowFraction: Boolean(unit?.allowFraction),
    availableQuantity
  });
}

function getStockState(drawer, component, componentTotals) {
  if (!drawer.componentId) {
    return { id: 'empty', label: 'Empty' };
  }
  if (drawer.quantity === 0) {
    return { id: 'out', label: 'Out of stock' };
  }

  const totalQuantity = componentTotals.get(drawer.componentId) || 0;
  if (totalQuantity <= component.minimumQuantity) {
    return { id: 'low', label: 'Low stock' };
  }

  return { id: 'stocked', label: 'In stock' };
}

function createDemoWorkspace() {
  const state = getDemoState();
  const componentsById = new Map(state.components.map((component) => [component.id, component]));
  const unitsById = new Map(state.units.map((unit) => [unit.id, unit]));
  const componentTotals = new Map();

  state.cabinets.forEach((cabinet) => {
    cabinet.drawers.forEach((drawer) => {
      if (drawer.componentId) {
        componentTotals.set(drawer.componentId, (componentTotals.get(drawer.componentId) || 0) + drawer.quantity);
      }
    });
  });

  const movementByDrawerId = new Map();
  state.movements.forEach((movement) => {
    [movement.sourceDrawerId, movement.destinationDrawerId].filter(Boolean).forEach((drawerId) => {
      const currentMovements = movementByDrawerId.get(drawerId) || [];
      currentMovements.push(movement);
      movementByDrawerId.set(drawerId, currentMovements);
    });
  });

  const cabinets = state.cabinets.map((cabinet) => ({
    ...cabinet,
    drawerCount: cabinet.drawers.length,
    drawers: cabinet.drawers.map((drawer) => {
      const component = drawer.componentId ? componentsById.get(drawer.componentId) : null;
      const stockState = getStockState(drawer, component, componentTotals);

      return {
        ...drawer,
        component,
        unit: component ? unitsById.get(component.unitId) : { symbol: '' },
        stockState: stockState.id,
        stockLabel: stockState.label,
        movements: (movementByDrawerId.get(drawer.id) || [])
          .sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp))
          .slice(0, 3)
      };
    })
  }));

  const cabinetsById = new Map(cabinets.map((cabinet) => [cabinet.id, cabinet]));
  const groups = state.cabinetGroups.map((group) => ({
    ...group,
    cabinets: group.cabinetIds.map((cabinetId) => cabinetsById.get(cabinetId)).filter(Boolean)
  }));

  return { groups, cabinets };
}

export async function listCabinets() {
  if (APP_CONFIG.mode === 'demo') {
    return createDemoWorkspace().cabinets;
  }

  throw new Error('Inventory API integration is not configured yet.');
}

export async function getCabinet(cabinetId) {
  const cabinets = await listCabinets();
  return cabinets.find((cabinet) => cabinet.id === cabinetId) || null;
}

export async function getInventoryWorkspace() {
  if (APP_CONFIG.mode === 'demo') {
    return createDemoWorkspace();
  }

  throw new Error('Inventory API integration is not configured yet.');
}

export async function createCabinet({ name, groupId, rows, columnCount }) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Inventory API integration is not configured yet.');
  }

  const normalizedName = String(name || '').trim();
  const nextRows = Number(rows);
  const nextColumnCount = Number(columnCount);
  const state = getDemoState();
  const errors = {};

  if (!normalizedName) {
    errors.name = 'Cabinet name is required.';
  } else if (state.cabinets.some((cabinet) => cabinet.name.toLowerCase() === normalizedName.toLowerCase())) {
    errors.name = 'A cabinet with this name already exists.';
  }
  if (!state.cabinetGroups.some((group) => group.id === groupId)) {
    errors.groupId = 'Choose a valid cabinet group.';
  }
  if (!Number.isInteger(nextRows) || nextRows < 1 || nextRows > 9) {
    errors.rows = 'Rows must be a whole number from 1 to 9.';
  }
  if (!Number.isInteger(nextColumnCount) || nextColumnCount < 1 || nextColumnCount > 26) {
    errors.columnCount = 'Columns must be a whole number from 1 to 26.';
  }
  if (hasValidationErrors(errors)) {
    throw new CabinetValidationError(errors);
  }

  const cabinetId = createCabinetId();
  const columns = getColumnLabels(nextColumnCount);
  updateDemoState((nextState) => {
    const group = nextState.cabinetGroups.find((item) => item.id === groupId);
    const drawers = Array.from({ length: nextRows }, (_, rowIndex) => columns.map((column) => {
      const row = rowIndex + 1;
      return {
        id: createDrawerId(cabinetId, column, row),
        code: `${column}${row}`,
        row,
        column,
        sectionCount: 1,
        componentId: null,
        quantity: 0,
        note: ''
      };
    })).flat();

    nextState.cabinets.push({
      id: cabinetId,
      name: normalizedName,
      rows: nextRows,
      columns,
      groupId,
      drawers
    });
    group.cabinetIds.push(cabinetId);
    nextState.auditLog.push({
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      entity: 'Cabinet',
      action: 'Created',
      summary: `${normalizedName} created with ${nextColumnCount} columns and ${nextRows} rows.`,
      actorId: 'user-admin',
      timestamp: new Date().toISOString()
    });
    return nextState;
  });

  return getCabinet(cabinetId);
}

export function subscribeToInventoryChanges(listener) {
  if (APP_CONFIG.mode === 'demo') {
    return subscribeToDemoStore(listener);
  }

  return () => {};
}

export async function assignComponentToDrawer({ cabinetId, drawerId, componentId, quantity, note = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Inventory API integration is not configured yet.');
  }

  const state = getDemoState();
  const cabinet = state.cabinets.find((item) => item.id === cabinetId);
  const drawer = cabinet?.drawers.find((item) => item.id === drawerId);
  const component = state.components.find((item) => item.id === componentId);
  const unit = component ? state.units.find((item) => item.id === component.unitId) : null;
  const errors = validateDrawerAssignment({
    componentId,
    drawer,
    quantity,
    allowFraction: Boolean(unit?.allowFraction)
  });

  if (!cabinet) {
    errors.cabinet = 'Cabinet was not found.';
  }
  if (!component) {
    errors.componentId = 'Choose a valid Library component.';
  }
  if (hasValidationErrors(errors)) {
    throw new DrawerAssignmentValidationError(errors);
  }

  updateDemoState((nextState) => {
    const targetCabinet = nextState.cabinets.find((item) => item.id === cabinetId);
    const targetDrawer = targetCabinet.drawers.find((item) => item.id === drawerId);
    const now = new Date().toISOString();

    targetDrawer.componentId = componentId;
    targetDrawer.quantity = Number(quantity);
    targetDrawer.note = String(note || '').trim();
    targetDrawer.updatedOn = now;
    addMovement(nextState, {
      type: 'Add',
      componentId,
      sourceDrawerId: null,
      destinationDrawerId: drawerId,
      quantity: Number(quantity),
      projectId: null,
      note: `Initial assignment${note ? `: ${String(note).trim()}` : ''}`,
      timestamp: now
    });
    return nextState;
  });

  return getCabinet(cabinetId);
}

export async function addStock({ cabinetId, drawerId, quantity, note = '', unitPrice = '', deliveryCharge = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Inventory API integration is not configured yet.');
  }

  updateDemoState((state) => {
    const context = findDrawerContext(state, cabinetId, drawerId);
    const errors = {};
    validateAssignedSource(context, errors);
    const quantityError = validatePositiveQuantity(quantity, context.unit);
    if (quantityError) errors.quantity = quantityError;
    if (unitPrice !== '' && (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0)) errors.unitPrice = 'Unit price must be zero or greater.';
    if (deliveryCharge !== '' && (!Number.isFinite(Number(deliveryCharge)) || Number(deliveryCharge) < 0)) errors.deliveryCharge = 'Delivery charge must be zero or greater.';
    if (hasValidationErrors(errors)) throw new StockOperationValidationError(errors);

    context.drawer.quantity += Number(quantity);
    context.drawer.updatedOn = new Date().toISOString();
    if (unitPrice !== '') context.component.lastBuyingPrice = Number(unitPrice);
    if (deliveryCharge !== '') context.component.deliveryCharge = Number(deliveryCharge);
    addMovement(state, {
      type: 'Add',
      componentId: context.component.id,
      destinationDrawerId: drawerId,
      quantity: Number(quantity),
      unitPrice: unitPrice === '' ? null : Number(unitPrice),
      note: String(note || '').trim()
    });
    return state;
  });
}

export async function takeStock({ cabinetId, drawerId, quantity, projectId = '', note = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Inventory API integration is not configured yet.');
  }

  updateDemoState((state) => {
    const context = findDrawerContext(state, cabinetId, drawerId);
    const errors = {};
    validateAssignedSource(context, errors);
    const quantityError = validatePositiveQuantity(quantity, context.unit, context.drawer?.quantity ?? null);
    if (quantityError) errors.quantity = quantityError;
    const project = projectId ? state.projects.find((item) => item.id === projectId) : null;
    if (projectId && (!project || project.status !== 'Active')) errors.projectId = 'Choose an active project or leave this blank.';
    if (hasValidationErrors(errors)) throw new StockOperationValidationError(errors);

    context.drawer.quantity -= Number(quantity);
    context.drawer.updatedOn = new Date().toISOString();
    addMovement(state, {
      type: 'Take',
      componentId: context.component.id,
      sourceDrawerId: drawerId,
      quantity: Number(quantity),
      projectId: projectId || null,
      note: String(note || '').trim()
    });
    return state;
  });
}

export async function returnStock({ cabinetId, drawerId, quantity, note }) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Inventory API integration is not configured yet.');
  }

  updateDemoState((state) => {
    const context = findDrawerContext(state, cabinetId, drawerId);
    const errors = {};
    validateAssignedSource(context, errors);
    const quantityError = validatePositiveQuantity(quantity, context.unit);
    if (quantityError) errors.quantity = quantityError;
    if (!String(note || '').trim()) errors.note = 'Add a note for the returned stock.';
    if (hasValidationErrors(errors)) throw new StockOperationValidationError(errors);

    context.drawer.quantity += Number(quantity);
    context.drawer.updatedOn = new Date().toISOString();
    addMovement(state, {
      type: 'Return',
      componentId: context.component.id,
      destinationDrawerId: drawerId,
      quantity: Number(quantity),
      note: String(note).trim()
    });
    return state;
  });
}

export async function transferStock({ cabinetId, drawerId, destinationDrawerId, quantity, note = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Inventory API integration is not configured yet.');
  }

  updateDemoState((state) => {
    const source = findDrawerContext(state, cabinetId, drawerId);
    const destination = findDrawerContext(state, cabinetId, destinationDrawerId);
    const errors = {};
    validateAssignedSource(source, errors);
    if (!destination.drawer) errors.destinationDrawerId = 'Choose a valid destination drawer.';
    if (destination.drawer?.id === source.drawer?.id) errors.destinationDrawerId = 'Choose a different destination drawer.';
    if (destination.drawer?.componentId && destination.drawer.componentId !== source.component?.id) errors.destinationDrawerId = 'The destination holds a different component.';
    const quantityError = validatePositiveQuantity(quantity, source.unit, source.drawer?.quantity ?? null);
    if (quantityError) errors.quantity = quantityError;
    if (hasValidationErrors(errors)) throw new StockOperationValidationError(errors);

    source.drawer.quantity -= Number(quantity);
    source.drawer.updatedOn = new Date().toISOString();
    if (!destination.drawer.componentId) destination.drawer.componentId = source.component.id;
    destination.drawer.quantity += Number(quantity);
    destination.drawer.updatedOn = new Date().toISOString();
    addMovement(state, {
      type: 'Transfer',
      componentId: source.component.id,
      sourceDrawerId: drawerId,
      destinationDrawerId,
      quantity: Number(quantity),
      note: String(note || '').trim()
    });
    return state;
  });
}
