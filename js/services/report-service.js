import { APP_CONFIG } from '../config.js';
import { apiList, apiRequest } from '../api/client.js';
import { mapMovement } from '../api/mappers/library.js';
import {
  mapCurrentStockRow,
  mapDashboard,
  mapDrawerUtilisation,
  mapLowStockRow,
  mapProjectConsumption
} from '../api/mappers/reports.js';
import { getDemoState } from '../data/demo-store.js';
import { listComponents } from './component-service.js';
import { getInventoryWorkspace } from './inventory-service.js';
import { listProjectSummaries } from './project-service.js';

const PAGE_SIZE = 100;

/**
 * Staff may only read the dashboard, movement history and their own activity.
 * The manager-only reports answer 403 for them, which is an empty, explained
 * section — not a failed page.
 */
async function loadReport(path, params = {}) {
  try {
    const { items } = await apiList(path, { params: { page_size: PAGE_SIZE, ...params } });
    return { items, restricted: false };
  } catch (error) {
    if (error?.status === 403) return { items: [], restricted: true };
    throw error;
  }
}

export async function getDashboardData() {
  if (APP_CONFIG.mode !== 'demo') {
    const [dashboard, movementPage] = await Promise.all([
      apiRequest('reports/dashboard/'),
      loadReport('inventory/movements/', { page_size: 50 })
    ]);

    const movements = movementPage.items.map(mapMovement).map((movement) => ({
      ...movement,
      component: movement.componentId ? { id: movement.componentId, name: movement.componentName } : null,
      unit: { symbol: movement.unitSymbol }
    }));

    const summary = mapDashboard(dashboard);
    const recent = (dashboard?.recent_movements || []).map(mapMovement).map((movement) => ({
      ...movement,
      component: movement.componentId ? { id: movement.componentId, name: movement.componentName } : null
    }));

    return {
      ...summary,
      // The dashboard tile counts chambers in use; total stock is not reported.
      totalStock: summary.chamberSummary.inUse,
      recentMovements: recent.length ? recent.slice(0, 5) : movements.slice(0, 5),
      movements
    };
  }

  const [components, workspace] = await Promise.all([listComponents(), getInventoryWorkspace()]);
  const state = getDemoState();
  const totalStock = components.reduce((total, component) => total + component.totalQuantity, 0);
  const totalValue = components.reduce((total, component) => total + component.totalQuantity * component.lastBuyingPrice, 0);
  const drawers = workspace.cabinets.flatMap((cabinet) => cabinet.drawers);
  const movements = state.movements.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const resolvedMovements = movements.map((movement) => ({ ...movement, component: componentsById.get(movement.componentId) }));
  return {
    componentCount: components.length,
    totalStock,
    totalValue,
    lowStockCount: components.filter((component) => component.stockState === 'low').length,
    outOfStockCount: components.filter((component) => component.stockState === 'out').length,
    pendingRequisitionCount: state.requisitions.filter((requisition) => requisition.status === 'Pending').length,
    drawerUtilisation: drawers.length ? Math.round(drawers.filter((drawer) => drawer.componentId).length / drawers.length * 100) : 0,
    recentMovements: resolvedMovements.slice(0, 5),
    movements: resolvedMovements
  };
}

export async function getReportsData() {
  if (APP_CONFIG.mode !== 'demo') {
    const [currentStock, lowStock, projectConsumption, utilisation, movementPage] = await Promise.all([
      loadReport('reports/current-stock/'),
      loadReport('reports/low-stock/'),
      loadReport('reports/project-consumption/'),
      loadReport('reports/drawer-utilisation/'),
      loadReport('reports/movements/', { page_size: 50 })
    ]);

    return {
      currentStock: currentStock.items.map(mapCurrentStockRow),
      lowStock: lowStock.items.map(mapLowStockRow),
      projectConsumption: mapProjectConsumption(projectConsumption.items),
      drawerUtilisation: mapDrawerUtilisation(utilisation.items),
      movements: movementPage.items.map(mapMovement).map((movement) => ({
        ...movement,
        component: movement.componentId ? { id: movement.componentId, name: movement.componentName, unit: { symbol: movement.unitSymbol } } : null,
        location: movement.typeCode === 'TRANSFER' && movement.sourceLocation && movement.destinationLocation
          ? `${movement.sourceLocation} to ${movement.destinationLocation}`
          : movement.locationLabel
      })),
      // Which sections this role may not see, so the page can say so plainly.
      restricted: {
        currentStock: currentStock.restricted,
        lowStock: lowStock.restricted,
        projectConsumption: projectConsumption.restricted,
        drawerUtilisation: utilisation.restricted,
        movements: movementPage.restricted
      }
    };
  }

  const [components, workspace, projects] = await Promise.all([listComponents(), getInventoryWorkspace(), listProjectSummaries()]);
  const state = getDemoState();
  const drawers = workspace.cabinets.flatMap((cabinet) => cabinet.drawers.map((drawer) => ({ ...drawer, cabinetName: cabinet.name })));
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const drawerLabels = new Map(drawers.map((drawer) => [drawer.id, `${drawer.cabinetName} · ${drawer.code}`]));
  return {
    currentStock: components,
    lowStock: components.filter((component) => component.stockState === 'low' || component.stockState === 'out'),
    projectConsumption: projects.filter((project) => project.takeCount),
    movements: state.movements.slice().sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp)).map((movement) => ({
      ...movement,
      component: componentsById.get(movement.componentId),
      location: movement.type === 'Transfer'
        ? `${drawerLabels.get(movement.sourceDrawerId) || 'Unknown drawer'} to ${drawerLabels.get(movement.destinationDrawerId) || 'Unknown drawer'}`
        : drawerLabels.get(movement.destinationDrawerId || movement.sourceDrawerId) || 'Unknown drawer'
    })),
    drawerUtilisation: {
      occupied: drawers.filter((drawer) => drawer.componentId).length,
      empty: drawers.filter((drawer) => !drawer.componentId).length,
      total: drawers.length
    },
    restricted: {}
  };
}
