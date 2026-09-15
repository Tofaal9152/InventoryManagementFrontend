import { APP_CONFIG } from '../config.js';
import { apiRequest } from '../api/client.js';
import { mapCabinet } from '../api/mappers/inventory.js';
import { getCabinetConfiguration } from './inventory-service.js';
import { listCategories, listUnits } from './reference-service.js';
import { listUsers } from './user-service.js';
import { mapAuditEvent } from '../api/mappers/administration.js';
import { apiList } from '../api/client.js';
import { getDemoState, updateDemoState } from '../data/demo-store.js';

export class CabinetConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CabinetConfigurationError';
  }
}

function requireDemoMode() {
  if (APP_CONFIG.mode !== 'demo') throw new Error('Administration API integration is not configured yet.');
}

function drawerCode(column, row) {
  return `${column}${row}`;
}

function addAuditEvent(state, { entity, action, summary }) {
  state.auditLog.push({ id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, entity, action, summary, actorId: 'user-admin', timestamp: new Date().toISOString() });
}

export async function getAdministrationData() {
  if (APP_CONFIG.mode !== 'demo') {
    const [cabinet, categories, units, users] = await Promise.all([
      getCabinetConfiguration(),
      listCategories(),
      listUnits(),
      // Only an Admin may list users; everyone else still gets the rest of the page.
      listUsers().catch((error) => {
        if (error?.status === 403) return [];
        throw error;
      })
    ]);

    return {
      categories: categories.map((category) => ({ ...category, totalQuantity: 0 })),
      units,
      // One cabinet, shaped as a list so the settings page keeps iterating.
      cabinets: cabinet
        ? [{
          ...cabinet,
          columnCount: cabinet.columnCount,
          drawers: [],
          occupiedDrawerCount: cabinet.summary.inUse
        }]
        : [],
      users,
      roles: ['Admin', 'Manager', 'Staff']
    };
  }

  requireDemoMode();
  const state = getDemoState();
  const componentTotals = new Map();
  state.cabinets.forEach((cabinet) => cabinet.drawers.forEach((drawer) => {
    if (drawer.componentId) componentTotals.set(drawer.componentId, (componentTotals.get(drawer.componentId) || 0) + drawer.quantity);
  }));
  return {
    categories: state.categories.map((category) => {
      const components = state.components.filter((component) => component.categoryId === category.id);
      return { ...category, componentCount: components.length, totalQuantity: components.reduce((total, component) => total + (componentTotals.get(component.id) || 0), 0) };
    }),
    units: state.units.map((unit) => ({ ...unit, componentCount: state.components.filter((component) => component.unitId === unit.id).length })),
    cabinets: state.cabinets.map((cabinet) => ({ ...cabinet, occupiedDrawerCount: cabinet.drawers.filter((drawer) => drawer.componentId).length })),
    users: state.users,
    roles: ['Admin', 'Manager', 'Staff']
  };
}

export async function updateCabinetDimensions({ cabinetId, rows, columnCount, name = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    try {
      const dto = await apiRequest('inventory/cabinet/', {
        method: 'PUT',
        body: { name: String(name || 'Main Cabinet').trim(), rows: Number(rows), columns: Number(columnCount) }
      });
      return mapCabinet(dto);
    } catch (error) {
      // Shrinking over occupied chambers is refused with a reason worth showing.
      if (error?.name === 'ApiRequestError' && (error.isValidationError || error.status === 409)) {
        throw new CabinetConfigurationError(error.message);
      }
      throw error;
    }
  }

  requireDemoMode();
  const nextRows = Number(rows);
  const nextColumnCount = Number(columnCount);
  if (!Number.isInteger(nextRows) || nextRows < 1 || nextRows > 9) throw new CabinetConfigurationError('Rows must be a whole number from 1 to 9.');
  if (!Number.isInteger(nextColumnCount) || nextColumnCount < 1 || nextColumnCount > 26) throw new CabinetConfigurationError('Columns must be a whole number from 1 to 26.');

  const state = getDemoState();
  const cabinet = state.cabinets.find((item) => item.id === cabinetId);
  if (!cabinet) throw new CabinetConfigurationError('Cabinet was not found.');
  const columns = Array.from({ length: nextColumnCount }, (_, index) => String.fromCharCode(65 + index));
  const removedDrawers = cabinet.drawers.filter((drawer) => drawer.row > nextRows || !columns.includes(drawer.column));
  if (removedDrawers.some((drawer) => drawer.componentId || drawer.quantity > 0)) throw new CabinetConfigurationError('Cannot reduce this cabinet while a removed drawer holds an assigned component or stock.');

  updateDemoState((nextState) => {
    const target = nextState.cabinets.find((item) => item.id === cabinetId);
    const existingByCode = new Map(target.drawers.map((drawer) => [drawer.code, drawer]));
    target.rows = nextRows;
    target.columns = columns;
    target.drawers = Array.from({ length: nextRows }, (_, rowIndex) => columns.map((column) => {
      const row = rowIndex + 1;
      const code = drawerCode(column, row);
      return existingByCode.get(code) || { id: `drawer-${column.toLowerCase()}${row}`, code, row, column, sectionCount: 1, componentId: null, quantity: 0, note: '' };
    })).flat();
    addAuditEvent(nextState, { entity: 'Cabinet', action: 'Configured', summary: `${target.name} set to ${nextColumnCount} columns and ${nextRows} rows.` });
    return nextState;
  });
  return getAdministrationData();
}

export async function getAuditLog() {
  if (APP_CONFIG.mode !== 'demo') {
    const { items } = await apiList('administrator/audit-logs/', { params: { page_size: 100 } });
    return items.map(mapAuditEvent);
  }

  requireDemoMode();
  const state = getDemoState();
  const usersById = new Map(state.users.map((user) => [user.id, user]));
  const movementEvents = state.movements.map((movement) => ({ id: movement.id, entity: 'Movement', action: movement.type, summary: `${movement.type} movement recorded.`, actorId: movement.userId, timestamp: movement.timestamp }));
  return [...state.auditLog, ...movementEvents].map((event) => ({ ...event, actor: usersById.get(event.actorId) })).sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp));
}
