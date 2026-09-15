import { APP_CONFIG } from '../config.js';
import { apiRequest } from '../api/client.js';
import { mapCabinet, mapDrawer, mapDrawerMap } from '../api/mappers/inventory.js';
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

/**
 * The backend keeps one cabinet, and reports 404 until an Admin configures it.
 * That is an empty workspace, not an error: the page shows the "no cabinet yet"
 * panel and offers the setup action to whoever is allowed to run it.
 */
async function fetchWorkspace() {
  let dto;
  try {
    dto = await apiRequest('inventory/drawer-map/');
  } catch (error) {
    if (error?.status === 404) return { cabinets: [], groups: [] };
    throw error;
  }
  return mapDrawerMap(dto);
}

export async function listCabinets() {
  if (APP_CONFIG.mode === 'demo') {
    return createDemoWorkspace().cabinets;
  }

  return (await fetchWorkspace()).cabinets;
}

export async function getCabinet(cabinetId) {
  const cabinets = await listCabinets();
  return cabinets.find((cabinet) => cabinet.id === cabinetId) || cabinets[0] || null;
}

/** The cabinet's own record: rows, columns and the utilisation summary. */
export async function getCabinetConfiguration() {
  if (APP_CONFIG.mode !== 'demo') {
    try {
      return mapCabinet(await apiRequest('inventory/cabinet/'));
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
  }

  const [cabinet] = createDemoWorkspace().cabinets;
  return cabinet || null;
}

export async function getInventoryWorkspace() {
  if (APP_CONFIG.mode === 'demo') {
    return createDemoWorkspace();
  }

  return fetchWorkspace();
}

export async function createCabinet({ name, groupId, rows, columnCount }) {
  if (APP_CONFIG.mode !== 'demo') {
    // There is one cabinet: PUT both creates it and resizes it.
    const errors = {};
    if (!String(name || '').trim()) errors.name = 'Give the cabinet a name.';
    if (!(Number(rows) >= 1 && Number(rows) <= 9)) errors.rows = 'Rows must be between 1 and 9.';
    if (!(Number(columnCount) >= 1 && Number(columnCount) <= 26)) errors.columnCount = 'Columns must be between 1 and 26.';
    if (hasValidationErrors(errors)) throw new CabinetValidationError(errors);

    try {
      const dto = await apiRequest('inventory/cabinet/', {
        method: 'PUT',
        body: { name: String(name).trim(), rows: Number(rows), columns: Number(columnCount) }
      });
      return mapCabinet(dto);
    } catch (error) {
      if (error?.name === 'ApiRequestError' && error.isValidationError) {
        throw new CabinetValidationError({
          name: error.fields.name || '',
          rows: error.fields.rows || '',
          columnCount: error.fields.columns || '',
          ...(Object.keys(error.fields).length ? {} : { name: error.message })
        });
      }
      throw error;
    }
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

/** DRF field names -> the stock form's control names. */
const STOCK_FIELD_BY_API_NAME = Object.freeze({
  component: 'componentId',
  location: 'quantity',
  source_location: 'quantity',
  destination_location: 'destinationDrawerId',
  quantity: 'quantity',
  new_quantity: 'quantity',
  project: 'projectId',
  unit_price: 'unitPrice',
  delivery_charge: 'deliveryCharge',
  reason: 'note',
  note: 'note'
});

function toStockValidationError(error) {
  const errors = {};
  Object.entries(error.fields || {}).forEach(([apiName, message]) => {
    const field = STOCK_FIELD_BY_API_NAME[apiName];
    if (field && !errors[field]) errors[field] = message;
  });
  if (!Object.keys(errors).length) errors.quantity = error.message;
  return new StockOperationValidationError(errors);
}

/**
 * Every stock endpoint addresses a **chamber code** (`A11`), never a drawer id.
 * The page passes it as `locationCode`; a missing one means the caller tried to
 * act on a multi-chamber drawer without choosing a chamber first.
 */
async function postStockOperation(path, body, { location } = {}) {
  if (location !== undefined && !location) {
    throw new StockOperationValidationError({ quantity: 'Choose a chamber in this drawer first.' });
  }

  try {
    return await apiRequest(`inventory/stock/${path}/`, { method: 'POST', body });
  } catch (error) {
    if (error?.name === 'ApiRequestError' && error.isValidationError) throw toStockValidationError(error);
    throw error;
  }
}

export async function assignComponentToDrawer({ cabinetId, drawerId, componentId, quantity, note = '', locationCode = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    // Assigning is the first add of stock into an empty chamber.
    if (!componentId) throw new StockOperationValidationError({ componentId: 'Choose a valid Library component.' });
    return postStockOperation('add', {
      component: componentId,
      location: locationCode,
      quantity: String(quantity),
      note: String(note || '').trim()
    }, { location: locationCode });
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

export async function addStock({ cabinetId, drawerId, quantity, note = '', unitPrice = '', deliveryCharge = '', locationCode = '', componentId = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    const body = { location: locationCode, quantity: String(quantity), note: String(note || '').trim() };
    if (componentId) body.component = componentId;
    if (unitPrice !== '') body.unit_price = String(unitPrice);
    if (deliveryCharge !== '') body.delivery_charge = String(deliveryCharge);
    return postStockOperation('add', body, { location: locationCode });
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

export async function takeStock({ cabinetId, drawerId, quantity, projectId = '', note = '', locationCode = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    const body = { location: locationCode, quantity: String(quantity), note: String(note || '').trim() };
    if (projectId) body.project = projectId;
    return postStockOperation('take', body, { location: locationCode });
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

export async function returnStock({ cabinetId, drawerId, quantity, note, locationCode = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    return postStockOperation('return', {
      location: locationCode,
      quantity: String(quantity),
      note: String(note || '').trim()
    }, { location: locationCode });
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

export async function transferStock({ cabinetId, drawerId, destinationDrawerId, quantity, note = '', locationCode = '', destinationLocationCode = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    if (!destinationLocationCode) {
      throw new StockOperationValidationError({ destinationDrawerId: 'Choose a destination chamber.' });
    }
    return postStockOperation('transfer', {
      source_location: locationCode,
      destination_location: destinationLocationCode,
      quantity: String(quantity),
      note: String(note || '').trim()
    }, { location: locationCode });
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

/** Correct a counted quantity. Admin only, and always audited with a reason. */
export async function adjustStock({ locationCode, newQuantity, reason }) {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('Stock adjustment is only available against the backend.');
  }

  if (!String(reason || '').trim()) {
    throw new StockOperationValidationError({ note: 'Give a reason for the adjustment.' });
  }

  return postStockOperation('adjust', {
    location: locationCode,
    new_quantity: String(newQuantity),
    reason: String(reason).trim()
  }, { location: locationCode });
}

/** Edit the note on a stock entry. */
export async function updateStockEntryNote(stockEntryId, note) {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('Editing stock entries is only available against the backend.');
  }

  return apiRequest(`inventory/stock-entries/${encodeURIComponent(stockEntryId)}/`, {
    method: 'PATCH',
    body: { note: String(note || '').trim() }
  });
}

/** Remove an empty stock entry, freeing the chamber. The backend blocks a non-empty one. */
export async function deleteStockEntry(stockEntryId) {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('Deleting stock entries is only available against the backend.');
  }

  return apiRequest(`inventory/stock-entries/${encodeURIComponent(stockEntryId)}/`, { method: 'DELETE' });
}

/**
 * How many chambers a drawer is divided into (1-9). Admin only. The server
 * refuses to reduce while a removed chamber still holds a stock entry.
 */
export async function updateDrawerChambers(drawerId, chamberCount) {
  if (APP_CONFIG.mode === 'demo') {
    throw new CabinetValidationError({ chamberCount: 'Subdividing drawers is only available against the backend.' });
  }

  const count = Number(chamberCount);
  if (!Number.isInteger(count) || count < 1 || count > 9) {
    throw new CabinetValidationError({ chamberCount: 'A drawer can have 1 to 9 chambers.' });
  }

  try {
    const payload = await apiRequest(`inventory/drawers/${encodeURIComponent(drawerId)}/`, {
      method: 'PATCH',
      body: { chamber_count: count }
    });
    return mapDrawer(payload?.data ?? payload);
  } catch (error) {
    if (error?.name === 'ApiRequestError' && (error.isValidationError || error.isPermissionError)) {
      throw new CabinetValidationError({ chamberCount: error.fields.chamber_count || error.message });
    }
    throw error;
  }
}
